import * as riff from '../../siyuan/riff.ts';
import { setBlockAttrs, sql } from '../../siyuan/api.ts';
import { ATTR_PRIORITY } from '../../siyuan/block.ts';
import { RiffScheduler } from '../schedulers/RiffScheduler.ts';
import { PrioritySequencer } from '../sequencers/PrioritySequencer.ts';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types.ts';
import { computeProtectionStats, clampPriority, DEFAULT_PRIORITY } from '../abstraction/IPriority.ts';
import type { IPrioritizableTrait } from '../abstraction/types.ts';
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

export class RetrievalPracticeQueue implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly api: RiffApi;
  private readonly getPrioritiesByBlockIDs: (blockIDs: string[]) => Promise<Map<string, number>>;
  private readonly sequencer: PrioritySequencer<QueueItem>;
  private readonly scheduler: RiffScheduler<QueueItem, 1 | 2 | 3 | 4>;
  private readonly prioritizableTrait: IPrioritizableTrait<QueueItem>;
  private protectionExtra = '';

  private loaded = false;
  private buffer: QueueItem[] = [];
  private rawBuffer: any[] = [];
  private currentRaw: any | null = null;

  private unreviewedNew = 0;
  private unreviewedOld = 0;
  private unreviewedTotal = 0;

  // 跟踪初始总数和已复习数量
  private initialTotal = 0;
  private reviewedCount = 0;

  constructor(options?: { deckID?: string; api?: Partial<RiffApi>; getPrioritiesByBlockIDs?: (blockIDs: string[]) => Promise<Map<string, number>> }) {
    this.deckID = String(options?.deckID || riff.BUILTIN_DECK_ID);
    this.api = {
      getRiffDueCards: options?.api?.getRiffDueCards || riff.getRiffDueCards,
      reviewRiffCard: options?.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options?.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.getPrioritiesByBlockIDs = options?.getPrioritiesByBlockIDs || defaultGetPrioritiesByBlockIDs;

    this.scheduler = new RiffScheduler(async (card, grade) => {
      await this.api.reviewRiffCard(card.deckID || this.deckID, card.cardID, grade, this.getReviewedCardsPayload());
      return card;
    });

    this.sequencer = new PrioritySequencer(async () => {
      await this.ensureLoaded();
      const raw = this.rawBuffer.shift();
      const next = this.buffer.shift();
      if (!raw || !next) return null;
      this.currentRaw = raw;
      return next;
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
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    await this.ensureLoaded();
    const size = Math.max(0, Number(this.unreviewedTotal) || 0);
    const label = `${Math.max(0, Number(this.unreviewedNew) || 0)}/${Math.max(0, Number(this.unreviewedOld) || 0)}`;
    return {
      size,
      label,
      extra: this.protectionExtra,
      total: this.initialTotal,
      remaining: size,
      reviewed: this.reviewedCount,
      initialTotal: this.initialTotal,
    } as any;
  }

  async next(): Promise<QueueItem | null> {
    const next = await this.sequencer.next();
    return next;
  }

  getPrioritizableTrait(): IPrioritizableTrait<QueueItem> {
    return this.prioritizableTrait;
  }

  async onFeedback(
    currentItem: QueueItem | null,
    feedback: QueueFeedback,
  ): Promise<void> {
    const cardID = String((currentItem as any)?.cardID || (currentItem as any)?.cardId || '');
    const deckID = String((currentItem as any)?.deckID || (currentItem as any)?.deckId || this.deckID);
    if (!cardID) return;

    if (feedback.action === 'skip') {
      await this.api.skipReviewRiffCard(deckID, cardID);
      this.afterConsumed(currentItem);
      this.currentRaw = null;
      return;
    }
    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;
      await this.scheduler.schedule({ ...(currentItem as any), deckID, cardID } as QueueItem, rating);
      this.afterConsumed(currentItem);
      this.currentRaw = null;
      return;
    }
  }

  private afterConsumed(item: any): void {
    this.unreviewedTotal = Math.max(0, (Number(this.unreviewedTotal) || 0) - 1);
    const state = Number(item?.state);
    if (state === 0) {
      this.unreviewedNew = Math.max(0, (Number(this.unreviewedNew) || 0) - 1);
    } else {
      this.unreviewedOld = Math.max(0, (Number(this.unreviewedOld) || 0) - 1);
    }
    // 增加已复习数量
    this.reviewedCount++;
  }

  private getReviewedCardsPayload(): any[] {
    const out: any[] = [];
    if (this.currentRaw) out.push(this.currentRaw);
    for (const raw of this.rawBuffer) out.push(raw);
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

    // 初始化初始总数
    this.initialTotal = this.unreviewedTotal;
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
    this.rawBuffer = paired.map((x) => x.raw);
    this.buffer = paired.map((x) => ({ ...x.it, priority: x.priority, meta: { ...(x.it.meta || {}), priority: x.priority } }));

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
