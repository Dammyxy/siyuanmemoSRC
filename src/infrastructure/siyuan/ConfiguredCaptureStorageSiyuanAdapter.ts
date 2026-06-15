import type {
  ConfiguredCaptureDocInfo,
  ConfiguredCaptureNotebookSummary,
  ConfiguredCaptureStoragePort,
} from '@/application/ports/ConfiguredCaptureStoragePort';
import {
  createDailyNote,
  createDocWithMd,
  getDocInfo,
  listNotebooks,
  sql,
} from '@/infrastructure/siyuan/api';

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function formatDailyNoteDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export class ConfiguredCaptureStorageSiyuanAdapter implements ConfiguredCaptureStoragePort {
  private readonly appId: string;

  constructor(app?: { appId?: string | null } | null) {
    this.appId = String(app?.appId || '').trim();
  }

  async listNotebooks(): Promise<ConfiguredCaptureNotebookSummary[]> {
    return listNotebooks();
  }

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getDocInfo(docId: string): Promise<ConfiguredCaptureDocInfo> {
    const result = await getDocInfo(docId);
    return {
      id: String(result.id || ''),
      box: String(result.box || ''),
      path: String(result.path || ''),
      hpath: String(result.hpath || ''),
      name: String(result.name || result.content || ''),
    };
  }

  async createDocWithMarkdown(notebook: string, path: string, markdown: string): Promise<string> {
    return createDocWithMd(notebook, path, markdown);
  }

  async ensureTodayDailyNote(notebook: string): Promise<string> {
    const dateStamp = formatDailyNoteDate(new Date());
    const existing = await this.findTodayDailyNoteId(notebook, dateStamp);
    if (existing) {
      return existing;
    }

    const created = await createDailyNote(notebook, this.appId || undefined);
    const createdId = String(created?.id || '').trim();
    if (createdId) {
      return createdId;
    }

    const resolved = await this.findTodayDailyNoteId(notebook, dateStamp);
    if (resolved) {
      return resolved;
    }

    throw new Error(`无法定位笔记本 ${notebook} 的今日日记。`);
  }

  private async findTodayDailyNoteId(notebook: string, dateStamp: string): Promise<string | null> {
    const rows = await sql<{ id?: string }>(`
      SELECT DISTINCT b.id
      FROM blocks b
      INNER JOIN attributes a
        ON a.block_id = b.id
       AND a.name = 'custom-dailynote-${escapeSql(dateStamp)}'
       AND a.value = '${escapeSql(dateStamp)}'
      WHERE b.type = 'd'
        AND b.box = '${escapeSql(notebook)}'
      LIMIT 1
    `);
    const docId = String(rows[0]?.id || '').trim();
    return docId.length > 0 ? docId : null;
  }
}
