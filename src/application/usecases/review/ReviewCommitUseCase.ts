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
import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
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

export interface ReviewCommitFollowerCommandClient {
  submitAndWait<TResult>(request: {
    instanceId: string;
    method: string;
    params?: unknown;
  }, timeoutMs?: number): Promise<TResult>;
}

export interface ReviewCommitUseCaseDependencies {
  cards: ReviewCommitCardReader;
  scheduler: Pick<SchedulerRouter, 'answer' | 'commit'>;
  reviewLogs: ReviewCommitLogWriter;
  transactionRunner?: ReviewCommitTransactionRunner | null;
  arena?: ReviewCommitArenaRecorder | null;
  srsBackend?: ReviewCommitBackendFeedbackClient | null;
  writerLeaseGuard?: ReviewCommitWriterLeaseGuard | null;
  followerCommandClient?: ReviewCommitFollowerCommandClient | null;
  runtimePolicy?: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null;
  onCommittedCard?: (card: FSRSCard) => Promise<void> | void;
}

export class ReviewCommitUseCase {
  constructor(private readonly deps: ReviewCommitUseCaseDependencies) {}

  async execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
    if (!this.isRuntimePolicyReadyForWrite()) {
      throw new Error('BACKEND_UNAVAILABLE: review.feedback requires backend+writer ownership');
    }
    if (!this.shouldUseWorkerFeedback(command)) {
      throw new Error('BACKEND_UNAVAILABLE: review.feedback requires backend-worker ownership');
    }

    return this.executeViaWorkerFeedback(command);
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
    const requestPayload = {
      cardId: command.cardId,
      rating,
      queueType: workerContext.queueType,
      queueMode: workerContext.queueMode,
      commitPolicy: workerContext.commitPolicy,
      sessionId: context.sessionId,
      reviewedAt,
    };
    const followerRelayRuntime = resolveFollowerRelayRuntime(this.deps.writerLeaseGuard);
    let result: {
      committed: boolean;
      updatedCard: unknown | null;
    };
    if (followerRelayRuntime && this.deps.followerCommandClient) {
      const relayPayload = await this.deps.followerCommandClient.submitAndWait<unknown>({
        instanceId: followerRelayRuntime.instanceId,
        method: 'review.feedback',
        params: requestPayload,
      });
      result = normalizeRelayFeedbackResult(relayPayload);
    } else {
      if (followerRelayRuntime && !this.deps.followerCommandClient) {
        throw new Error('BACKEND_UNAVAILABLE: review.feedback relay is unavailable in follower mode');
      }
      if (this.deps.writerLeaseGuard) {
        await this.deps.writerLeaseGuard.ensureWritable();
      }
      result = await this.deps.srsBackend!.reviewFeedback(requestPayload);
    }

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

  private isRuntimePolicyReadyForWrite(): boolean {
    const runtimePolicy = this.deps.runtimePolicy;
    if (!runtimePolicy) {
      return true;
    }
    if (!runtimePolicy.capabilities.reviewFeedbackWriteEnabled) {
      return false;
    }
    if (runtimePolicy.capabilities.writerRelayRequiredForBackendWrites && !this.deps.writerLeaseGuard) {
      return false;
    }
    return true;
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

function resolveFollowerRelayRuntime(
  writerLeaseGuard: ReviewCommitWriterLeaseGuard | null | undefined,
): { instanceId: string } | null {
  if (!writerLeaseGuard || typeof writerLeaseGuard !== 'object') {
    return null;
  }
  const runtime = writerLeaseGuard as {
    getMode?: () => unknown;
    getInstanceId?: () => unknown;
  };
  if (runtime.getMode?.() !== 'follower') {
    return null;
  }
  const instanceId = String(runtime.getInstanceId?.() || '').trim();
  if (!instanceId) {
    return null;
  }
  return { instanceId };
}

function normalizeRelayFeedbackResult(payload: unknown): {
  committed: boolean;
  updatedCard: unknown | null;
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('review.feedback follower relay returned invalid payload');
  }
  const candidate = payload as {
    committed?: unknown;
    updatedCard?: unknown;
  };
  if (typeof candidate.committed !== 'boolean') {
    throw new Error('review.feedback follower relay payload missing committed');
  }
  return {
    committed: candidate.committed,
    updatedCard: candidate.updatedCard ?? null,
  };
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
