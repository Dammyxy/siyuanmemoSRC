import type { BrowserCard } from '../types';
import type { BrowserActionTarget, SortModel } from './types';
import type { FSRSCard } from '@/types/card';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import type {
  BatchCardDeleteResult,
  BatchCardMutationResult,
  QueueType,
  type IUnifiedDataSourceManagerFacade,
  QueueBulkMutationResult,
} from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import { batchSuspend, parseQuery } from '../browserService';
import {
  getSortContractRawValue,
  getSortContractValueType,
  type SortValueType,
} from '../config/sortDisplayContract';
import { matchesParsedQuery } from '../utils/cardFilters';
import { normalizeSortModel } from '../utils/sortModel';
import { resolveBrowserCardActionId } from '../utils/browserCardIdentity';

const logger = createLogger('DataSourceUtils');

type CardTypeFilterValue = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';
export type QuerySecondaryField = 'headline' | 'fullContent';

type BrowserCardWithHeadline = BrowserCard & { headline?: string };
type QueueFilterRowLike = {
  id?: string;
  blockId?: string;
  rootId?: string;
  cardType?: string;
  state?: number;
  due?: unknown;
  suspended?: boolean;
  content?: string;
  fullContent?: string;
  deckId?: string;
  tags?: string[];
  priority?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  difficulty?: number;
  retrievability?: number;
  stability?: number;
  blockType?: string | null;
  meta?: unknown;
  headline?: string;
};
type BrowserSortRowLike = {
  id?: unknown;
  blockId?: unknown;
} & Record<string, unknown>;
export type QueueFilterOptions = {
  docId?: string;
  scopeDocIds?: string[] | null;
  preset?: string;
  queryText?: string;
  cardType?: string;
};

type QueueRemoveLike = {
  removeCard?: (cardIdOrBlockId: string) => Promise<void> | void;
  removeCards?: (cardIdsOrBlockIds: string[]) => Promise<QueueBulkMutationResult> | QueueBulkMutationResult;
};
type QueueInsertLike = {
  insertAt?: (cardId: string, position: number) => Promise<void> | void;
};
type UnifiedCardManagerLike = {
  getCard: (cardId: string, options?: { silent?: boolean }) => Promise<FSRSCard>;
  updateCard: (card: FSRSCard) => Promise<void>;
  batchUpdateCards?: (cards: FSRSCard[]) => Promise<BatchCardMutationResult>;
};
type SuspendCardsManagerLike = {
  getCards: () => Promise<FSRSCard[]>;
  updateCard: (card: FSRSCard) => Promise<void>;
  deleteCard?: (cardId: string) => Promise<void>;
};
type BrowserDeleteManagerLike = {
  deleteCard?: (cardId: string) => Promise<void> | void;
  batchDeleteCards?: (
    cardIds: string[],
    options?: { blockIds?: string[] }
  ) => Promise<BatchCardDeleteResult> | BatchCardDeleteResult;
};

type QueueDueConfigLike = Partial<
  Record<
    'days' | 'maxDays' | 'minInterval' | 'maxInterval' | 'collectingPeriod' | 'reschedulingPeriod',
    unknown
  >
>;

export type DeleteCardsExecutionResult = {
  attemptedCount: number;
  deletedCount: number;
  deletedCardIds: string[];
  failedCardIds: string[];
};

export type QueueCardActionResult = {
  updated: BrowserActionTarget[];
  skipped: BrowserActionTarget[];
};

export type QueueRemovalResult = {
  removedCount: number;
  failedCount: number;
  failedIds: string[];
};

export type QueueInsertResult = {
  insertedCount: number;
  failedCount: number;
  failedIds: string[];
};

export type QueueDueAdjustAction = 'postpone' | 'advance' | 'spread';
export type QueueDueAdjustContext = {
  days?: unknown;
  maxDays?: unknown;
  config?: QueueDueConfigLike;
};

export type QueueDueAdjustResult = QueueCardActionResult & {
  days: number;
  averageCardsPerDay?: number;
};

export function resolveBrowserCardId(card: BrowserActionTarget): string {
  return resolveBrowserCardActionId(card as BrowserCard);
}

