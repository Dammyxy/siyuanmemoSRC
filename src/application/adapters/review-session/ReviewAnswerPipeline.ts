import type {
  QueueFeedback,
  QueueFeedbackResult,
} from '@/core/queue/abstraction/Strategy';
import type { FSRSCard } from '@/types/card';
import {
  type QueueCounterSnapshot,
  type QueueType,
} from '@/types/unified-data-source';
import type {
  ReviewSessionQueueResult,
  ReviewSessionQueueRuntime,
} from './ReviewSessionQueueRuntime';
import type { ReviewTransaction } from './ReviewTransactionSafetyEnvelope';

export type ReviewAnswerPipelineTimingStep = {
  step: string;
  durationMs: number;
  parentStep?: string;
  countsTowardTotal?: boolean;
};

export type ReviewAnswerPipelineTimingContext = {
  activeItem: FSRSCard;
  feedback: QueueFeedback;
  frontendTimingSteps: ReviewAnswerPipelineTimingStep[];
};

type ReviewAnswerPipelineTimingOptions = {
  parentStep?: string;
  countsTowardTotal?: boolean;
};

export interface ReviewAnswerPipelineDependencies {
  queueType: QueueType;
  captureTransaction(
    activeItem: FSRSCard,
    feedback: QueueFeedback,
    options: { includeCardSnapshot?: boolean },
  ): Promise<ReviewTransaction>;
  withFeedbackMutation<TResult>(
    activeItem: FSRSCard,
    feedback: QueueFeedback,
    task: () => Promise<TResult>,
  ): Promise<TResult>;
  recordReviewHistory(activeItem: FSRSCard, transaction: ReviewTransaction | null): void;
  syncCursorFromRuntime(): void;
  setCounterSnapshot(snapshot: QueueCounterSnapshot): void;
  setPendingCounterSnapshot(snapshot: QueueCounterSnapshot | null): void;
  setPendingNextCard(card: FSRSCard | null | undefined): void;
  consumeAdvanceResult(
    nextCard: FSRSCard | null,
    timingContext: ReviewAnswerPipelineTimingContext,
  ): Promise<FSRSCard | null>;
  isUnavailableCurrentItemError(error: unknown, activeItem: FSRSCard): boolean;
  measureStep<TResult>(
    step: string,
    timingContext: ReviewAnswerPipelineTimingContext,
    task: () => Promise<TResult>,
    options?: ReviewAnswerPipelineTimingOptions,
  ): Promise<TResult>;
  measureSyncStep<TResult>(
    step: string,
    timingContext: ReviewAnswerPipelineTimingContext,
    task: () => TResult,
    options?: ReviewAnswerPipelineTimingOptions,
  ): TResult;
}

export interface ReviewAnswerPipelineInput {
  activeItem: FSRSCard;
  feedback: QueueFeedback;
  runtime: ReviewSessionQueueRuntime;
  runtimeOwnsMutationAuthority: boolean;
  frontendTimingSteps: ReviewAnswerPipelineTimingStep[];
  onTransactionCaptured?: (transaction: ReviewTransaction) => void;
  onTransactionHistoryPushed?: () => void;
  onTransactionCleared?: () => void;
}

export class ReviewAnswerPipeline {
  constructor(private readonly deps: ReviewAnswerPipelineDependencies) {}

  async answer(input: ReviewAnswerPipelineInput): Promise<QueueFeedbackResult<FSRSCard>> {
    const timingContext: ReviewAnswerPipelineTimingContext = {
      activeItem: input.activeItem,
      feedback: input.feedback,
      frontendTimingSteps: input.frontendTimingSteps,
    };
    let activeTransaction: ReviewTransaction | null = null;

    if (!input.runtimeOwnsMutationAuthority) {
      activeTransaction = await this.deps.measureStep(
        'transaction-capture',
        timingContext,
        () => this.deps.captureTransaction(input.activeItem, input.feedback, {
          includeCardSnapshot: input.feedback.action === 'rate',
        }),
      );
      input.onTransactionCaptured?.(activeTransaction);
    }

    const result = await this.deps.measureStep(
      'session-runtime-answer',
      timingContext,
      () => this.deps.withFeedbackMutation(input.activeItem, input.feedback, () => input.runtime.answerAndAdvance({
        card: input.activeItem,
        feedback: input.feedback,
      })),
    );

    this.throwIfRuntimeRejected(result, input.activeItem);

    this.deps.measureSyncStep('sync-cursor-from-runtime', timingContext, () => {
      this.deps.syncCursorFromRuntime();
    });
    this.deps.measureSyncStep('sync-counter-snapshot', timingContext, () => {
      const counterSnapshot = cloneCounterSnapshot(result.counterSnapshot);
      this.deps.setCounterSnapshot(counterSnapshot);
      this.deps.setPendingCounterSnapshot(cloneCounterSnapshot(result.counterSnapshot));
    });

    const advancedNextItem = await this.deps.measureStep(
      'consume-advance',
      timingContext,
      () => this.deps.consumeAdvanceResult(result.nextCard, timingContext),
    );

    if (!input.runtimeOwnsMutationAuthority) {
      this.deps.recordReviewHistory(input.activeItem, activeTransaction);
      input.onTransactionHistoryPushed?.();
    }

    input.onTransactionCleared?.();
    return this.toFeedbackResult(result, advancedNextItem, input.feedback);
  }

  private throwIfRuntimeRejected(result: ReviewSessionQueueResult, activeItem: FSRSCard): void {
    if (result.status === 'conflict') {
      this.deps.setPendingNextCard(activeItem);
      throw new Error(`REVIEW_SESSION_RUNTIME_CONFLICT: ${result.reason ?? 'answer rejected'}`);
    }
    if (result.status === 'unavailable') {
      const runtimeUnavailable = new Error(result.reason ?? 'answer unavailable');
      if (!this.deps.isUnavailableCurrentItemError(runtimeUnavailable, activeItem)) {
        this.deps.setPendingNextCard(activeItem);
      }
      throw new Error(`REVIEW_SESSION_RUNTIME_UNAVAILABLE: ${result.reason ?? 'answer unavailable'}`);
    }
  }

  private toFeedbackResult(
    result: ReviewSessionQueueResult,
    nextItem: FSRSCard | null,
    feedback: QueueFeedback,
  ): QueueFeedbackResult<FSRSCard> {
    return {
      status: 'advanced',
      nextItem,
      counterSnapshot: cloneCounterSnapshot(result.counterSnapshot),
      affectedQueueTypes: result.affectedQueueTypes ? [...result.affectedQueueTypes] : [this.deps.queueType],
      activeQueueCount: result.activeQueueCount,
      countDelta: result.countDelta,
      queueImpact: result.queueImpact ? JSON.parse(JSON.stringify(result.queueImpact)) : null,
      commitStatus: result.commitStatus,
      commitIdempotencyKey: result.commitIdempotencyKey ?? feedback.commitIdempotencyKey,
      commit: result.commit,
    };
  }
}

function cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
  return {
    ...snapshot,
    buckets: {
      ...snapshot.buckets,
    },
  };
}
