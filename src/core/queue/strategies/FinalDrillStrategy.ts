import type { DismissType, IQueueStrategy, InsertOptions, QueueItem, QueueStats, QueueUIConfig, RescheduleOptions, ReviewFeedback } from '../types';
import type { FinalDrillQueue } from './FinalDrillQueue';

export class FinalDrillStrategy implements IQueueStrategy<QueueItem> {
  private readonly queue: FinalDrillQueue;

  constructor(queue: FinalDrillQueue) {
    this.queue = queue;
  }

  addItem(item: QueueItem): Promise<void> {
    return this.queue.addItem(item);
  }

  getNextItem(): QueueItem | null {
    return this.queue.getNextItem();
  }

  removeItem(item: QueueItem): Promise<boolean> {
    return this.queue.removeItem(item);
  }

  size(): number {
    return this.queue.size();
  }

  isEmpty(): boolean {
    return this.queue.isEmpty();
  }

  async next(): Promise<QueueItem | null> {
    return this.queue.getNextItem();
  }

  async onFeedback(item: QueueItem | null, feedback: ReviewFeedback): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;

    if (feedback.action === 'skip' || feedback.action === 'custom') {
      await this.queue.moveToEnd(cardID);
      return;
    }

    if (feedback.action === 'rate') {
      const rating = Number(feedback.rating || 0);
      if (rating >= 4) {
        await this.queue.removeItem({ cardID } as any);
      } else {
        await this.queue.moveToEnd(cardID);
      }
      return;
    }
  }

  async reschedule(item: QueueItem, options: RescheduleOptions): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;
    if (options.type === 'reschedule-on-priority') {
      const p = typeof options.value === 'number' ? options.value : item.priority;
      await this.queue.setPriority(cardID, Number(p));
      return;
    }
  }

  async insert(item: QueueItem, options: InsertOptions): Promise<void> {
    const next = { ...item, priority: options.priority ?? item.priority };
    await this.queue.insertAt(next, options.position);
  }

  async dismiss(item: QueueItem, _type: DismissType): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;
    await this.queue.removeItem({ cardID } as any);
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    return { size: this.queue.size() };
  }
}
