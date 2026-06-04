import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  hasCdfLiveRelationMetadata,
  isCdfLiveRelationQueueEligible,
} from '@/core/card/cdf-live-relation';
import {
  QueueType,
  type IReviewQueue,
} from '@/types/unified-data-source';
import type {
  ReviewSessionNextEntryRepairResult,
  ReviewSessionQueueEntry,
  SrsV2QueueProfile,
} from './ReviewSessionQueueRuntime';

abstract class BaseSrsV2QueueProfile implements SrsV2QueueProfile {
  abstract readonly queueType: QueueType;
  abstract readonly eligibleCardTypes: ReadonlySet<CardType>;

  async buildInitialCards(queue: IReviewQueue): Promise<FSRSCard[]> {
    const cards = await queue.getCards();
    return cards.filter((card) => this.isEligible(card));
  }

  isEligible(card: FSRSCard): boolean {
    return this.eligibleCardTypes.has(card.type)
      && card.state !== CardState.Suspended
      && card.skipped !== true
      && card.meta?.dismissed !== true
      && card.meta?.deleted !== true
      && card.meta?.outOfScope !== true
      && this.isCdfLiveRelationEligible(card);
  }

  private isCdfLiveRelationEligible(card: FSRSCard): boolean {
    if (!hasCdfLiveRelationMetadata(card)) {
      return true;
    }
    return isCdfLiveRelationQueueEligible(card);
  }

  async hydrateEntry(queue: IReviewQueue, entry: ReviewSessionQueueEntry): Promise<ReviewSessionNextEntryRepairResult> {
    void queue;
    return { status: 'ready', card: null };
  }

  fingerprint(card: FSRSCard): string {
    return [
      card.id,
      card.blockId,
      card.type,
      card.state,
      Number(card.due) || 0,
      Number(card.updatedAt) || 0,
      card.skipped === true ? 'skipped' : '',
      card.meta?.dismissed === true ? 'dismissed' : '',
      card.meta?.outOfScope === true ? 'out-of-scope' : '',
    ].join('|');
  }

  shouldRemainInLearning(card: FSRSCard): boolean {
    return card.state === CardState.Learning || card.state === CardState.Relearning;
  }
}

export class IncrementalLearningProfile extends BaseSrsV2QueueProfile {
  readonly queueType = QueueType.IncrementalLearning;
  readonly eligibleCardTypes = new Set<CardType>([
    CardType.Item,
    CardType.Concept,
    CardType.Descriptor,
    CardType.Topic,
    CardType.Incremental,
    CardType.Webpage,
  ]);
}

export class RetrievalPracticeProfile extends BaseSrsV2QueueProfile {
  readonly queueType = QueueType.RetrievalPractice;
  readonly eligibleCardTypes = new Set<CardType>([
    CardType.Item,
    CardType.Descriptor,
  ]);
}

export function createSrsV2QueueProfile(queueType: QueueType): SrsV2QueueProfile {
  if (queueType === QueueType.RetrievalPractice) {
    return new RetrievalPracticeProfile();
  }
  return new IncrementalLearningProfile();
}
