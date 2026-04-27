import type { SchedulerRouter } from '@/core/scheduler';
import type {
  QueueReviewCommand,
  QueueReviewCommitResult,
} from '@/core/queue/managers/UnifiedDataSourceManager';
import type { FSRSCard, Rating } from '@/types';
import { createReviewLogV2 } from '@/types/review';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewCommitUseCase');

export interface ReviewCommitCardReader {
  getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
}

export interface ReviewCommitLogWriter {
  addReviewLogV2(log: ReturnType<typeof createReviewLogV2>): Promise<void>;
}

export interface ReviewCommitUseCaseDependencies {
  cards: ReviewCommitCardReader;
  scheduler: Pick<SchedulerRouter, 'answer' | 'commit' | 'route'>;
  reviewLogs: ReviewCommitLogWriter;
  onCommittedCard?: (card: FSRSCard) => Promise<void> | void;
}

export class ReviewCommitUseCase {
  constructor(private readonly deps: ReviewCommitUseCaseDependencies) {}

  async execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
    const card = await this.deps.cards.getCard(command.cardId);
    const rating = normalizeRating(command.rating);
    const context = {
      ...command.context,
      source: command.context.source ?? 'queue',
    };

    logger.debug('Committing SRS v2 review', {
      cardId: card.id,
      rating,
      queueType: context.queueType,
      queueMode: context.queueMode,
      commitPolicy: context.commitPolicy,
    });

    if (typeof this.deps.scheduler.answer === 'function' && typeof this.deps.scheduler.commit === 'function') {
      const decision = this.deps.scheduler.answer(card, rating, context);
      const commitResult = await this.deps.scheduler.commit(decision);
      const updatedCard = commitResult.updatedCard ?? decision.current;

      if (commitResult.committed && commitResult.updatedCard) {
        await this.deps.reviewLogs.addReviewLogV2(createReviewLogV2({
          attemptId: decision.attempt.id,
          cardId: decision.attempt.cardId,
          rating: decision.attempt.rating,
          reviewedAt: decision.attempt.reviewedAt,
          before: decision.before,
          after: commitResult.updatedCard,
          elapsedMs: decision.attempt.elapsedMs,
          queueType: decision.attempt.queueType,
          queueMode: decision.queueMode,
          source: decision.attempt.source,
          algorithm: decision.algorithm,
          schedulerType: decision.schedulerType,
          commitPolicy: decision.commitPolicy,
          isDrill: decision.attempt.isDrill,
          isFiltered: decision.attempt.isFiltered,
          customStudy: decision.attempt.customStudy,
        }));
        await this.deps.onCommittedCard?.(commitResult.updatedCard);
      }

      return {
        card,
        updatedCard,
        committed: commitResult.committed,
        decision,
        commitResult,
      };
    }

    const updatedCard = await this.deps.scheduler.route(card, rating, context);
    await this.deps.onCommittedCard?.(updatedCard);
    return {
      card,
      updatedCard,
      committed: true,
    };
  }
}

function normalizeRating(value: number): Rating {
  return Math.max(1, Math.min(4, Math.floor(Number(value) || 0))) as Rating;
}
