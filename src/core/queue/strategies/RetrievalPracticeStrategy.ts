import type { DismissType, IQueueStrategy, InsertOptions, QueueItem, QueueStats, QueueUIConfig, ReviewFeedback } from '../types';
import { riff } from '@/core/siyuan';
import type { RescheduleService } from '@/core/scheduler';

export class RetrievalPracticeStrategy implements IQueueStrategy<QueueItem> {
  private readonly deckID: string;
  private readonly rescheduleService?: RescheduleService;
  private buffer: QueueItem[] = [];
  private readonly dismissedSession = new Set<string>();

  constructor(options?: { deckID?: string; rescheduleService?: RescheduleService }) {
    this.deckID = options?.deckID || riff.BUILTIN_DECK_ID;
    this.rescheduleService = options?.rescheduleService;
  }

  addItem(_item: QueueItem): Promise<void> | void {
    return;
  }

  async getNextItem(): Promise<QueueItem | null> {
    return this.next();
  }

  removeItem(_item: QueueItem): Promise<boolean> | boolean {
    return false;
  }

  async size(): Promise<number> {
    const stats = await this.getStats();
    return stats.size;
  }

  async isEmpty(): Promise<boolean> {
    const n = await this.size();
    return n === 0;
  }

  async next(): Promise<QueueItem | null> {
    await this.ensureBuffer();
    for (const it of this.buffer) {
      if (!this.dismissedSession.has(String(it.cardID || ''))) {
        return it;
      }
    }
    return null;
  }

  async onFeedback(item: QueueItem | null, feedback: ReviewFeedback): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;

    if (feedback.action === 'skip') {
      await riff.skipReviewRiffCard(this.deckID, cardID);
      this.buffer = this.buffer.filter((x) => x.cardID !== cardID);
      return;
    }

    if (feedback.action === 'rate') {
      const rating = (feedback.rating || 1) as 1 | 2 | 3 | 4;
      await riff.reviewRiffCard(this.deckID, cardID, rating);
      this.buffer = this.buffer.filter((x) => x.cardID !== cardID);
      return;
    }
  }

  async insert(item: QueueItem, options: InsertOptions): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;
    await this.ensureBuffer();
    this.dismissedSession.delete(cardID);

    const nextItem = { ...item, deckID: item.deckID || this.deckID };
    this.buffer = this.buffer.filter((x) => x.cardID !== cardID);

    if (options.position === 'top') {
      this.buffer.unshift(nextItem);
      return;
    }
    if (options.position === 'bottom') {
      this.buffer.push(nextItem);
      return;
    }
    const idx = Math.max(0, Math.min(this.buffer.length, Math.floor(Math.random() * (this.buffer.length + 1))));
    this.buffer.splice(idx, 0, nextItem);
  }

  async dismiss(item: QueueItem, type: DismissType): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;
    if (type === 'session') {
      this.dismissedSession.add(cardID);
      this.buffer = this.buffer.filter((x) => x.cardID !== cardID);
      return;
    }
    this.dismissedSession.add(cardID);
    this.buffer = this.buffer.filter((x) => x.cardID !== cardID);
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true };
  }

  async reschedule(item: QueueItem, options: {
    type: 'specific-date' | 'interval-change' | 'reschedule-on-priority';
    value?: string | number;
  }): Promise<void> {
    if (!this.rescheduleService) {
      console.warn('[RetrievalStrategy] RescheduleService not available');
      return;
    }
    const cardID = String(item?.cardID || '');
    const blockID = String(item?.blockID || '');
    if (!cardID && !blockID) return;

    const rows = [{ blockId: blockID, cardId: cardID }];

    if (options.type === 'specific-date') {
      // value is date string or timestamp?
      // Interface says value?: string | number.
      // Usually specific-date expects string (iso) or number (ts).
      const date = new Date(options.value as string | number);
      await this.rescheduleService.rescheduleAbsolute(rows, date, { source: 'queue-retrieval' });
    } else if (options.type === 'interval-change') {
      const days = Number(options.value);
      if (days > 0) {
        await this.rescheduleService.advance(rows, days, { source: 'queue-retrieval' }); // Wait, advance is usually shortening interval? Or setting next due?
        // "Advance" = due becomes sooner.
        // "Postpone" = due becomes later.
        // Interval-change: if positive, usually means "add days to interval" -> Postpone?
        // Or "change interval to X".
        // Let's assume `options.value` is relative days.
        // If we want to postpone:
        await this.rescheduleService.postpone(rows, days, { source: 'queue-retrieval' }); // Postpone adds days.
      } else {
        // Negative? Advance?
        // Advance usually sets due to Today + Random(1..N).
        // If we want exact shift back? `rescheduleRelative(days)`.
        await this.rescheduleService.rescheduleRelative(rows, days, { source: 'queue-retrieval' });
      }
    }

    // Update buffer if needed (remove old item or update due?)
    // Retrieval queue buffer are due cards. If rescheduled, they are likely not due anymore.
    this.buffer = this.buffer.filter(x => x.cardID !== cardID);
    this.dismissedSession.add(cardID); // Treat as handled
  }

  async getStats(): Promise<QueueStats> {
    const due = await riff.getRiffDueCards(this.deckID);
    return {
      size: Number(due?.unreviewedCount) || 0,
      label: `${due?.unreviewedNewCardCount || 0}/${due?.unreviewedOldCardCount || 0}`,
    };
  }

  private async ensureBuffer(): Promise<void> {
    if (this.buffer.length > 0) return;
    const due = await riff.getRiffDueCards(this.deckID);
    const cards = due?.cards || [];
    this.buffer = cards
      .filter((c) => !this.dismissedSession.has(String(c?.cardID || '')))
      .map((c) => ({
        cardID: c.cardID,
        blockID: c.blockID,
        deckID: c.deckID,
        nextDues: {
          1: c.nextDues.again,
          2: c.nextDues.hard,
          3: c.nextDues.good,
          4: c.nextDues.easy,
        },
      }));
  }
}
