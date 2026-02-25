import type { QueueType } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { QueuePersistencePort } from './ports';
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
  persist?: () => Promise<void>;
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
      fallback: [],
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
    this.temporaryBlacklist.add(cardIdOrBlockId);

    if (wasManuallyAdded || options.persistWhenNotManual) {
      if (options.persist) {
        await options.persist();
      } else {
        await this.saveManualCardState(logger);
      }
    }

    return { wasManuallyAdded };
  }

  protected async resolveManuallyAddedCards(
    logger: ManualCardQueueLogger,
    persist?: () => Promise<void>
  ): Promise<FSRSCard[]> {
    return this.manualCards.resolveExistingCards(
      async (cardId) => {
        try {
          return await this.manager.getCard(cardId, { silent: true });
        } catch {
          logger.debug(`Card ${cardId} not found, removing from manual additions`);
          return null;
        }
      },
      {
        onCleanup: async () => {
          if (persist) {
            await persist();
            return;
          }
          await this.saveManualCardState(logger);
        },
        cleanupLogger: logger,
      }
    );
  }
}