export async function removeCardsFromQueue(
  queue: QueueRemoveLike | undefined,
  selectedRows: BrowserActionTarget[],
  options?: { scope?: string; resolveId?: (row: BrowserActionTarget) => string }
): Promise<QueueRemovalResult> {
  const scope = options?.scope || 'DataSource';
  if (!queue || (typeof queue.removeCards !== 'function' && typeof queue.removeCard !== 'function')) {
    throw new Error(`[${scope}] Queue removeCard is unavailable`);
  }

  if (typeof queue.removeCards === 'function') {
    const failedIds: string[] = [];
    const cardIds: string[] = [];
    for (const row of selectedRows || []) {
      const cardId = options?.resolveId?.(row) || resolveBrowserCardId(row);
      if (!cardId) {
        failedIds.push(String(row?.blockId || row?.id || ''));
        continue;
      }
      cardIds.push(cardId);
    }

    const uniqueCardIds = uniqueStrings(cardIds);
    if (uniqueCardIds.length === 0) {
      return {
        removedCount: 0,
        failedCount: failedIds.length,
        failedIds: uniqueStrings(failedIds),
      };
    }

    try {
      const result = await Promise.resolve(queue.removeCards(uniqueCardIds));
      const resultFailedIds = Array.isArray(result.failedIds) ? result.failedIds : [];
      const mergedFailedIds = uniqueStrings([...failedIds, ...resultFailedIds]);
      return {
        removedCount: result.changedCount,
        failedCount: mergedFailedIds.length,
        failedIds: mergedFailedIds,
      };
    } catch (error) {
      logger.error(`[${scope}] Failed to bulk remove ${uniqueCardIds.length} cards`, error);
      return {
        removedCount: 0,
        failedCount: uniqueCardIds.length + failedIds.length,
        failedIds: uniqueStrings([...failedIds, ...uniqueCardIds]),
      };
    }
  }

  let removedCount = 0;
  const failedIds: string[] = [];
  for (const row of selectedRows || []) {
    const cardId = options?.resolveId?.(row) || resolveBrowserCardId(row);
    if (!cardId) {
      failedIds.push(String(row?.blockId || row?.id || ''));
      continue;
    }

    try {
      await Promise.resolve(queue.removeCard(cardId));
      removedCount++;
    } catch (error) {
      failedIds.push(cardId);
      logger.error(`[${scope}] Failed to remove card ${cardId}`, error);
    }
  }

  return {
    removedCount,
    failedCount: failedIds.length,
    failedIds: uniqueStrings(failedIds),
  };
}

export function resolveQueueRemovalTarget(
  manager: IUnifiedDataSourceManagerFacade,
  queueType: QueueType
): QueueRemoveLike {
  if (typeof manager.batchRemoveFromQueue === 'function') {
    return {
      removeCards: (cardIdsOrBlockIds: string[]) => manager.batchRemoveFromQueue!(queueType, cardIdsOrBlockIds),
    };
  }
  return manager.getQueue(queueType);
}

export async function insertCardsIntoQueue(
  queue: QueueInsertLike | undefined,
  selectedRows: BrowserActionTarget[],
  index: number,
  options?: { scope?: string }
): Promise<QueueInsertResult> {
  const scope = options?.scope || 'DataSource';
  if (!queue || typeof queue.insertAt !== 'function') {
    throw new Error(`[${scope}] Queue insertAt is unavailable`);
  }

  const baseIndex = Math.max(0, Math.floor(index));
  const basePosition = baseIndex + 1;

  let insertedCount = 0;
  const failedIds: string[] = [];
  for (const row of selectedRows || []) {
    const cardId = resolveBrowserCardId(row);
    if (!cardId) {
      failedIds.push(String(row?.blockId || row?.id || ''));
      continue;
    }

    try {
      await Promise.resolve(queue.insertAt(cardId, basePosition + insertedCount));
      insertedCount++;
    } catch (error) {
      failedIds.push(cardId);
      logger.error(`[${scope}] Failed to insert card ${cardId}`, error);
    }
  }

  return {
    insertedCount,
    failedCount: failedIds.length,
    failedIds: uniqueStrings(failedIds),
  };
}

