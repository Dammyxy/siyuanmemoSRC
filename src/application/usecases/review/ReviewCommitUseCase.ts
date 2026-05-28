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
import type {
  BackendReviewFeedbackQueueImpact,
  BackendReviewSchedulerConfig,
} from '../../../../packages/contracts/src/backend-rpc';
import { createLogger } from '@/utils/logger';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';

const logger = createLogger('ReviewCommitUseCase');
const REVIEW_COMMIT_STEP_SLOW_MS = 120;

export interface ReviewCommitCardReader {
  getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
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
    idempotencyKey?: string | null;
    projectionGeneration?: number;
    projectionPolicyHash?: string;
    scheduler?: BackendReviewSchedulerConfig;
  }): Promise<ReviewFeedbackWriteResult>;
}

type ReviewFeedbackRequest = Parameters<ReviewCommitBackendFeedbackClient['reviewFeedback']>[0];

type ReviewFeedbackWriteResult = {
  committed: boolean;
  updatedCard: unknown | null;
  idempotencyKey?: string | null;
  duplicate?: boolean;
  queueImpact?: BackendReviewFeedbackQueueImpact | null;
};

export interface ReviewCommitWriterLeaseGuard {
  ensureWritable(): Promise<void>;
  getMode?(): unknown;
  getInstanceId?(): unknown;
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
  arena?: ReviewCommitArenaRecorder | null;
  srsBackend?: ReviewCommitBackendFeedbackClient | null;
  writerLeaseGuard?: ReviewCommitWriterLeaseGuard | null;
  followerCommandClient?: ReviewCommitFollowerCommandClient | null;
  schedulerConfig?: BackendReviewSchedulerConfig | null;
  runtimePolicy?: Pick<BackendMigrationRuntimePolicy, 'capabilities'> | null;
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
  | 'follower-relay-no-active-writer-recovered'
  | 'writer-unavailable';

type RelayRuntimeState =
  | { mode: 'missing' }
  | { mode: 'unknown'; rawMode: string | null }
  | { mode: 'writer'; observedMode?: 'writer' | 'unknown' }
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

