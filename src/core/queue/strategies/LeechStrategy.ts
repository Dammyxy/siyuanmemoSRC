import type { IQueueStrategy, QueueItem, QueueStats, QueueUIConfig, ReviewFeedback } from '../types';
import { riff } from '@/core/siyuan';
import type { StorageManager } from '@/core/storage';

export class LeechStrategy implements IQueueStrategy<QueueItem> {
  private readonly storage: StorageManager;
  private queue: QueueItem[] = [];
  private threshold = 0;

  constructor(storage: StorageManager) {
    this.storage = storage;
  }

  private rebuildIfNeeded(): void {
    const nextThreshold = Number(this.storage.getSettings()?.leech?.threshold ?? 8);
    if (this.queue.length > 0 && nextThreshold === this.threshold) return;
    this.threshold = nextThreshold;

    const cards = this.storage.getAllCards().filter((c: any) => (c.lapses || 0) >= this.threshold);
    this.queue = cards.map((c: any) => ({
      cardID: c.id,
      blockID: c.blockId,
      deckID: riff.BUILTIN_DECK_ID,
      state: c.state,
      lapses: c.lapses,
      reps: c.reps,
    }));
  }

  addItem(item: QueueItem): Promise<void> | void {
    if (!item?.cardID) return;
    this.rebuildIfNeeded();
    if (this.queue.some((x) => x.cardID === item.cardID)) return;
    this.queue.push(item);
  }

  getNextItem(): QueueItem | null {
    this.rebuildIfNeeded();
    return this.queue.length ? this.queue[0] : null;
  }

  removeItem(item: QueueItem): Promise<boolean> | boolean {
    this.rebuildIfNeeded();
    const before = this.queue.length;
    this.queue = this.queue.filter((x) => x.cardID !== item.cardID);
    return this.queue.length !== before;
  }

  size(): Promise<number> | number {
    this.rebuildIfNeeded();
    return this.queue.length;
  }

  isEmpty(): Promise<boolean> | boolean {
    this.rebuildIfNeeded();
    return this.queue.length === 0;
  }

  async next(): Promise<QueueItem | null> {
    return this.getNextItem();
  }

  async onFeedback(item: QueueItem | null, feedback: ReviewFeedback): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;
    this.rebuildIfNeeded();

    if (feedback.action === 'skip' || feedback.action === 'custom') {
      const idx = this.queue.findIndex((x) => x.cardID === cardID);
      if (idx !== -1) {
        const [it] = this.queue.splice(idx, 1);
        this.queue.push(it);
      }
      return;
    }

    if (feedback.action === 'rate') {
      const rating = Number(feedback.rating || 0);
      const idx = this.queue.findIndex((x) => x.cardID === cardID);
      if (idx === -1) return;
      const [it] = this.queue.splice(idx, 1);
      if (rating >= 4) {
        return;
      }
      this.queue.push(it);
    }
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    this.rebuildIfNeeded();
    return { size: this.queue.length };
  }
}

