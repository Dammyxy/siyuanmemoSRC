import { OrderedStaticSubsetQueueBase } from './OrderedStaticSubsetQueueBase';
import { QueueReviewResult, QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';

export class SubsetReviewQueue extends OrderedStaticSubsetQueueBase {
  public name = 'SubsetReviewQueue';

  constructor(
    manager: UnifiedDataSourceManager,
    blockIds: string[],
    options?: {
      cardIds?: string[];
      preferredCardId?: string;
    }
  ) {
    super(manager, QueueType.FilterGroup, blockIds, options);
  }

  public async handleReview(cardId: string, rating: number, options?: { commitIdempotencyKey?: string }): Promise<QueueReviewResult> {
    let result: QueueReviewResult;
    try {
      result = await this.handleReviewWithScheduler(cardId, rating, {
        commitIdempotencyKey: options?.commitIdempotencyKey,
      });
    } finally {
      await this.removeCard(cardId);
    }

    const counterSnapshot = await this.getCounterSnapshot(true);
    return {
      ...result!,
      removedFromQueue: true,
      remainsInQueue: false,
      queueChanged: true,
      requiresCurrentViewReorder: false,
      counterSnapshot,
      version: counterSnapshot.version,
    };
  }

  public async skip(cardId: string): Promise<void> {
    await this.removeCard(cardId);
  }

  protected postProcessCards(cards: FSRSCard[]): FSRSCard[] {
    return this.applyCustomOrder(cards);
  }
}
