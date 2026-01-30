import * as riff from '../../siyuan/riff.ts';
import { setBlockAttrs, sql, getBlockAttrs } from '../../siyuan/api.ts';
import { ATTR_PRIORITY, ATTR_CARD_TYPE } from '../../siyuan/block.ts';
import { RiffScheduler } from '../schedulers/RiffScheduler.ts';
import { PrioritySequencer } from '../sequencers/PrioritySequencer.ts';
import type { StorageManager } from '../../storage/StorageManager';
import { SchedulerSortingStrategy } from '../../scheduling/SortingStrategy';
import { CardStorage } from '../../scheduling/CardStorage';
import type { SchedulerEngineAdapter } from '../../scheduler/types';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types.ts';
import { computeProtectionStats, clampPriority, DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import type { IPrioritizableTrait, IMutableTrait, IRemovableTrait } from '../abstraction/types.ts';
import { normalizeBlockId, normalizeDeckId, normalizeRiffCardId } from '../abstraction/QueueCardRef.ts';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy.ts';
import { QueueMigrationManager, type QueueData } from './QueueMigrationManager.ts';
import { QueueRecoveryManager } from './QueueRecoveryManager.ts';
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types';
import { CardState } from '@/types';

type RiffApi = {
  getRiffDueCards: typeof riff.getRiffDueCards;
  reviewRiffCard: typeof riff.reviewRiffCard;
  skipReviewRiffCard: typeof riff.skipReviewRiffCard;
};

function normalizeNextDues(input: any): Record<1 | 2 | 3 | 4, string> {
  const next = input?.nextDues;
  if (!next) return { 1: '', 2: '', 3: '', 4: '' };
  if (typeof next === 'object') {
    const byNum = {
      1: String((next as any)[1] ?? (next as any)['1'] ?? ''),
      2: String((next as any)[2] ?? (next as any)['2'] ?? ''),
      3: String((next as any)[3] ?? (next as any)['3'] ?? ''),
      4: String((next as any)[4] ?? (next as any)['4'] ?? ''),
    };
    if (byNum[1] || byNum[2] || byNum[3] || byNum[4]) return byNum;

    const byName = {
      1: String((next as any).again ?? ''),
      2: String((next as any).hard ?? ''),
      3: String((next as any).good ?? ''),
      4: String((next as any).easy ?? ''),
    };
    return byName;
  }
  return { 1: '', 2: '', 3: '', 4: '' };
}

function normalizeDueCard(raw: any, fallbackDeckID: string): QueueItem {
  const cardID = normalizeRiffCardId(raw);
  const blockID = normalizeBlockId(raw);
  const deckID = normalizeDeckId(raw, fallbackDeckID);
  return {
    cardID,
    blockID,
    deckID,
    priority: DEFAULT_PRIORITY,
    nextDues: normalizeNextDues(raw),
    state: Number.isFinite(Number(raw?.state)) ? Number(raw?.state) : undefined,
    lapses: Number.isFinite(Number(raw?.lapses)) ? Number(raw?.lapses) : undefined,
    reps: Number.isFinite(Number(raw?.reps)) ? Number(raw?.reps) : undefined,
  };
}

/**
 * 统一的检索练习队列
 *
 * SuperMemo Outstanding 队列模式：
 * - 包含所有待复习卡片（新卡片 + 到期的旧卡片）
 * - 评分后卡片从队列移除
 * - 只返回到期的卡片（nextDues <= now）
 * - 随时可以加入新卡片到队列
 *
 * 支持：
 * 1. 从 Riff 获取到期卡片（使用 Riff API）
 * 2. 本地队列（手动添加，持久化）
 * 3. 混合模式：同时支持两种来源
 * 4. 算法排序（FSRS/SM-2）
 */
export class RetrievalPracticeQueue implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly getPrioritiesByBlockIDs: (blockIDs: string[]) => Promise<Map<string, number>>;
  private readonly scheduler: RiffScheduler<QueueItem, 1 | 2 | 3 | 4>;
  private readonly prioritizableTrait: IPrioritizableTrait<QueueItem>;
  private readonly mutableTrait: IMutableTrait<QueueItem>;
  private readonly removableTrait: IMutableTrait<QueueItem> & IRemovableTrait<QueueItem>;
  private protectionExtra = '';

  // 🆕 Phase 4: SchedulerRouter（可选）
  private readonly schedulerRouter?: SchedulerRouter;

  // Riff 队列相关
  private riffLoaded = false;
  private riffBuffer: QueueItem[] = [];
  private riffRawBuffer: any[] = [];
  private riffCurrentRaw: any | null = null;

  // 本地队列相关
  private readonly storage?: StorageManager;
  private localBuffer: QueueItem[] = [];
  private sortingStrategy?: SchedulerSortingStrategy;
  private isLocalBufferSorted = false; // 🆕 Phase 2d.1: 排序状态标记
  private readonly migrationManager: QueueMigrationManager; // 🆕 Phase 2d.2: 迁移管理器
  private readonly recoveryManager: QueueRecoveryManager; // 🆕 Phase 2d.4: 恢复管理器

  // 🆕 Phase 2d.2: 队列元数据
  private queueCreatedAt: number = Date.now();
  private queueInitialTotal: number = 0;

  // 🆕 Phase 2d.4: 备份相关
  private _saveCount: number = 0;
  private readonly BACKUP_INTERVAL = 10; // 每 10 次保存备份

  // 统计信息
  private riffUnreviewedNew = 0;
  private riffUnreviewedOld = 0;
  private riffUnreviewedTotal = 0;
  private initialTotal = 0;
  private reviewedCount = 0;

  constructor(options?: {
    deckID?: string;
    api?: Partial<RiffApi>;
    getPrioritiesByBlockIDs?: (blockIDs: string[]) => Promise<Map<string, number>>;
    storage?: StorageManager;
    localScheduler?: SchedulerEngineAdapter;
    schedulerRouter?: SchedulerRouter; // 🆕 Phase 4
  }) {
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.api = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.getPrioritiesByBlockIDs = options?.getPrioritiesByBlockIDs || defaultGetPrioritiesByBlockIDs;
    this.storage = options?.storage;
    this.schedulerRouter = options?.schedulerRouter; // 🆕 Phase 4

    // 🆕 Phase 2d.2: 初始化迁移管理器
    this.migrationManager = new QueueMigrationManager();

    // 🆕 Phase 2d.4: 初始化恢复管理器
    this.recoveryManager = new QueueRecoveryManager();

    // 初始化本地调度器（如果提供）
    if (options?.localScheduler) {
      this.sortingStrategy = new SchedulerSortingStrategy(options.localScheduler);
    }

    this.scheduler = new RiffScheduler(async (card, grade) => {
      await this.api.reviewRiffCard(card.deckID || this.deckID, card.cardID, grade, this.getRiffReviewedCardsPayload());
      return card;
    });

    this.prioritizableTrait = {
      id: 'prioritizable',
      setPriority: async (item, priority) => {
        const blockID = String((item as any)?.blockID || '');
        if (!blockID) return false;
        const p = clampPriority(priority, DEFAULT_PRIORITY);
        await setBlockAttrs(blockID, { [ATTR_PRIORITY]: String(p) } as any);
        return true;
      },
    };

    this.mutableTrait = {
      id: 'mutable',
      insertAt: async (items, index) => {
        // 本地队列插入（规范化数据）
        const itemsOnly = await this._filterItemCards(items);
        const normalizedItems = itemsOnly.map(item => ({
          cardID: String(item?.cardID || item?.cardId || ''),
          blockID: String(item?.blockID || item?.blockId || ''),
          deckID: String(item?.deckID || item?.deckId || this.deckID),
          priority: item?.priority ?? DEFAULT_PRIORITY,
          nextDues: item?.nextDues || { 1: '', 2: '', 3: '', 4: '' },
          state: item?.state,
          lapses: item?.lapses,
          reps: item?.reps,
          lastReview: item?.lastReview,
          meta: item?.meta || {},
        }));
        this.localBuffer.splice(index, 0, ...normalizedItems);
        await this._persistLocalQueue();
        return;
      },
    };

    this.removableTrait = {
      id: 'removable',
      insertAt: async (items, index) => {
        // 本地队列插入（规范化数据）
        const itemsOnly = await this._filterItemCards(items);
        const normalizedItems = itemsOnly.map(item => ({
          cardID: String(item?.cardID || item?.cardId || ''),
          blockID: String(item?.blockID || item?.blockId || ''),
          deckID: String(item?.deckID || item?.deckId || this.deckID),
          priority: item?.priority ?? DEFAULT_PRIORITY,
          nextDues: item?.nextDues || { 1: '', 2: '', 3: '', 4: '' },
          state: item?.state,
          lapses: item?.lapses,
          reps: item?.reps,
          lastReview: item?.lastReview,
          meta: item?.meta || {},
        }));
        this.localBuffer.splice(index, 0, ...normalizedItems);
        await this._persistLocalQueue();
        return;
      },
      removeItems: async (items) => {
        let removedCount = 0;
        for (const item of items) {
          const cardID = String((item as any)?.cardID || item?.cardId || '');
          if (!cardID) continue;

          const index = this.localBuffer.findIndex(localItem => String(localItem.cardID) === cardID);
          if (index !== -1) {
            this.localBuffer.splice(index, 1);
            removedCount++;
          }
        }

        if (removedCount > 0) {
          await this._persistLocalQueue();
        }

        return removedCount;
      },
    };

    // 初始化时加载本地队列（异步，不阻塞构造函数）
    this._loadLocalQueue().catch(err => {
      console.error('[RetrievalPracticeQueue] Failed to load queue on init:', err);
    });
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return {
      statsType: 'riff-counts',
      showRatingButtons: true,
      allowSkip: true,
      hiddenContentTypes: ['heading', 'mark', 'list', 'superBlock'], // 🆕 添加隐藏内容类型
    };
  }

  async getStats(): Promise<QueueStats> {
    await this._ensureRiffLoaded();

    const riffSize = Math.max(0, Number(this.riffUnreviewedTotal) || 0);
    const localSize = this.localBuffer.length;
    const totalSize = riffSize + localSize;
    const label = `${Math.max(0, Number(this.riffUnreviewedNew) || 0)}/${Math.max(0, Number(this.riffUnreviewedOld) || 0)}`;

    return {
      size: totalSize,
      label,
      extra: this.protectionExtra,
      total: this.initialTotal,
      remaining: totalSize,
      reviewed: this.reviewedCount,
      initialTotal: this.initialTotal,
    } as any;
  }

  async next(): Promise<QueueItem | null> {
    console.log('[RetrievalPracticeQueue] next() ENTRY - Method called!');
    await this._ensureRiffLoaded();
    console.log('[RetrievalPracticeQueue] next() after _ensureRiffLoaded');

    // ✅ Phase 2d.1: 确保本地队列已排序（O(1) 如果已排序）
    this._ensureSorted();

    // ✅ 只返回到期的本地卡片（Outstanding 模式）
    const now = Date.now();
    console.log('[RetrievalPracticeQueue] next() filtering local items:', {
      localBufferLength: this.localBuffer.length,
    });

    try {
      const dueLocalItems = this.localBuffer.filter(item => {
        const dueTime = CardStorage.getDueTime(item);
        return dueTime <= now;
      });

      console.log('[RetrievalPracticeQueue] next() filter complete:', {
        dueLocalItemsLength: dueLocalItems.length,
      });

      // 合并到期的本地卡片和 Riff 卡片
      const allItems = [...dueLocalItems, ...this.riffBuffer];

      console.log('[RetrievalPracticeQueue] next() called:', {
        deckID: this.deckID,
        localTotal: this.localBuffer.length,
        localDue: dueLocalItems.length,
        riffTotal: this.riffBuffer.length,
        allItems: allItems.length,
      });

      if (allItems.length === 0) return null;

      // 选择一张卡片
      let selectedItem: QueueItem | null = null;

      // 如果有调度器，使用算法排序
      if (this.sortingStrategy) {
        const sorted = this.sortingStrategy.sort(allItems);
        selectedItem = sorted[0] || null;
      } else {
        // 否则使用已排序的队列（本地队列已排序，riff 队列按优先级排序）
        selectedItem = allItems[0];
      }

      if (!selectedItem) return null;

      // ✅ 关键：从队列中移除已选择的卡片
      const selectedCardID = String(selectedItem.cardID);

      // 从本地队列移除
      const localIndex = this.localBuffer.findIndex(item => String(item.cardID) === selectedCardID);
      if (localIndex !== -1) {
        this.localBuffer.splice(localIndex, 1);
      } else {
        // 从Riff队列移除
        const riffIndex = this.riffBuffer.findIndex(item => String(item.cardID) === selectedCardID);
        if (riffIndex !== -1) {
          this.riffBuffer.splice(riffIndex, 1);
        }
      }

      console.log('[RetrievalPracticeQueue] next() returning card:', {
        cardID: selectedCardID,
        remainingLocal: this.localBuffer.length,
        remainingRiff: this.riffBuffer.length,
      });

      return selectedItem;
    } catch (err) {
      console.error('[RetrievalPracticeQueue] next() error:', err);
      return null;
    }
  }

  getPrioritizableTrait(): IPrioritizableTrait<QueueItem> {
    return this.prioritizableTrait;
  }

  getMutableTrait(): IMutableTrait<QueueItem> | undefined {
    return this.mutableTrait;
  }

  getRemovableTrait(): IMutableTrait<QueueItem> & IRemovableTrait<QueueItem> | undefined {
    return this.removableTrait;
  }

  async onFeedback(
    currentItem: QueueItem | null,
    feedback: QueueFeedback,
  ): Promise<void> {
    if (!currentItem) return;

    const cardID = String((currentItem as any)?.cardID || (currentItem as any)?.cardId || '');
    const deckID = String((currentItem as any)?.deckID || (currentItem as any)?.deckId || this.deckID);
    if (!cardID) return;

    // 判断是否是本地卡片
    const isLocal = this.localBuffer.some(item => String(item.cardID) === cardID);

    if (feedback.action === 'skip') {
      if (isLocal) {
        // 本地卡片：移到队列末尾
        await this._moveLocalToEnd(cardID);
      } else {
        // Riff 卡片：调用 Riff API
        await this.api.skipReviewRiffCard(deckID, cardID);
        this._afterRiffConsumed(currentItem);
        this.riffCurrentRaw = null;
      }
      return;
    }

    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;

      if (isLocal) {
        // 🆕 Phase 4: 如果有 SchedulerRouter，使用它进行调度
        if (this.schedulerRouter) {
          // 转换 QueueItem → FSRSCard
          const card = this._queueItemToCard(currentItem);

          // 使用 SchedulerRouter 进行复习和调度
          const updatedCard = await this.schedulerRouter.route(card, rating as any);

          // 转换 FSRSCard → QueueItem
          const updatedItem = this._cardToQueueItem(updatedCard, currentItem);

          // 从队列中移除旧项
          const cardIDStr = String(currentItem.cardID);
          const oldIndex = this.localBuffer.findIndex(item => String(item.cardID) === cardIDStr);
          if (oldIndex !== -1) {
            this.localBuffer.splice(oldIndex, 1);
          }

          // 使用二分查找重新插入到正确位置
          this._insertSorted(updatedItem, this.localBuffer);

          await this._persistLocalQueue();
        } else if (this.sortingStrategy) {
          // 回退到原有逻辑：使用本地调度器更新 nextDues
          await this.sortingStrategy.review(currentItem, rating);

          // ✅ Phase 2d.1: 评分后卡片可能需要移动到新位置（nextDues 已更新）
          // 从队列中移除旧项
          const cardIDStr = String(currentItem.cardID);
          const oldIndex = this.localBuffer.findIndex(item => String(item.cardID) === cardIDStr);
          if (oldIndex !== -1) {
            this.localBuffer.splice(oldIndex, 1);
          }

          // 使用二分查找重新插入到正确位置
          this._insertSorted(currentItem, this.localBuffer);

          await this._persistLocalQueue();
        }
      } else {
        // Riff 卡片：使用 Riff API
        await this.scheduler.schedule({ ...(currentItem as any), deckID, cardID } as QueueItem, rating);
        this._afterRiffConsumed(currentItem);
        this.riffCurrentRaw = null;
      }
      this.reviewedCount++;
      return;
    }
  }

  /**
   * 手动添加卡片到本地队列
   */
  async addItems(items: QueueItem[]): Promise<number> {
    // 过滤 Topic 卡片
    const itemsOnly = await this._filterItemCards(items);

    // 初始化调度状态（如果有调度器）
    if (this.sortingStrategy) {
      for (const item of itemsOnly) {
        // 使用默认评分 Good (3) 初始化
        await this.sortingStrategy.review(item, 3);
      }
    }

    this.localBuffer.push(...itemsOnly);

    // ✅ Phase 2d.1: 标记为未排序（延迟排序，在 next() 时执行）
    this._markUnsorted();

    await this._persistLocalQueue();

    return itemsOnly.length;
  }

  /**
   * 获取所有卡片（本地 + Riff）
   */
  getAllItems(): QueueItem[] {
    return [...this.localBuffer, ...this.riffBuffer];
  }

  /**
   * 重新排序队列
   */
  async reorder(orderedItems: QueueItem[]): Promise<boolean> {
    try {
      const allItems = this.getAllItems();

      if (orderedItems.length !== allItems.length) {
        console.error('[RetrievalPracticeQueue] reorder - Count mismatch');
        return false;
      }

      // 分离本地和 Riff 卡片
      const localIDs = new Set(this.localBuffer.map(item => String(item.cardID)));
      const newLocal: QueueItem[] = [];
      const newRiff: QueueItem[] = [];

      for (const item of orderedItems) {
        const id = String(item.cardID);
        if (localIDs.has(id)) {
          newLocal.push(item);
        } else {
          newRiff.push(item);
        }
      }

      this.localBuffer = newLocal;
      this.riffBuffer = newRiff;

      // 持久化本地队列
      await this._persistLocalQueue();

      return true;
    } catch (err) {
      console.error('[RetrievalPracticeQueue] reorder failed:', err);
      return false;
    }
  }

  // ========== 私有方法 ==========

  /**
   * 过滤出 Item 卡片（排除 Topic 卡片）
   */
  private async _filterItemCards(items: QueueItem[]): Promise<QueueItem[]> {
    const filtered: QueueItem[] = [];

    for (const item of items) {
      const cardType = await this._getCardType(item.blockID);

      if (cardType !== 'topic') {
        filtered.push(item);
      } else {
        console.log('[RetrievalPracticeQueue] Filtered out Topic card:', {
          blockID: item.blockID,
        });
      }
    }

    return filtered;
  }

  /**
   * 获取卡片类型
   */
  private async _getCardType(blockId: string): Promise<'topic' | 'item' | undefined> {
    try {
      const attrs = await getBlockAttrs(blockId);
      const cardType = attrs[ATTR_CARD_TYPE];

      if (cardType === 'topic') return 'topic';
      if (cardType === 'item') return 'item';

      return undefined;
    } catch (err) {
      console.error('[RetrievalPracticeQueue] Failed to get card type:', err);
      return undefined;
    }
  }

  /**
   * 加载本地队列（Phase 2d.2: 使用迁移管理器，Phase 2d.4: 使用恢复管理器）
   */
  private async _loadLocalQueue(): Promise<void> {
    if (!this.storage) return;

    try {
      // 获取主数据和备份数据
      const rawData = this.storage.getQueueData();
      const backupData = await this.storage.getQueueBackup();

      if (!rawData && !backupData) {
        // 尝试使用旧方法加载（向后兼容）
        const legacyData = this.storage.getPracticeQueue();
        if (legacyData && legacyData.length > 0) {
          const queueData = this.migrationManager.migrate(legacyData);
          this._loadQueueData(queueData);
        } else {
          // 空队列
          this.localBuffer = [];
          this._markUnsorted();
        }
        return;
      }

      // 🆕 Phase 2d.4: 使用恢复管理器验证和恢复数据
      const recovered = this.recoveryManager.recover(rawData, backupData);

      if (!recovered) {
        console.error('[RetrievalPracticeQueue] Failed to recover queue data, creating empty queue');
        // 创建空队列
        const emptyQueue = this.recoveryManager.createEmptyQueue();
        this._loadQueueData(emptyQueue);
        return;
      }

      // 使用迁移管理器确保数据是最新版本
      const queueData = this.migrationManager.migrate(recovered);
      this._loadQueueData(queueData);

      console.log('[RetrievalPracticeQueue] Loaded local queue:', {
        deckID: this.deckID,
        version: queueData.version,
        localCount: this.localBuffer.length,
        initialTotal: queueData.metadata.initialTotal,
        items: this.localBuffer.map(i => ({ cardID: i.cardID, blockID: i.blockID })),
      });
    } catch (error) {
      console.error('[RetrievalPracticeQueue] Failed to load local queue:', error);
      // 创建空队列
      this.localBuffer = [];
      this._markUnsorted();
    }
  }

  /**
   * 从 QueueData 加载队列数据
   */
  private _loadQueueData(queueData: QueueData): void {
    this.localBuffer = queueData.items;
    this.queueCreatedAt = queueData.metadata.createdAt;
    this.queueInitialTotal = queueData.metadata.initialTotal;
    this.reviewedCount = queueData.metadata.totalReviewed;

    // ✅ Phase 2d.1: 加载后标记为未排序，让 _ensureSorted() 在第一次调用时排序
    this._markUnsorted();
  }

  /**
   * 持久化本地队列（Phase 2d.2: 版本化格式，Phase 2d.4: 自动备份）
   */
  private async _persistLocalQueue(): Promise<void> {
    if (!this.storage) return;

    // 构建版本化的队列数据
    const queueData: QueueData = {
      version: 2, // 当前版本
      items: this.localBuffer,
      metadata: {
        createdAt: this.queueCreatedAt,
        updatedAt: Date.now(),
        totalReviewed: this.reviewedCount,
        initialTotal: this.queueInitialTotal > 0 ? this.queueInitialTotal : this.localBuffer.length,
      },
    };

    // 保存主数据
    await this.storage.setQueueData(queueData);

    // 🆕 Phase 2d.4: 定期备份
    this._saveCount++;
    if (this._saveCount % this.BACKUP_INTERVAL === 0) {
      await this.storage.setQueueBackup(queueData);
      console.debug(`[RetrievalPracticeQueue] Queue backup saved (save #${this._saveCount})`);
    }
  }

  /**
   * 从本地队列移除卡片
   */
  private async _removeFromLocal(cardID: string): Promise<void> {
    const id = String(cardID);
    this.localBuffer = this.localBuffer.filter(item => String(item.cardID) !== id);
    await this._persistLocalQueue();
  }

  /**
   * 将本地卡片移到队列末尾
   */
  private async _moveLocalToEnd(cardID: string): Promise<void> {
    const id = String(cardID);
    const index = this.localBuffer.findIndex(item => String(item.cardID) === id);
    if (index !== -1) {
      const [item] = this.localBuffer.splice(index, 1);
      this.localBuffer.push(item);
      await this._persistLocalQueue();
    }
  }

  // ========== Phase 2d.1: 二分查找插入 ==========

  /**
   * 比较两张卡片的排序顺序
   * 返回负数表示 a 应该在 b 前面（更早到期或优先级更高）
   */
  private _compareItems(a: QueueItem, b: QueueItem): number {
    // 首先按到期时间排序（使用 Good 评分的到期时间）
    const dueA = CardStorage.getDueTime(a);
    const dueB = CardStorage.getDueTime(b);

    if (dueA !== dueB) {
      return dueA - dueB;
    }

    // 到期时间相同时，按优先级排序（高优先级在前）
    const priorityA = a.priority ?? DEFAULT_PRIORITY;
    const priorityB = b.priority ?? DEFAULT_PRIORITY;

    // 优先级高的应该排在前面，所以返回 b - a
    return priorityB - priorityA;
  }

  /**
   * 使用二分查找找到插入位置
   * 时间复杂度: O(log n)
   */
  private _findInsertIndex(item: QueueItem, queue: QueueItem[]): number {
    let left = 0;
    let right = queue.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midItem = queue[mid];

      // 如果 item 应该在 midItem 前面，搜索左半部分
      if (this._compareItems(item, midItem) < 0) {
        right = mid;
      } else {
        // 否则搜索右半部分
        left = mid + 1;
      }
    }

    return left;
  }

  /**
   * 有序插入元素到队列
   * 使用二分查找找到正确的插入位置
   */
  private _insertSorted(item: QueueItem, queue: QueueItem[]): void {
    const index = this._findInsertIndex(item, queue);
    queue.splice(index, 0, item);
  }

  /**
   * 确保队列已排序
   * 如果未排序，则执行排序并标记为已排序
   */
  private _ensureSorted(): void {
    if (!this.isLocalBufferSorted && this.localBuffer.length > 1) {
      this.localBuffer.sort((a, b) => this._compareItems(a, b));
      this.isLocalBufferSorted = true;
    }
  }

  /**
   * 标记队列为未排序
   * 在添加新元素时调用
   */
  private _markUnsorted(): void {
    this.isLocalBufferSorted = false;
  }

  // ========== End Phase 2d.1 ==========

  private _afterRiffConsumed(item: any): void {
    this.riffUnreviewedTotal = Math.max(0, (Number(this.riffUnreviewedTotal) || 0) - 1);
    const state = Number(item?.state);
    if (state === 0) {
      this.riffUnreviewedNew = Math.max(0, (Number(this.riffUnreviewedNew) || 0) - 1);
    } else {
      this.riffUnreviewedOld = Math.max(0, (Number(this.riffUnreviewedOld) || 0) - 1);
    }
  }

  private getRiffReviewedCardsPayload(): any[] {
    const out: any[] = [];
    if (this.riffCurrentRaw) out.push(this.riffCurrentRaw);
    for (const raw of this.riffRawBuffer) out.push(raw);
    return out;
  }

  private async _ensureRiffLoaded(): Promise<void> {
    if (this.riffLoaded) return;
    this.riffLoaded = true;
    console.log('[RetrievalPracticeQueue] Loading Riff cards for deck:', this.deckID);
    const data = await this.api.getRiffDueCards(this.deckID);
    const cards = Array.isArray((data as any)?.cards) ? (data as any).cards : [];
    this.riffUnreviewedTotal = Number((data as any)?.unreviewedCount) || cards.length || 0;
    this.riffUnreviewedNew = Number((data as any)?.unreviewedNewCardCount) || 0;
    this.riffUnreviewedOld = Number((data as any)?.unreviewedOldCardCount) || 0;

    console.log('[RetrievalPracticeQueue] Riff cards loaded:', {
      deckID: this.deckID,
      total: this.riffUnreviewedTotal,
      new: this.riffUnreviewedNew,
      old: this.riffUnreviewedOld,
      cardCount: cards.length,
    });

    // 初始化初始总数
    this.initialTotal = this.riffUnreviewedTotal + this.localBuffer.length;
    this.reviewedCount = 0;

    const rawOut: any[] = [];
    const itemOut: QueueItem[] = [];
    for (const c of cards) {
      const it = normalizeDueCard(c, this.deckID);
      if (!it.cardID || !it.blockID) continue;
      rawOut.push(c);
      itemOut.push(it);
    }

    const blockIds = itemOut.map((x) => String(x.blockID)).filter(Boolean);
    const priorityMap = await this.getPrioritiesByBlockIDs(blockIds).catch(() => new Map<string, number>());
    const paired = itemOut.map((it, i) => ({
      it,
      raw: rawOut[i],
      priority: clampPriority(priorityMap.get(it.blockID), DEFAULT_PRIORITY),
    }));

    paired.sort((a, b) => a.priority - b.priority);
    this.riffRawBuffer = paired.map((x) => x.raw);
    this.riffBuffer = paired.map((x) => ({ ...x.it, priority: x.priority, meta: { ...(x.it.meta || {}), priority: x.priority } }));

    const prot = computeProtectionStats(paired.map((x) => x.priority));
    this.protectionExtra = prot.total > 0 ? `HP ${prot.highPriority}/${prot.total} ${(prot.coverage * 100).toFixed(0)}%` : '';
  }

  // 🆕 Phase 4: QueueItem ↔ FSRSCard 转换方法

  /**
   * 将 QueueItem 转换为 FSRSCard
   * 用于 SchedulerRouter 的 route() 方法
   */
  private _queueItemToCard(item: QueueItem): FSRSCard {
    const now = Date.now();
    const nextDues = item.nextDues || { 1: '', 2: '', 3: '', 4: '' };

    // 解析 nextDues 获取到期时间
    const getNextDueTime = (rating: 1 | 2 | 3 | 4): number => {
      const dueStr = nextDues[rating];
      if (!dueStr) return now + 86400000; // 默认 1 天后
      const dueDate = new Date(dueStr);
      return dueDate.getTime();
    };

    // 使用 Good (3) 的到期时间作为主要 due
    const due = getNextDueTime(3);

    return {
      id: String(item.cardID),
      blockId: String(item.blockID),
      due,
      stability: item.meta?.stability || 10,
      difficulty: item.meta?.difficulty || 5,
      reps: item.reps || 0,
      lapses: item.lapses || 0,
      state: item.state ?? CardState.New,
      lastReview: item.lastReview || now - 86400000,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: item.priority || DEFAULT_PRIORITY,
      type: item.meta?.type || 'item',
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: item.meta,
      aFactor: item.meta?.aFactor,
      schedulerType: item.meta?.schedulerType,
    };
  }

  /**
   * 将 FSRSCard 转换回 QueueItem
   * 更新 QueueItem 的 nextDues 和其他字段
   */
  private _cardToQueueItem(card: FSRSCard, item: QueueItem): QueueItem {
    // 格式化到期时间为 ISO 字符串
    const formatDue = (timestamp: number): string => new Date(timestamp).toISOString();

    // 更新所有评分的到期时间（这里简化为使用相同的 due）
    // 实际应用中应该调用 scheduler.preview() 获取所有评分的到期时间
    const nextDues: Record<1 | 2 | 3 | 4, string> = {
      1: formatDue(card.due),
      2: formatDue(card.due),
      3: formatDue(card.due),
      4: formatDue(card.due),
    };

    return {
      ...item,
      nextDues,
      state: card.state,
      lapses: card.lapses,
      reps: card.reps,
      lastReview: card.lastReview,
      meta: {
        ...item.meta,
        stability: card.stability,
        difficulty: card.difficulty,
        aFactor: card.aFactor,
        schedulerType: card.schedulerType,
        scheduledDays: card.scheduledDays,
      },
    };
  }
}

function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

async function defaultGetPrioritiesByBlockIDs(blockIDs: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set((blockIDs || []).map((x) => String(x || '')).filter(Boolean)));
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const inList = batch.map((id) => `'${escapeSql(id)}'`).join(',');
    const stmt = `SELECT block_id, value FROM attributes WHERE name = '${ATTR_PRIORITY}' AND block_id IN (${inList})`;
    const rows = await sql(stmt).catch(() => []);
    for (const r of rows as any[]) {
      const bid = String(r?.block_id || r?.blockId || '');
      if (!bid) continue;
      out.set(bid, clampPriority(r?.value, DEFAULT_PRIORITY));
    }
  }
  return out;
}
