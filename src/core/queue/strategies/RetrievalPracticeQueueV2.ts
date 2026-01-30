/**
 * Retrieval Practice Queue (V2 - Composite Architecture)
 *
 * New implementation using BaseCompositeQueue pattern.
 * Unifies Riff + Local storage with algorithmic sorting.
 *
 * Features:
 * - FSRS algorithm scheduling
 * - Priority-based sorting
 * - Mutable trait (add items)
 * - Removable trait (remove items)
 * - Prioritizable trait (set priority)
 */

import * as riff from '../../siyuan/riff.ts';
import { setBlockAttrs } from '../../siyuan/api.ts';
import { ATTR_PRIORITY } from '../../siyuan/block.ts';
import { RiffScheduler } from '../schedulers/RiffScheduler.ts';
import { PrioritySequencer } from '../sequencers/PrioritySequencer.ts';
import { HybridDataSource } from '../datasource/HybridDataSource.ts';
import { RiffDataSource } from '../datasource/RiffDataSource.ts';
import { StorageDataSource } from '../datasource/StorageDataSource.ts';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue.ts';
import type { StorageManager } from '../../storage/StorageManager';
import { SchedulerSortingStrategy } from '../../scheduling/SortingStrategy';
import { CardStorage } from '../../scheduling/CardStorage';
import type { SchedulerEngineAdapter } from '../../scheduler/types';
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types.ts';
import { clampPriority, DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import type { IPrioritizableTrait, IMutableTrait, IRemovableTrait } from '../abstraction/types.ts';
import { normalizeBlockId, normalizeDeckId, normalizeRiffCardId } from '../abstraction/QueueCardRef.ts';

type RiffApi = {
  getRiffDueCards: typeof riff.getRiffDueCards;
  reviewRiffCard: typeof riff.reviewRiffCard;
  skipReviewRiffCard: typeof riff.skipReviewRiffCard;
};

/**
 * Custom Hybrid DataSource for Retrieval Practice
 *
 * Merges Riff API + Local Storage with due date filtering.
 */
class RetrievalHybridDataSource extends HybridDataSource {
  private readonly deckID: string;
  private readonly storage?: StorageManager;
  private localBuffer: QueueItem[] = [];
  private riffBuffer: QueueItem[] = [];

  constructor(
    deckID: string,
    api: RiffApi,
    storage?: StorageManager,
    options?: { notebook?: string; rootID?: string }
  ) {
    // Create hybrid data source with Riff + Storage
    super({
      sources: {
        riff: new RiffDataSource({
          deckId: deckID,
          notebook: options?.notebook,
          rootID: options?.rootID,
        }),
        local: new StorageDataSource({
          storage,
          deckId: deckID,
        }),
      },
      priority: ['riff', 'local'], // Riff cards first, then local
    });

    this.deckID = deckID;
    this.storage = storage;

    // Load local queue on initialization
    this._loadLocalQueue();
  }

  /**
   * Override getAll to implement Outstanding queue logic
   */
  async getAll(): Promise<QueueItem[]> {
    // Load Riff cards
    this.riffBuffer = await this.getFromSource('riff');

    // Filter local buffer for due cards only
    const now = Date.now();
    const dueLocalItems = this.localBuffer.filter(item => {
      const dueTime = CardStorage.getDueTime(item);
      return dueTime <= now;
    });

    // Merge Riff + due local cards
    return [...this.riffBuffer, ...dueLocalItems];
  }

  /**
   * Override remove to update both buffers
   */
  async remove(items: QueueItem[]): Promise<number> {
    let removedCount = 0;

    for (const item of items) {
      const cardID = String((item as any)?.cardID || item?.cardId || '');
      if (!cardID) continue;

      // Try to remove from local buffer
      const localIndex = this.localBuffer.findIndex(localItem => String(localItem.cardID) === cardID);
      if (localIndex !== -1) {
        this.localBuffer.splice(localIndex, 1);
        removedCount++;
        await this._persistLocalQueue();
        continue;
      }

      // Try to remove from Riff buffer
      const riffIndex = this.riffBuffer.findIndex(riffItem => String(riffItem.cardID) === cardID);
      if (riffIndex !== -1) {
        this.riffBuffer.splice(riffIndex, 1);
        removedCount++;
        // Riff cards are removed via API during review, no persistence needed
      }
    }

    return removedCount;
  }

  /**
   * Add items to local buffer
   */
  async insertAt(items: QueueItem[], index: number): Promise<void> {
    this.localBuffer.splice(index, 0, ...items);
    await this._persistLocalQueue();
  }

  /**
   * Get local buffer size
   */
  getLocalSize(): number {
    return this.localBuffer.length;
  }

  /**
   * Get Riff buffer size
   */
  getRiffSize(): number {
    return this.riffBuffer.length;
  }

  /**
   * Load local queue from storage
   */
  private async _loadLocalQueue(): Promise<void> {
    if (!this.storage) return;

    try {
      const data = await this.storage.loadQueue('retrieval-practice');
      if (data?.items && Array.isArray(data.items)) {
        this.localBuffer = data.items;
      }
    } catch (error) {
      console.error('[RetrievalHybridDataSource] Failed to load local queue:', error);
    }
  }

  /**
   * Persist local queue to storage
   */
  private async _persistLocalQueue(): Promise<void> {
    if (!this.storage) return;

    try {
      await this.storage.saveQueue('retrieval-practice', {
        items: this.localBuffer,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[RetrievalHybridDataSource] Failed to persist local queue:', error);
    }
  }
}

/**
 * Retrieval Practice Queue (V2)
 *
 * New implementation using composite architecture.
 * Maintains full compatibility with V1 while using cleaner code structure.
 */
export class RetrievalPracticeQueueV2 extends BaseCompositeQueue<QueueItem> {
  private readonly hybridSource: RetrievalHybridDataSource;
  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly storage?: StorageManager;
  private readonly sortingStrategy?: SchedulerSortingStrategy;
  private readonly schedulerRouter?: SchedulerRouter;  // 🆕 新增
  private reviewedCount = 0;
  private riffUnreviewedNew = 0;
  private riffUnreviewedOld = 0;

  constructor(options?: {
    deckID?: string;
    api?: Partial<RiffApi>;
    storage?: StorageManager;
    localScheduler?: SchedulerEngineAdapter;
    schedulerRouter?: SchedulerRouter;  // 🆕 新增
  }) {
    const deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    const api: RiffApi = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };

    // Create custom data source
    const hybridSource = new RetrievalHybridDataSource(deckID, api, options?.storage);

    // Initialize sorting strategy if local scheduler provided
    const sortingStrategy = options?.localScheduler
      ? new SchedulerSortingStrategy(options.localScheduler)
      : undefined;

    // Create sequencer with algorithmic sorting
    const sequencer = new PrioritySequencer<QueueItem>({
      fetchAll: async () => {
        const allItems = await hybridSource.getAll();

        // Apply sorting strategy if available
        if (sortingStrategy) {
          return sortingStrategy.sort(allItems);
        }

        // Otherwise sort by priority
        return allItems.sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
      },
      getDueMs: (item) => {
        // Get due time for sorting
        return CardStorage.getDueTime(item);
      },
      getPriority: (item) => {
        return item.priority ?? DEFAULT_PRIORITY;
      },
    });

    // Create scheduler for review feedback
    const scheduler = new RiffScheduler<QueueItem, 1 | 2 | 3 | 4>(async (card, grade) => {
      // 🆕 如果有 SchedulerRouter 和 Storage，使用路由器
      const storage = options?.storage;
      const router = options?.schedulerRouter;

      if (router && storage) {
        // 1. QueueItem 转 FSRSCard
        const fsrsCard = storage.getCard(String(card.cardID));
        if (fsrsCard) {
          // 2. 使用 SchedulerRouter 进行复习
          const updatedCard = await router.route(fsrsCard, grade);

          // 3. SchedulerRouter 已经保存了卡片（route() 方法包含保存逻辑）
          // 但仍需调用 Riff API 以同步 Riff 数据
          await api.reviewRiffCard(card.deckID || deckID, card.cardID, grade);

          console.log('[RetrievalPracticeQueue] ✅ Used SchedulerRouter:', {
            cardID: card.cardID,
            cardType: updatedCard.type,
            schedulerType: updatedCard.schedulerType,
          });
        } else {
          // 本地没有卡片数据，直接调用 Riff API
          await api.reviewRiffCard(card.deckID || deckID, card.cardID, grade);
        }
      } else {
        // 后备方案：直接调用 Riff API
        await api.reviewRiffCard(card.deckID || deckID, card.cardID, grade);
      }

      return card;
    });

    // Create traits
    const prioritizableTrait: IPrioritizableTrait<QueueItem> = {
      id: 'prioritizable',
      setPriority: async (item, priority) => {
        const blockID = String((item as any)?.blockID || '');
        if (!blockID) return false;
        const p = clampPriority(priority, DEFAULT_PRIORITY);
        await setBlockAttrs(blockID, { [ATTR_PRIORITY]: String(p) } as any);
        return true;
      },
    };

    const mutableTrait: IMutableTrait<QueueItem> = {
      id: 'mutable',
      insertAt: async (items, index) => {
        await hybridSource.insertAt(items, index);
      },
    };

    const removableTrait: IRemovableTrait<QueueItem> & IMutableTrait<QueueItem> = {
      id: 'removable',
      insertAt: async (items, index) => {
        await hybridSource.insertAt(items, index);
      },
      removeItems: async (items) => {
        return await hybridSource.remove(items);
      },
    };

    // Initialize base class
    super({
      scheduler,
      sequencer,
      dataSource: hybridSource,
      traits: [prioritizableTrait, mutableTrait, removableTrait],
      uiConfig: {
        statsType: 'riff-counts',
        showRatingButtons: true,
        allowSkip: true,
        hiddenContentTypes: ['heading', 'mark', 'list', 'superBlock'], // 🆕 添加隐藏内容类型
      },
      statsLabel: '提取练习',
    });

    this.hybridSource = hybridSource;
    this.deckID = deckID;
    this.api = api;
    this.storage = options?.storage;
    this.sortingStrategy = sortingStrategy;
    this.schedulerRouter = options?.schedulerRouter;  // 🆕 新增
  }

  /**
   * Override getStats to provide Riff-specific statistics
   */
  async getStats(): Promise<QueueStats> {
    const stats = await super.getStats();

    // Add Riff-specific counts
    return {
      ...stats,
      label: `${this.riffUnreviewedNew}/${this.riffUnreviewedOld}`,
      total: stats.size,
      remaining: stats.size,
      reviewed: this.reviewedCount,
    } as any;
  }

  /**
   * Get the prioritizable trait
   */
  getPrioritizableTrait(): IPrioritizableTrait<QueueItem> {
    return this.getTrait<IPrioritizableTrait<QueueItem>>('prioritizable')!;
  }

  /**
   * Get the mutable trait
   */
  getMutableTrait(): IMutableTrait<QueueItem> | undefined {
    return this.getTrait<IMutableTrait<QueueItem>>('mutable');
  }

  /**
   * Get the removable trait
   */
  getRemovableTrait(): IRemovableTrait<QueueItem> | undefined {
    return this.getTrait<IRemovableTrait<QueueItem>>('removable');
  }

  /**
   * Get all items from the queue
   */
  getAllItems(): QueueItem[] {
    return [...this.hybridSource['riffBuffer'], ...this.hybridSource['localBuffer']];
  }
}
