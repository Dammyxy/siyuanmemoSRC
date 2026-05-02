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
import type { ReviewLogV2 } from '@/types/review';
import type { BackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import type { BackendReviewSchedulerConfig } from '../../../../packages/contracts/src/backend-rpc';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewCommitUseCase');

export interface ReviewCommitCardReader {
  getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
}

export interface ReviewCommitLogWriter {
  addReviewLogV2(log: ReviewLogV2): Promise<void>;
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
    scheduler?: BackendReviewSchedulerConfig;
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
  schedulerConfig?: BackendReviewSchedulerConfig | null;
  runtimePolicy?: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null;
  onCommittedCard?: (card: FSRSCard) => Promise<void> | void;
}

type ReviewPolicyDecisionReason =
  | 'runtime-policy-missing'
  | 'backend-worker-disabled'
  | 'writer-relay-disabled'
  | 'writer-relay-runtime-missing'
  | 'writer-relay-runtime-unknown'
  | 'backend-worker-unavailable'
  | 'follower-relay-unavailable'
  | 'follower-relay-timeout'
  | 'writer-unavailable';

type RelayRuntimeState =
  | { mode: 'missing' }
  | { mode: 'unknown'; rawMode: string | null }
  | { mode: 'writer' }
  | { mode: 'follower'; instanceId: string };

export class ReviewCommitUseCase {
  constructor(private readonly deps: ReviewCommitUseCaseDependencies) {}

  async execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult> {
    const relayRuntime = resolveRelayRuntimeState(this.deps.writerLeaseGuard);
    const runtimeReadiness = this.resolveRuntimeWriteReadiness(relayRuntime);
    if (!runtimeReadiness.ready) {
      this.logPolicyDecision(runtimeReadiness.reason, {
        relayRuntimeMode: relayRuntime.mode,
        relayRuntimeRawMode: relayRuntime.mode === 'unknown' ? relayRuntime.rawMode : null,
      });
      throw new Error(runtimeReadiness.message);
    }
    if (!this.shouldUseWorkerFeedback(command)) {
      this.logPolicyDecision('backend-worker-unavailable', {
        hasBackendClient: Boolean(this.deps.srsBackend),
      });
      throw new Error('BACKEND_UNAVAILABLE: review.feedback requires backend-worker ownership');
    }

    return this.executeViaWorkerFeedback(command, relayRuntime);
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

  private async executeViaWorkerFeedback(
    command: QueueReviewCommand,
    relayRuntime: RelayRuntimeState,
  ): Promise<QueueReviewCommitResult> {
    const card = await this.deps.cards.getCard(command.cardId);
    const rating = normalizeRating(command.rating);
    const context = {
      ...command.context,
      source: command.context.source ?? 'queue',
    };
    const workerContext = resolveWorkerFeedbackContext(context);
    const reviewedAt = normalizeReviewedAt(context.reviewTime);
    const schedulerConfig = normalizeBackendReviewSchedulerConfig(this.deps.schedulerConfig);
    const requestPayload = {
      cardId: command.cardId,
      rating,
      queueType: workerContext.queueType,
      queueMode: workerContext.queueMode,
      commitPolicy: workerContext.commitPolicy,
      sessionId: context.sessionId,
      reviewedAt,
      ...(schedulerConfig ? { scheduler: schedulerConfig } : {}),
    };
    let result: {
      committed: boolean;
      updatedCard: unknown | null;
    };
    if (relayRuntime.mode === 'follower') {
      if (!this.deps.followerCommandClient) {
        this.logPolicyDecision('follower-relay-unavailable', {
          instanceId: relayRuntime.instanceId,
        });
        throw new Error('BACKEND_UNAVAILABLE: review.feedback relay is unavailable in follower mode');
      }
      try {
        const relayPayload = await this.deps.followerCommandClient.submitAndWait<unknown>({
          instanceId: relayRuntime.instanceId,
          method: 'review.feedback',
          params: requestPayload,
        });
        result = normalizeRelayFeedbackResult(relayPayload);
      } catch (error) {
        if (isWriterRelayTimeoutError(error)) {
          this.logPolicyDecision('follower-relay-timeout', {
            instanceId: relayRuntime.instanceId,
          });
        }
        throw error;
      }
    } else {
      if (relayRuntime.mode === 'unknown') {
        this.logPolicyDecision('writer-relay-runtime-unknown', {
          relayRuntimeRawMode: relayRuntime.rawMode,
        });
        throw new Error('BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime');
      }
      if (this.deps.writerLeaseGuard) {
        try {
          await this.deps.writerLeaseGuard.ensureWritable();
        } catch (error) {
          this.logPolicyDecision('writer-unavailable', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
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

  private resolveRuntimeWriteReadiness(relayRuntime: RelayRuntimeState): {
    ready: boolean;
    reason: ReviewPolicyDecisionReason;
    message: string;
  } {
    const runtimePolicy = this.deps.runtimePolicy;
    if (!runtimePolicy) {
      return {
        ready: true,
        reason: 'runtime-policy-missing',
        message: '',
      };
    }
    if (!runtimePolicy.capabilities.reviewFeedbackWriteEnabled) {
      const reason = runtimePolicy.capabilities.backendWorkerAvailable
        ? 'writer-relay-disabled'
        : 'backend-worker-disabled';
      return {
        ready: false,
        reason,
        message: 'BACKEND_UNAVAILABLE: review.feedback requires backend+writer ownership',
      };
    }
    if (runtimePolicy.capabilities.writerRelayRequiredForBackendWrites) {
      if (relayRuntime.mode === 'missing') {
        return {
          ready: false,
          reason: 'writer-relay-runtime-missing',
          message: 'BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime',
        };
      }
      if (relayRuntime.mode === 'unknown') {
        return {
          ready: false,
          reason: 'writer-relay-runtime-unknown',
          message: 'BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime',
        };
      }
    }
    return {
      ready: true,
      reason: 'runtime-policy-missing',
      message: '',
    };
  }

  private logPolicyDecision(reason: ReviewPolicyDecisionReason, payload?: Record<string, unknown>): void {
    logger.info('[BackendMigrationPolicy][ReviewCommitUseCase]', {
      reason,
      ...(payload || {}),
    });
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

function resolveRelayRuntimeState(
  writerLeaseGuard: ReviewCommitWriterLeaseGuard | null | undefined,
): RelayRuntimeState {
  if (!writerLeaseGuard || typeof writerLeaseGuard !== 'object') {
    return { mode: 'missing' };
  }
  const runtime = writerLeaseGuard as {
    getMode?: () => unknown;
    getInstanceId?: () => unknown;
  };
  const rawMode = runtime.getMode?.();
  if (rawMode === 'follower') {
    const instanceId = String(runtime.getInstanceId?.() || '').trim();
    if (!instanceId) {
      return { mode: 'unknown', rawMode: 'follower-without-instance' };
    }
    return { mode: 'follower', instanceId };
  }
  if (rawMode === 'writer') {
    return { mode: 'writer' };
  }
  if (typeof rawMode === 'undefined' || rawMode === null || rawMode === '') {
    return { mode: 'unknown', rawMode: null };
  }
  return { mode: 'unknown', rawMode: String(rawMode) };
}

function isWriterRelayTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('BACKEND_UNAVAILABLE: writer relay timeout');
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

function normalizeBackendReviewSchedulerConfig(
  config: BackendReviewSchedulerConfig | null | undefined,
): BackendReviewSchedulerConfig | null {
  if (!config || typeof config !== 'object') {
    return null;
  }
  const defaultScheduler = config.defaultScheduler;
  const fsrsParams = config.fsrsParams;
  if (!defaultScheduler && (!fsrsParams || typeof fsrsParams !== 'object')) {
    return null;
  }
  return {
    ...(defaultScheduler ? { defaultScheduler } : {}),
    ...(fsrsParams && typeof fsrsParams === 'object' ? { fsrsParams } : {}),
  };
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