export async function setBrowserCardsPriority(
  manager: UnifiedCardManagerLike,
  selectedRows: BrowserActionTarget[],
  priority: number,
  options?: { scope?: string }
): Promise<QueueCardActionResult> {
  const scope = options?.scope || 'DataSource';
  const normalizedPriority = Math.max(0, Math.min(100, Math.floor(Number(priority) || 0)));
  const updated: BrowserActionTarget[] = [];
  const skipped: BrowserActionTarget[] = [];
  const rowsByCardId = new Map<string, BrowserActionTarget[]>();

  for (const row of selectedRows || []) {
    const cardId = resolveBrowserCardId(row);
    if (!cardId) {
      skipped.push(row);
      continue;
    }

    const rows = rowsByCardId.get(cardId);
    if (rows) {
      rows.push(row);
    } else {
      rowsByCardId.set(cardId, [row]);
    }
  }

  if (typeof manager.batchUpdateCards === 'function') {
    const cardsToUpdate: FSRSCard[] = [];
    const loadFailedIds = new Set<string>();

    for (const cardId of rowsByCardId.keys()) {
      try {
        const card = await manager.getCard(cardId);
        cardsToUpdate.push({
          ...card,
          priority: normalizedPriority,
        });
      } catch (error) {
        loadFailedIds.add(cardId);
        skipped.push(...(rowsByCardId.get(cardId) || []));
        logger.error(`[${scope}] Failed to load card ${cardId} before priority batch`, error);
      }
    }

    if (cardsToUpdate.length === 0) {
      return { updated, skipped };
    }

    try {
      const result = await manager.batchUpdateCards(cardsToUpdate);
      const failedIds = new Set((result.failedCardIds || []).map((id) => String(id || '').trim()).filter(Boolean));
      const updatedIds = (result.updatedCardIds?.length ? result.updatedCardIds : cardsToUpdate.map((card) => card.id))
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      const updatedIdSet = new Set(updatedIds);

      for (const cardId of rowsByCardId.keys()) {
        if (loadFailedIds.has(cardId)) {
          continue;
        }
        const rows = rowsByCardId.get(cardId) || [];
        if (failedIds.has(cardId) || !updatedIdSet.has(cardId)) {
          skipped.push(...rows);
          continue;
        }
        for (const row of rows) {
          row.priority = normalizedPriority;
          updated.push(row);
        }
      }
    } catch (error) {
      skipped.push(
        ...Array.from(rowsByCardId.entries())
          .filter(([cardId]) => !loadFailedIds.has(cardId))
          .flatMap(([, rows]) => rows)
      );
      logger.error(`[${scope}] Failed to bulk set priority`, error);
    }

    return { updated, skipped };
  }

  for (const [cardId, rows] of rowsByCardId.entries()) {
    try {
      const card = await manager.getCard(cardId);
      card.priority = normalizedPriority;
      await manager.updateCard(card);
      for (const row of rows) {
        row.priority = normalizedPriority;
        updated.push(row);
      }
    } catch (error) {
      skipped.push(...rows);
      logger.error(`[${scope}] Failed to set priority for card ${cardId}`, error);
    }
  }

  return { updated, skipped };
}

export async function toggleBrowserCardsSuspended(
  manager: SuspendCardsManagerLike,
  selectedRows: BrowserActionTarget[],
  suspended: boolean,
  options?: { scope?: string }
): Promise<number> {
  const scope = options?.scope || 'DataSource';
  const blockIds = uniqueStrings(
    (selectedRows || []).map((row) => String(row?.blockId || '')).filter(Boolean)
  );

  if (blockIds.length === 0) {
    return 0;
  }

  try {
    return await batchSuspend(
      blockIds,
      suspended,
      manager as Parameters<typeof batchSuspend>[2]
    );
  } catch (error) {
    logger.error(`[${scope}] Failed to toggle suspended state`, error);
    throw error;
  }
}

