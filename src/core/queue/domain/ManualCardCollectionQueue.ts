import type { CardFilter, QueueType } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { AutoFailedCardSinkPort, QueuePersistencePort } from './ports';
import { BaseReviewQueue } from './BaseReviewQueue';
import { ManualCardSetStrategy } from './ManualCardSetStrategy';
import { loadQueueState, saveQueueState } from './queuePersistence';
import { resolveCardId } from '../../../diagnostics/type-guards';

interface ManualCardQueueLogger {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface ManualCardCollectionConfig {
  queuePersistence: QueuePersistencePort;
  storageKey: string;
  persistenceContext: string;
}

interface RemoveManualCardOptions {
  persistWhenNotManual?: boolean;
  addToTemporaryBlacklist?: boolean;
  persist?: () => Promise<void>;
}

interface ResolveManualCardsOptions {
  persist?: () => Promise<void>;
  cardPool?: Iterable<FSRSCard>;
}

interface BuildDynamicQueueCardsOptions {
  logger: ManualCardQueueLogger;
  baseCardsLabel?: string;
  warnInvalidBlockId?: boolean;
}

interface BuildOutstandingQueueCardsOptions extends BuildDynamicQueueCardsOptions {
  everyNthElement: number;
}

interface SyncManualMembershipOptions {
  notifyObservers?: boolean;
}

interface BuildDynamicCardsFromBaseOptions {
  logger: ManualCardQueueLogger;
  baseCardsLabel?: string;
  warnInvalidBlockId?: boolean;
  persist?: () => Promise<void>;
  cardPool?: Iterable<FSRSCard>;
}

interface BuildDynamicCardsFromFilterOptions {
  logger: ManualCardQueueLogger;
  baseFilter?: CardFilter;
  cardPoolFilter?: CardFilter;
  baseCardsLabel?: string;
  warnInvalidBlockId?: boolean;
  persist?: () => Promise<void>;
}

interface AddCardToCollectionOptions {
  logger: ManualCardQueueLogger;
  persist?: () => Promise<void>;
  notifyQueueChanged?: boolean;
  notifyObservers?: boolean;
}

interface RemoveCardFromCollectionOptions {
  logger: ManualCardQueueLogger;
  persistWhenNotManual?: boolean;
  addToTemporaryBlacklist?: boolean;
  persist?: () => Promise<void>;
  persistAfterError?: () => Promise<void>;
  notifyObservers?: boolean;
}

interface HandleReviewWithAutoFailedOptions {
  logger: ManualCardQueueLogger;
  autoFailedSink: AutoFailedCardSinkPort;
  logEscalation?: boolean;
}

type ManualCardCollectionRollbackSnapshot = {
  temporaryBlacklist: string[];
  customOrder: string[] | null;
  manualCards: string[];
};

function isManualCardCollectionRollbackSnapshot(value: unknown): value is ManualCardCollectionRollbackSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    temporaryBlacklist?: unknown;
    customOrder?: unknown;
    manualCards?: unknown;
  };

  if (!Array.isArray(candidate.temporaryBlacklist)) {
    return false;
  }
  if (!Array.isArray(candidate.manualCards)) {
    return false;
  }
  if (!(candidate.customOrder === null || Array.isArray(candidate.customOrder))) {
    return false;
  }

  return true;
}

export abstract class ManualCardCollectionQueue extends BaseReviewQueue {
  protected readonly manualCards = new ManualCardSetStrategy();
  protected readonly queuePersistence: QueuePersistencePort;

  private readonly storageKey: string;
  private readonly persistenceContext: string;

  protected constructor(
    manager: UnifiedDataSourceManager,
    type: QueueType,
    config: ManualCardCollectionConfig
  ) {
    super(manager, type);
    this.queuePersistence = config.queuePersistence;
    this.storageKey = config.storageKey;
    this.persistenceContext = config.persistenceContext;
  }

