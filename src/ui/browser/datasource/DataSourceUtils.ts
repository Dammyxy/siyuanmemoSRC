import type { BrowserCard } from '../types';
import type { SortModel } from './types';
import type { FSRSCard } from '@/types/card';
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
type QuerySecondaryField = 'headline' | 'fullContent';

type BrowserCardWithHeadline = BrowserCard & { headline?: string };
type QueueFilterOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: string;
};

type DeleteCardResultLike = { ok: boolean; error?: unknown };
type DeleteCardsValueLike = {
  deletedCount?: number;
  deletedCardIds?: string[];
  failedCardIds?: string[];
};
type DeleteCardsResultLike = { ok: boolean; value?: DeleteCardsValueLike; error?: unknown };
type QueueRemoveLike = {
  removeCard?: (cardIdOrBlockId: string) => Promise<void> | void;
};
type QueueInsertLike = {
  insertAt?: (cardId: string, position: number) => Promise<void> | void;
};
type UnifiedCardManagerLike = {
  getCard: (cardId: string, options?: { silent?: boolean }) => Promise<FSRSCard>;
  updateCard: (card: FSRSCard) => Promise<void>;
};
type SuspendCardsManagerLike = {
  getCards: () => Promise<FSRSCard[]>;
  updateCard: (card: FSRSCard) => Promise<void>;
  deleteCard?: (cardId: string) => Promise<void>;
};

type QueueDueConfigLike = Partial<
  Record<
    'days' | 'maxDays' | 'minInterval' | 'maxInterval' | 'collectingPeriod' | 'reschedulingPeriod',
    unknown
  >
>;

type CardServiceLike = {
  deleteCard?: (command: { cardId: string }) => Promise<DeleteCardResultLike>;
  deleteCards?: (command: { cardIds: string[] }) => Promise<DeleteCardsResultLike>;
};

type PluginContextLike = {
  getCardService?: () => CardServiceLike | undefined;
};

export type CardServicePluginLike = {
  context?: PluginContextLike;
  getContext?: () => PluginContextLike | undefined;
};

export type DeleteCardsExecutionResult = {
  attemptedCount: number;
  deletedCount: number;
  deletedCardIds: string[];
  failedCardIds: string[];
};