function parsePositiveDays(candidate: unknown): number | null {
  const value = Math.floor(Number(candidate));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveAdjustDays(action: QueueDueAdjustAction, context?: QueueDueAdjustContext): number {
  const config = context?.config;

  const directDays =
    parsePositiveDays(context?.days) ??
    parsePositiveDays(context?.maxDays) ??
    parsePositiveDays(config?.days) ??
    parsePositiveDays(config?.maxDays);
  if (directDays) {
    return directDays;
  }

  if (action === 'postpone') {
    return (
      parsePositiveDays(config?.minInterval) ??
      parsePositiveDays(config?.maxInterval) ??
      1
    );
  }

  if (action === 'spread') {
    return (
      parsePositiveDays(config?.collectingPeriod) ??
      parsePositiveDays(config?.reschedulingPeriod) ??
      1
    );
  }

  return 1;
}

export async function adjustBrowserCardsDue(
  manager: UnifiedCardManagerLike,
  selectedRows: BrowserActionTarget[],
  action: QueueDueAdjustAction,
  context?: QueueDueAdjustContext,
  options?: { scope?: string; postponeFromNow?: boolean; allowSpread?: boolean }
): Promise<QueueDueAdjustResult> {
  const scope = options?.scope || 'DataSource';
  if (action === 'spread' && options?.allowSpread === false) {
    throw new Error(`[${scope}] Spread action is not supported`);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days = resolveAdjustDays(action, context);
  const now = Date.now();
  const updated: BrowserActionTarget[] = [];
  const skipped: BrowserActionTarget[] = [];
  const cards = selectedRows || [];

  for (let i = 0; i < cards.length; i++) {
    const row = cards[i];
    const cardId = resolveBrowserCardId(row);
    if (!cardId) {
      skipped.push(row);
      continue;
    }

    try {
      const card = await manager.getCard(cardId);
      let newDue = Number(card.due) || now;

      if (action === 'postpone') {
        const baseDue = options?.postponeFromNow ? Math.max(newDue, now) : newDue;
        newDue = baseDue + days * dayMs;
      } else if (action === 'advance') {
        newDue = newDue - days * dayMs;
      } else {
        const spreadOffset = Math.floor((i / Math.max(1, cards.length)) * days * dayMs);
        newDue = newDue + spreadOffset;
      }

      card.due = newDue;
      await manager.updateCard(card);

      updated.push(row);
    } catch (error) {
      skipped.push(row);
      logger.error(`[${scope}] Failed to ${action} card ${cardId}`, error);
    }
  }

  const result: QueueDueAdjustResult = { updated, skipped, days };
  if (action === 'spread') {
    result.averageCardsPerDay = days > 0 ? updated.length / days : updated.length;
  }
  return result;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toComparableSortValue(
  row: BrowserSortRowLike,
  sortKey: string
): string | number | boolean | null {
  const rawValue = getSortContractRawValue(row as unknown as BrowserCard, sortKey);
  const valueType = getSortContractValueType(sortKey);
  return normalizeComparableSortValue(rawValue, valueType);
}

function normalizeComparableSortValue(
  rawValue: unknown,
  valueType: SortValueType | null
): string | number | boolean | null {
  if (valueType === 'number') {
    return toFiniteNumber(rawValue);
  }

  if (valueType === 'date') {
    return toTimestamp(rawValue);
  }

  if (valueType === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    if (rawValue === 'true' || rawValue === 1) {
      return true;
    }
    if (rawValue === 'false' || rawValue === 0) {
      return false;
    }
    return null;
  }

  if (valueType === 'string') {
    if (rawValue == null) {
      return null;
    }
    const normalized = String(rawValue).trim();
    return normalized || null;
  }

  if (rawValue == null) {
    return null;
  }

  if (rawValue instanceof Date) {
    return toTimestamp(rawValue);
  }

  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim();
    if (!normalized) {
      return null;
    }

    const numeric = toFiniteNumber(normalized);
    if (numeric != null) {
      return numeric;
    }

    const timestamp = toTimestamp(normalized);
    if (timestamp != null) {
      return timestamp;
    }

    return normalized;
  }

  return String(rawValue);
}

function compareSortValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === 'number' && typeof right === 'number') {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }

  const compared = String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (compared < 0) return -1;
  if (compared > 0) return 1;
  return 0;
}

