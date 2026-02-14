/**
 * Incremental Learning Queue (V2 - Simplified)
 *
 * @deprecated 此文件属于旧队列架构，将在未来版本中移除。
 * 请使用 src/queues/ 中的新架构。
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
 *
 * Simple implementation based on RetrievalPracticeQueue pattern.
 * Supports manual card addition with persistence.
 *
 * Features:
 * - All cards can be added (no Topic/Item filtering)
 * - Riff API cards + local cards (manual addition)
 * - Unified FSRS scheduling
 * - Simple persistence to StorageManager
 */

import * as riff from '../../siyuan/riff';
import { setBlockAttrs } from '../../siyuan/api';
import { RiffScheduler } from '../schedulers/RiffScheduler';
import type { StorageManager } from '../../storage/StorageManager';
import { SchedulerSortingStrategy } from '../../scheduling/SortingStrategy';
import type { SchedulerEngineAdapter } from '../../scheduler/types';
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority';
import type { IPrioritizableTrait, IMutableTrait, IRemovableTrait } from '../abstraction/types';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy';
import { getHiddenContentTypes } from '../utils/hiddenContentTypes';
import { warnDeprecatedQueueUsage } from '../deprecation';
import { CardType } from '../../../types/card';

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
  const cardID = String(raw?.cardID || raw?.id || '');
  const blockID = String(raw?.blockID || raw?.blockId || '');
  const deckID = String(raw?.deckID || raw?.deckId || fallbackDeckID);
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
 * 安全地将时间戳转换为 ISO 字符串
 * 
 * 验证时间值的有效性，对于无效值返回当前时间的 ISO 字符串作为后备。
 * 这可以防止 Invalid Date 错误导致整个队列加载失败。
 * 
 * @param timestamp - 要转换的时间戳（可能是无效值）
 * @param context - 上下文信息，用于日志记录
 * @returns 有效的 ISO 时间字符串
 * 
 * @see .kiro/specs/invalid-date-fix/design.md
 */
function safeToISOString(
  timestamp: number | undefined | null,
  context: { cardID: string; field: string }
): string {
  // 检查 undefined 或 null
  if (timestamp === undefined || timestamp === null) {
    const fallback = new Date().toISOString();
    console.warn('[IncrementalLearningQueue] Invalid due time detected:', {
      cardID: context.cardID,
      field: context.field,
      value: timestamp,
      reason: timestamp === undefined ? 'undefined' : 'null',
      fallback,
    });
    return fallback;
  }

  // 检查 NaN
  if (Number.isNaN(timestamp)) {
    const fallback = new Date().toISOString();
    console.warn('[IncrementalLearningQueue] Invalid due time detected:', {
      cardID: context.cardID,
      field: context.field,
      value: timestamp,
      reason: 'NaN',
      fallback,
    });
    return fallback;
  }

  // 检查是否为有限数字
  if (!Number.isFinite(timestamp)) {
    const fallback = new Date().toISOString();
    console.warn('[IncrementalLearningQueue] Invalid due time detected:', {
      cardID: context.cardID,
      field: context.field,
      value: timestamp,
      reason: 'not finite',
      fallback,
    });
    return fallback;
  }

  // 尝试转换为 ISO 字符串
  try {
    const date = new Date(timestamp);
    
    // 检查是否创建了 Invalid Date
    if (isNaN(date.getTime())) {
      const fallback = new Date().toISOString();
      console.warn('[IncrementalLearningQueue] Invalid due time detected:', {
        cardID: context.cardID,
        field: context.field,
        value: timestamp,
        reason: 'invalid date',
        fallback,
      });
      return fallback;
    }
    
    return date.toISOString();
  } catch (error) {
    // 捕获任何未预期的异常
    const fallback = new Date().toISOString();
    console.warn('[IncrementalLearningQueue] Invalid due time detected:', {
      cardID: context.cardID,
      field: context.field,
      value: timestamp,
      reason: 'exception',
      error: error instanceof Error ? error.message : String(error),
      fallback,
    });
    return fallback;
  }
}

