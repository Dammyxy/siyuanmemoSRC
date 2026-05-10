import { OrderedStaticSubsetQueueBase } from './OrderedStaticSubsetQueueBase';
import { QueueReviewResult, QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';

export class TemporaryDrillQueue extends OrderedStaticSubsetQueueBase {
  public name = 'TemporaryDrillQueue';

  private readonly FLIP_LOWEST_PICK = 5;
  private readonly FLIP_LOWEST_INSERT = 3;
  private readonly FLIP_HIGHEST_INSERT = 6;

  constructor(
    manager: UnifiedDataSourceManager,
    blockIds: string[],
    options?: {
      cardIds?: string[];
      preferredCardId?: string;
    },
  ) {
    super(manager, QueueType.FinalDrill, blockIds, options);
  }

  public async handleReview(cardId: string, rating: number): Promise<QueueReviewResult> {
    if (rating === 4) {
      await this.removeCard(cardId);
      const counterSnapshot = await this.getCounterSnapshot(true);
      return {
        updatedCard: null,
        removedFromQueue: true,
        remainsInQueue: false,
        queueChanged: true,
        requiresCurrentViewReorder: false,
        counterSnapshot,
        version: counterSnapshot.version,
      };
    }

    await this.moveCardToBack(cardId);
    const counterSnapshot = await this.getCounterSnapshot(true);
    return {
      updatedCard: null,
      removedFromQueue: false,
      remainsInQueue: true,
      queueChanged: true,
      requiresCurrentViewReorder: true,
      counterSnapshot,
      version: counterSnapshot.version,
    };
  }

  public async skip(cardId: string): Promise<void> {
    await this.moveCardToBack(cardId);
  }

  protected postProcessCards(cards: FSRSCard[]): FSRSCard[] {
    this.applyFlipElement(cards);
    this.cardOrder = cards.map((card) => card.id);
    return cards;
  }

  private applyFlipElement(cards: FSRSCard[]): void {
    const queueSize = cards.length;
    if (queueSize < this.FLIP_LOWEST_PICK) return;

    const pickStart = this.FLIP_LOWEST_PICK - 1;
    const pickEnd = queueSize - 1;
    const pickPos = pickStart + Math.floor(Math.random() * (pickEnd - pickStart + 1));

    const insertStart = this.FLIP_LOWEST_INSERT - 1;
    const insertEnd = Math.min(this.FLIP_HIGHEST_INSERT - 1, queueSize - 1);
    let insertPos = insertStart + Math.floor(Math.random() * (insertEnd - insertStart + 1));

    if (pickPos === insertPos) {
      insertPos = pickPos + 1;
      if (insertPos >= queueSize) return;
    }

    const card = cards[pickPos];
    cards.splice(pickPos, 1);

    const adjustedInsertPos = pickPos < insertPos ? insertPos - 1 : insertPos;
    cards.splice(adjustedInsertPos, 0, card);
  }
}
