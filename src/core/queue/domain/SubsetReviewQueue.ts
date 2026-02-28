import { OrderedStaticSubsetQueueBase } from './OrderedStaticSubsetQueueBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';

export class SubsetReviewQueue extends OrderedStaticSubsetQueueBase {
  public name = 'SubsetReviewQueue';

  constructor(
    manager: UnifiedDataSourceManager,
    blockIds: string[],
    options?: {
      preferredCardId?: string;
    }
  ) {
    super(manager, QueueType.FilterGroup, blockIds, options);
  }

  public async handleReview(cardId: string, rating: number): Promise<void> {
    try {
      await this.handleReviewWithScheduler(cardId, rating);
    } finally {
      await this.removeCard(cardId);
    }
  }

  public async skip(cardId: string): Promise<void> {
    await this.removeCard(cardId);
  }

  protected postProcessCards(cards: FSRSCard[]): FSRSCard[] {
    return this.applyCustomOrder(cards);
  }
}
