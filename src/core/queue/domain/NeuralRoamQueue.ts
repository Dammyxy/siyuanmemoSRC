/**
 * Neural Roam Queue
 * 神经漫游队列
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import {
  QueueType,
  type NeuralNavigationMode,
  type NeuralNavigationState,
  type NeuralRoamHistoryEntry,
} from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem as ReviewQueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { NeuralRoamCardTypeResolverPort, QueuePersistencePort } from './ports';
import { loadQueueState, saveQueueState } from './queuePersistence';
import {
  ConceptNeuralQueue,
  type ConceptNeuralSessionState,
  type QueueItem as ConceptQueueItem,
} from '../neural/ConceptNeuralQueue';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NeuralRoamQueue');

interface LegacySeedOnlyState {
  seeds: string[];
  currentSeed: string | null;
}

interface NeuralRoamPersistedState {
  version: 2;
  seeds: string[];
  session: ConceptNeuralSessionState;
}

interface NeuralRoamQueueOptions {
  cardTypeResolver?: NeuralRoamCardTypeResolverPort;
}

const DEFAULT_CARD_TYPE_RESOLVER: NeuralRoamCardTypeResolverPort = {
  async resolveCardType(): Promise<'item' | 'topic'> {
    return 'topic';
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLegacySeedOnlyState(value: unknown): value is LegacySeedOnlyState {
  return isRecord(value) && Array.isArray(value.seeds);
}

function isNeuralRoamPersistedState(value: unknown): value is NeuralRoamPersistedState {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 2 && Array.isArray(value.seeds) && isRecord(value.session);
}

export class NeuralRoamQueue extends BaseReviewQueue {
  public name = 'NeuralRoamQueue';

  private readonly conceptQueue: ConceptNeuralQueue;
  private readonly STORAGE_KEY = 'neuralRoamQueue';
  private readonly queuePersistence: QueuePersistencePort;
  private readonly cardTypeResolver: NeuralRoamCardTypeResolverPort;

  constructor(
    manager: UnifiedDataSourceManager,
    queuePersistence: QueuePersistencePort,
    options: NeuralRoamQueueOptions = {}
  ) {
    super(manager, QueueType.NeuralRoam);
    this.queuePersistence = queuePersistence;
    this.cardTypeResolver = options.cardTypeResolver ?? DEFAULT_CARD_TYPE_RESOLVER;
    this.conceptQueue = new ConceptNeuralQueue();
  }

  async load(): Promise<void> {
    const { value: rawState, fromStorage } = loadQueueState<unknown>({
      persistence: this.queuePersistence,
      key: this.STORAGE_KEY,
      initialValue: null,
      validate: () => true,
      logger,
      context: 'NeuralRoamQueue',
    });

    if (!rawState) {
      logger.info('No saved data found, starting with empty seeds');
      return;
    }

    if (isNeuralRoamPersistedState(rawState)) {
      this.conceptQueue.restoreSeeds(rawState.seeds);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Loaded neural roam state (v2), seeds=${rawState.seeds.length}`);
      }
      return;
    }

    if (isLegacySeedOnlyState(rawState)) {
      this.conceptQueue.restoreSeeds(rawState.seeds);
      logger.info(`Loaded legacy neural roam seeds, count=${rawState.seeds.length}`);
      return;
    }

    logger.warn('Invalid neural roam persisted state, ignore and start fresh');
  }

  async save(): Promise<void> {
    const data: NeuralRoamPersistedState = {
      version: 2,
      seeds: this.conceptQueue.getSeeds(),
      session: this.conceptQueue.exportSessionState(),
    };

    await saveQueueState({
      persistence: this.queuePersistence,
      key: this.STORAGE_KEY,
      value: data,
      logger,
      context: 'NeuralRoamQueue',
    });
  }

  public isDynamic(): boolean {
    return false;
  }

  public async getCards(): Promise<FSRSCard[]> {
    await this.ensureInitialLoad();
    const nodeIds = this.conceptQueue.getSessionVisibleNodeIds(80);
    if (nodeIds.length === 0) {
      return [];
    }

    const cards = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const queueItem = await this.conceptQueue.getPathItemByNodeId(nodeId, { focusPath: false });
        if (!queueItem) {
          return null;
        }
        return this.convertToFSRSCard(queueItem);
      })
    );

    return cards.filter((card): card is FSRSCard => Boolean(card));
  }

  public async addCard(card: FSRSCard | ReviewQueueItem | string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
    await this.ensureInitialLoad();
    const blockId = typeof card === 'string' ? card : resolveCardId(card);
    if (!blockId) {
      throw new Error('Invalid card or block ID');
    }

    await this.conceptQueue.addSeed(blockId, priority);
    await this.save();
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialLoad();
    this.conceptQueue.removeSeed(cardIdOrBlockId);
    await this.save();
  }

  public async handleReview(cardId: string, rating: number): Promise<void> {
    logger.debug(`Review handled by FSRS system: ${cardId}, rating: ${rating}`);
  }

  public async getNextCard(): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const queueItem = await this.conceptQueue.getNextCard();
    if (!queueItem) {
      return null;
    }
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam session after getNextCard:', error);
    });
    return this.convertToFSRSCard(queueItem);
  }

  public async lockCurrentAsSeed(cardId: string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.addSeed(cardId, priority);
    await this.save();
  }

  public clearHistory(): void {
    this.conceptQueue.clearHistory();
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after clearHistory:', error);
    });
  }

  public getSeedBlocks(): string[] {
    return this.conceptQueue.getSeeds();
  }

  public async startRoamingFromSeed(
    seedId: string,
    options: {
      includeSeedAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.startRoamingFromSeed(seedId, options);
    await this.save();
  }

  public getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getHistorySnapshot();
  }

  public async getPathItemByNodeId(blockId: string): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const queueItem = await this.conceptQueue.getPathItemByNodeId(blockId);
    if (!queueItem) {
      return null;
    }
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after getPathItemByNodeId:', error);
    });
    return this.convertToFSRSCard(queueItem);
  }

  public getNavigationState(): NeuralNavigationState {
    return this.conceptQueue.getNavigationState();
  }

  public setNavigationMode(mode: NeuralNavigationMode): void {
    this.conceptQueue.setNavigationMode(mode);
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after setNavigationMode:', error);
    });
  }

  public returnToBookmark(): boolean {
    const moved = this.conceptQueue.returnToBookmark();
    if (moved) {
      void this.save().catch((error) => {
        logger.warn('Failed to persist neural roam state after returnToBookmark:', error);
      });
    }
    return moved;
  }

  public getFilterStats(): { listBlocks: number; deletedBlocks: number; total: number } {
    return {
      listBlocks: 0,
      deletedBlocks: 0,
      total: 0,
    };
  }

  public async reorder(_orderedCards: FSRSCard[] = []): Promise<boolean> {
    logger.warn('Reorder not supported');
    return false;
  }

  public async getSize(): Promise<number> {
    await this.ensureInitialLoad();
    return this.conceptQueue.getSeeds().length;
  }

  private async convertToFSRSCard(queueItem: ConceptQueueItem): Promise<FSRSCard> {
    const now = Date.now();

    let cardType: 'item' | 'topic' = 'topic';
    try {
      cardType = await this.cardTypeResolver.resolveCardType(queueItem.blockId);
    } catch (error) {
      logger.warn('Failed to resolve neural roam card type, fallback to topic:', error);
    }

    return {
      id: queueItem.blockId,
      xiuyuanID: queueItem.blockId,
      blockId: queueItem.blockId,
      due: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: now,
      priority: 50,
      type: cardType as FSRSCard['type'],
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: {
        neuralContext: {
          associationType: queueItem.associationType,
          reason: queueItem.reason,
          blockType: queueItem.blockData.type,
          isFlashcard: cardType === 'item',
        },
      },
    };
  }
}
