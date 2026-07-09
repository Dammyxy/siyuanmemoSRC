import type {
  CardFilter,
  DataChangeEvent,
  IDataSourceObserver,
  IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import {
  isCdfLiveRelationQueueEligible,
  hasCdfLiveRelationMetadata,
  readCdfLiveRelationMetadata,
} from '@/core/card/cdf-live-relation';
import type {
  RefreshCurrentItemOptions,
  ReviewMidSessionInsertedDiagnostic,
  ReviewMidSessionInsertedOrigin,
} from './types';
import type { ReviewFilterCommandClient, ReviewFilterGroupQueueLike } from './reviewFilterCommands';
import { isProgressiveExcerptCard } from './reviewProgressiveExcerptCommands';

type ReviewDataObserverLogger = {
  debug?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export type ReviewDataObserverReference = {
  cardId?: string;
  blockId?: string;
};

export type ReviewTailAppendQueueStrategyLike = {
  appendCardsToTail?: (cards: FSRSCard[]) => number;
};

export type ReviewActiveQueueLike = {
  next?: () => Promise<unknown>;
};

export type ReviewDataObserverRuntimeOptions = {
  logger?: ReviewDataObserverLogger;
  now?: () => number;
  notifyMidSessionInserted?: (input: {
    count: number;
    origin: ReviewMidSessionInsertedOrigin;
    cards: FSRSCard[];
  }) => void;
  getManager: () => IUnifiedDataSourceManagerFacade | null;
  getFilterGroupQueue: () => ReviewFilterGroupQueueLike | null;
  getFilterCommandClient: () => ReviewFilterCommandClient | null;
  getQueueStrategyWithTailAppend: () => ReviewTailAppendQueueStrategyLike | null;
  getActiveQueueStrategy: () => ReviewActiveQueueLike | null;
  getCurrentReference: () => { cardId: string; blockId: string };
  getCurrentCard: () => FSRSCard | null | undefined;
  getSession: () => {
    initialTotal?: number;
    midSessionInsertedCount?: number;
    midSessionInsertedCards?: ReviewMidSessionInsertedDiagnostic[];
  } | null | undefined;
  setAppliedFilter: (filter: CardFilter | null) => void;
  setShowAnswer: (showAnswer: boolean) => void;
  isAdvancePending: () => boolean;
  buildExpectedRefreshOptions: (reference: ReviewDataObserverReference | null | undefined) => RefreshCurrentItemOptions;
  refreshCurrentItem: (item: unknown, options?: RefreshCurrentItemOptions) => Promise<void> | void;
  refreshCurrentReviewCard: () => Promise<void> | void;
  advanceCurrentReviewCardByReference: (reference: ReviewDataObserverReference) => Promise<void> | void;
  removeCardIdsFromActiveQueue: (cardIds: string[]) => Promise<void> | void;
};

export function normalizeCardFilterIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids
    .map((id) => String(id || '').trim())
    .filter((id) => id.length > 0);
}

export function readCardRootId(card: FSRSCard): string {
  const meta = card.meta;
  if (!meta || typeof meta !== 'object') {
    return '';
  }

  const source = meta as Record<string, unknown>;
  const value = source.rootId ?? source.rootID ?? source.root_id;
  return typeof value === 'string' ? value.trim() : '';
}

export function matchesFilterCardType(card: FSRSCard, filter: CardFilter): boolean {
  if (!filter.cardType) {
    return true;
  }

  const requestedTypes = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
  return requestedTypes.includes(card.type as typeof requestedTypes[number]);
}

function readCardId(card: FSRSCard | null | undefined): string {
  return String(card?.id || '').trim();
}

function readCardBlockId(card: FSRSCard | null | undefined): string {
  return String(card?.blockId || '').trim();
}

function isDueForReviewSession(card: FSRSCard, now: number): boolean {
  const due = Number(card.due);
  return Number.isFinite(due) && due <= now;
}

function uniqueCardsById(cards: Array<FSRSCard | null | undefined>): FSRSCard[] {
  const byId = new Map<string, FSRSCard>();
  for (const card of cards) {
    const cardId = readCardId(card);
    if (!card || !cardId || byId.has(cardId)) {
      continue;
    }
    byId.set(cardId, card);
  }
  return Array.from(byId.values());
}

function isCurrentReviewCard(card: FSRSCard, reference: ReviewDataObserverReference): boolean {
  const cardId = String(reference.cardId || '').trim();
  const blockId = String(reference.blockId || '').trim();
  return (cardId.length > 0 && cardId === readCardId(card))
    || (blockId.length > 0 && blockId === readCardBlockId(card));
}

function isDueEligibleCdfCard(card: FSRSCard, now: number): boolean {
  return hasCdfLiveRelationMetadata(card)
    && isCdfLiveRelationQueueEligible(card)
    && isDueForReviewSession(card, now)
    && !isProgressiveExcerptCard(card);
}

export function createReviewDataObserverRuntime(options: ReviewDataObserverRuntimeOptions) {
  let subscribedManager: IUnifiedDataSourceManagerFacade | null = null;

  async function loadCardsByIds(cardIds: string[]): Promise<FSRSCard[]> {
    const manager = subscribedManager;
    if (!manager) {
      return [];
    }

    const normalizedCardIds = Array.from(new Set(
      cardIds
        .map((cardId) => String(cardId || '').trim())
        .filter((cardId) => cardId.length > 0),
    ));
    if (normalizedCardIds.length === 0) {
      return [];
    }

    const loadedCards = await Promise.all(
      normalizedCardIds.map(async (cardId) => {
        try {
          return await manager.getCard(cardId, { silent: true });
        } catch (error) {
          options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to load card for mid-session enqueue:', {
            cardId,
            error,
          });
          return null;
        }
      }),
    );

    return uniqueCardsById(loadedCards);
  }

  function recordMidSessionInsertedCards(
    cards: FSRSCard[],
    insertedCount: number,
    origin: ReviewMidSessionInsertedOrigin,
    markMidSessionInserted = true,
  ): FSRSCard[] {
    if (insertedCount <= 0) {
      return [];
    }

    const insertedCards = cards.slice(0, insertedCount);
    const session = options.getSession();
    if (session) {
      const currentInitialTotal = Math.max(0, Number(session.initialTotal) || 0);
      session.initialTotal = currentInitialTotal + insertedCount;
    }
    if (!markMidSessionInserted) {
      return insertedCards;
    }

    if (session) {
      session.midSessionInsertedCount = Math.max(0, Number(session.midSessionInsertedCount) || 0) + insertedCount;
      const currentCards = Array.isArray(session.midSessionInsertedCards)
        ? session.midSessionInsertedCards
        : [];
      const insertedAt = (options.now ?? (() => Date.now()))();
      session.midSessionInsertedCards = [
        ...currentCards,
        ...insertedCards.map((card): ReviewMidSessionInsertedDiagnostic => {
          const liveMeta = readCdfLiveRelationMetadata(card);
          return {
            origin,
            cardId: readCardId(card),
            blockId: readCardBlockId(card),
            sourceBlockId: liveMeta.sourceBlockId,
            insertedAt,
          };
        }),
      ];
    }

    options.notifyMidSessionInserted?.({ count: insertedCount, origin, cards: insertedCards });
    return insertedCards;
  }

  async function refreshOrAdvanceAfterTailAppend(): Promise<void> {
    const currentCard = options.getCurrentCard();
    if (currentCard) {
      await options.refreshCurrentItem(currentCard, options.buildExpectedRefreshOptions({
        cardId: currentCard.id,
        blockId: currentCard.blockId,
      }));
      return;
    }

    const activeQueue = options.getActiveQueueStrategy();
    if (typeof activeQueue?.next !== 'function') {
      return;
    }

    try {
      const nextItem = await activeQueue.next();
      if (!nextItem) {
        return;
      }
      options.setShowAnswer(false);
      await options.refreshCurrentItem(nextItem);
    } catch (error) {
      options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to advance into newly appended scope card:', error);
    }
  }

  async function appendCardsToActiveSessionTail(
    cards: FSRSCard[],
    origin: ReviewMidSessionInsertedOrigin,
    markMidSessionInserted = true,
  ): Promise<number> {
    const queueStrategy = options.getQueueStrategyWithTailAppend();
    if (!queueStrategy?.appendCardsToTail) {
      return 0;
    }

    const appendedCount = queueStrategy.appendCardsToTail(cards);
    if (appendedCount === 0) {
      return 0;
    }

    recordMidSessionInsertedCards(cards, appendedCount, origin, markMidSessionInserted);
    await refreshOrAdvanceAfterTailAppend();
    return appendedCount;
  }

  async function appendDueCdfCardsToActiveSessionTail(
    cards: FSRSCard[],
    origin: ReviewMidSessionInsertedOrigin,
  ): Promise<number> {
    const now = (options.now ?? (() => Date.now()))();
    const currentReference = options.getCurrentReference();
    const cardsToAppend = uniqueCardsById(cards)
      .filter((card) => !isCurrentReviewCard(card, currentReference))
      .filter((card) => isDueEligibleCdfCard(card, now));
    if (cardsToAppend.length === 0) {
      return 0;
    }
    return appendCardsToActiveSessionTail(cardsToAppend, origin);
  }

  async function appendCreatedCardsToActiveScopeQueue(cardIds: string[]): Promise<void> {
    const manager = subscribedManager;
    const filterQueue = options.getFilterGroupQueue();
    const queueStrategy = options.getQueueStrategyWithTailAppend();
    if (!manager || !filterQueue || typeof filterQueue.getFilter !== 'function' || !queueStrategy?.appendCardsToTail) {
      return;
    }

    const currentFilter = filterQueue.getFilter() || {};
    const scopeDocIds = normalizeCardFilterIds(currentFilter.scopeDocIds);
    if (scopeDocIds.length === 0) {
      return;
    }

    const loadedCards = await loadCardsByIds(cardIds);

    const cardsToAppend = loadedCards
      .filter((card) => !hasCdfLiveRelationMetadata(card))
      .filter((card) => {
        const rootId = readCardRootId(card);
        return rootId.length > 0 && scopeDocIds.includes(rootId);
      })
      .filter((card) => matchesFilterCardType(card, currentFilter))
      .filter((card) => !isProgressiveExcerptCard(card));

    if (cardsToAppend.length === 0) {
      return;
    }

    const currentBlockIds = normalizeCardFilterIds(currentFilter.blockIds);
    const nextBlockIds = Array.from(new Set([
      ...currentBlockIds,
      ...cardsToAppend.map((card) => String(card.blockId || '').trim()).filter((blockId) => blockId.length > 0),
    ]));

    const nextFilter = nextBlockIds.length === currentBlockIds.length
      ? currentFilter
      : {
          ...currentFilter,
          blockIds: nextBlockIds,
        };

    if (nextFilter !== currentFilter) {
      const commandClient = options.getFilterCommandClient();
      if (!commandClient || typeof commandClient.setFilterGroupFilter !== 'function') {
        options.logger?.warn?.('[SiYuanMemo][ReviewView] Filter-group command unavailable for doc-scope enqueue');
        return;
      }

      try {
        const updated = await commandClient.setFilterGroupFilter(nextFilter);
        if (updated === false) {
          options.logger?.warn?.('[SiYuanMemo][ReviewView] Filter-group command rejected doc-scope enqueue filter update');
          return;
        }
      } catch (error) {
        options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to update filter-group filter through command client:', error);
        return;
      }

      options.setAppliedFilter(nextFilter);
    }

    await appendCardsToActiveSessionTail(cardsToAppend, 'doc-scope-card-created', false);
  }

  async function appendDueCdfCardsByIds(cardIds: string[], origin: ReviewMidSessionInsertedOrigin): Promise<number> {
    const cards = await loadCardsByIds(cardIds);
    return appendDueCdfCardsToActiveSessionTail(cards, origin);
  }

  const observer: IDataSourceObserver = {
    onDataChanged(event: DataChangeEvent) {
      if (event.type === 'card-created') {
        void appendCreatedCardsToActiveScopeQueue(event.cardIds || []);
        return;
      }

      if (event.type === 'card-deleted') {
        const deletedCardIds = Array.from(new Set(
          (event.cardIds || [])
            .map((id) => String(id || '').trim())
            .filter((id) => id.length > 0),
        ));
        if (deletedCardIds.length === 0) {
          return;
        }

        const { cardId, blockId } = options.getCurrentReference();
        if (cardId && deletedCardIds.includes(cardId)) {
          void options.advanceCurrentReviewCardByReference({ cardId, blockId });
          return;
        }

        void options.removeCardIdsFromActiveQueue(deletedCardIds);
        return;
      }

      if (event.type !== 'card-updated') {
        return;
      }

      const eventCardIds = event.cardIds || [];
      const eventBlockIds = event.blockIds || [];

      void appendDueCdfCardsByIds(eventCardIds, 'external-cdf-sync');

      const { cardId, blockId } = options.getCurrentReference();
      if (!cardId && !blockId) {
        return;
      }

      const matchedCard = eventCardIds.some((id) => {
        const normalized = String(id || '').trim();
        return normalized === cardId;
      });
      const matchedBlock = eventBlockIds.some((id) => {
        const normalized = String(id || '').trim();
        return normalized === blockId;
      });
      const matched = matchedCard || matchedBlock;
      if (!matched) {
        return;
      }

      if (options.isAdvancePending()) {
        options.logger?.debug?.('[SiYuanMemo][ReviewView] Skip current card refresh while review advance is pending:', {
          cardId,
          blockId,
          eventCardIds,
          eventBlockIds,
        });
        return;
      }

      void options.refreshCurrentReviewCard();
    },
  };

  function bind(): void {
    const manager = options.getManager();
    if (manager === subscribedManager) {
      return;
    }

    if (subscribedManager) {
      subscribedManager.unregisterObserver(observer);
    }

    subscribedManager = manager;
    subscribedManager?.registerObserver(observer);
  }

  function unbind(): void {
    if (!subscribedManager) {
      return;
    }

    subscribedManager.unregisterObserver(observer);
    subscribedManager = null;
  }

  return {
    observer,
    appendCreatedCardsToActiveScopeQueue,
    appendDueCdfCardsToActiveSessionTail,
    appendDueCdfCardsByIds,
    bind,
    unbind,
    getSubscribedManager: () => subscribedManager,
  };
}
