/**
 * FSRS Retrieval Provider
 * 
 * @deprecated 旧架构 Provider 层。
 * 新代码请直接使用 RetrievalPracticeQueue（src/core/queue/domain/RetrievalPracticeQueue.ts）
 * 
 * 参考迁移：src/index.ts 中的 TAB 恢复逻辑
 */

import * as riff from '../../siyuan/riff.ts';
import { sql } from '../../siyuan/api.ts';
import { ATTR_PRIORITY } from '../../siyuan/block.ts';
import { computeProtectionStats, clampPriority, DEFAULT_PRIORITY } from '../../queue/abstraction/IPriority.ts';
import { normalizeBlockId, normalizeDeckId, normalizeRiffCardId } from '../../queue/abstraction/QueueCardRef.ts';
import type { CardReadPort, CardWritePort, ReviewLogWritePort } from '../../storage/ports.ts';
import type { QueueItem } from '../../queue/types.ts';
import type { QueueProvider } from '../QueueProvider.ts';
import type { QueueStats } from '../types.ts';
import { createLogger } from '../../../utils/logger.ts';

const logger = createLogger('FSRSRetrievalProvider');

type FSRSRetrievalStoragePort = CardReadPort & CardWritePort & ReviewLogWritePort;

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
    return {
      1: String((next as any).again ?? ''),
      2: String((next as any).hard ?? ''),
      3: String((next as any).good ?? ''),
      4: String((next as any).easy ?? ''),
    };
  }
  return { 1: '', 2: '', 3: '', 4: '' };
}

