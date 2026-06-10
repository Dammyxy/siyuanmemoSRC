import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';

export const BROWSER_BLOCK_EXISTENCE_BATCH_SIZE = 500;

export interface BrowserBlockExistenceBatch {
  batchIds: string[];
  offset: number;
}

type BrowserBlockIdRow = Record<string, unknown> & {
  id?: unknown;
};

export interface BrowserBlockExistenceQueryInstrumentation {
  loadExistingBlockIds(
    stmt: string,
    batch: BrowserBlockExistenceBatch,
    loadRows: () => Promise<BrowserBlockIdRow[]>,
  ): Promise<BrowserBlockIdRow[]>;
}

export function normalizeBrowserBlockId(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeBrowserBlockIds(values: Iterable<unknown> | null | undefined): string[] {
  return Array.from(new Set(Array.from(values || []).map(normalizeBrowserBlockId).filter(Boolean)));
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlQuotedValues(values: string[]): string {
  return values.map((value) => `'${escapeSqlString(value)}'`).join(',');
}

function buildBrowserBlockExistenceStatement(blockIds: string[]): string {
  return `
      SELECT id
      FROM blocks
      WHERE id IN (${toSqlQuotedValues(blockIds)})
    `;
}

export async function loadExistingBrowserBlockIds(
  blockIds: Iterable<unknown> | null | undefined,
  loadRows: (stmt: string, batch: BrowserBlockExistenceBatch) => Promise<BrowserBlockIdRow[]>,
  options: { batchSize?: number } = {},
): Promise<Set<string>> {
  const existing = new Set<string>();
  const normalizedBlockIds = normalizeBrowserBlockIds(blockIds);
  if (normalizedBlockIds.length === 0) {
    return existing;
  }

  const requestedBatchSize = Math.floor(Number(options.batchSize) || BROWSER_BLOCK_EXISTENCE_BATCH_SIZE);
  const batchSize = Math.max(1, requestedBatchSize);
  for (let index = 0; index < normalizedBlockIds.length; index += batchSize) {
    const batchIds = normalizedBlockIds.slice(index, index + batchSize);
    const rows = await loadRows(buildBrowserBlockExistenceStatement(batchIds), {
      batchIds,
      offset: index,
    });
    for (const row of rows) {
      const id = normalizeBrowserBlockId(row.id);
      if (id) {
        existing.add(id);
      }
    }
  }

  return existing;
}

export class BrowserBlockExistenceQuerySource {
  constructor(
    private readonly source: Pick<BrowserQuerySiyuanPort, 'sql'>,
    private readonly options: {
      batchSize?: number;
      instrumentation?: BrowserBlockExistenceQueryInstrumentation;
    } = {},
  ) {}

  loadExistingBlockIds(blockIds: Iterable<unknown> | null | undefined): Promise<Set<string>> {
    return loadExistingBrowserBlockIds(
      blockIds,
      (stmt, batch) => {
        const loadRows = () => this.source.sql<BrowserBlockIdRow>(stmt);
        return this.options.instrumentation?.loadExistingBlockIds(stmt, batch, loadRows) ?? loadRows();
      },
      { batchSize: this.options.batchSize },
    );
  }
}
