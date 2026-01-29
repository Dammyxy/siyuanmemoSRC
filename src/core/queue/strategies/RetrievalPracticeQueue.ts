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

  // Riff 队列相关
  private riffLoaded = false;
  private riffBuffer: QueueItem[] = [];
  private riffRawBuffer: any[] = [];
  private riffCurrentRaw: any | null = null;

  // 本地队列相关
  private readonly storage?: StorageManager;
  private localBuffer: QueueItem[] = [];
  private sortingStrategy?: SchedulerSortingStrategy;

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
  }) {
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.api = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.getPrioritiesByBlockIDs = options?.getPrioritiesByBlockIDs || defaultGetPrioritiesByBlockIDs;
    this.storage = options?.storage;

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

    // 初始化时加载本地队列
    this._loadLocalQueue();
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true };
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
        // 否则按优先级排序
        allItems.sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
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
        // 本地卡片：使用本地调度器更新 nextDues
        if (this.sortingStrategy) {
          await this.sortingStrategy.review(currentItem, rating);
        }
        // ✅ 保留在队列中（Riff Outstanding 模式：评分后不删除，让 due 过滤自动处理）
        await this._persistLocalQueue();
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
   * 加载本地队列
   */
  private _loadLocalQueue(): void {
    if (!this.storage) return;
    const rawData = this.storage.getPracticeQueue() || [];
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
    console.log('[RetrievalPracticeQueue] Loaded local queue:', {
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
    await this.storage.setPracticeQueue(this.localBuffer);
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