export type QueueCardActionResult = {
  updated: BrowserCard[];
  skipped: BrowserCard[];
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

export function resolveBrowserCardId(card: BrowserCard): string {
  return resolveBrowserCardActionId(card);
}

export async function removeCardsFromQueue(
  queue: QueueRemoveLike | undefined,
  selectedRows: BrowserCard[],
  options?: { scope?: string; resolveId?: (row: BrowserCard) => string }
): Promise<QueueRemovalResult> {
  const scope = options?.scope || 'DataSource';
  if (!queue || typeof queue.removeCard !== 'function') {
    throw new Error(`[${scope}] Queue removeCard is unavailable`);
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

export async function insertCardsIntoQueue(
  queue: QueueInsertLike | undefined,
  selectedRows: BrowserCard[],
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
  selectedRows: BrowserCard[],
  priority: number,
  options?: { scope?: string }
): Promise<QueueCardActionResult> {
  const scope = options?.scope || 'DataSource';
  const normalizedPriority = Math.max(0, Math.min(100, Math.floor(Number(priority) || 0)));
  const updated: BrowserCard[] = [];
  const skipped: BrowserCard[] = [];

  for (const row of selectedRows || []) {
    const cardId = resolveBrowserCardId(row);
    if (!cardId) {
      skipped.push(row);
      continue;
    }

    try {
      const card = await manager.getCard(cardId);
      card.priority = normalizedPriority;
      await manager.updateCard(card);
      row.priority = normalizedPriority;
      updated.push(row);
    } catch (error) {
      skipped.push(row);
      logger.error(`[${scope}] Failed to set priority for card ${cardId}`, error);
    }
  }

  return { updated, skipped };
}

export async function toggleBrowserCardsSuspended(
  manager: SuspendCardsManagerLike,
  selectedRows: BrowserCard[],
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
  selectedRows: BrowserCard[],
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
  const updated: BrowserCard[] = [];
  const skipped: BrowserCard[] = [];
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

      row.due = new Date(newDue);
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
  row: BrowserCard,
  sortKey: string
): string | number | boolean | null {
  const rawValue = getSortContractRawValue(row, sortKey);
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

export function sortBrowserCards(rows: BrowserCard[], sortModel: SortModel[]): BrowserCard[] {
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

export function isMissingBlockCard(card: BrowserCard): boolean {
  return (card.meta as { blockType?: unknown } | undefined)?.blockType === 'missing';
}

export function applyDocFilter(cards: BrowserCard[], docId?: string): BrowserCard[] {
  const normalizedDocId = String(docId || '').trim();

  if (normalizedDocId === '__lost__') {
    return cards.filter((card) => isMissingBlockCard(card));
  }

  const nonMissingCards = cards.filter((card) => !isMissingBlockCard(card));
  if (!normalizedDocId) {
    return nonMissingCards;
  }

  return nonMissingCards.filter((card) => card.rootId === normalizedDocId);
}

export function applyLegacyPresetFilter(cards: BrowserCard[], preset?: string): BrowserCard[] {
  if (!preset || preset === 'all') {
    return cards;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return cards.filter((card) => {
    switch (preset) {
      case 'due':
        return card.due && new Date(card.due) <= today;
      case 'overdue':
        return card.due && new Date(card.due) < today;
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

export function applyCardTypeFilter(cards: BrowserCard[], cardType?: string): BrowserCard[] {
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

export function applySimpleQueryFilter(
  cards: BrowserCard[],
  queryText?: string,
  options?: { secondaryField?: QuerySecondaryField }
): BrowserCard[] {
  const normalizedQuery = String(queryText || '').trim();
  if (!normalizedQuery) {
    return cards;
  }

  const parsed = parseQuery(normalizedQuery);
  const filtered = cards.filter((card) => matchesParsedQuery(card, parsed));
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
    return (card as BrowserCardWithHeadline).headline?.toLowerCase().includes(query) || false;
  });
}

export function applyQueueFilters(
  cards: BrowserCard[],
  options: QueueFilterOptions,
  querySecondaryField: QuerySecondaryField = 'headline'
): BrowserCard[] {
  let result = cards;
  result = applyDocFilter(result, options.docId);
  result = applyLegacyPresetFilter(result, options.preset);
  result = applySimpleQueryFilter(result, options.queryText, { secondaryField: querySecondaryField });
  result = applyCardTypeFilter(result, options.cardType);
  return result;
}

function resolveCardService(plugin: CardServicePluginLike | undefined): CardServiceLike | undefined {
  if (!plugin) {
    return undefined;
  }
  return plugin.getContext?.()?.getCardService?.() ?? plugin.context?.getCardService?.();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function executeSingleDelete(
  service: CardServiceLike,
  cardIds: string[],
  scope: string
): Promise<DeleteCardsExecutionResult> {
  const deletedCardIds: string[] = [];
  const failedCardIds: string[] = [];

  for (const cardId of cardIds) {
    try {
      const result = await service.deleteCard?.({ cardId });
      if (result?.ok) {
        deletedCardIds.push(cardId);
      } else {
        failedCardIds.push(cardId);
        logger.error(`[${scope}] Failed to delete card ${cardId}`, result?.error);
      }
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

async function executeBatchDelete(
  service: CardServiceLike,
  cardIds: string[],
  scope: string
): Promise<DeleteCardsExecutionResult> {
  try {
    const result = await service.deleteCards?.({ cardIds });
    if (!result?.ok) {
      logger.error(`[${scope}] Batch delete failed`, result?.error);
      return {
        attemptedCount: cardIds.length,
        deletedCount: 0,
        deletedCardIds: [],
        failedCardIds: [...cardIds],
      };
    }

    const rawDeletedIds = Array.isArray(result.value?.deletedCardIds) ? result.value.deletedCardIds : [];
    const rawFailedIds = Array.isArray(result.value?.failedCardIds) ? result.value.failedCardIds : [];
    const deletedCount =
      typeof result.value?.deletedCount === 'number' ? Math.max(0, Math.floor(result.value.deletedCount)) : rawDeletedIds.length;

    let deletedCardIds = uniqueStrings(rawDeletedIds);
    if (deletedCardIds.length === 0 && deletedCount > 0) {
      deletedCardIds = cardIds.slice(0, Math.min(cardIds.length, deletedCount));
    }

    let failedCardIds = uniqueStrings(rawFailedIds);
    if (failedCardIds.length === 0 && deletedCardIds.length < cardIds.length) {
      const deletedSet = new Set(deletedCardIds);
      failedCardIds = cardIds.filter((cardId) => !deletedSet.has(cardId));
    }

    return {
      attemptedCount: cardIds.length,
      deletedCount: deletedCardIds.length,
      deletedCardIds,
      failedCardIds,
    };
  } catch (error) {
    logger.error(`[${scope}] Batch delete failed`, error);
    return {
      attemptedCount: cardIds.length,
      deletedCount: 0,
      deletedCardIds: [],
      failedCardIds: [...cardIds],
    };
  }
}

export async function deleteBrowserCards(
  plugin: CardServicePluginLike | undefined,
  selectedRows: BrowserCard[],
  options?: { preferBatch?: boolean; scope?: string }
): Promise<DeleteCardsExecutionResult | null> {
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

  const service = resolveCardService(plugin);
  if (!service) {
    logger.error(`[${scope}] CardApplicationService not available`);
    return null;
  }

  const preferBatch = options?.preferBatch === true;
  if (preferBatch && typeof service.deleteCards === 'function') {
    return executeBatchDelete(service, cardIds, scope);
  }

  if (typeof service.deleteCard === 'function') {
    return executeSingleDelete(service, cardIds, scope);
  }

  if (typeof service.deleteCards === 'function') {
    return executeBatchDelete(service, cardIds, scope);
  }

  logger.error(`[${scope}] CardApplicationService does not expose delete APIs`);
  return null;
}
