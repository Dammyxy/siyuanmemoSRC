import type { AISiyuanBlockRow, AISiyuanMutationResult } from '@/application/ports/AISiyuanPort';

export type AIFlashcardMutationRow = AISiyuanBlockRow & { sort?: string | number };

export interface AIFlashcardMarkdownTarget {
  targetBlockId: string;
  writeMode: 'append' | 'after';
}

export interface AIFlashcardMarkdownInsertionRuntimeDeps {
  appendBlockUnderParentDetailed: (markdown: string, parentId: string) => Promise<AISiyuanMutationResult>;
  insertBlockAfterDetailed: (markdown: string, previousId: string) => Promise<AISiyuanMutationResult>;
  sql: <TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string) => Promise<TRow[]>;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => normalizeString(value)).filter(Boolean)));
}

export class AIFlashcardMarkdownInsertionRuntime {
  constructor(private readonly deps: AIFlashcardMarkdownInsertionRuntimeDeps) {}

  async insertMarkdown(
    markdown: string,
    target: AIFlashcardMarkdownTarget,
    previousSiblingId = target.targetBlockId,
  ): Promise<AISiyuanMutationResult> {
    if (target.writeMode === 'append') {
      return this.deps.appendBlockUnderParentDetailed(markdown, target.targetBlockId);
    }
    return this.deps.insertBlockAfterDetailed(markdown, previousSiblingId);
  }

  async loadMutationRows(result: AISiyuanMutationResult): Promise<AIFlashcardMutationRow[]> {
    const blockIds = uniqueIds(result.doOperations.map((operation) => normalizeString(operation.id)));
    if (blockIds.length === 0) {
      throw new Error('未能解析插入后的块 ID。');
    }
    const escapedIds = blockIds.map((id) => `'${escapeSql(id)}'`).join(', ');
    return this.deps.sql<AIFlashcardMutationRow>(`
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort
      FROM blocks
      WHERE id IN (${escapedIds})
      ORDER BY sort ASC, id ASC
      LIMIT ${Math.max(blockIds.length, 1)}
    `);
  }
}
