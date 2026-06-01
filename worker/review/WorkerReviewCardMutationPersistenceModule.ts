import { SchedulerRouter } from '@/core/scheduler';
import {
  mapReviewLogV2ToReviewEventFact,
  summarizeReviewEventFact,
} from '@/core/scheduler/reviewEventFact';
import type { SchedulerType } from '@/core/scheduler/schedulerPolicy';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import { createReviewLogV2 } from '@/types/review';
import { DEFAULT_SETTINGS, type FSRSParameters } from '@/types/settings';
import type { FSRSCard } from '@/types/card';
import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import type {
  BackendReviewFeedbackQueueImpact,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
} from '../../packages/contracts/src/backend-rpc';
import { DomainSyncLedger } from '../domain-sync/DomainSyncLedger';
import { recordReviewFeedbackInnerStep } from '../bootstrap/ReviewFeedbackTimingScope';
import { createLogger } from '@/utils/logger';

type ReviewFeedbackRepository = Pick<SqlUnifiedStorageRepository, 'getCard' | 'upsertCards' | 'touchSyncMetadata'>;
type ReviewFeedbackTransactionDb =
  Parameters<RuntimeSqliteDatabaseService['runTransaction']>[1] extends (db: infer TDb) => unknown
    ? TDb
    : never;
type ReviewFeedbackRuntime = Pick<RuntimeSqliteDatabaseService, 'run' | 'getOne'> & {
  runTransaction<T>(
    label: string,
    writer: (db: ReviewFeedbackTransactionDb) => T | Promise<T>,
    options?: { persist?: boolean },
  ): Promise<T>;
};
const logger = createLogger('WorkerReviewCardMutationPersistenceModule');
const REVIEW_FEEDBACK_WORKER_STEP_SLOW_MS = 120;

type ExistingReviewCommitRow = {
  id: string;
  card_id: string | null;
  rating: number | null;
  reviewed_at: number;
  event_type: string;
  payload_json: string;
};

export type WorkerReviewFeedbackMutationInput = {
  request: BackendReviewFeedbackRequest;
  cardId: string;
  queueType: string;
  queueMode: string;
  commitPolicy: string;
  reviewedAt: number;
  rating: 1 | 2 | 3 | 4;
  idempotencyKey: string | null;
};

export type WorkerReviewFeedbackQueueImpactBuilder = (input: {
  queueType: string;
  request: BackendReviewFeedbackRequest;
  reviewedCard: FSRSCard;
  reviewedAt: number;
  committed: boolean;
  updatedCard: FSRSCard | null;
}) => BackendReviewFeedbackQueueImpact | null;

export class WorkerReviewCardMutationPersistenceModule {
  constructor(private readonly deps: {
    repository: ReviewFeedbackRepository;
    runtime: ReviewFeedbackRuntime;
    domainSyncLedger?: DomainSyncLedger;
  }) {}