/**
 * Incremental Learning Queue (Simplified)
 *
 * Simple queue implementation:
 * - Supports Riff API cards (due cards)
 * - Supports manual card addition (persistent)
 * - No filtering (all cards can be added)
 * - Unified FSRS scheduling
 */
/**
 * @deprecated Old architecture queue. Use src/queues/IncrementalLearningQueue instead.
 */
export class IncrementalLearningQueue implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly scheduler: RiffScheduler<QueueItem, 1 | 2 | 3 | 4>;
  private readonly prioritizableTrait: IPrioritizableTrait<QueueItem>;
  private readonly mutableTrait: IMutableTrait<QueueItem>;
  private readonly removableTrait: IMutableTrait<QueueItem> & IRemovableTrait<QueueItem>;

  // Riff 队列相关
  private riffLoaded = false;
  private riffBuffer: QueueItem[] = [];
  private riffRawBuffer: any[] = [];
  private riffCurrentRaw: any | null = null;

  // 本地队列相关（手动添加的卡片）
  private readonly storage?: StorageManager;
  private localBuffer: QueueItem[] = [];
  private sortingStrategy?: SchedulerSortingStrategy;
  private readonly schedulerRouter?: SchedulerRouter;  // 🆕 Phase 2.1.2
  private readonly config?: { enableRiffSync?: boolean };  // 🆕 Phase 2.1.3

  // 统计信息
  private riffUnreviewedNew = 0;
  private riffUnreviewedOld = 0;
  private riffUnreviewedTotal = 0;
  private initialTotal = 0;
  private reviewedCount = 0;

  constructor(options?: {
    deckID?: string;
    api?: Partial<RiffApi>;
    storage?: StorageManager;
    scheduler?: SchedulerEngineAdapter;
    schedulerRouter?: SchedulerRouter;  // 🆕 Phase 2.1.1
    config?: { enableRiffSync?: boolean };  // 🆕 Phase 2.1.1
  }) {
    warnDeprecatedQueueUsage(this.constructor.name);
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.api = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.storage = options?.storage;
    this.schedulerRouter = options?.schedulerRouter;  // 🆕 Phase 2.1.2
    this.config = options?.config;  // 🆕 Phase 2.1.3

    // 初始化本地调度器（如果提供）
    if (options?.scheduler) {
      this.sortingStrategy = new SchedulerSortingStrategy(options.scheduler);
    }

    this.scheduler = new RiffScheduler(async (card, grade) => {
      await this.api.reviewRiffCard(card.deckID || this.deckID, card.cardID, grade);
      return card;
    });

    this.prioritizableTrait = {
      id: 'prioritizable',
      setPriority: async (item, priority) => {
        const blockID = String(item?.blockID || '');
        if (!blockID) return false;
        await setBlockAttrs(blockID, { 'custom-fsrs-priority': String(priority) } as any);
        return true;
      },
    };

    this.mutableTrait = {
      id: 'mutable',
      insertAt: async (items, index) => {
        this.localBuffer.splice(index, 0, ...items);
        await this._persistLocalQueue();
        return;
      },
    };

    this.removableTrait = {
      id: 'removable',
      insertAt: async (items, index) => {
        this.localBuffer.splice(index, 0, ...items);
        await this._persistLocalQueue();
        return;
      },
      remove: async (items) => {
        let removedCount = 0;
        const riffBlockIds: string[] = [];  // 🆕 Phase 2.3.1: 收集需要从 Riff 删除的卡片

        for (const item of items) {
          const cardID = String(item?.cardID || '');
          const blockID = String(item?.blockID || '');
          if (!cardID) continue;

          // 尝试从本地队列移除
          const localIndex = this.localBuffer.findIndex(localItem => String(localItem.cardID) === cardID);
          if (localIndex !== -1) {
            this.localBuffer.splice(localIndex, 1);
            removedCount++;
            console.log('[IncrementalLearningQueue] Removed from local buffer:', cardID);
          } else {
            // 🆕 Phase 2.3.1: 如果不在本地队列，说明是 Riff 卡片
            if (blockID) {
              riffBlockIds.push(blockID);
            }
          }
        }

        // 🆕 Phase 2.3.1: 批量调用 Riff API 删除卡片
        if (riffBlockIds.length > 0) {
          try {
            await riff.removeRiffCards(this.deckID, riffBlockIds);
            removedCount += riffBlockIds.length;
            console.log('[IncrementalLearningQueue] ✅ Removed from Riff:', riffBlockIds.length);
          } catch (error) {
            // 🆕 Phase 2.3.2: 错误处理 - 添加到黑名单
            console.error('[IncrementalLearningQueue] Failed to remove from Riff:', error);
            if (this.storage) {
              for (const blockID of riffBlockIds) {
                this.storage.addToRiffBlacklist(blockID);
              }
              console.log('[IncrementalLearningQueue] ✅ Added to blacklist (remove failed):', riffBlockIds.length);
            }
          }
        }

        // 🆕 Phase 2.3.4: 持久化本地队列
        if (removedCount > 0) {
          await this._persistLocalQueue();
        }

        // 🆕 Phase 2.3.3: 添加日志输出
        console.log('[IncrementalLearningQueue] remove result:', {
          total: items.length,
          removed: removedCount,
          local: removedCount - riffBlockIds.length,
          riff: riffBlockIds.length,
        });

        return removedCount;
      },
    };

    // 初始化时加载本地队列
    this._loadLocalQueue();
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { 
      statsType: 'queue-size', 
      showRatingButtons: true, 
      allowSkip: true,
      hiddenContentTypes: getHiddenContentTypes(),
    };
  }

  async getStats(): Promise<QueueStats> {
    await this._ensureRiffLoaded();

    const riffSize = Math.max(0, Number(this.riffUnreviewedTotal) || 0);
    const localSize = this.localBuffer.length;
    const totalSize = riffSize + localSize;

    return {
      size: totalSize,
      total: this.initialTotal,
      remaining: totalSize,
      reviewed: this.reviewedCount,
      new: this.riffUnreviewedNew,
      learning: 0,
    };
  }

  async next(): Promise<QueueItem | null> {
    console.log('[IncrementalLearningQueue] next() called');
    await this._ensureRiffLoaded();

    // 合并本地卡片和 Riff 卡片
    const allItems = [...this.localBuffer, ...this.riffBuffer];

    console.log('[IncrementalLearningQueue] next():', {
      localTotal: this.localBuffer.length,
      riffTotal: this.riffBuffer.length,
      allItems: allItems.length,
    });

    if (allItems.length === 0) return null;

    // 如果有调度器，使用算法排序
    let selectedItem: QueueItem | null = null;

    if (this.sortingStrategy) {
      const sorted = this.sortingStrategy.sort(allItems);
      selectedItem = sorted[0] || null;
    } else {
      // 否则按优先级排序
      allItems.sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
      selectedItem = allItems[0];
    }

    if (!selectedItem) return null;

    // 从队列中移除已选择的卡片
    const selectedCardID = String(selectedItem.cardID);

    // 从本地队列移除
    const localIndex = this.localBuffer.findIndex(item => String(item.cardID) === selectedCardID);
    if (localIndex !== -1) {
      this.localBuffer.splice(localIndex, 1);
    } else {
      // 从 Riff 队列移除
      const riffIndex = this.riffBuffer.findIndex(item => String(item.cardID) === selectedCardID);
      if (riffIndex !== -1) {
        this.riffBuffer.splice(riffIndex, 1);
      }
    }

    console.log('[IncrementalLearningQueue] next() returning card:', {
      cardID: selectedCardID,
      remainingLocal: this.localBuffer.length,
      remainingRiff: this.riffBuffer.length,
    });

    return selectedItem;
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

    const cardID = String(currentItem?.cardID || '');
    const deckID = String(currentItem?.deckID || this.deckID);
    if (!cardID) return;

    // 判断是否是本地卡片
    const isLocal = this.localBuffer.some(item => String(item.cardID) === cardID);

    if (feedback.action === 'skip') {
      if (isLocal) {
        // 本地卡片：移到队列末尾
        await this._moveLocalToEnd(cardID);
      } else {
        // 🆕 Phase 2.2.4: Riff 卡片：添加到黑名单（不调用 Riff API）
        if (this.storage) {
          this.storage.addToRiffBlacklist(currentItem.blockID);
          console.log('[IncrementalLearningQueue] ✅ Added to blacklist (skip):', currentItem.blockID);
        }
        this._afterRiffConsumed(currentItem);
        this.riffCurrentRaw = null;
      }
      return;
    }

    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;

      // 判断卡片是否还在队列中（可能已被 next() 移除）
      const isStillInQueue = isLocal 
        ? this.localBuffer.some(item => String(item.cardID) === cardID)
        : this.riffBuffer.some(item => String(item.cardID) === cardID);

      // 如果卡片还在队列中，先移除
      if (isStillInQueue) {
        if (isLocal) {
          const index = this.localBuffer.findIndex(item => String(item.cardID) === cardID);
          if (index !== -1) {
            this.localBuffer.splice(index, 1);
          }
        } else {
          const index = this.riffBuffer.findIndex(item => String(item.cardID) === cardID);
          if (index !== -1) {
            this.riffBuffer.splice(index, 1);
          }
        }
      }

      // 🆕 Phase 2.2.1-2.2.3: 统一使用 SchedulerRouter
      if (this.schedulerRouter && this.storage) {
        // 🆕 Phase 2.2.2: QueueItem 转 FSRSCard
        const fsrsCard = this.storage.getCard(cardID);
        if (fsrsCard) {
          // 🆕 Phase 2.2.1: 使用 SchedulerRouter 进行复习
          const updatedCard = await this.schedulerRouter.route(fsrsCard, rating);

          // 🆕 Phase 2.2.3: 如果是 Riff 卡片，可选同步到 Riff
          if (!isLocal && this.config?.enableRiffSync) {
            await this.api.reviewRiffCard(deckID, cardID, rating);
            console.log('[IncrementalLearningQueue] ✅ Synced to Riff:', cardID);
          }

          // 🆕 Phase 2.2.6: 添加详细日志
          console.log('[IncrementalLearningQueue] ✅ Used SchedulerRouter:', {
            cardID,
            isLocal,
            cardType: updatedCard.type,
            schedulerType: updatedCard.schedulerType,
            syncedToRiff: !isLocal && this.config?.enableRiffSync,
          });
        } else {
          // 🆕 Phase 2.2.5: 后备方案：直接调用 Riff API
          console.warn('[IncrementalLearningQueue] Card not found in storage, using Riff API:', cardID);
          await this.api.reviewRiffCard(deckID, cardID, rating);
        }
      } else {
        // 🆕 Phase 2.2.5: 后备方案：使用原有逻辑
        if (isLocal && this.sortingStrategy) {
          await this.sortingStrategy.review(currentItem, rating);
          await this._persistLocalQueue();
        } else {
          await this.scheduler.schedule({ ...currentItem, deckID, cardID } as QueueItem, rating);
        }
      }

      // 🆕 retrieval-practice-rating-fix: 根据评分决定是否重新进入队列
      // Rating < 3 (1-2): 重新进入队列末尾
      // Rating >= 3 (3-4): 从队列移除（已移除，无需操作）
      if (rating < 3) {
        if (isLocal) {
          // 本地卡片：重新添加到队列末尾
          this.localBuffer.push(currentItem);
          await this._persistLocalQueue();
          console.log('[IncrementalLearningQueue] ✅ Rotated local card to end:', cardID);
        } else {
          // Riff 卡片：重新添加到 Riff 队列末尾
          this.riffBuffer.push(currentItem);
          console.log('[IncrementalLearningQueue] ✅ Rotated Riff card to end:', cardID);
          // 不调用 _afterRiffConsumed，因为卡片重新进入队列
        }
      } else {
        // Rating >= 3: 卡片已移除，更新统计
        if (!isLocal) {
          this._afterRiffConsumed(currentItem);
          this.riffCurrentRaw = null;
        }
        console.log('[IncrementalLearningQueue] ✅ Card removed from queue (rating >= 3):', cardID);
      }

      this.reviewedCount++;
      return;
    }
  }

  /**
   * 手动添加卡片到本地队列
   */
  async addItems(items: QueueItem[]): Promise<number> {
    console.log('[IncrementalLearningQueue] addItems called with', items.length, 'items');
    console.log('[IncrementalLearningQueue] Input items:', items.map(i => ({
      cardID: i.cardID,
      blockID: i.blockID,
      deckID: i.deckID,
    })));

    // 规范化卡片数据（确保所有字段存在）
    const normalizedItems: QueueItem[] = items.map(item => ({
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

    console.log('[IncrementalLearningQueue] Normalized items:', normalizedItems.map(i => ({
      cardID: i.cardID,
      blockID: i.blockID,
      deckID: i.deckID,
    })));

    // 去重：过滤掉已存在的卡片（基于 cardID）
    const existingCardIds = new Set(this.localBuffer.map(item => String(item.cardID)));
    const newItems = normalizedItems.filter(item => !existingCardIds.has(String(item.cardID)));

    if (newItems.length < normalizedItems.length) {
      console.log('[IncrementalLearningQueue] Filtered out', normalizedItems.length - newItems.length, 'duplicate items');
    }

    // 初始化调度状态（如果有调度器）
    if (this.sortingStrategy) {
      for (const item of newItems) {
        // 使用默认评分 Good (3) 初始化
        await this.sortingStrategy.review(item, 3);
      }
    }

    this.localBuffer.push(...newItems);
    await this._persistLocalQueue();

    console.log('[IncrementalLearningQueue] Added', newItems.length, 'items to local queue');
    console.log('[IncrementalLearningQueue] Local buffer size:', this.localBuffer.length);
    return newItems.length;
  }

  /**
   * 获取所有卡片（本地 + Riff）- 供 Card Browser 使用
   *
   * @returns Promise<QueueItem[]> 所有卡片的数组
   */
  async getAllCards(): Promise<QueueItem[]> {
    // 确保 Riff 卡片已加载
    await this._ensureRiffLoaded();

    // 返回本地 + Riff 卡片
    return [...this.localBuffer, ...this.riffBuffer];
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
        console.error('[IncrementalLearningQueue] reorder - Count mismatch');
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
      console.error('[IncrementalLearningQueue] reorder failed:', err);
      return false;
    }
  }

  // ========== 私有方法 ==========

  /**
   * 加载本地队列
   */
  private _loadLocalQueue(): void {
    if (!this.storage) return;
    const rawData = this.storage.getIncrementalLearningQueue?.() || [];
    // 规范化卡片数据
    this.localBuffer = rawData.map((item: any) => ({
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
    console.log('[IncrementalLearningQueue] Loaded local queue:', {
      deckID: this.deckID,
      localCount: this.localBuffer.length,
      items: this.localBuffer.map(i => ({ cardID: i.cardID, blockID: i.blockID })),
    });
  }

  /**
   * 持久化本地队列
   */
  private async _persistLocalQueue(): Promise<void> {
    if (!this.storage) return;
    await this.storage.setIncrementalLearningQueue?.(this.localBuffer);
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

  private _afterRiffConsumed(item: any): void {
    this.riffUnreviewedTotal = Math.max(0, (Number(this.riffUnreviewedTotal) || 0) - 1);
    const state = Number(item?.state);
    if (state === 0) {
      this.riffUnreviewedNew = Math.max(0, (Number(this.riffUnreviewedNew) || 0) - 1);
    } else {
      this.riffUnreviewedOld = Math.max(0, (Number(this.riffUnreviewedOld) || 0) - 1);
    }
  }

  private async _ensureRiffLoaded(): Promise<void> {
    if (this.riffLoaded) return;
    this.riffLoaded = true;
    console.log('[IncrementalLearningQueue] Loading Riff cards for deck:', this.deckID);
    const data = await this.api.getRiffDueCards(this.deckID);
    const cards = Array.isArray(data?.cards) ? data.cards : [];
    this.riffUnreviewedTotal = Number(data?.unreviewedCount) || cards.length || 0;
    this.riffUnreviewedNew = Number(data?.unreviewedNewCardCount) || 0;
    this.riffUnreviewedOld = Number(data?.unreviewedOldCardCount) || 0;

    console.log('[IncrementalLearningQueue] Riff cards loaded:', {
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

    this.riffRawBuffer = rawOut;
    this.riffBuffer = itemOut.map(item => ({
      ...item,
      priority: DEFAULT_PRIORITY,
    }));

    // 🆕 Phase 1.3: 使用 SchedulerRouter 重新计算 nextDues
    if (this.schedulerRouter && this.storage) {
      await this._recalculateNextDues();
    }
  }

  /**
   * 🆕 Phase 1.3: 使用 SchedulerRouter 重新计算 nextDues
   * 
   * 从本地数据库加载卡片状态，使用 SchedulerRouter.preview() 预测四个选项的时间
   * 如果卡片不存在于本地存储，创建默认的 FSRSCard
   */
  private async _recalculateNextDues(): Promise<void> {
    if (!this.schedulerRouter || !this.storage) return;

    try {
      let recalculatedCount = 0;
      let createdCount = 0;

      for (let i = 0; i < this.riffBuffer.length; i++) {
        const item = this.riffBuffer[i];
        const cardID = item.cardID;
        const blockID = item.blockID;

        // 从本地数据库加载卡片
        let localCard = this.storage.getCard(cardID);
        
        // 🆕 如果卡片不存在，创建默认的 FSRSCard
        if (!localCard) {
          const now = Date.now();
          localCard = {
            id: cardID,
            blockId: blockID,
            due: now,
            stability: 0,
            difficulty: 5,
            reps: item.reps ?? 0,
            lapses: item.lapses ?? 0,
            state: item.state ?? 0,
            lastReview: item.lastReview ?? 0,
            elapsedDays: 0,
            scheduledDays: 0,
            priority: item.priority ?? 50,
            type: CardType.Item, // ✅ 修复：使用 CardType 枚举而不是字符串
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
          };
          
          // 保存到本地存储
          this.storage.setCard(localCard);
          createdCount++;
          
          console.log('[IncrementalLearningQueue] Created default card for:', cardID);
        }

        // 使用 SchedulerRouter 预测四个选项的时间
        try {
          const previews = this.schedulerRouter.preview(localCard);

          const againCard = previews.get(1);
          const hardCard = previews.get(2);
          const goodCard = previews.get(3);
          const easyCard = previews.get(4);

          // 更新 nextDues - 使用 safeToISOString 防止 Invalid Date 错误
          item.nextDues = {
            1: againCard 
              ? safeToISOString(againCard.due, { cardID: item.cardID, field: 'again' })
              : new Date().toISOString(),
            2: hardCard 
              ? safeToISOString(hardCard.due, { cardID: item.cardID, field: 'hard' })
              : new Date().toISOString(),
            3: goodCard 
              ? safeToISOString(goodCard.due, { cardID: item.cardID, field: 'good' })
              : new Date().toISOString(),
            4: easyCard 
              ? safeToISOString(easyCard.due, { cardID: item.cardID, field: 'easy' })
              : new Date().toISOString(),
          };

          recalculatedCount++;
        } catch (error) {
          console.error('[IncrementalLearningQueue] Failed to preview card:', cardID, error);
        }
      }

      // 如果创建了新卡片，保存到存储
      if (createdCount > 0) {
        await this.storage.saveCards();
        console.log('[IncrementalLearningQueue] ✅ Created', createdCount, 'default cards');
      }

      if (recalculatedCount > 0) {
        console.log('[IncrementalLearningQueue] ✅ Recalculated nextDues for', recalculatedCount, 'cards');
      }
    } catch (error) {
      console.error('[IncrementalLearningQueue] Failed to recalculate nextDues:', error);
    }
  }
}