export function sortBrowserRows<TRow extends BrowserSortRowLike>(
  rows: TRow[],
  sortModel: SortModel[]
): TRow[] {
  if (!sortModel?.length) return rows;

  const normalizedSortModel = normalizeSortModel(sortModel);

  if (!normalizedSortModel.length) {
    return rows;
  }

  const copy = [...rows];

  copy.sort((a, b) => {
    for (const { colId, sort } of normalizedSortModel) {
      const dir = sort === 'desc' ? -1 : 1;
      const key = String(colId || '').trim();
      const av = toComparableSortValue(a, key);
      const bv = toComparableSortValue(b, key);

      if (av == null || bv == null) {
        if (av == null && bv == null) {
          continue;
        }
        // Keep invalid values at the bottom regardless of sort direction.
        return av == null ? 1 : -1;
      }

      const compared = compareSortValues(av, bv);
      if (compared !== 0) {
        return compared * dir;
      }
    }

    const blockCompare = String(a.blockId || '').localeCompare(String(b.blockId || ''));
    if (blockCompare !== 0) {
      return blockCompare;
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return copy;
}

export function sortBrowserCards(rows: BrowserCard[], sortModel: SortModel[]): BrowserCard[] {
  return sortBrowserRows(rows as unknown as BrowserSortRowLike[], sortModel) as unknown as BrowserCard[];
}

export function sortQueueSnapshotRows(
  rows: QueueSnapshotRow[],
  sortModel: SortModel[]
): QueueSnapshotRow[] {
  if (!sortModel?.length) {
    return rows;
  }

  const normalizedSortModel = normalizeSortModel(sortModel);
  if (!normalizedSortModel.length) {
    return rows;
  }

  const copy = [...rows];
  copy.sort((a, b) => {
    for (const { colId, sort } of normalizedSortModel) {
      const dir = sort === 'desc' ? -1 : 1;
      const key = String(colId || '').trim();
      const av = toComparableSortValue(a as unknown as BrowserSortRowLike, key);
      const bv = toComparableSortValue(b as unknown as BrowserSortRowLike, key);

      if (av == null || bv == null) {
        if (av == null && bv == null) {
          continue;
        }
        return av == null ? 1 : -1;
      }

      const compared = compareSortValues(av, bv);
      if (compared !== 0) {
        return compared * dir;
      }
    }

    const queueIndexDiff = Number(a.queueIndex || 0) - Number(b.queueIndex || 0);
    if (queueIndexDiff !== 0) {
      return queueIndexDiff;
    }

    const blockCompare = String(a.blockId || '').localeCompare(String(b.blockId || ''));
    if (blockCompare !== 0) {
      return blockCompare;
    }

    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return copy;
}

export type PaginationSliceResult = {
  rows: BrowserCard[];
  totalCount: number;
  startRow: number;
  endRow: number;
};

function normalizeRowBoundary(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

export function paginateBrowserCards(
  rows: BrowserCard[],
  startRow?: number,
  endRow?: number
): PaginationSliceResult {
  const totalCount = rows.length;
  const normalizedStart = normalizeRowBoundary(startRow, 0);
  const defaultEnd = totalCount;
  const normalizedEndCandidate = normalizeRowBoundary(endRow, defaultEnd);
  const normalizedEnd = endRow == null ? defaultEnd : normalizedEndCandidate;
  const safeStart = Math.min(normalizedStart, totalCount);
  const safeEnd = Math.max(safeStart, Math.min(normalizedEnd, totalCount));

  return {
    rows: rows.slice(safeStart, safeEnd),
    totalCount,
    startRow: safeStart,
    endRow: safeEnd,
  };
}

export function sortAndPaginateBrowserCards(
  rows: BrowserCard[],
  sortModel: SortModel[],
  startRow?: number,
  endRow?: number
): PaginationSliceResult {
  const sortedRows = sortBrowserCards(rows, sortModel);
  return paginateBrowserCards(sortedRows, startRow, endRow);
}

function hasMissingBlockType(card: QueueFilterRowLike): boolean {
  const metaBlockType = (
    card.meta && typeof card.meta === 'object'
      ? (card.meta as { blockType?: unknown }).blockType
      : undefined
  );
  return card.blockType === 'missing' || metaBlockType === 'missing';
}

export function isMissingBlockCard(card: QueueFilterRowLike): boolean {
  return hasMissingBlockType(card);
}

function toDueTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeScopeDocIds(scopeDocIds?: string[] | null): string[] {
  return Array.from(new Set(
    (scopeDocIds || [])
      .map((docId) => String(docId || '').trim())
      .filter(Boolean)
  ));
}

export function applyDocFilter<TRow extends QueueFilterRowLike>(
  cards: TRow[],
  docId?: string,
  scopeDocIds?: string[] | null,
): TRow[] {
  const normalizedDocId = String(docId || '').trim();
  const normalizedScopeDocIds = normalizeScopeDocIds(scopeDocIds);
  const scopeDocIdSet = normalizedScopeDocIds.length > 0 ? new Set(normalizedScopeDocIds) : null;

  if (normalizedDocId === '__lost__') {
    let missingCards = cards.filter((card) => isMissingBlockCard(card));
    if (scopeDocIdSet) {
      missingCards = missingCards.filter((card) => scopeDocIdSet.has(String(card.rootId || '').trim()));
    }
    return missingCards;
  }

  let result = cards.filter((card) => !isMissingBlockCard(card));
  if (scopeDocIdSet) {
    result = result.filter((card) => scopeDocIdSet.has(String(card.rootId || '').trim()));
  }

  if (!normalizedDocId) {
    return result;
  }

  return result.filter((card) => String(card.rootId || '').trim() === normalizedDocId);
}

export function applyLegacyPresetFilter<TRow extends QueueFilterRowLike>(cards: TRow[], preset?: string): TRow[] {
  if (!preset || preset === 'all') {
    return cards;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return cards.filter((card) => {
    const dueTimestamp = toDueTimestamp(card.due);
    switch (preset) {
      case 'due':
        return dueTimestamp != null && dueTimestamp <= today;
      case 'overdue':
        return dueTimestamp != null && dueTimestamp < today;
      case 'new':
        return card.state === 0;
      case 'leech':
        return (card.lapses || 0) > 0;
      case 'suspended':
        return card.suspended === true;
      default:
        return true;
    }
  });
}

export function applyCardTypeFilter<TRow extends QueueFilterRowLike>(cards: TRow[], cardType?: string): TRow[] {
  if (!cardType || cardType === 'all') {
    return cards;
  }

  const normalized = cardType as CardTypeFilterValue;

  return cards.filter((card) => {
    switch (normalized) {
      case 'topic-only':
        return card.cardType === 'topic';
      case 'item-only':
        return card.cardType === 'item' || !card.cardType;
      case 'concept-only':
        return card.cardType === 'concept';
      case 'descriptor-only':
        return card.cardType === 'descriptor';
      case 'missing-block-only':
        return isMissingBlockCard(card);
      default:
        return true;
    }
  });
}

function normalizeSimpleQuery(queryText?: string): string | null {
  if (!queryText) {
    return null;
  }

  const query = queryText.toLowerCase().trim();
  if (!query) {
    return null;
  }

  if (
    query.startsWith('tag:') ||
    query.startsWith('deck:') ||
    query.startsWith('state:') ||
    query.startsWith('doc:')
  ) {
    return null;
  }

  return query;
}

export function applySimpleQueryFilter<TRow extends QueueFilterRowLike>(
  cards: TRow[],
  queryText?: string,
  options?: { secondaryField?: QuerySecondaryField }
): TRow[] {
  const normalizedQuery = String(queryText || '').trim();
  if (!normalizedQuery) {
    return cards;
  }

  const parsed = parseQuery(normalizedQuery);
  const filtered = cards.filter((card) => matchesParsedQuery(card as unknown as BrowserCard, parsed));
  if (filtered.length > 0 || !options?.secondaryField) {
    return filtered;
  }

  // Fallback keeps legacy behavior when free-text query only matches headline.
  const query = normalizeSimpleQuery(queryText);
  if (!query) {
    return filtered;
  }
  return cards.filter((card) => {
    const content = card.content?.toLowerCase() || '';
    if (content.includes(query)) {
      return true;
    }
    if (options.secondaryField === 'fullContent') {
      return card.fullContent?.toLowerCase().includes(query) || false;
    }
    return (card as unknown as BrowserCardWithHeadline).headline?.toLowerCase().includes(query) || false;
  });
}

export function applyQueueFilters<TRow extends QueueFilterRowLike>(
  cards: TRow[],
  options: QueueFilterOptions,
  querySecondaryField: QuerySecondaryField = 'headline'
): TRow[] {
  let result = cards;
  result = applyDocFilter(result, options.docId, options.scopeDocIds);
  result = applyLegacyPresetFilter(result, options.preset);
  result = applySimpleQueryFilter(result, options.queryText, { secondaryField: querySecondaryField });
  result = applyCardTypeFilter(result, options.cardType);
  return result;
}

export function applyQueueFiltersToSnapshotRows(
  rows: QueueSnapshotRow[],
  options: QueueFilterOptions,
  querySecondaryField: QuerySecondaryField = 'headline'
): QueueSnapshotRow[] {
  return applyQueueFilters(rows, options, querySecondaryField);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function executeBrowserManagerDelete(
  manager: BrowserDeleteManagerLike,
  cardIds: string[],
  scope: string
): Promise<DeleteCardsExecutionResult> {
  const deletedCardIds: string[] = [];
  const failedCardIds: string[] = [];

  for (const cardId of cardIds) {
    try {
      await Promise.resolve(manager.deleteCard?.(cardId));
      deletedCardIds.push(cardId);
    } catch (error) {
      failedCardIds.push(cardId);
      logger.error(`[${scope}] Failed to delete card ${cardId}`, error);
    }
  }

  return {
    attemptedCount: cardIds.length,
    deletedCount: deletedCardIds.length,
    deletedCardIds: uniqueStrings(deletedCardIds),
    failedCardIds: uniqueStrings(failedCardIds),
  };
}

export async function deleteBrowserCards(
  manager: BrowserDeleteManagerLike | undefined,
  selectedRows: BrowserActionTarget[],
  options?: { scope?: string }
): Promise<DeleteCardsExecutionResult> {
  const scope = options?.scope || 'DataSource';
  const cardIds = uniqueStrings(
    (selectedRows || [])
      .map((row) => resolveBrowserCardId(row))
      .filter(Boolean)
  );

  if (cardIds.length === 0) {
    return {
      attemptedCount: 0,
      deletedCount: 0,
      deletedCardIds: [],
      failedCardIds: [],
    };
  }

  if (!manager || (typeof manager.deleteCard !== 'function' && typeof manager.batchDeleteCards !== 'function')) {
    logger.error(`[${scope}] UnifiedDataSourceManager.deleteCard is unavailable`);
    return {
      attemptedCount: cardIds.length,
      deletedCount: 0,
      deletedCardIds: [],
      failedCardIds: [...cardIds],
    };
  }

  if (typeof manager.batchDeleteCards === 'function') {
    const blockIds = uniqueStrings(
      (selectedRows || [])
        .map((row) => String(row?.blockId || '').trim())
        .filter(Boolean)
    );
    try {
      const result = await Promise.resolve(manager.batchDeleteCards(cardIds, { blockIds }));
      return {
        attemptedCount: result.attemptedCount,
        deletedCount: result.deletedCount,
        deletedCardIds: uniqueStrings(result.deletedCardIds || []),
        failedCardIds: uniqueStrings(result.failedCardIds || []),
      };
    } catch (error) {
      logger.error(`[${scope}] Failed to batch delete ${cardIds.length} cards`, error);
      return {
        attemptedCount: cardIds.length,
        deletedCount: 0,
        deletedCardIds: [],
        failedCardIds: [...cardIds],
      };
    }
  }

  return executeBrowserManagerDelete(manager, cardIds, scope);
}
