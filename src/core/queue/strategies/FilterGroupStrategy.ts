import type { IQueueStrategy, QueueItem, QueueStats, QueueUIConfig, ReviewFeedback } from '../types';
import type { FilterGroupQueue } from './FilterGroupQueue';

export class FilterGroupStrategy implements IQueueStrategy<QueueItem> {
  private readonly queue: FilterGroupQueue;

  constructor(queue: FilterGroupQueue) {
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
      await this.queue.advanceGroupCursor();
      return;
    }

    if (feedback.action === 'rate') {
      const rating = Number(feedback.rating || 0);
      if (rating >= 4) {
        await this.queue.removeItem({ cardID } as any);
      } else {
        await this.queue.moveToEnd(cardID);
      }
      await this.queue.advanceGroupCursor();
      return;
    }
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    return { size: this.queue.size() };
  }
}

