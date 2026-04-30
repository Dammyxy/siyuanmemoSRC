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

export interface ReviewCommitBackendFeedbackClient {
  reviewFeedback(request: {
    cardId: string;
    rating: number;
    queueType?: string;
    queueMode?: string;
    commitPolicy?: string;
    sessionId?: string;
    reviewedAt?: number;
  }): Promise<{
    committed: boolean;
    updatedCard: unknown | null;
  }>;
}

export interface ReviewCommitWriterLeaseGuard {
  ensureWritable(): Promise<void>;
}

export interface ReviewCommitUseCaseDependencies {
  cards: ReviewCommitCardReader;
  scheduler: Pick<SchedulerRouter, 'answer' | 'commit' | 'route'>;
  reviewLogs: ReviewCommitLogWriter;
  transactionRunner?: ReviewCommitTransactionRunner | null;
  arena?: ReviewCommitArenaRecorder | null;
  srsBackend?: ReviewCommitBackendFeedbackClient | null;
  writerLeaseGuard?: ReviewCommitWriterLeaseGuard | null;
  onCommittedCard?: (card: FSRSCard) => Promise<void> | void;
}

export class ReviewCommitUseCase {
  constructor(private readonly deps: ReviewCommitUseCaseDependencies) {}

  async execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
    if (this.shouldUseWorkerFeedback(command)) {
      return this.executeViaWorkerFeedback(command);
    }

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

  private shouldUseWorkerFeedback(command: QueueReviewCommand): boolean {
    if (!this.deps.srsBackend) {
      return false;
    }

    const workerContext = resolveWorkerFeedbackContext(command.context);
    const queueType = workerContext.queueType;
    if (!queueType) {
      return false;
    }

    const queueMode = workerContext.queueMode;
    const commitPolicy = workerContext.commitPolicy;

    if (
      queueType === 'retrieval-practice'
      || queueType === 'incremental-learning'
      || queueType === 'neural-roam'
      || queueType === 'leech'
    ) {
      return queueMode === 'formal' && commitPolicy === 'write-schedule';
    }

    if (queueType === 'filter-group') {
      return (
        (queueMode === 'filtered-preview' && commitPolicy === 'preview-only')
        || (queueMode === 'filtered-rescheduling' && commitPolicy === 'write-schedule')
      );
    }

    if (queueType === 'final-drill') {
      return queueMode === 'drill' && commitPolicy === 'drill-only';
    }

    return false;
  }

  private async executeViaWorkerFeedback(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
    const card = await this.deps.cards.getCard(command.cardId);
    const rating = normalizeRating(command.rating);
    const context = {
      ...command.context,
      source: command.context.source ?? 'queue',
    };
    const workerContext = resolveWorkerFeedbackContext(context);
    const reviewedAt = normalizeReviewedAt(context.reviewTime);
    if (this.deps.writerLeaseGuard) {
      await this.deps.writerLeaseGuard.ensureWritable();
    }
    const result = await this.deps.srsBackend!.reviewFeedback({
      cardId: command.cardId,
      rating,
      queueType: workerContext.queueType,
      queueMode: workerContext.queueMode,
      commitPolicy: workerContext.commitPolicy,
      sessionId: context.sessionId,
      reviewedAt,
    });

    const updatedCard = normalizeWorkerUpdatedCard(result.updatedCard, card);
    if (result.committed) {
      await this.deps.onCommittedCard?.(updatedCard);
    }
    await this.recordArenaReview(card, rating, context);
    return {
      card,
      updatedCard,
      committed: result.committed,
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

function normalizeReviewedAt(value: Date | number | undefined): number | undefined {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function normalizeWorkerUpdatedCard(updatedCard: unknown, fallbackCard: FSRSCard): FSRSCard {
  if (!updatedCard || typeof updatedCard !== 'object') {
    return fallbackCard;
  }
  const candidate = updatedCard as FSRSCard;
  if (typeof candidate.id !== 'string' || !candidate.id) {
    throw new Error('review.feedback worker response missing updatedCard.id');
  }
  return canonicalizeSchedulingState(candidate, {
    source: 'review-commit',
    mode: 'assert-internal',
  }).card;
}

function resolveWorkerFeedbackContext(context: {
  queueType?: string;
  queueMode?: string;
  commitPolicy?: string;
}): {
  queueType: string;
  queueMode: string;
  commitPolicy: string;
} {
  const queueType = String(context.queueType || 'retrieval-practice').trim() || 'retrieval-practice';
  const commitPolicy = String(
    context.commitPolicy || (queueType === 'final-drill' ? 'drill-only' : 'write-schedule'),
  ).trim() || (queueType === 'final-drill' ? 'drill-only' : 'write-schedule');
  const queueMode = String(
    context.queueMode || (
      queueType === 'filter-group'
        ? (commitPolicy === 'preview-only' ? 'filtered-preview' : 'filtered-rescheduling')
        : (queueType === 'final-drill' ? 'drill' : 'formal')
    ),
  ).trim() || (
    queueType === 'filter-group'
      ? (commitPolicy === 'preview-only' ? 'filtered-preview' : 'filtered-rescheduling')
      : (queueType === 'final-drill' ? 'drill' : 'formal')
  );
  return {
    queueType,
    queueMode,
    commitPolicy,
  };
}
