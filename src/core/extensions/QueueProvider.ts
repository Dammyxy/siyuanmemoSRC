/**
 * Queue Provider Interface
 * 
 * @deprecated 旧架构接口，用于适配旧 Queue。
 * 新架构的 BaseReviewQueue 已有统一接口，不需要 Provider 层。
 * 
 * 新代码请直接使用：
 * - UnifiedDataSourceManager.getQueue(QueueType)
 * - BaseReviewQueue 的方法（getAllCards, handleReview, skip, getStats 等）
 */

import type { QueueStats } from './types.ts';

export interface QueueProvider<TItem = unknown> {
  readonly id: string;
  readonly displayName: string;

  getDueCards(options: Record<string, unknown>): Promise<TItem[]>;
  reviewCard(cardId: string, rating: number, reviewedCards?: TItem[]): Promise<void>;
  skipReviewCard(cardId: string): Promise<void>;

  postponeCard?(cardId: string, days: number): Promise<void>;
  advanceCard?(cardId: string, days: number): Promise<void>;
  resetCard?(cardId: string): Promise<void>;
  setPriority?(cardId: string, priority: number): Promise<void>;

  onCustomAction?(
    actionId: string,
    currentItem: TItem | null,
    buffer: TItem[],
    options: Record<string, unknown>
  ): Promise<boolean | void> | boolean | void;
  insertAt?(cardId: string, position: number): Promise<void> | void;
  getStats?(options?: Record<string, unknown>): Promise<QueueStats>;
}