  protected loadManualCardState(logger: ManualCardQueueLogger): { fromStorage: boolean; count: number } {
    const { value, fromStorage } = loadQueueState<string[]>({
      persistence: this.queuePersistence,
      key: this.storageKey,
      initialValue: [],
      validate: (candidate): candidate is string[] => Array.isArray(candidate),
      logger,
      context: this.persistenceContext,
    });

    this.manualCards.replace(value);
    return {
      fromStorage,
      count: this.manualCards.size(),
    };
  }

  protected async saveManualCardState(logger: ManualCardQueueLogger): Promise<number> {
    const data = this.manualCards.toArray();
    await saveQueueState({
      persistence: this.queuePersistence,
      key: this.storageKey,
      value: data,
      logger,
      context: this.persistenceContext,
    });
    return data.length;
  }

  protected logManualCardStateLoad(logger: ManualCardQueueLogger): void {
    const { fromStorage, count } = this.loadManualCardState(logger);
    if (fromStorage) {
      logger.info(`Loaded ${count} manually added cards`);
      return;
    }
    logger.info('No saved data found, starting with empty set');
  }

  protected async logManualCardStateSave(logger: ManualCardQueueLogger): Promise<void> {
    const count = await this.saveManualCardState(logger);
    logger.info(`Saved ${count} manually added cards`);
  }

  public override async createRollbackSnapshot(): Promise<ManualCardCollectionRollbackSnapshot> {
    const base = await super.createRollbackSnapshot();
    return {
      temporaryBlacklist: [...base.temporaryBlacklist],
      customOrder: base.customOrder ? [...base.customOrder] : null,
      manualCards: this.manualCards.toArray(),
    };
  }

  public override async restoreRollbackSnapshot(snapshot: unknown): Promise<void> {
    if (!isManualCardCollectionRollbackSnapshot(snapshot)) {
      throw new Error(`[${this.type}] Invalid rollback snapshot for ManualCardCollectionQueue`);
    }

    await super.restoreRollbackSnapshot(snapshot);
    this.manualCards.replace(snapshot.manualCards.map((item) => String(item)));

    const save = (this as unknown as { save?: () => Promise<void> }).save;
    if (typeof save === 'function') {
      await save.call(this);
    }
  }

  protected async addManualCard(
    card: FSRSCard | QueueItem | string,
    logger: ManualCardQueueLogger,
    persist?: () => Promise<void>
  ): Promise<{ cardId: string; wasBlacklisted: boolean }> {
    const cardId = resolveCardId(card);
    const wasBlacklisted = this.temporaryBlacklist.delete(cardId);

    this.manualCards.add(cardId);
    if (persist) {
      await persist();
    } else {
      await this.saveManualCardState(logger);
    }

    return { cardId, wasBlacklisted };
  }

  protected async removeManualCard(
    cardIdOrBlockId: string,
    logger: ManualCardQueueLogger,
    options: RemoveManualCardOptions = {}
  ): Promise<{ wasManuallyAdded: boolean }> {
    const wasManuallyAdded = this.manualCards.delete(cardIdOrBlockId);
    const addToTemporaryBlacklist = options.addToTemporaryBlacklist !== false;
    if (addToTemporaryBlacklist) {
      this.temporaryBlacklist.add(cardIdOrBlockId);
    }

    if (wasManuallyAdded || options.persistWhenNotManual) {
      if (options.persist) {
        await options.persist();
      } else {
        await this.saveManualCardState(logger);
      }
    }

    return { wasManuallyAdded };
  }

  private async persistManualCardState(
    logger: ManualCardQueueLogger,
    persist?: () => Promise<void>
  ): Promise<void> {
    if (persist) {
      await persist();
      return;
    }

    await this.saveManualCardState(logger);
  }

