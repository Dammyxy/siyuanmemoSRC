import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import {
  BrowserBlockExistenceQuerySource,
  normalizeBrowserBlockId,
  normalizeBrowserBlockIds,
} from './BrowserBlockExistenceQuerySource';

const logger = createLogger('MissingBlockMarker');

type MissingBlockMarkableRow = {
  blockId?: unknown;
  blockType?: string | null;
  meta?: unknown;
};

type QuerySqlPort = Pick<BrowserQuerySiyuanPort, 'sql'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

export async function markMissingBlockRows<TRow extends MissingBlockMarkableRow>(
  rows: TRow[],
  siyuanApi: QuerySqlPort,
): Promise<TRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const blockIds = normalizeBrowserBlockIds(rows.map((row) => row.blockId));
  if (blockIds.length === 0) {
    return rows;
  }

  let existingBlockIds: Set<string>;
  try {
    existingBlockIds = await new BrowserBlockExistenceQuerySource(siyuanApi).loadExistingBlockIds(blockIds);
  } catch (error) {
    logger.debug('[MissingBlockMarker] Block existence check failed, keeping rows fail-open', error);
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    if (hasMissingBlockType(row)) {
      return row;
    }

    const blockId = normalizeBrowserBlockId(row.blockId);
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
  const missing = new Set(Array.from(missingBlockIds).map(normalizeBrowserBlockId).filter(Boolean));
  if (rows.length === 0 || missing.size === 0) {
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    if (hasMissingBlockType(row)) {
      return row;
    }
    const blockId = normalizeBrowserBlockId(row.blockId);
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
    const normalized = normalizeBrowserBlockId(blockId);
    if (normalized) {
      normalizedStatusByBlockId.set(normalized, exists);
    }
  }
  if (rows.length === 0 || normalizedStatusByBlockId.size === 0) {
    return rows;
  }

  let changed = false;
  const nextRows = rows.map((row) => {
    const blockId = normalizeBrowserBlockId(row.blockId);
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

  const blockIds = normalizeBrowserBlockIds(cards.map((card) => card.blockId));
  if (blockIds.length === 0) {
    return cards.filter(hasMissingBlockType).length;
  }

  let existingBlockIds: Set<string>;
  try {
    existingBlockIds = await new BrowserBlockExistenceQuerySource(siyuanApi).loadExistingBlockIds(blockIds);
  } catch (error) {
    logger.debug('[MissingBlockMarker] Missing-card count failed, returning explicit missing metadata count only', error);
    return cards.filter(hasMissingBlockType).length;
  }

  return cards.filter((card) => {
    if (hasMissingBlockType(card)) {
      return true;
    }
    const blockId = normalizeBrowserBlockId(card.blockId);
    return Boolean(blockId) && !existingBlockIds.has(blockId);
  }).length;
}
