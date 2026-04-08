import type {
  ConfiguredCaptureBlockRow,
  ConfiguredCaptureDocInfo,
  ConfiguredCaptureNotebookSummary,
  ConfiguredCaptureStoragePort,
} from '@/application/ports/ConfiguredCaptureStoragePort';
import type { ConfiguredCaptureStorageSettings } from '@/types/settings';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConfiguredCaptureStorageService');

const FEATURE_ROOT_DOC_TITLES = {
  'progressive-excerpt': 'SiYuanMemo 摘录库',
  'ai-draft': 'SiYuanMemo AI 草稿',
} as const;

export type ConfiguredCaptureFeature = keyof typeof FEATURE_ROOT_DOC_TITLES;

export interface ConfiguredCaptureLibraryTarget {
  notebookId: string;
  containerDocId: string;
  parentBlockId: string;
  parentDoc: ConfiguredCaptureDocInfo;
  targetKind: 'root-doc' | 'doc' | 'block';
}

export interface ConfiguredCaptureDailyNoteTarget {
  notebookId: string;
  containerDocId: string;
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function sanitizeDocTitle(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'SiYuanMemo';
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

export class ConfiguredCaptureStorageService {
  constructor(private readonly port: ConfiguredCaptureStoragePort) {}

  async listOpenNotebooks(): Promise<ConfiguredCaptureNotebookSummary[]> {
    const notebooks = await this.port.listNotebooks();
    return notebooks
      .filter((notebook) => notebook.closed !== true)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  hasExplicitConfiguration(settings?: ConfiguredCaptureStorageSettings | null): boolean {
    return normalizeString(settings?.notebookId).length > 0;
  }

  async resolveLibraryTarget(
    settings: ConfiguredCaptureStorageSettings | null | undefined,
    options: {
      feature: ConfiguredCaptureFeature;
      allowNonDocTarget: boolean;
    },
  ): Promise<ConfiguredCaptureLibraryTarget | null> {
    const notebookId = normalizeString(settings?.notebookId);
    if (!notebookId) {
      return null;
    }

    const targetBlockId = normalizeString(settings?.targetBlockId);
    if (!targetBlockId) {
      const parentDoc = await this.ensureFeatureRootDoc(options.feature, notebookId);
      return {
        notebookId,
        containerDocId: parentDoc.id,
        parentBlockId: parentDoc.id,
        parentDoc,
        targetKind: 'root-doc',
      };
    }

    const targetBlock = await this.resolveTargetBlock(targetBlockId);
    const targetNotebookId = normalizeString(targetBlock.box);
    if (targetNotebookId !== notebookId) {
      throw new Error('目标块和已配置笔记本不一致，请重新检查配置。');
    }

    if (normalizeString(targetBlock.type) === 'd') {
      const parentDoc = await this.resolveDocInfo(targetBlock.id);
      return {
        notebookId,
        containerDocId: parentDoc.id,
        parentBlockId: parentDoc.id,
        parentDoc,
        targetKind: 'doc',
      };
    }

    if (!options.allowNonDocTarget) {
      throw new Error('当前配置只支持把内容存放到目标文档块下。');
    }

    const rootDocId = normalizeString(targetBlock.root_id);
    if (!rootDocId) {
      throw new Error('无法解析目标块所属文档。');
    }
    const parentDoc = await this.resolveDocInfo(rootDocId);
    return {
      notebookId,
      containerDocId: parentDoc.id,
      parentBlockId: targetBlock.id,
      parentDoc,
      targetKind: 'block',
    };
  }

  async resolveDailyNoteTarget(
    settings: ConfiguredCaptureStorageSettings | null | undefined,
  ): Promise<ConfiguredCaptureDailyNoteTarget | null> {
    const notebookId = normalizeString(settings?.notebookId);
    if (!notebookId) {
      return null;
    }

    const containerDocId = await this.port.ensureTodayDailyNote(notebookId);
    return {
      notebookId,
      containerDocId,
    };
  }

  private async ensureFeatureRootDoc(
    feature: ConfiguredCaptureFeature,
    notebookId: string,
  ): Promise<ConfiguredCaptureDocInfo> {
    const title = FEATURE_ROOT_DOC_TITLES[feature];
    const path = `/${sanitizeDocTitle(title)}`;
    const existingDocId = await this.findDocIdByHPath(notebookId, path);
    if (existingDocId) {
      return this.resolveDocInfo(existingDocId);
    }

    const createdDocId = normalizeString(await this.port.createDocWithMarkdown(notebookId, path, `# ${title}`));
    if (createdDocId) {
      return this.resolveDocInfo(createdDocId);
    }

    const resolvedDocId = await this.findDocIdByHPath(notebookId, path);
    if (!resolvedDocId) {
      throw new Error(`无法定位 ${title} 根文档。`);
    }
    return this.resolveDocInfo(resolvedDocId);
  }

  private async resolveDocInfo(docId: string): Promise<ConfiguredCaptureDocInfo> {
    const info = await this.port.getDocInfo(docId);
    if (normalizeString(info.box) && normalizeString(info.hpath)) {
      return {
        id: normalizeString(info.id) || docId,
        box: normalizeString(info.box),
        path: normalizeString(info.path),
        hpath: normalizeString(info.hpath),
        name: normalizeString(info.name),
      };
    }

    const rows = await this.port.sql<ConfiguredCaptureBlockRow>(`
      SELECT id, box, path, hpath, content
      FROM blocks
      WHERE id = '${escapeSql(docId)}'
      LIMIT 1
    `);
    const row = rows[0];
    const resolved = {
      id: normalizeString(info.id) || normalizeString(row?.id) || docId,
      box: normalizeString(info.box) || normalizeString(row?.box),
      path: normalizeString(info.path) || normalizeString(row?.path),
      hpath: normalizeString(info.hpath) || normalizeString(row?.hpath),
      name: normalizeString(info.name) || normalizeString(row?.content),
    };
    if (!resolved.box || !resolved.hpath) {
      logger.debug('Configured capture doc info remains incomplete after SQL hydration', {
        docId,
        box: resolved.box,
        hpath: resolved.hpath,
      });
    }
    return resolved;
  }

  private async resolveTargetBlock(targetBlockId: string): Promise<ConfiguredCaptureBlockRow> {
    const rows = await this.port.sql<ConfiguredCaptureBlockRow>(`
      SELECT id, box, root_id, type, path, hpath, content
      FROM blocks
      WHERE id = '${escapeSql(targetBlockId)}'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row || normalizeString(row.id).length === 0) {
      throw new Error('未找到配置的目标块，请检查块 ID 是否有效。');
    }
    return row;
  }

  private async findDocIdByHPath(notebookId: string, hpath: string): Promise<string> {
    const rows = await this.port.sql<{ id?: string }>(`
      SELECT id
      FROM blocks
      WHERE box = '${escapeSql(notebookId)}'
        AND type = 'd'
        AND hpath = '${escapeSql(hpath)}'
      LIMIT 1
    `);
    const docId = normalizeString(rows[0]?.id);
    if (!docId) {
      logger.debug('Configured capture root doc not found yet', {
        notebookId,
        hpath,
      });
    }
    return docId;
  }
}