  protected async resolveManuallyAddedCards(
    logger: ManualCardQueueLogger,
    persistOrOptions?: (() => Promise<void>) | ResolveManualCardsOptions
  ): Promise<FSRSCard[]> {
    const options = typeof persistOrOptions === 'function'
      ? { persist: persistOrOptions }
      : (persistOrOptions ?? {});
    const cardPoolByIdMap = options.cardPool
      ? new Map(Array.from(options.cardPool, (card) => [card.id, card] as const))
      : null;
    const cardPoolByBlockIdMap = options.cardPool
      ? new Map(Array.from(options.cardPool, (card) => [card.blockId, card] as const))
      : null;

    return this.manualCards.resolveExistingCards(
      async (cardId) => {
        if (cardPoolByIdMap || cardPoolByBlockIdMap) {
          const pooledById = cardPoolByIdMap?.get(cardId);
          if (pooledById) {
            return pooledById;
          }

          const pooledByBlockId = cardPoolByBlockIdMap?.get(cardId);
          if (pooledByBlockId) {
            return pooledByBlockId;
          }

          logger.debug(`Card ${cardId} not found in prefetched card pool, removing from manual additions`);
          return null;
        }

        const cardById = await this.manager.getCard(cardId, { silent: true }).catch(() => null);
        if (cardById) {
          return cardById;
        }

        const cardByBlockId = await this.manager.getCards({ blockIds: [cardId] })
          .then((cards) => cards[0] ?? null)
          .catch(() => null);
        if (cardByBlockId) {
          return cardByBlockId;
        }

        // Last-resort fallback for data-source adapters that cannot resolve by cardId
        // consistently in certain runtime states. This path should be rare.
        const cardFromFallbackPool = await this.manager.getCards()
          .then((cards) => cards.find((candidate) => candidate.id === cardId) ?? null)
          .catch(() => null);
        if (cardFromFallbackPool) {
          return cardFromFallbackPool;
        }

        logger.debug(`Card ${cardId} not found, removing from manual additions`);
        return null;
      },
      {
        onCleanup: async () => this.persistManualCardState(logger, options.persist),
        cleanupLogger: logger,
      }
    );
  }

  protected buildDynamicQueueCards(
    baseCards: FSRSCard[],
    manualCards: FSRSCard[],
    options: BuildDynamicQueueCardsOptions
  ): FSRSCard[] {
    const {
      logger,
      baseCardsLabel = 'cards from manager',
      warnInvalidBlockId = false,
    } = options;

    logger.debug(`Got ${baseCards.length} ${baseCardsLabel}`);
    logger.debug(`Got ${manualCards.length} manually added cards`);

    const allCards = this.mergeUniqueCards(baseCards, manualCards);
    logger.debug(`After merge: ${allCards.length} cards`);

    const filteredCards = allCards.filter((card) => !this.temporaryBlacklist.has(card.id));
    if (filteredCards.length < allCards.length) {
      logger.debug(`Filtered ${allCards.length - filteredCards.length} cards from temporary blacklist`);
    }

    if (warnInvalidBlockId) {
      const invalidCards = filteredCards.filter((card) => !card.blockId || card.blockId === 'undefined');
      if (invalidCards.length > 0) {
        logger.warn(
          `Found ${invalidCards.length} cards with invalid blockId:`,
          invalidCards.map((card) => ({ id: card.id, blockId: card.blockId }))
        );
      }
    }

    const sortedCards = this.sortByDuePriority(filteredCards);
    return this.applyCustomOrder(sortedCards);
  }

  private insertCardsSparsely(
    baseCards: FSRSCard[],
    cardsToInsert: FSRSCard[],
    everyNthElement: number
  ): FSRSCard[] {
    const normalizedEveryNth = Math.max(1, Math.min(100, Math.floor(everyNthElement)));
    if (cardsToInsert.length === 0) {
      return [...baseCards];
    }

    if (normalizedEveryNth <= 1) {
      return [...cardsToInsert, ...baseCards];
    }

    const result = [...baseCards];

    for (let index = 0; index < cardsToInsert.length; index += 1) {
      const card = cardsToInsert[index];
      const targetIndex = (normalizedEveryNth - 1) + index * normalizedEveryNth;
      if (targetIndex >= result.length) {
        result.push(card);
      } else {
        result.splice(targetIndex, 0, card);
      }
    }

    return result;
  }