function normalizeDueCard(raw: any, fallbackDeckID: string): QueueItem | null {
  const cardID = normalizeRiffCardId(raw);
  const blockID = normalizeBlockId(raw);
  const deckID = normalizeDeckId(raw, fallbackDeckID);
  if (!cardID || !blockID) return null;
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

export class FSRSRetrievalProvider implements QueueProvider<QueueItem> {
  readonly id = 'fsrs-retrieval';
  readonly displayName: string;

  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly storage?: FSRSRetrievalStoragePort;
  private loaded = false;

  private items: QueueItem[] = [];
  private rawByCardId = new Map<string, any>();
  private blockIdByCardId = new Map<string, string>();
  private itemByCardId = new Map<string, QueueItem>();

  private unreviewedNew = 0;
  private unreviewedOld = 0;
  private unreviewedTotal = 0;
  private protectionExtra = '';

  constructor(options?: { deckID?: string; displayName?: string; api?: Partial<RiffApi>; storage?: FSRSRetrievalStoragePort }) {
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.displayName = String(options?.displayName || 'FSRS 复习');
    this.storage = options?.storage;
    this.api = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
  }

  async getDueCards(options?: {
    forceReload?: boolean;  // 🆕 支持强制重载
  }): Promise<QueueItem[]> {
    logger.debug('getDueCards START', {
      loaded: this.loaded,
      itemsCount: this.items.length,
      forceReload: options?.forceReload,
    });

    // 如果需要强制重新加载，清空状态
    if (options?.forceReload) {
      logger.debug('Force reload requested');
      this.loaded = false;
    }

    await this.ensureLoaded();
    
    logger.debug('getDueCards DONE:', this.items.length);
    return [...this.items];
  }

  async getStats(_options?: Record<string, unknown>): Promise<QueueStats> {
    await this.ensureLoaded();
    const remaining = Math.max(0, Number(this.unreviewedTotal) || 0);
    const label = `${Math.max(0, Number(this.unreviewedNew) || 0)}/${Math.max(0, Number(this.unreviewedOld) || 0)}`;
    return {
      current: 0,
      total: remaining,
      remaining,
      reviewed: 0,
      label,
      extra: this.protectionExtra,
    };
  }

  async reviewCard(cardId: string, rating: number, reviewedCards?: QueueItem[]): Promise<void> {
    logger.debug('reviewCard called:', {
      cardId,
      rating,
      itemsCount: this.items.length,
    });

    await this.ensureLoaded();
    const id = String(cardId || '');
    if (!id) return;

    // 🆕 找到卡片在列表中的位置
    const index = this.items.findIndex(item => String(item.cardID) === id);
    if (index === -1) {
      logger.error('Card not found in list:', id);
      return;
    }

    const item = this.items[index];
    const deckID = item.deckID || this.deckID;
    const payload = this.buildReviewedPayload(reviewedCards);
    const reviewTime = Date.now();

    // 调用 Riff API
    await this.api.reviewRiffCard(deckID, id, Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4, payload);

    // 记录复习日志
    if (this.storage) {
      try {
        await this.storage.addReviewLog({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          cardId: id,
          rating: rating as 1 | 2 | 3 | 4,
          state: item?.state || 0,
          scheduledDays: 0,
          elapsedDays: 0,
          review: reviewTime,
          reviewTime: 0,
          isDrill: false,
          stability: 0,
          difficulty: 0,
        });
      } catch (error) {
        logger.error('Failed to add review log:', error);
      }
    }

    // 🆕 更新内部状态（删除已复习的卡片）
    this.afterConsumed(id);
    logger.debug('Card reviewed, remaining:', this.items.length);
  }

  async skipReviewCard(cardId: string): Promise<void> {
    logger.debug('skipReviewCard called:', cardId);

    await this.ensureLoaded();
    const id = String(cardId || '');
    if (!id) return;

    // 🆕 找到卡片在列表中的位置
    const index = this.items.findIndex(item => String(item.cardID) === id);
    if (index === -1) {
      logger.error('Card not found in list:', id);
      return;
    }

    const item = this.items[index];
    const deckID = item.deckID || this.deckID;

    // 调用 Riff API
    await this.api.skipReviewRiffCard(deckID, id);

    // 🆕 更新内部状态（删除已跳过的卡片）
    this.afterConsumed(id);
    logger.debug('Card skipped, remaining:', this.items.length);
  }

  async setPriority(cardId: string, priority: number): Promise<void> {
    await this.ensureLoaded();
    const id = String(cardId || '');
    const blockID = this.blockIdByCardId.get(id);
    if (!blockID) return;
    if (!this.storage) {
      logger.warn('setPriority skipped: storage is not available');
      return;
    }
    const p = clampPriority(priority, DEFAULT_PRIORITY);
    
    // 更新 FSRSCard.priority（统一优先级存储）
    const card = this.storage.getCard(id);
    if (card) {
      card.priority = p;
      this.storage.setCard(card);
      await this.storage.saveCards();
    }
    
    // 注意：不再写入块属性 custom-fsrs-priority
  }

  private afterConsumed(cardId: string): void {
    this.unreviewedTotal = Math.max(0, (Number(this.unreviewedTotal) || 0) - 1);
    const state = Number(this.itemByCardId.get(cardId)?.state);
    if (state === 0) {
      this.unreviewedNew = Math.max(0, (Number(this.unreviewedNew) || 0) - 1);
    } else {
      this.unreviewedOld = Math.max(0, (Number(this.unreviewedOld) || 0) - 1);
    }
    this.items = this.items.filter((x) => String(x.cardID) !== cardId);
    this.rawByCardId.delete(cardId);
    this.blockIdByCardId.delete(cardId);
    this.itemByCardId.delete(cardId);
  }

  private buildReviewedPayload(reviewedCards?: QueueItem[]): any[] {
    const out: any[] = [];
    const list = Array.isArray(reviewedCards) ? reviewedCards : [];
    for (const it of list) {
      const cid = String((it as any)?.cardID || (it as any)?.cardId || '');
      if (!cid) continue;
      const raw = this.rawByCardId.get(cid);
      if (raw) out.push(raw);
    }
    return out;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const data = await this.api.getRiffDueCards(this.deckID);
    const cards = Array.isArray((data as any)?.cards) ? (data as any).cards : [];
    this.unreviewedTotal = Number((data as any)?.unreviewedCount) || cards.length || 0;
    this.unreviewedNew = Number((data as any)?.unreviewedNewCardCount) || 0;
    this.unreviewedOld = Number((data as any)?.unreviewedOldCardCount) || 0;

    const rawOut: any[] = [];
    const itemOut: QueueItem[] = [];
    for (const c of cards) {
      const it = normalizeDueCard(c, this.deckID);
      if (!it) continue;
      rawOut.push(c);
      itemOut.push(it);
    }

    const blockIds = itemOut.map((x) => String(x.blockID)).filter(Boolean);
    const priorityMap = await defaultGetPrioritiesByBlockIDs(blockIds).catch(() => new Map<string, number>());
    const paired = itemOut.map((it, i) => ({
      it,
      raw: rawOut[i],
      priority: clampPriority(priorityMap.get(it.blockID), DEFAULT_PRIORITY),
    }));
    paired.sort((a, b) => a.priority - b.priority);

    const finalItems = paired.map((x) => ({ ...x.it, priority: x.priority, meta: { ...(x.it.meta || {}), priority: x.priority } }));
    this.items = finalItems;
    for (let i = 0; i < paired.length; i++) {
      const item = finalItems[i];
      const raw = paired[i].raw;
      const cid = String(item.cardID);
      this.rawByCardId.set(cid, raw);
      this.blockIdByCardId.set(cid, String(item.blockID));
      this.itemByCardId.set(cid, item);
    }

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