  async commitReviewFeedback(
    input: WorkerReviewFeedbackMutationInput,
    buildQueueImpact: WorkerReviewFeedbackQueueImpactBuilder,
  ): Promise<BackendReviewFeedbackResult> {
    let postCommitQueueImpactInput: Parameters<WorkerReviewFeedbackQueueImpactBuilder>[0] | null = null;
    const result = await this.measureReviewFeedbackStep('transaction', input, () => this.deps.runtime.runTransaction('review.feedback', async () => {
      const domainSyncLedger = this.deps.domainSyncLedger ?? new DomainSyncLedger(this.deps.runtime);
      const card = this.deps.repository.getCard(input.cardId);
      if (!card) {
        throw new Error(`review.feedback card not found: ${input.cardId}`);
      }

      const existingCommit = input.idempotencyKey
        ? this.readExistingReviewCommit(input.idempotencyKey)
        : null;
      if (existingCommit) {
        this.assertCompatibleDuplicateCommit(existingCommit, input);
        return {
          cardId: input.cardId,
          committed: true,
          reviewedAt: existingCommit.reviewedAt,
          queueType: input.queueType,
          updatedCard: card,
          idempotencyKey: input.idempotencyKey,
          duplicate: true,
          queueImpact: null,
        };
      }

      const schedulerConfig = resolveWorkerReviewSchedulerConfig(input.request);
      const scheduler = new SchedulerRouter(
        {
          defaultScheduler: schedulerConfig.defaultScheduler,
          fsrsParams: schedulerConfig.fsrsParams,
        },
        {
          batchUpdateCardsWithoutEvents: async (cards) => {
            this.deps.repository.upsertCards(
              cards.map((candidate) => canonicalizeSchedulingState(candidate, {
                source: 'review-commit',
                mode: 'assert-internal',
              }).card),
            );
          },
          addReviewLogV2: async () => undefined,
        },
      );

      const decision = scheduler.answer(card, input.rating, {
        queueType: input.queueType,
        queueMode: input.queueMode,
        commitPolicy: input.commitPolicy as 'write-schedule' | 'preview-only' | 'drill-only',
        source: 'queue',
        sessionId: input.request.sessionId,
        reviewTime: input.reviewedAt,
      });
      const commitResult = await scheduler.commit(decision);

      if (commitResult.committed && commitResult.updatedCard) {
        const log = createReviewLogV2({
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
          commitIdempotencyKey: input.idempotencyKey ?? undefined,
          isDrill: decision.attempt.isDrill,
          isFiltered: decision.attempt.isFiltered,
          customStudy: decision.attempt.customStudy,
        });
        const fact = mapReviewLogV2ToReviewEventFact(log);
        if (!fact.classification.formal) {
          throw new Error(
            `INVALID_STATE: committed review feedback produced non-formal review fact: ${fact.classification.exclusionReasons.join(',')}`,
          );
        }
        const month = new Date(log.reviewedAt);
        this.deps.runtime.run(
          `INSERT OR REPLACE INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            log.cardId,
            log.attemptId,
            log.rating,
            log.reviewedAt,
            input.idempotencyKey,
            month.getFullYear(),
            month.getMonth() + 1,
            'review-v2',
            JSON.stringify(buildReviewEventIndexPayload({
              log,
              factSummary: summarizeReviewEventFact(fact),
              idempotencyKey: input.idempotencyKey,
            })),
          ],
        );
        domainSyncLedger.appendReviewCommitted({
          reviewEventId: log.id,
          card,
          rating: input.rating,
          reviewedAt: log.reviewedAt,
          queueType: input.queueType,
          queueMode: input.queueMode,
          commitPolicy: input.commitPolicy,
          idempotencyKey: input.idempotencyKey ?? null,
        });
      }

      const queueImpactInput = {
        queueType: input.queueType,
        request: input.request,
        reviewedCard: card,
        reviewedAt: input.reviewedAt,
        committed: commitResult.committed,
        updatedCard: commitResult.updatedCard ?? null,
      };
      const queueImpact = shouldBuildQueueImpactAfterReviewTransaction(input.queueType)
        ? null
        : this.measureReviewFeedbackStep('queue-impact', input, () => buildQueueImpact(queueImpactInput));
      if (shouldBuildQueueImpactAfterReviewTransaction(input.queueType)) {
        postCommitQueueImpactInput = queueImpactInput;
      }

      if (commitResult.committed) {
        await this.deps.repository.touchSyncMetadata({
          modifiedAt: input.reviewedAt,
          modifiedBy: 'srs-backend-worker:review.feedback',
        });
      }

      return {
        cardId: input.cardId,
        committed: commitResult.committed,
        reviewedAt: input.reviewedAt,
        queueType: input.queueType,
        updatedCard: commitResult.updatedCard ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        duplicate: false,
        queueImpact,
      };
    }, { persist: false }));
    if (!postCommitQueueImpactInput) {
      return result;
    }
    return {
      ...result,
      queueImpact: this.measureReviewFeedbackStep(
        'queue-impact',
        input,
        () => buildQueueImpact(postCommitQueueImpactInput),
      ),
    };
  }

  private async measureReviewFeedbackStep<TResult>(
    step: string,
    input: WorkerReviewFeedbackMutationInput,
    task: () => Promise<TResult>,
  ): Promise<TResult>;
  private measureReviewFeedbackStep<TResult>(
    step: string,
    input: WorkerReviewFeedbackMutationInput,
    task: () => TResult,
  ): TResult;
  private measureReviewFeedbackStep<TResult>(
    step: string,
    input: WorkerReviewFeedbackMutationInput,
    task: () => TResult | Promise<TResult>,
  ): TResult | Promise<TResult> {
    const startedAt = Date.now();
    const logIfSlow = (): void => {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= REVIEW_FEEDBACK_WORKER_STEP_SLOW_MS) {
        recordReviewFeedbackInnerStep({
          layer: step === 'queue-impact' ? 'queue-impact' : 'transaction',
          step,
          cardId: input.cardId,
          queueType: input.queueType,
          durationMs,
          extra: {
            queueMode: input.queueMode,
            commitPolicy: input.commitPolicy,
            rating: input.rating,
          },
        });
        logger.info('[SiYuanMemo][WorkerReviewCardMutationPersistenceModule] slow review.feedback worker step', {
          step,
          cardId: input.cardId,
          queueType: input.queueType,
          queueMode: input.queueMode,
          commitPolicy: input.commitPolicy,
          rating: input.rating,
          durationMs,
        });
      }
    };

    try {
      const result = task();
      if (result && typeof (result as Promise<TResult>).then === 'function') {
        return (result as Promise<TResult>).finally(logIfSlow);
      }
      logIfSlow();
      return result;
    } catch (error) {
      logIfSlow();
      throw error;
    }
  }

  private readExistingReviewCommit(idempotencyKey: string): {
    reviewedAt: number;
    payload: Record<string, unknown>;
  } | null {
    const row = this.deps.runtime.getOne<ExistingReviewCommitRow>(
      `SELECT id, card_id, rating, reviewed_at, event_type, payload_json
       FROM review_events
       WHERE commit_idempotency_key = ?
       ORDER BY reviewed_at, id
       LIMIT 1`,
      [idempotencyKey],
    );
    if (!row) {
      return null;
    }
    return {
      reviewedAt: Number(row.reviewed_at),
      payload: parseJsonObject(row.payload_json),
    };
  }

  private assertCompatibleDuplicateCommit(
    existing: { payload: Record<string, unknown> },
    request: WorkerReviewFeedbackMutationInput,
  ): void {
    const payload = existing.payload;
    const mismatches = [
      ['cardId', payload.cardId, request.cardId],
      ['rating', payload.rating, request.rating],
      ['queueType', payload.queueType, request.queueType],
      ['queueMode', payload.queueMode, request.queueMode],
      ['commitPolicy', payload.commitPolicy, request.commitPolicy],
    ].filter(([, actual, expected]) => String(actual ?? '') !== String(expected ?? ''));
    if (mismatches.length > 0) {
      throw new Error(
        `INVALID_REQUEST: conflicting review commit idempotency key: ${request.idempotencyKey}`,
      );
    }
  }
}

function shouldBuildQueueImpactAfterReviewTransaction(queueType: string): boolean {
  return queueType !== 'retrieval-practice'
    && queueType !== 'incremental-learning';
}

function buildReviewEventIndexPayload(input: {
  log: ReturnType<typeof createReviewLogV2>;
  factSummary: ReturnType<typeof summarizeReviewEventFact>;
  idempotencyKey: string | null;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    projectionKind: 'messagepack-review-event-index',
    eventId: input.log.id,
    cardId: input.log.cardId,
    attemptId: input.log.attemptId,
    rating: input.log.rating,
    reviewedAt: input.log.reviewedAt,
    commitIdempotencyKey: input.idempotencyKey,
    schedulerType: input.log.schedulerType,
    algorithm: input.log.algorithm,
    queueType: input.log.queueType,
    queueMode: input.log.queueMode,
    commitPolicy: input.log.commitPolicy,
    source: input.log.source,
    isDrill: input.log.isDrill,
    isFiltered: input.log.isFiltered,
    customStudy: input.log.customStudy,
    reviewEventFactSummary: input.factSummary,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function resolveWorkerReviewSchedulerConfig(request: BackendReviewFeedbackRequest): {
  defaultScheduler: SchedulerType;
  fsrsParams: FSRSParameters;
} {
  const scheduler = request.scheduler && typeof request.scheduler === 'object'
    ? request.scheduler
    : null;
  const defaultScheduler = isSchedulerType(scheduler?.defaultScheduler)
    ? scheduler.defaultScheduler
    : 'fsrs-v6';
  const candidate = scheduler?.fsrsParams && typeof scheduler.fsrsParams === 'object'
    ? scheduler.fsrsParams as Partial<FSRSParameters>
    : {};
  const candidateWeights = Array.isArray(candidate.weights)
    ? candidate.weights.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : [];
  return {
    defaultScheduler,
    fsrsParams: {
      ...DEFAULT_SETTINGS.fsrs,
      ...candidate,
      weights: candidateWeights.length > 0 ? [...candidateWeights] : [...DEFAULT_SETTINGS.fsrs.weights],
    },
  };
}

function isSchedulerType(value: unknown): value is SchedulerType {
  return value === 'fsrs-v6' || value === 'a-factor-v2';
}
