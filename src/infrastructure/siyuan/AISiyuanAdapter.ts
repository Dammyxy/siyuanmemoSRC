import type { AISiyuanNotebookConf, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import {
  appendBlock,
  copyStdMarkdown,
  createDailyNote,
  createDocWithMd,
  deleteBlock,
  getNotebookConf,
  insertBlock,
  renderSprig,
  setBlockAttrs,
  sql,
  updateBlock,
} from '@/infrastructure/siyuan/api';

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function formatDailyNoteDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export class AISiyuanAdapter implements AISiyuanPort {
  private readonly appId: string;

  constructor(app?: { appId?: string | null } | null) {
    this.appId = String(app?.appId || '').trim();
  }

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getBlockText(blockId: string): Promise<string> {
    const rows = await sql<{ markdown?: string; content?: string }>(
      `SELECT markdown, content FROM blocks WHERE id = '${blockId.replace(/'/g, "''")}' LIMIT 1`,
    );
    const row = rows[0];
    return String(row?.markdown || row?.content || '').trim();
  }

  async copyStdMarkdown(blockId: string): Promise<string> {
    return copyStdMarkdown(blockId);
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

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async getNotebookConf(notebook: string): Promise<AISiyuanNotebookConf> {
    const result = await getNotebookConf(notebook);
    return result.conf;
  }

  async renderTemplate(template: string): Promise<string> {
    return renderSprig(template);
  }

  async createDocWithMarkdown(notebook: string, path: string, markdown: string): Promise<string> {
    return createDocWithMd(notebook, path, markdown);
  }

  async insertBlockAfter(markdown: string, previousId: string): Promise<string> {
    return insertBlock({
      dataType: 'markdown',
      data: markdown,
      previousID: previousId,
    });
  }

  async appendBlockUnderParent(markdown: string, parentId: string): Promise<string> {
    return appendBlock({
      dataType: 'markdown',
      data: markdown,
      parentID: parentId,
    });
  }

  async updateBlockMarkdown(blockId: string, markdown: string): Promise<string> {
    return updateBlock({
      dataType: 'markdown',
      data: markdown,
      id: blockId,
    });
  }

  async deleteBlock(blockId: string): Promise<void> {
    await deleteBlock(blockId);
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
