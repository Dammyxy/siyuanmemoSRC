/**
 * 检索练习队列 Provider
 *
 * 实现 Extensions Layer 的 QueueProvider 接口
 * 封装 RetrievalPracticeQueue 为外部提供标准 API
 */

import type { QueueProvider } from '@/core/extensions';
import type { BrowserCard } from '@/ui/browser/browserService';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { StorageManager } from '@/core/storage/StorageManager';
import type { SchedulerEngineAdapter } from '@/core/scheduler/types';

/**
 * 检索练习队列 Provider
 *
 * 提供统一的队列访问接口，支持：
 * - 获取到期卡片（Riff + 本地）
 * - 提交复习评分
 * - 跳过卡片
 * - 获取统计信息
 * - 手动添加卡片
 */
export class RetrievalPracticeProvider implements QueueProvider<BrowserCard> {
  private readonly queue: RetrievalPracticeQueue;
  private readonly deckId: string;
  private reviewedCount = 0;

  constructor(options?: {
    deckId?: string;
    storage?: StorageManager;
    scheduler?: SchedulerEngineAdapter;
  }) {
    this.deckId = options?.deckId || '';
    this.queue = new RetrievalPracticeQueue({
      deckID: options?.deckId,
      storage: options?.storage,
      localScheduler: options?.scheduler,
    });
  }

  /**
   * 获取到期卡片
   *
   * @param options 可选参数
   * @returns 到期卡片列表
   */
  async getDueCards(options?: {
    limit?: number;
    deckId?: string;
  }): Promise<BrowserCard[]> {
    const items: BrowserCard[] = [];

    // 循环获取卡片（直到队列为空或达到 limit）
    while (true) {
      const item = await this.queue.next();
      if (!item) break;
      items.push(item as any);
      if (options?.limit && items.length >= options.limit) break;
    }

    console.log('[RetrievalPracticeProvider] getDueCards called:', {
      options,
      count: items.length,
    });

    return items;
  }

  /**
   * 提交复习评分
   *
   * @param cardId 卡片 ID
   * @param rating 评分（1=重来, 2=困难, 3=一般, 4=简单）
   * @param reviewedCards 可选的已复习卡片列表
   * @returns 是否成功
   */
  async reviewCard(
    cardId: string,
    rating: 1 | 2 | 3 | 4,
    reviewedCards?: BrowserCard[]
  ): Promise<boolean> {
    try {
      // 查找对应的卡片
      const card = reviewedCards?.find(c => (c as any).cardID === cardId || (c as any).cardId === cardId);
      if (!card) {
        console.error('[RetrievalPracticeProvider] Card not found:', cardId);
        return false;
      }

      // 提交反馈
      await this.queue.onFeedback(card as any, {
        action: 'rate',
        rating,
      });

      console.log('[RetrievalPracticeProvider] Card reviewed:', {
        cardId,
        rating,
      });

      this.reviewedCount++;
      return true;
    } catch (err) {
      console.error('[RetrievalPracticeProvider] Review failed:', err);
      return false;
    }
  }

  /**
   * 跳过卡片
   *
   * @param cardId 卡片 ID
   * @returns 是否成功
   */
  async skipReviewCard(cardId: string): Promise<boolean> {
    try {
      // 从队列中获取卡片（需要先获取所有卡片）
      const allItems = this.queue.getAllItems();
      const card = allItems.find(
        c => (c as any).cardID === cardId || (c as any).cardId === cardId
      );

      if (!card) {
        console.error('[RetrievalPracticeProvider] Card not found:', cardId);
        return false;
      }

      // 提交跳过反馈
      await this.queue.onFeedback(card as any, {
        action: 'skip',
      });

      console.log('[RetrievalPracticeProvider] Card skipped:', cardId);
      return true;
    } catch (err) {
      console.error('[RetrievalPracticeProvider] Skip failed:', err);
      return false;
    }
  }

  /**
   * 获取统计信息
   *
   * @returns 队列统计
   */
  async getStats(): Promise<{
    total: number;
    due: number;
    new: number;
    reviewed: number;
    learning: number;
  }> {
    const stats = await this.queue.getStats();

    return {
      total: stats.total || 0,
      due: stats.remaining || 0,
      new: stats.new ?? 0,
      reviewed: stats.reviewed || 0,
      learning: stats.learning ?? 0,
    };
  }
}
