import type { IQueueStrategy, QueueItem, QueueStats, QueueUIConfig, ReviewFeedback } from '../types';
import type { NeuralQueue } from '../neural/NeuralQueue';
import type { NeuralContext } from '../neural/types';

export class NeuralStrategy implements IQueueStrategy<QueueItem> {
  private readonly queue: NeuralQueue;

  constructor(queue: NeuralQueue) {
    this.queue = queue;
  }

  addItem(item: QueueItem): Promise<void> {
    return this.queue.addItem(item);
  }

  getNextItem(): Promise<QueueItem | null> {
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

  async onFeedback(item: QueueItem | null, _feedback: ReviewFeedback): Promise<void> {
    const cardID = String(item?.cardID || '');
    if (!cardID) return;
    await this.queue.removeItem({ cardID } as any);
  }

  getUIConfig(currentItem: QueueItem | null): QueueUIConfig {
    const ctx = (currentItem?.meta as any)?.neuralContext as NeuralContext | undefined;
    const isFlashcard = ctx?.isFlashcard !== false;
    if (!isFlashcard) {
      return {
        statsType: 'infinite',
        showRatingButtons: false,
        allowSkip: false,
        customButtons: [{ label: '继续漫游', actionId: 'next', variant: 'primary' }],
      };
    }
    return { statsType: 'infinite', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    return { size: this.queue.size() };
  }
}

