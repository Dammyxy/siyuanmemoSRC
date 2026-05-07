import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MissingBlockMarker');
const BLOCK_EXISTENCE_BATCH_SIZE = 500;

type MissingBlockMarkableRow = {
  blockId?: unknown;
  blockType?: string | null;
  meta?: unknown;
};

type BlockIdRow = Record<string, unknown> & {
  id?: unknown;
};

type QuerySqlPort = Pick<QuerySiyuanPort, 'sql'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBlockId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeBlockIds(blockIds: unknown[]): string[] {
  return Array.from(new Set(blockIds.map(normalizeBlockId).filter(Boolean)));
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlQuotedValues(values: string[]): string {
  return values.map((value) => `'${escapeSqlString(value)}'`).join(',');
}

function hasMissingBlockType(row: MissingBlockMarkableRow): boolean {
  const metaBlockType = isRecord(row.meta) ? row.meta.blockType : undefined;
  return row.blockType === 'missing' || metaBlockType === 'missing';
}

function markRowAsMissing<TRow extends MissingBlockMarkableRow>(row: TRow): TRow {
  if (hasMissingBlockType(row)) {
    return row;
  }

  const meta = isRecord(row.meta)
    ? { ...row.meta, blockType: 'missing' }
    : { blockType: 'missing' };

  return {
    ...row,
    blockType: 'missing',
    meta,
  } as TRow;
}

function clearMissingBlockMark<TRow extends MissingBlockMarkableRow>(row: TRow): TRow {
  if (!hasMissingBlockType(row)) {
    return row;
  }

  const base = { ...(row as Record<string, unknown>) };
  if (base.blockType === 'missing') {
    delete base.blockType;
  }

  const meta = isRecord(row.meta) ? { ...row.meta } : undefined;
  if (meta?.blockType === 'missing') {
    delete meta.blockType;
  }
  if (meta && Object.keys(meta).length > 0) {
    base.meta = meta;
  } else if (meta) {
    delete base.meta;
  }

  return base as TRow;
}

async function loadExistingBlockIds(
  blockIds: string[],
  siyuanApi: QuerySqlPort,
): Promise<Set<string>> {
  const existing = new Set<string>();
  const normalizedBlockIds = normalizeBlockIds(blockIds);
  if (normalizedBlockIds.length === 0) {
    return existing;
  }

  for (let index = 0; index < normalizedBlockIds.length; index += BLOCK_EXISTENCE_BATCH_SIZE) {
    const batchIds = normalizedBlockIds.slice(index, index + BLOCK_EXISTENCE_BATCH_SIZE);
    const rows = await siyuanApi.sql<BlockIdRow>(`
      SELECT id
      FROM blocks
      WHERE id IN (${toSqlQuotedValues(batchIds)})
    `);

    for (const row of rows) {
      const id = normalizeBlockId(row.id);
      if (id) {
        existing.add(id);
      }
    }
  }

  return existing;
}

export async function markMissingBlockRows<TRow extends MissingBlockMarkableRow>(
  rows: TRow[],
  siyuanApi: QuerySqlPort,
): Promise<TRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const blockIds = normalizeBlockIds(rows.map((row) => row.blockId));
  if (blockIds.length === 0) {
    return rows;
  }

  let existingBlockIds: Set<string>;
  try {
    existingBlockIds = await loadExistingBlockIds(blockIds, siyuanApi);
  } catch (error) {
    logger.debug('[MissingBlockMarker] Block existence check failed, keeping rows fail-open', error);
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    if (hasMissingBlockType(row)) {
      return row;
    }

    const blockId = normalizeBlockId(row.blockId);
    if (!blockId || existingBlockIds.has(blockId)) {
      return row;
    }

    changed = true;
    return markRowAsMissing(row);
  });

  return changed ? nextRows : rows;
}

export function markKnownMissingBlockRows<TRow extends MissingBlockMarkableRow>(
  rows: TRow[],
  missingBlockIds: Iterable<string>,
): TRow[] {
  const missing = new Set(Array.from(missingBlockIds).map(normalizeBlockId).filter(Boolean));
  if (rows.length === 0 || missing.size === 0) {
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    if (hasMissingBlockType(row)) {
      return row;
    }
    const blockId = normalizeBlockId(row.blockId);
    if (!blockId || !missing.has(blockId)) {
      return row;
    }
    changed = true;
    return markRowAsMissing(row);
  });

  return changed ? nextRows : rows;
}

export function applyKnownSourceExistenceToRows<TRow extends MissingBlockMarkableRow>(
  rows: TRow[],
  statusByBlockId: Iterable<readonly [string, boolean | null]>,
): TRow[] {
  const normalizedStatusByBlockId = new Map<string, boolean | null>();
  for (const [blockId, exists] of statusByBlockId) {
    const normalized = normalizeBlockId(blockId);
    if (normalized) {
      normalizedStatusByBlockId.set(normalized, exists);
    }
  }
  if (rows.length === 0 || normalizedStatusByBlockId.size === 0) {
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    const blockId = normalizeBlockId(row.blockId);
    if (!blockId || !normalizedStatusByBlockId.has(blockId)) {
      return row;
    }

    const exists = normalizedStatusByBlockId.get(blockId);
    if (exists === false) {
      const next = markRowAsMissing(row);
      changed = changed || next !== row;
      return next;
    }
    if (exists === true) {
      const next = clearMissingBlockMark(row);
      changed = changed || next !== row;
      return next;
    }
    return row;
  });

  return changed ? nextRows : rows;
}

export async function countMissingBlockCards(
  cards: FSRSCard[],
  siyuanApi: QuerySqlPort,
): Promise<number> {
  if (cards.length === 0) {
    return 0;
  }

  const blockIds = normalizeBlockIds(cards.map((card) => card.blockId));
  if (blockIds.length === 0) {
    return cards.filter(hasMissingBlockType).length;
  }

  let existingBlockIds: Set<string>;
  try {
    existingBlockIds = await loadExistingBlockIds(blockIds, siyuanApi);
  } catch (error) {
    logger.debug('[MissingBlockMarker] Missing-card count failed, returning explicit missing metadata count only', error);
    return cards.filter(hasMissingBlockType).length;
  }

  return cards.filter((card) => {
    if (hasMissingBlockType(card)) {
      return true;
    }
    const blockId = normalizeBlockId(card.blockId);
    return Boolean(blockId) && !existingBlockIds.has(blockId);
  }).length;
}
