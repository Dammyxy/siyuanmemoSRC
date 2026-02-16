/**
 * Retrieval Practice Queue (V2 - Composite Architecture)
 *
 * @deprecated 此文件属于旧队列架构，将在未来版本中移除。
 * 请使用 src/queues/ 中的新架构。
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
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
import { SortedSequencer } from '../sequencers/SortedSequencer.ts';
import { HybridDataSource } from '../datasource/HybridDataSource.ts';
import { RiffDataSource, type RiffApi } from '../datasource/RiffDataSource.ts';
import { StorageDataSource } from '../datasource/StorageDataSource.ts';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue.ts';
import type { StorageManager } from '../../storage/manager';
import { SchedulerSortingStrategy } from '../../scheduling/SortingStrategy';
import { CardStorage } from '../../scheduling/CardStorage';
import type { SchedulerEngineAdapter } from '../../scheduler/types';
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { QueueItem, QueueStats } from '../types.ts';
import { clampPriority, DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import type { IPrioritizableTrait, IMutableTrait, IRemovableTrait } from '../abstraction/types.ts';

// 🆕 导出 RiffApi 类型供外部使用
export type { RiffApi };

/**
 * Custom Hybrid DataSource for Retrieval Practice
 *
 * Merges Riff API + Local Storage with due date filtering.
 */
class RetrievalHybridDataSource extends HybridDataSource {
  private readonly deckID: string;
  private readonly storage?: StorageManager;
  // ✅ 改为 protected 以便在 size() 中访问
  protected localBuffer: QueueItem[] = [];
  protected riffBuffer: QueueItem[] = [];

