import type { BrowserCard } from '../types';
import type { BrowserActionTarget, SortModel } from './types';
import type { FSRSCard } from '@/types/card';
import type {
  BatchCardDeleteResult,
  BatchCardMutationResult,
  QueueType,
  type IUnifiedDataSourceManagerFacade,
  QueueBulkMutationResult,
} from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import { batchSuspend } from '../browserService';
import {
  applyCardTypeFilter as applyCardTypeFilterShared,
  applyDocFilter as applyDocFilterShared,
  applyLegacyPresetFilter as applyLegacyPresetFilterShared,
  applyQueueFilters as applyQueueFiltersShared,
  applyQueueFiltersToSnapshotRows as applyQueueFiltersToSnapshotRowsShared,
  applySimpleQueryFilter as applySimpleQueryFilterShared,
  isMissingBlockCard as isMissingBlockCardShared,
  sortBrowserRows as sortBrowserRowsShared,
  sortQueueSnapshotRows as sortQueueSnapshotRowsShared,
  type QuerySecondaryField,
  type QueueFilterOptions,
} from '@/application/queries/browser/shared/BrowserRowUtils';
import { resolveBrowserCardActionId } from '../utils/browserCardIdentity';

const logger = createLogger('DataSourceUtils');

export type { QuerySecondaryField, QueueFilterOptions };

export {
  applyCardTypeFilterShared as applyCardTypeFilter,
  applyDocFilterShared as applyDocFilter,
  applyLegacyPresetFilterShared as applyLegacyPresetFilter,
  applyQueueFiltersShared as applyQueueFilters,
  applyQueueFiltersToSnapshotRowsShared as applyQueueFiltersToSnapshotRows,
  applySimpleQueryFilterShared as applySimpleQueryFilter,
  isMissingBlockCardShared as isMissingBlockCard,
  sortBrowserRowsShared as sortBrowserRows,
  sortQueueSnapshotRowsShared as sortQueueSnapshotRows,
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

export type RelativePriorityActionResult = {
  delta: number;
  lowerBoundReached: boolean;
  skipped: BrowserActionTarget[];
  updated: BrowserActionTarget[];
  upperBoundReached: boolean;
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
  removalPort: QueueRemoveLike | null | undefined,
  selectedRows: BrowserActionTarget[],
  options?: { scope?: string; resolveId?: (row: BrowserActionTarget) => string }
): Promise<QueueRemovalResult> {
  const scope = options?.scope || 'DataSource';
  if (!removalPort || (typeof removalPort.removeCards !== 'function' && typeof removalPort.removeCard !== 'function')) {
    throw new Error(`[${scope}] Queue removeCard is unavailable`);
  }

  if (typeof removalPort.removeCards === 'function') {
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
      const result = await Promise.resolve(removalPort.removeCards(uniqueCardIds));
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
      await Promise.resolve(removalPort.removeCard(cardId));
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
): QueueRemoveLike | null {
  if (typeof manager.batchRemoveFromQueue === 'function') {
    return {
      removeCards: (cardIdsOrBlockIds: string[]) => manager.batchRemoveFromQueue!(queueType, cardIdsOrBlockIds),
    };
  }
  return null;
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

export async function adjustBrowserCardsPriorityRelative(
  manager: UnifiedCardManagerLike,
  selectedRows: BrowserActionTarget[],
  delta: number,
  options?: { scope?: string }
): Promise<RelativePriorityActionResult> {
  const scope = options?.scope || 'DataSource';
  const normalizedDelta = Math.trunc(Number(delta) || 0);
  const updated: BrowserActionTarget[] = [];
  const skipped: BrowserActionTarget[] = [];
  const rowsByCardId = new Map<string, BrowserActionTarget[]>();
  const nextPriorityByCardId = new Map<string, number>();
  let lowerBoundReached = false;
  let upperBoundReached = false;

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

  const cardsToUpdate: FSRSCard[] = [];
  const loadFailedIds = new Set<string>();

  for (const cardId of rowsByCardId.keys()) {
    try {
      const card = await manager.getCard(cardId);
      const currentPriority = Number.isFinite(Number(card.priority)) ? Number(card.priority) : 50;
      const nextPriority = Math.max(0, Math.min(100, Math.floor(currentPriority + normalizedDelta)));
      lowerBoundReached = lowerBoundReached || nextPriority === 0;
      upperBoundReached = upperBoundReached || nextPriority === 100;
      nextPriorityByCardId.set(cardId, nextPriority);
      cardsToUpdate.push({
        ...card,
        priority: nextPriority,
      });
    } catch (error) {
      loadFailedIds.add(cardId);
      skipped.push(...(rowsByCardId.get(cardId) || []));
      logger.error(`[${scope}] Failed to load card ${cardId} before relative priority batch`, error);
    }
  }

  if (cardsToUpdate.length === 0) {
    return { delta: normalizedDelta, lowerBoundReached, skipped, updated, upperBoundReached };
  }

  if (typeof manager.batchUpdateCards === 'function') {
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
        const nextPriority = nextPriorityByCardId.get(cardId);
        if (failedIds.has(cardId) || !updatedIdSet.has(cardId) || nextPriority == null) {
          skipped.push(...rows);
          continue;
        }
        for (const row of rows) {
          row.priority = nextPriority;
          updated.push(row);
        }
      }
    } catch (error) {
      skipped.push(
        ...Array.from(rowsByCardId.entries())
          .filter(([cardId]) => !loadFailedIds.has(cardId))
          .flatMap(([, rows]) => rows)
      );
      logger.error(`[${scope}] Failed to bulk adjust relative priority`, error);
    }

    return { delta: normalizedDelta, lowerBoundReached, skipped, updated, upperBoundReached };
  }

  for (const card of cardsToUpdate) {
    const cardId = String(card.id || '').trim();
    const rows = rowsByCardId.get(cardId) || [];
    try {
      await manager.updateCard(card);
      const nextPriority = nextPriorityByCardId.get(cardId);
      for (const row of rows) {
        if (nextPriority != null) {
          row.priority = nextPriority;
        }
        updated.push(row);
      }
    } catch (error) {
      skipped.push(...rows);
      logger.error(`[${scope}] Failed to adjust relative priority for card ${cardId}`, error);
    }
  }

  return { delta: normalizedDelta, lowerBoundReached, skipped, updated, upperBoundReached };
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

export function sortBrowserCards(rows: BrowserCard[], sortModel: SortModel[]): BrowserCard[] {
  return sortBrowserRowsShared(rows, sortModel);
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
