import type { BrowserCard } from '../types';
import type { SortModel } from './types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DataSourceUtils');

type CardTypeFilterValue = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';
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
  getCard: (cardId: string, options?: { silent?: boolean }) => Promise<any>;
  updateCard: (card: any) => Promise<void>;
};

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

export type QueueDueAdjustResult = QueueCardActionResult & {
  days: number;
  averageCardsPerDay?: number;
};

export function resolveBrowserCardId(card: BrowserCard): string {
  return card.fsrsCardId || card.id || '';
}

export async function removeCardsFromQueue(
  queue: QueueRemoveLike | undefined,
  selectedRows: BrowserCard[],
  options?: { scope?: string }
): Promise<QueueRemovalResult> {
  const scope = options?.scope || 'DataSource';
  if (!queue || typeof queue.removeCard !== 'function') {
    throw new Error(`[${scope}] Queue removeCard is unavailable`);
  }

  let removedCount = 0;
  const failedIds: string[] = [];
  for (const row of selectedRows || []) {
    const cardId = resolveBrowserCardId(row);
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

function parsePositiveDays(candidate: unknown): number | null {
  const value = Math.floor(Number(candidate));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveAdjustDays(action: QueueDueAdjustAction, context?: any): number {
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
  context?: any,
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

export function sortBrowserCards(rows: BrowserCard[], sortModel: SortModel[]): BrowserCard[] {
  if (!sortModel?.length) return rows;

  const [{ colId, sort }] = sortModel;
  const dir = sort === 'desc' ? -1 : 1;
  const key = String(colId || '');
  const copy = [...rows];

  copy.sort((a, b) => {
    const av = (a as Record<string, unknown>)?.[key];
    const bv = (b as Record<string, unknown>)?.[key];

    if (av == null && bv == null) return 0;
    if (av == null) return -1 * dir;
    if (bv == null) return 1 * dir;
    if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;

    return String(av).localeCompare(String(bv)) * dir;
  });

  return copy;
}

export function applyDocFilter(cards: BrowserCard[], docId?: string): BrowserCard[] {
  if (!docId) {
    return cards;
  }
  return cards.filter((card) => card.rootId === docId);
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
  const query = normalizeSimpleQuery(queryText);
  if (!query) {
    return cards;
  }

  const secondaryField = options?.secondaryField ?? 'headline';
  return cards.filter((card) => {
    const content = card.content?.toLowerCase() || '';
    if (content.includes(query)) {
      return true;
    }

    if (secondaryField === 'fullContent') {
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
