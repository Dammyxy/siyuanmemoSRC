import type { QueueStats } from './types.ts';

export interface QueueProvider<TItem = any> {
  readonly id: string;
  readonly displayName: string;

  getDueCards(options: Record<string, unknown>): Promise<TItem[]>;
  reviewCard(cardId: string, rating: number, reviewedCards?: TItem[]): Promise<void>;
  skipReviewCard(cardId: string): Promise<void>;

  postponeCard?(cardId: string, days: number): Promise<void>;
  advanceCard?(cardId: string, days: number): Promise<void>;
  resetCard?(cardId: string): Promise<void>;
  setPriority?(cardId: string, priority: number): Promise<void>;

  getStats?(options?: Record<string, unknown>): Promise<QueueStats>;
}