  protected buildOutstandingQueueCards(
    baseCards: FSRSCard[],
    manualCards: FSRSCard[],
    options: BuildOutstandingQueueCardsOptions
  ): FSRSCard[] {
    const {
      logger,
      baseCardsLabel = 'cards from manager',
      warnInvalidBlockId = false,
      everyNthElement,
    } = options;

    logger.debug(`Got ${baseCards.length} ${baseCardsLabel}`);
    logger.debug(`Got ${manualCards.length} manually added cards`);

    const filteredBaseCards = baseCards.filter((card) => !this.temporaryBlacklist.has(card.id));
    const existingIds = new Set(filteredBaseCards.map((card) => card.id));
    const manualOutstandingCards = manualCards.filter((card) => {
      if (this.temporaryBlacklist.has(card.id)) {
        return false;
      }
      return !existingIds.has(card.id);
    });

    if (warnInvalidBlockId) {
      const invalidCards = [...filteredBaseCards, ...manualOutstandingCards]
        .filter((card) => !card.blockId || card.blockId === 'undefined');
      if (invalidCards.length > 0) {
        logger.warn(
          `Found ${invalidCards.length} cards with invalid blockId:`,
          invalidCards.map((card) => ({ id: card.id, blockId: card.blockId }))
        );
      }
    }

    const autoSortEnabled = this.isAutoSortEnabled();
    const sortedBase = autoSortEnabled
      ? this.sortByPriorityThenDue(filteredBaseCards)
      : [...filteredBaseCards];
    const sparseQueue = this.insertCardsSparsely(sortedBase, manualOutstandingCards, everyNthElement);

    logger.debug('Built outstanding queue with sparse insertion', {
      baseCount: sortedBase.length,
      insertedManualCount: manualOutstandingCards.length,
      everyNthElement: Math.max(1, Math.min(100, Math.floor(everyNthElement))),
      autoSortEnabled,
      total: sparseQueue.length,
    });

    return this.applyCustomOrder(sparseQueue);
  }

  protected async buildDynamicCardsFromBase(
    baseCards: FSRSCard[],
    options: BuildDynamicCardsFromBaseOptions
  ): Promise<FSRSCard[]> {
    const { logger, persist, cardPool, baseCardsLabel, warnInvalidBlockId } = options;
    const manualCards = await this.resolveManuallyAddedCards(logger, {
      persist,
      cardPool,
    });

    return this.buildDynamicQueueCards(baseCards, manualCards, {
      logger,
      baseCardsLabel,
      warnInvalidBlockId,
    });
  }

  protected async buildDynamicCardsFromFilter(
    options: BuildDynamicCardsFromFilterOptions
  ): Promise<FSRSCard[]> {
    const {
      logger,
      baseFilter,
      cardPoolFilter,
      persist,
      baseCardsLabel,
      warnInvalidBlockId,
    } = options;

    await this.ensureInitialLoad();

    const baseCards = await this.manager.getCards(baseFilter);
    const cardPool = cardPoolFilter
      ? await this.manager.getCards(cardPoolFilter)
      : undefined;

    return this.buildDynamicCardsFromBase(baseCards, {
      logger,
      persist,
      cardPool,
      baseCardsLabel,
      warnInvalidBlockId,
    });
  }

