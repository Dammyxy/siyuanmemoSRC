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

export function resolveBrowserCardId(card: BrowserCard): string {
  return card.fsrsCardId || card.id || '';
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
