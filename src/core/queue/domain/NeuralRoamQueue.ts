/**
 * Neural Roam Queue
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

interface NeuralRoamPersistedStateV3 {
  version: 3;
  conceptBlocks: string[];
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

function isNeuralRoamPersistedStateV3(value: unknown): value is NeuralRoamPersistedStateV3 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 3
    && Array.isArray(value.conceptBlocks)
    && isRecord(value.session);
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
      logger.info('No saved neural roam state found');
      return;
    }

    if (isNeuralRoamPersistedStateV3(rawState)) {
      this.conceptQueue.restoreConceptBlocks(rawState.conceptBlocks);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Loaded neural roam state (v3), conceptBlocks=${rawState.conceptBlocks.length}`);
      }
      return;
    }

    // Hard-cut migration strategy: reset legacy/v2 state silently.
    logger.info('Legacy neural roam state detected, reset to v3 schema');
    this.conceptQueue.restoreConceptBlocks([]);
    this.conceptQueue.clearHistory('all');
    await this.save();
  }

  async save(): Promise<void> {
    const data: NeuralRoamPersistedStateV3 = {
      version: 3,
      conceptBlocks: this.conceptQueue.getConceptBlocks(),
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

    await this.conceptQueue.addConceptBlock(blockId, priority);
    await this.save();
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialLoad();
    this.conceptQueue.removeConceptBlock(cardIdOrBlockId);
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

  public async lockCurrentAsFocus(cardId: string, priority: 'normal' | 'high' = 'high'): Promise<void> {
    await this.ensureInitialLoad();

    await this.conceptQueue.startRoamingFromFocus(cardId, {
      includeFocusAsFirst: false,
      resetHistory: false,
    });

    try {
      await this.conceptQueue.addConceptBlock(cardId, priority);
      await this.conceptQueue.setPinnedFocusBlock(cardId, true);
    } catch (error) {
      // Virtual focus (non-concept) should not be persisted.
      logger.debug('Skip persistent focus lock for virtual block', { cardId, error });
    }

    await this.save();
  }

  public clearHistory(scope: 'current' | 'all' = 'current'): void {
    this.conceptQueue.clearHistory(scope);
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after clearHistory:', error);
    });
  }

  public getConceptBlocks(): string[] {
    return this.conceptQueue.getConceptBlocks();
  }

  public async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.startRoamingFromFocus(focusId, options);
    await this.save();
  }

  public getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getHistorySnapshot();
  }

  public getSessionFocusStack(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getSessionFocusStack();
  }

  public getPinnedFocusBlocks(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getPinnedFocusBlocks();
  }

  public async setPinnedFocusBlock(blockId: string, pinned = true): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.setPinnedFocusBlock(blockId, pinned);
    await this.save();
  }

  public async jumpToHistoryNode(nodeId: string): Promise<boolean> {
    await this.ensureInitialLoad();
    const jumped = await this.conceptQueue.jumpToHistoryNode(nodeId);
    if (jumped) {
      await this.save();
    }
    return jumped;
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
    return this.conceptQueue.getConceptBlocks().length;
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
