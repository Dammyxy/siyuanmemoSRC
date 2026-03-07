import type { IQueueStrategy, QueueFeedback } from '../queue/abstraction/Strategy.ts';
import type { QueueStats, QueueUIConfig } from '../queue/types.ts';
import type { IReviewQueue, QueueUIConfig as ReviewQueueUIConfig } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

function toLegacyQueueUIConfig(config: ReviewQueueUIConfig): QueueUIConfig {
  return {
    statsType: 'queue-size',
    showRatingButtons: config.buttons.some((button) => button.type === 'rating'),
    allowSkip: config.showSkipButton,
  };
}

/**
 * 直接基于新架构 Queue 的 Strategy
 * 
 * 跳过 Provider 层，直接使用 BaseReviewQueue 的统一接口
 */
export class QueueBackedStrategy implements IQueueStrategy<FSRSCard> {
  private readonly queue: IReviewQueue;
  private readonly displayName: string;
  private buffer: FSRSCard[] = [];
  private current: FSRSCard | null = null;
  private loaded = false;

  constructor(queue: IReviewQueue, displayName?: string) {
    this.queue = queue;
    this.displayName = displayName || queue.name || 'Review';
  }

  getUIConfig(_currentItem: FSRSCard | null): QueueUIConfig {
    return toLegacyQueueUIConfig(this.queue.getUIConfig());
  }

  getProgress(): unknown {
    return undefined;
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    return null;
  }

  async getStats(): Promise<QueueStats> {
    const stats = await this.queue.getStats();
    return {
      size: stats.due || 0,
      label: this.displayName,
    };
  }

  async next(): Promise<FSRSCard | null> {
    await this.ensureLoaded();
    const next = this.buffer.shift() || null;
    this.current = next;
    return next;
  }

  async onFeedback(currentItem: FSRSCard | null, feedback: QueueFeedback): Promise<void> {
    const item = currentItem || this.current;
    if (!item) return;

    const cardId = item.blockId || item.id;
    if (!cardId) return;

    if (feedback.action === 'skip') {
      await this.queue.skip(cardId);
      // 重新加载
      this.loaded = false;
      await this.ensureLoaded();
      return;
    }

    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;
      
      await this.queue.handleReview(cardId, rating);
      
      // 重新加载以获取更新后的队列状态
      this.loaded = false;
      await this.ensureLoaded();
      return;
    }
  }

  async insertAt(cardId: string, position: number): Promise<void> {
    await this.queue.insertAt(cardId, position);
    // 重新加载
    this.loaded = false;
    await this.ensureLoaded();
  }

  async getRemainingSize(): Promise<number> {
    await this.ensureLoaded();
    return this.buffer.length;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    
    const cards = await this.queue.getAllCards();
    this.buffer = [...cards];
  }
}
