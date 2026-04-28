import type { SchedulerRouter } from '@/core/scheduler';
import type { SchedulerType } from '@/core/scheduler/schedulerPolicy';
import { resolveEffectiveSchedulerTypeForCard } from '@/core/scheduler/schedulerPolicy';
import type {
  QueueReviewCommand,
  QueueReviewCommitResult,
} from '@/core/queue/managers/UnifiedDataSourceManager';
import type { SrsV2SchedulingContext } from '@/core/scheduler/srs-v2';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
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

export interface ReviewCommitTransactionRunner {
  runTransaction<T>(label: string, operation: () => Promise<T> | T): Promise<T>;
}

export interface ReviewCommitArenaRecorder {
  recordSrsReview(input: {
    card: FSRSCard;
    rating: number;
    currentSchedulerType?: SchedulerType | null;
    schedulingContext?: SrsV2SchedulingContext | null;
  }): Promise<unknown>;
}

export interface ReviewCommitUseCaseDependencies {
  cards: ReviewCommitCardReader;
  scheduler: Pick<SchedulerRouter, 'answer' | 'commit' | 'route'>;
  reviewLogs: ReviewCommitLogWriter;
  transactionRunner?: ReviewCommitTransactionRunner | null;
  arena?: ReviewCommitArenaRecorder | null;
  onCommittedCard?: (card: FSRSCard) => Promise<void> | void;
}

export class ReviewCommitUseCase {
  constructor(private readonly deps: ReviewCommitUseCaseDependencies) {}

  async execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
    if (this.deps.transactionRunner) {
      return this.deps.transactionRunner.runTransaction('review.feedback', () => this.executeInner(command));
    }

    return this.executeInner(command);
  }

  private async executeInner(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
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
      const cleanUpdatedCard = commitResult.updatedCard
        ? canonicalizeSchedulingState(commitResult.updatedCard, {
            source: 'review-commit',
            mode: 'assert-internal',
          }).card
        : undefined;
      const cleanCommitResult = cleanUpdatedCard
        ? { ...commitResult, updatedCard: cleanUpdatedCard }
        : commitResult;
      const updatedCard = cleanUpdatedCard ?? decision.current;

      if (cleanCommitResult.committed && cleanUpdatedCard) {
        await this.deps.reviewLogs.addReviewLogV2(createReviewLogV2({
          attemptId: decision.attempt.id,
          cardId: decision.attempt.cardId,
          rating: decision.attempt.rating,
          reviewedAt: decision.attempt.reviewedAt,
          before: decision.before,
          after: cleanUpdatedCard,
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
        await this.deps.onCommittedCard?.(cleanUpdatedCard);
      }

      await this.recordArenaReview(card, rating, context);

      return {
        card,
        updatedCard,
        committed: cleanCommitResult.committed,
        decision,
        commitResult: cleanCommitResult,
      };
    }

    const updatedCard = canonicalizeSchedulingState(
      await this.deps.scheduler.route(card, rating, context),
      {
        source: 'review-commit',
        mode: 'assert-internal',
      },
    ).card;
    await this.deps.onCommittedCard?.(updatedCard);
    await this.recordArenaReview(card, rating, context);
    return {
      card,
      updatedCard,
      committed: true,
    };
  }

  private async recordArenaReview(card: FSRSCard, rating: Rating, schedulingContext?: SrsV2SchedulingContext | null): Promise<void> {
    if (!this.deps.arena) {
      return;
    }

    try {
      await this.deps.arena.recordSrsReview({
        card,
        rating,
        currentSchedulerType: resolveEffectiveSchedulerTypeForCard(card),
        schedulingContext,
      });
    } catch (error) {
      logger.warn('Arena SRS review recording failed; review commit kept', {
        cardId: card.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function normalizeRating(value: number): Rating {
  return Math.max(1, Math.min(4, Math.floor(Number(value) || 0))) as Rating;
}