    return measureRuntimePerformance('review', 'commit.execute', () => this.executeViaWorkerFeedback(command, relayRuntime), {
      cardId: command.cardId,
      rating: command.rating,
      relayRuntimeMode: relayRuntime.mode,
    });
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
    const card = await measureRuntimePerformance(
      'review',
      'commit.read-card',
      () => this.deps.cards.getCard(command.cardId),
      { cardId: command.cardId },
    );
    const rating = normalizeRating(command.rating);
    const context = {
      ...command.context,
      source: command.context.source ?? 'queue',
    };
    const workerContext = resolveWorkerFeedbackContext(context);
    const reviewedAt = normalizeReviewedAt(context.reviewTime);
    const idempotencyKey = normalizeOptionalString(command.commitIdempotencyKey ?? context.commitIdempotencyKey);
    const schedulerConfig = normalizeBackendReviewSchedulerConfig(this.deps.schedulerConfig);
    const projectionGeneration = normalizeProjectionGeneration(context.projectionGeneration);
    const projectionPolicyHash = normalizeProjectionPolicyHash(context.projectionPolicyHash);
    const requestPayload = {
      cardId: command.cardId,
      rating,
      queueType: workerContext.queueType,
      queueMode: workerContext.queueMode,
      commitPolicy: workerContext.commitPolicy,
      sessionId: context.sessionId,
      reviewedAt,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(projectionGeneration !== null ? { projectionGeneration } : {}),
      ...(projectionPolicyHash ? { projectionPolicyHash } : {}),
      ...(schedulerConfig ? { scheduler: schedulerConfig } : {}),
    };
    let result: ReviewFeedbackWriteResult;
    if (relayRuntime.mode === 'follower') {
      if (!this.deps.followerCommandClient) {
        this.logPolicyDecision('follower-relay-unavailable', {
          instanceId: relayRuntime.instanceId,
        });
        throw new Error('BACKEND_UNAVAILABLE: review.feedback relay is unavailable in follower mode');
      }
      try {
        const relayPayload = await this.measureReviewCommitStep(
          'feedback.relay-submit-wait',
          command.cardId,
          workerContext,
          rating,
          () => measureRuntimePerformance('review', 'feedback.relay-submit-wait', () => this.deps.followerCommandClient!.submitAndWait<unknown>({
            instanceId: relayRuntime.instanceId,
            method: 'review.feedback',
            params: requestPayload,
          }), {
            cardId: command.cardId,
            commitPolicy: workerContext.commitPolicy,
            method: 'review.feedback',
            queueMode: workerContext.queueMode,
            queueType: workerContext.queueType,
            rating,
          })
        );
        result = normalizeRelayFeedbackResult(relayPayload);
      } catch (error) {
        if (isWriterRelayTimeoutError(error)) {
          this.logPolicyDecision('follower-relay-timeout', {
            instanceId: relayRuntime.instanceId,
          });
        }
        const recoveredResult = await this.tryRecoverFollowerNoActiveWriterFeedback(
          error,
          relayRuntime,
          requestPayload,
          command,
          workerContext,
          rating,
        );
        if (!recoveredResult) {
          throw error;
        }
        result = recoveredResult;
      }
    } else {
      if (relayRuntime.mode === 'unknown') {
        this.logPolicyDecision('writer-relay-runtime-unknown', {
          relayRuntimeRawMode: relayRuntime.rawMode,
        });
      }
      if (this.deps.writerLeaseGuard) {
        try {
          await measureRuntimePerformance('relay', 'ensure-writable.review-feedback', () => this.deps.writerLeaseGuard!.ensureWritable(), {
            method: 'review.feedback',
          });
        } catch (error) {
          this.logPolicyDecision('writer-unavailable', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }
      result = await this.executeLocalWorkerFeedback(requestPayload, command, workerContext, rating);
    }

    const updatedCard = normalizeWorkerUpdatedCard(result.updatedCard, card);
    await measureRuntimePerformance('review', 'commit.record-arena-review', () => this.recordArenaReview(card, rating, context), {
      cardId: command.cardId,
      rating,
    });
    return {
      card,
      updatedCard,
      committed: result.committed,
      queueImpact: result.queueImpact ?? null,
    };
  }

  private async tryRecoverFollowerNoActiveWriterFeedback(
    error: unknown,
    relayRuntime: Extract<RelayRuntimeState, { mode: 'follower' }>,
    requestPayload: ReviewFeedbackRequest,
    command: QueueReviewCommand,
    workerContext: ReturnType<typeof resolveWorkerFeedbackContext>,
    rating: Rating,
  ): Promise<ReviewFeedbackWriteResult | null> {
    if (!isNoActiveWriterRelayUnavailableError(error) || !this.deps.writerLeaseGuard) {
      return null;
    }
    try {
      await measureRuntimePerformance('relay', 'ensure-writable.review-feedback-recover', () => this.deps.writerLeaseGuard!.ensureWritable(), {
        method: 'review.feedback',
      });
    } catch (recoveryError) {
      this.logPolicyDecision('writer-unavailable', {
        instanceId: relayRuntime.instanceId,
        error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      });
      throw recoveryError;
    }
    const recoveredRuntime = resolveRelayRuntimeState(this.deps.writerLeaseGuard);
    if (recoveredRuntime.mode !== 'writer') {
      return null;
    }
    this.logPolicyDecision('follower-relay-no-active-writer-recovered', {
      instanceId: relayRuntime.instanceId,
    });
    return this.executeLocalWorkerFeedback(requestPayload, command, workerContext, rating);
  }

  private async executeLocalWorkerFeedback(
    requestPayload: ReviewFeedbackRequest,
    command: QueueReviewCommand,
    workerContext: ReturnType<typeof resolveWorkerFeedbackContext>,
    rating: Rating,
  ): Promise<ReviewFeedbackWriteResult> {
    return this.measureReviewCommitStep(
      'feedback.backend-worker',
      command.cardId,
      workerContext,
      rating,
      () => measureRuntimePerformance('review', 'feedback.backend-worker', () => this.deps.srsBackend!.reviewFeedback(requestPayload), {
        cardId: command.cardId,
        commitPolicy: workerContext.commitPolicy,
        queueMode: workerContext.queueMode,
        queueType: workerContext.queueType,
        rating,
      })
    );
  }

  private async measureReviewCommitStep<TResult>(
    step: string,
    cardId: string,
    workerContext: ReturnType<typeof resolveWorkerFeedbackContext>,
    rating: Rating,
    task: () => Promise<TResult>,
  ): Promise<TResult> {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= REVIEW_COMMIT_STEP_SLOW_MS) {
        logger.info('[SiYuanMemo][ReviewCommitUseCase] slow review commit step', {
          step,
          cardId,
          queueType: workerContext.queueType,
          queueMode: workerContext.queueMode,
          commitPolicy: workerContext.commitPolicy,
          rating,
          durationMs,
        });
      }
    }
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
    return { mode: 'writer', observedMode: 'writer' };
  }
  if (typeof rawMode === 'undefined' || rawMode === null || rawMode === '') {
    return typeof runtime.getMode === 'function' && typeof writerLeaseGuard.ensureWritable === 'function'
      ? { mode: 'writer', observedMode: 'unknown' }
      : { mode: 'unknown', rawMode: null };
  }
  return { mode: 'unknown', rawMode: String(rawMode) };
}

function isWriterRelayTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('BACKEND_UNAVAILABLE: writer relay timeout');
}

function isNoActiveWriterRelayUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('writer command unavailable: no active writer lease');
}

function normalizeRelayFeedbackResult(payload: unknown): {
  committed: boolean;
  updatedCard: unknown | null;
  queueImpact?: BackendReviewFeedbackQueueImpact | null;
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('review.feedback follower relay returned invalid payload');
  }
  const candidate = payload as {
    committed?: unknown;
    updatedCard?: unknown;
    idempotencyKey?: unknown;
    duplicate?: unknown;
    queueImpact?: unknown;
  };
  if (typeof candidate.committed !== 'boolean') {
    throw new Error('review.feedback follower relay payload missing committed');
  }
  return {
    committed: candidate.committed,
    updatedCard: candidate.updatedCard ?? null,
    idempotencyKey: normalizeOptionalString(candidate.idempotencyKey),
    duplicate: candidate.duplicate === true,
    queueImpact: normalizeRelayQueueImpact(candidate.queueImpact),
  };
}

function normalizeRelayQueueImpact(value: unknown): BackendReviewFeedbackQueueImpact | null {
  if (value == null) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('review.feedback follower relay payload has invalid queueImpact');
  }
  const impact = value as {
    hotPatchable?: unknown;
    refreshRequired?: unknown;
    affectedQueues?: unknown;
  };
  if (typeof impact.hotPatchable !== 'boolean' || typeof impact.refreshRequired !== 'boolean') {
    throw new Error('review.feedback follower relay payload has invalid queueImpact');
  }
  if (!Array.isArray(impact.affectedQueues)) {
    throw new Error('review.feedback follower relay payload has invalid queueImpact');
  }
  return value as BackendReviewFeedbackQueueImpact;
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

function normalizeProjectionGeneration(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const generation = Math.floor(Number(value));
  return Number.isFinite(generation) && generation >= 0 ? generation : null;
}

function normalizeProjectionPolicyHash(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
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