  protected async syncManualMembershipForCard(
    card: Pick<FSRSCard, 'id' | 'blockId'>,
    logger: ManualCardQueueLogger,
    options: SyncManualMembershipOptions = {},
  ): Promise<boolean> {
    await this.ensureInitialLoad();

    const candidateIds = Array.from(
      new Set([String(card.id || '').trim(), String(card.blockId || '').trim()].filter(Boolean))
    );
    if (candidateIds.length === 0) {
      return false;
    }

    let removed = false;
    for (const candidateId of candidateIds) {
      removed = this.manualCards.delete(candidateId) || removed;
    }

    if (!removed) {
      return false;
    }

    if (this.customOrder) {
      this.customOrder = this.customOrder.filter((id) => !candidateIds.includes(String(id || '').trim()));
    }
    if (this.cards.length > 0) {
      this.cards = this.cards.filter((entry) => (
        !candidateIds.includes(String(entry.id || '').trim())
        && !candidateIds.includes(String(entry.blockId || '').trim())
      ));
    }

    await this.saveManualCardState(logger);
    this.clearSizeCache();
    this.emitQueueChangedEvent();
    if (options.notifyObservers !== false) {
      this.notifyObservers();
    }

    logger.info(`Removed card ${card.id} from manual additions after schedule update`, {
      blockId: card.blockId,
      remainingManualCards: this.manualCards.size(),
    });

    return true;
  }

  protected async addCardToCollection(
    card: FSRSCard | QueueItem | string,
    options: AddCardToCollectionOptions
  ): Promise<void> {
    const { logger, persist, notifyQueueChanged = true, notifyObservers = false } = options;
    try {
      await this.ensureInitialLoad();
      const { cardId, wasBlacklisted } = await this.addManualCard(card, logger, persist);

      if (notifyQueueChanged) {
        this.emitQueueChangedEvent();
      }
      if (notifyObservers) {
        this.notifyObservers();
      }

      logger.info(`Card ${cardId} added manually`, {
        wasBlacklisted,
        temporaryBlacklistSize: this.temporaryBlacklist.size,
      });
    } catch (error) {
      logger.error('Failed to add card:', error);
      throw error;
    }
  }

  protected async removeCardFromCollection(
    cardIdOrBlockId: string,
    options: RemoveCardFromCollectionOptions
  ): Promise<void> {
    const {
      logger,
      persistWhenNotManual = false,
      addToTemporaryBlacklist = true,
      persist,
      persistAfterError,
      notifyObservers = false,
    } = options;
    try {
      await this.ensureInitialLoad();
      const { wasManuallyAdded } = await this.removeManualCard(cardIdOrBlockId, logger, {
        persistWhenNotManual,
        addToTemporaryBlacklist,
        persist,
      });
      if (notifyObservers) {
        this.notifyObservers();
      }

      logger.info(`Card ${cardIdOrBlockId} removed`, {
        wasManuallyAdded,
        temporaryBlacklistSize: this.temporaryBlacklist.size,
      });
    } catch (error) {
      logger.error('Failed to remove card:', error);
      if (addToTemporaryBlacklist) {
        this.temporaryBlacklist.add(cardIdOrBlockId);
      }

      if (persistAfterError) {
        void persistAfterError().catch((persistError) => {
          logger.error('Failed to persist temporary blacklist after removeCard error:', persistError);
        });
      }

      throw error;
    }
  }

  protected async handleReviewWithAutoFailed(
    cardId: string,
    rating: number,
    options: HandleReviewWithAutoFailedOptions
  ): Promise<void> {
    const { logger, autoFailedSink, logEscalation = false } = options;
    try {
      await this.handleReviewWithScheduler(cardId, rating);
      if (rating < 3) {
        await autoFailedSink.addAutoFailed(cardId);
        if (logEscalation) {
          logger.info(`Card ${cardId} with rating ${rating} added to FinalDrill`);
        }
      }
    } catch (error) {
      logger.error('Failed to handle review:', error);
      throw error;
    }
  }

  public override async skip(cardId: string): Promise<void> {
    await this.ensureInitialLoad();

    const cards = await this.getCards();
    const index = cards.findIndex((card) => card.id === cardId || card.blockId === cardId);
    if (index === -1) {
      return;
    }

    const [skippedCard] = cards.splice(index, 1);
    if (!skippedCard) {
      return;
    }
    cards.push(skippedCard);

    this.customOrder = cards.map((card) => card.id);
    this.cards = [...cards];
    this.clearSizeCache();
    this.emitQueueChangedEvent();
    this.notifyObservers();
  }

}