  constructor(
    deckID: string,
    api: RiffApi,
    storage?: StorageManager,
    options?: { notebook?: string; rootID?: string; schedulerRouter?: SchedulerRouter }
  ) {
    // ⚠️ MUST create sources BEFORE calling super()
    const riffSource = new RiffDataSource({
      deckId: deckID,
      notebook: options?.notebook,
      rootID: options?.rootID,
      blacklistProvider: storage ? () => storage.getRiffBlacklist() : undefined,
      storage: storage,  // 🆕 Phase 1.2: 传入 storage 参数
      schedulerRouter: options?.schedulerRouter,  // 🆕 传入 schedulerRouter 用于预测 nextDues
      api: api,  // 🆕 传入 api 参数（用于测试）
    });
    
    const localSource = new StorageDataSource({
      storage,
      deckId: deckID,
    });

    // ✅ Now call super() with properly initialized sources
    super({
      sources: {
        riff: riffSource,
        local: localSource,
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

    // 🆕 迁移逻辑：为所有没有 manuallyAdded 标记的旧卡片添加标记
    // 这样旧卡片也能正常显示
    let needsPersist = false;
    for (const item of this.localBuffer) {
      if ((item as any).manuallyAdded === undefined) {
        (item as any).manuallyAdded = true;
        needsPersist = true;
      }
    }
    if (needsPersist) {
      console.log('[RetrievalHybridDataSource] 🔄 迁移：为旧卡片添加 manuallyAdded 标记');
      await this._persistLocalQueue();
    }

    // Filter local buffer:
    // - 手动添加的卡片（manuallyAdded = true）：不过滤，直接显示
    // - 自动到期的卡片（manuallyAdded = false）：只显示到期的
    const now = Date.now();
    console.log('[RetrievalHybridDataSource] getAll: filtering local buffer', {
      totalLocal: this.localBuffer.length,
      localBufferCards: this.localBuffer.map(it => ({
        cardID: it.cardID,
        manuallyAdded: (it as any).manuallyAdded,
        nextDues: it.nextDues,
      })),
      now,
    });
    
    const dueLocalItems = this.localBuffer.filter(item => {
      // 🆕 如果是手动添加的卡片，直接通过过滤
      if ((item as any).manuallyAdded === true) {
        console.log('[RetrievalHybridDataSource] ✅ 手动添加的卡片，直接显示:', {
          cardID: item.cardID,
          manuallyAdded: true,
        });
        return true;
      }
      
      // 否则检查是否到期
      const dueTime = CardStorage.getDueTime(item);
      const isDue = dueTime <= now;
      console.log('[RetrievalHybridDataSource] Checking local item:', {
        cardID: item.cardID,
        dueTime,
        now,
        isDue,
        nextDues: item.nextDues,
        manuallyAdded: false,
      });
      return isDue;
    });

    console.log('[RetrievalHybridDataSource] getAll result:', {
      riffCount: this.riffBuffer.length,
      dueLocalCount: dueLocalItems.length,
      totalDue: this.riffBuffer.length + dueLocalItems.length,
    });

    // Merge Riff + due local cards
    return [...this.riffBuffer, ...dueLocalItems];
  }

  /**
   * Override remove to update both buffers
   */
  async remove(items: QueueItem[]): Promise<number> {
    let removedCount = 0;
    const riffBlockIds: string[] = [];  // 🆕 Phase 2.4.1: 收集需要从 Riff 删除的卡片

    for (const item of items) {
      const cardID = String(item?.cardID || '');
      const blockID = String(item?.blockID || '');
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

        // 🆕 Phase 2.4.1: 收集 blockID 用于批量删除
        if (blockID) {
          riffBlockIds.push(blockID);
        }
      }
    }

    // 🆕 Phase 2.4.1: 批量调用 Riff API 删除卡片
    if (riffBlockIds.length > 0) {
      try {
        await riff.removeRiffCards(this.deckID, riffBlockIds);
        console.log('[RetrievalHybridDataSource] ✅ Removed from Riff:', riffBlockIds.length);
      } catch (error) {
        // 🆕 Phase 2.4.2-2.4.3: 错误处理 - 添加到黑名单
        console.error('[RetrievalHybridDataSource] Failed to remove from Riff:', error);
        if (this.storage) {
          for (const blockID of riffBlockIds) {
            this.storage.addToRiffBlacklist(blockID);
          }
          console.log('[RetrievalHybridDataSource] ✅ Added to blacklist (remove failed):', riffBlockIds.length);
        }
      }
    }

    return removedCount;
  }

  /**
   * Add items to local buffer
   */
  async insertAt(items: QueueItem[], index: number): Promise<void> {
    console.log('[RetrievalHybridDataSource] ========== insertAt 被调用 ==========');
    console.log('[RetrievalHybridDataSource] 输入参数:', {
      itemCount: items.length,
      index,
      currentLocalBufferSize: this.localBuffer.length,
    });
    console.log('[RetrievalHybridDataSource] 输入 items 详情:', items.map(it => ({
      cardID: it.cardID,
      blockID: it.blockID,
      nextDues: it.nextDues,
      priority: it.priority,
    })));
    console.log('[RetrievalHybridDataSource] 当前 localBuffer 内容:', this.localBuffer.map(it => ({
      cardID: it.cardID,
      blockID: it.blockID,
    })));
    
    // 执行插入
    this.localBuffer.splice(index, 0, ...items);
    console.log('[RetrievalHybridDataSource] ✅ splice 完成');
    console.log('[RetrievalHybridDataSource] 更新后 localBuffer 大小:', this.localBuffer.length);
    console.log('[RetrievalHybridDataSource] 更新后 localBuffer 内容:', this.localBuffer.map(it => ({
      cardID: it.cardID,
      blockID: it.blockID,
    })));
    
    // 验证插入结果
    for (const item of items) {
      const found = this.localBuffer.find(li => li.cardID === item.cardID);
      if (!found) {
        console.error('[RetrievalHybridDataSource] ❌ 验证失败：卡片未在 localBuffer 中找到', {
          cardID: item.cardID,
          blockID: item.blockID,
        });
      } else if (found.cardID !== item.cardID) {
        console.error('[RetrievalHybridDataSource] ❌ 验证失败：cardID 不匹配', {
          expected: item.cardID,
          actual: found.cardID,
        });
      } else {
        console.log('[RetrievalHybridDataSource] ✅ 验证成功：卡片已在 localBuffer 中', {
          cardID: found.cardID,
          blockID: found.blockID,
        });
      }
    }
    
    console.log('[RetrievalHybridDataSource] ✅ 准备持久化到存储');
    await this._persistLocalQueue();
    console.log('[RetrievalHybridDataSource] ========== insertAt 完成 ==========');
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
   * Override size() to provide accurate count
   */
  size(): number {
    // ✅ 安全检查：防止 this 上下文丢失
    if (!this.riffBuffer || !this.localBuffer) {
      console.warn('[RetrievalHybridDataSource] Buffers not initialized, returning 0');
      return 0;
    }
    return this.riffBuffer.length + this.localBuffer.length;
  }

  /**
   * Override isEmpty() for efficiency
   */
  isEmpty(): boolean {
    // ✅ 安全检查
    if (!this.riffBuffer || !this.localBuffer) {
      return true;
    }
    return this.riffBuffer.length === 0 && this.localBuffer.length === 0;
  }

  /**
   * Load local queue from storage
   */
  private async _loadLocalQueue(): Promise<void> {
    if (!this.storage) return;

    try {
      // 从 storage 加载队列数据
      const data = await this.storage.loadData('queue-retrieval-practice.json');

      if (data && Array.isArray(data.items)) {
        this.localBuffer = data.items;
        console.log('[RetrievalHybridDataSource] Loaded', this.localBuffer.length, 'items from storage');
        
        // 🆕 迁移逻辑：为所有没有 manuallyAdded 标记的旧卡片添加标记
        // 这确保旧架构添加的卡片也能正常显示
        let needsMigration = false;
        for (const item of this.localBuffer) {
          if ((item as any).manuallyAdded === undefined) {
            (item as any).manuallyAdded = true;
            needsMigration = true;
          }
        }
        
        if (needsMigration) {
          console.log('[RetrievalHybridDataSource] 🔄 迁移：为', this.localBuffer.length, '张旧卡片添加 manuallyAdded 标记');
          await this._persistLocalQueue();
        }
      } else {
        this.localBuffer = [];
        console.log('[RetrievalHybridDataSource] No saved queue found, starting empty');
      }
    } catch (error) {
      console.error('[RetrievalHybridDataSource] Failed to load local queue:', error);
      this.localBuffer = [];
    }
  }

  /**
   * Persist local queue to storage
   */
  private async _persistLocalQueue(): Promise<void> {
    if (!this.storage) return;

    try {
      // 构建持久化数据
      const data = {
        version: 1,
        items: this.localBuffer,
        metadata: {
          savedAt: Date.now(),
          count: this.localBuffer.length,
        },
      };

      // 保存到 storage
      await this.storage.saveData('queue-retrieval-practice.json', data);
      console.log('[RetrievalHybridDataSource] Saved', this.localBuffer.length, 'items to storage');
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
 * 
 * Now uses SortedSequencer (SM-15 style) for efficient binary search insertion.
 */
/**
 * @deprecated Old architecture queue. Use src/queues/RetrievalPracticeQueue instead.
 */
export class RetrievalPracticeQueue extends BaseCompositeQueue<QueueItem> {
  private readonly hybridSource: RetrievalHybridDataSource;
  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly storage?: StorageManager;
  private readonly sortingStrategy?: SchedulerSortingStrategy;
  private readonly schedulerRouter?: SchedulerRouter;  // 🆕 新增
  private reviewedCount = 0;
  private riffUnreviewedNew = 0;
  private riffUnreviewedOld = 0;

  /**
   * Private constructor - use create() factory method instead
   */
  private constructor(
    hybridSource: RetrievalHybridDataSource,
    sequencer: SortedSequencer<QueueItem>,
    scheduler: RiffScheduler<QueueItem, 1 | 2 | 3 | 4>,
    traits: any[],
    options: {
      deckID: string;
      api: RiffApi;
      storage?: StorageManager;
      sortingStrategy?: SchedulerSortingStrategy;
      schedulerRouter?: SchedulerRouter;
    }
  ) {
    // Initialize base class
    super({
      scheduler,
      sequencer,
      dataSource: hybridSource,
      traits,
      uiConfig: {
        statsType: 'riff-counts',
        showRatingButtons: true,
        allowSkip: true,
        hiddenContentTypes: ['heading', 'mark', 'list', 'superBlock'],
      },
      statsLabel: '提取练习',
    });

    this.hybridSource = hybridSource;
    this.deckID = options.deckID;
    this.api = options.api;
    this.storage = options.storage;
    this.sortingStrategy = options.sortingStrategy;
    this.schedulerRouter = options.schedulerRouter;
  }

  /**
   * Factory method to create RetrievalPracticeQueue
   * 
   * This is necessary because we need to load initial items asynchronously
   * before creating the SortedSequencer.
   */
  static async create(options?: {
    deckID?: string;
    api?: Partial<RiffApi>;
    storage?: StorageManager;
    localScheduler?: SchedulerEngineAdapter;
    schedulerRouter?: SchedulerRouter;
  }): Promise<RetrievalPracticeQueue> {
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

    // Create sequencer with SM-15 style sorted insertion
    // Load initial items from data source
    const initialItems = await hybridSource.getAll();
    const sequencer = new SortedSequencer<QueueItem>({
      getDueMs: (item) => {
        // Get due time for sorting
        return CardStorage.getDueTime(item);
      },
      getPriority: (item) => {
        return item.priority ?? DEFAULT_PRIORITY;
      },
      initialItems: sortingStrategy ? sortingStrategy.sort(initialItems) : initialItems,
    });

    // 🆕 Task 1.5: Register sequencer as observer of data source
    // This ensures the sequencer's cache is automatically invalidated when data changes
    hybridSource.addObserver(sequencer);
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ Registered sequencer as observer of data source');

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

          console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ Used SchedulerRouter:', {
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
      id: 'prioritizable' as const,
      setPriority: async (item, priority) => {
        const blockID = String((item as any)?.blockID || '');
        if (!blockID) return false;
        const p = clampPriority(priority, DEFAULT_PRIORITY);
        await setBlockAttrs(blockID, { [ATTR_PRIORITY]: String(p) } as any);
        return true;
      },
    };

    const mutableTrait: IMutableTrait<QueueItem> = {
      id: 'mutable' as const,
      insertAt: async (items, index) => {
        await hybridSource.insertAt(items, index);
      },
    };

    const removableTrait: IRemovableTrait<QueueItem> = {
      id: 'removable' as const,
      remove: async (items) => {
        return await hybridSource.remove(items);
      },
    };

    return new RetrievalPracticeQueue(
      hybridSource,
      sequencer,
      scheduler,
      [prioritizableTrait, mutableTrait, removableTrait],
      {
        deckID,
        api,
        storage: options?.storage,
        sortingStrategy,
        schedulerRouter: options?.schedulerRouter,
      }
    );
  }



  /**
   * Override getStats to provide Riff-specific statistics
   */
  async getStats(): Promise<QueueStats> {
    // 🆕 确保缓冲区已填充
    await this.hybridSource.getAll();
    
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

  /**
   * Add items to the queue (for backwards compatibility with V1)
   * Items are inserted at the beginning of the local buffer
   */
  async addItems(items: QueueItem[]): Promise<number> {
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ========== addItems 被调用 ==========');
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 输入 items 数量:', items?.length || 0);
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 输入 items 详情:', items?.map(item => ({
      cardID: item.cardID,
      blockID: item.blockID,
      deckID: item.deckID,
      nextDues: item.nextDues,
      priority: item.priority,
    })));
    
    if (!items || items.length === 0) {
      console.log('[SiyuanMemo][RetrievalPracticeQueue] ❌ items 为空，返回 0');
      return 0;
    }
    
    // 验证输入数据
    for (const item of items) {
      if (!item.cardID) {
        console.error('[SiyuanMemo][RetrievalPracticeQueue] ❌ 验证失败：cardID 为空', item);
      }
      if (!item.blockID) {
        console.error('[SiyuanMemo][RetrievalPracticeQueue] ❌ 验证失败：blockID 为空', item);
      }
    }
    
    // 🆕 为所有手动添加的卡片设置 manuallyAdded 标记
    // 这样即使卡片未到期，也会在 getAll() 中显示
    const itemsWithFlag = items.map(item => ({
      ...item,
      manuallyAdded: true,
    }));
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ 已为所有卡片设置 manuallyAdded = true');
    
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ 准备调用 hybridSource.insertAt()');
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 当前 localBuffer 大小:', this.hybridSource['localBuffer'].length);
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 当前 sequencer 大小:', (this.sequencer as SortedSequencer<QueueItem>).size());
    
    // Add to data source (for persistence)
    await this.hybridSource.insertAt(itemsWithFlag, 0);
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ hybridSource.insertAt() 完成');
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 更新后 localBuffer 大小:', this.hybridSource['localBuffer'].length);
    
    // Add to sequencer (for immediate availability)
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ 准备调用 sequencer.insertMany()');
    (this.sequencer as SortedSequencer<QueueItem>).insertMany(itemsWithFlag);
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ sequencer.insertMany() 完成');
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 更新后 sequencer 大小:', (this.sequencer as SortedSequencer<QueueItem>).size());
    
    // 验证插入结果
    const sequencerItems = (this.sequencer as SortedSequencer<QueueItem>).getAll();
    for (const item of items) {
      const found = sequencerItems.find(si => si.cardID === item.cardID);
      if (!found) {
        console.error('[SiyuanMemo][RetrievalPracticeQueue] ❌ 验证失败：卡片未在 sequencer 中找到', {
          cardID: item.cardID,
          blockID: item.blockID,
        });
      } else {
        console.log('[SiyuanMemo][RetrievalPracticeQueue] ✅ 验证成功：卡片已在 sequencer 中', {
          cardID: found.cardID,
          blockID: found.blockID,
          match: found.cardID === item.cardID && found.blockID === item.blockID,
        });
      }
    }
    
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ========== addItems 完成，返回 ==========');
    console.log('[SiyuanMemo][RetrievalPracticeQueue] 返回值:', items.length);
    
    return items.length;
  }

  /**
   * 清空本地队列
   */
  async clear(): Promise<number> {
    const count = this.hybridSource['localBuffer'].length;

    // 清空本地缓冲区
    this.hybridSource['localBuffer'] = [];

    // 持久化（删除持久化文件）
    await this.hybridSource['_persistLocalQueue']();

    console.log('[SiyuanMemo][RetrievalPracticeQueue] Cleared', count, 'items from local queue');
    return count;
  }

  /**
   * 获取所有卡片（包括 Riff + 本地）
   * 供 Card Browser 等外部组件使用
   *
   * 返回完整的卡片数据，包括：
   * - Riff API 的到期卡片（已自动过滤 Topic 卡片）
   * - 本地存储的到期卡片
   *
   * @returns 所有卡片的数组
   */
  async getAllCards(): Promise<QueueItem[]> {
    return await this.hybridSource.getAll();
  }

  /**
   * Override rotateToEnd to use SortedSequencer's insert method
   * 
   * This implementation follows SM-15's approach:
   * 1. Remove the item from the queue
   * 2. Update the item's dueTime to current time
   * 3. Re-insert using binary search (SM-15 style)
   * 
   * Key difference from base implementation:
   * - Uses SortedSequencer.insert() which maintains sorted order
   * - No need to call reset() - queue is always up-to-date
   * - Matches SM-15's discard() + splice(_findIndexToInsert()) pattern
   * 
   * @param item - The item to rotate to the end
   * @protected
   */
  protected async rotateToEnd(item: QueueItem): Promise<void> {
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ========== rotateToEnd START ==========');
    console.log('[SiyuanMemo][RetrievalPracticeQueue] Item to rotate:', {
      cardID: item.cardID,
      currentNextDues: item.nextDues,
    });
    
    // Step 1: Remove the item from the data source
    const removed = await this.hybridSource.remove([item]);
    console.log(`[SiyuanMemo][RetrievalPracticeQueue] Removed ${removed} item(s) from data source`);

    // Step 2: Set nextDues to current time (SM-15 style: dueDate = now)
    // This ensures the card is "immediately available" but doesn't always sort first
    const now = Date.now();
    const dueTimeISO = new Date(now).toISOString();
    item.nextDues = {
      1: dueTimeISO,
      2: dueTimeISO,
      3: dueTimeISO,
      4: dueTimeISO,
    };
    console.log(`[SiyuanMemo][RetrievalPracticeQueue] Set nextDues to current time (SM-15 style)`, {
      cardID: item.cardID,
      nextDues: item.nextDues,
      now,
      dueTimeISO,
    });

    // Step 3: Save the updated nextDues to Storage if available
    // Note: FSRSCard doesn't have nextDues field, so we don't update it in storage
    // The nextDues is only used by Riff and is stored in the queue data source
    console.log(`[SiyuanMemo][RetrievalPracticeQueue] ⚠️ nextDues is a Riff-specific field, not saved to FSRSCard storage`);

    // Step 4: Re-insert into data source (for persistence)
    await this.hybridSource.insertAt([item], Number.MAX_SAFE_INTEGER);
    console.log(`[SiyuanMemo][RetrievalPracticeQueue] Re-inserted item into data source`);

    // Step 5: Insert into sequencer using binary search (SM-15 style)
    // This is the key difference: SortedSequencer.insert() uses binary search
    // to find the correct position, just like SM-15's _findIndexToInsert()
    (this.sequencer as SortedSequencer<QueueItem>).insert(item);
    console.log(`[SiyuanMemo][RetrievalPracticeQueue] Inserted item into sequencer using binary search`);
    
    console.log('[SiyuanMemo][RetrievalPracticeQueue] ========== rotateToEnd END ==========');
  }
}
