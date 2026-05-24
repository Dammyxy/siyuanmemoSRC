import type {
  CardFilter,
  DataChangeEvent,
  IDataSourceObserver,
  IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { RefreshCurrentItemOptions } from './types';
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
  getManager: () => IUnifiedDataSourceManagerFacade | null;
  getFilterGroupQueue: () => ReviewFilterGroupQueueLike | null;
  getFilterCommandClient: () => ReviewFilterCommandClient | null;
  getQueueStrategyWithTailAppend: () => ReviewTailAppendQueueStrategyLike | null;
  getActiveQueueStrategy: () => ReviewActiveQueueLike | null;
  getCurrentReference: () => { cardId: string; blockId: string };
  getCurrentCard: () => FSRSCard | null | undefined;
  getSession: () => { initialTotal?: number } | null | undefined;
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

export function createReviewDataObserverRuntime(options: ReviewDataObserverRuntimeOptions) {
  let subscribedManager: IUnifiedDataSourceManagerFacade | null = null;

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

    const normalizedCardIds = Array.from(new Set(
      cardIds
        .map((cardId) => String(cardId || '').trim())
        .filter((cardId) => cardId.length > 0),
    ));
    if (normalizedCardIds.length === 0) {
      return;
    }

    const loadedCards = await Promise.all(
      normalizedCardIds.map(async (cardId) => {
        try {
          return await manager.getCard(cardId, { silent: true });
        } catch (error) {
          options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to load created card for doc-scope enqueue:', {
            cardId,
            error,
          });
          return null;
        }
      }),
    );

    const cardsToAppend = loadedCards
      .filter((card): card is FSRSCard => Boolean(card))
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

    const appendedCount = queueStrategy.appendCardsToTail(cardsToAppend);
    if (appendedCount === 0) {
      return;
    }

    const session = options.getSession();
    if (session) {
      const currentInitialTotal = Math.max(0, Number(session.initialTotal) || 0);
      session.initialTotal = currentInitialTotal + appendedCount;
    }

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

      const { cardId, blockId } = options.getCurrentReference();
      if (!cardId && !blockId) {
        return;
      }

      const matched = (event.cardIds || []).some((id) => {
        const normalized = String(id || '').trim();
        return normalized === cardId || normalized === blockId;
      });
      if (!matched) {
        return;
      }

      if (options.isAdvancePending()) {
        options.logger?.debug?.('[SiYuanMemo][ReviewView] Skip current card refresh while review advance is pending:', {
          cardId,
          blockId,
          eventCardIds: event.cardIds || [],
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
    bind,
    unbind,
    getSubscribedManager: () => subscribedManager,
  };
}
