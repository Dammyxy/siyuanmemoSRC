import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import type { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import type {
  BackendReviewFeedbackQueueImpact,
  BackendReviewFeedbackQueueImpactEntry,
  BackendReviewFeedbackQueueImpactReorderHint,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
} from '../../packages/contracts/src/backend-rpc';
import { DomainSyncLedger } from '../domain-sync/DomainSyncLedger';
import { buildQueueProjectionCountersFromRows } from '../queue-projection/WorkerQueueProjectionRuntime';
import {
  WorkerReviewCardMutationPersistenceModule,
  type WorkerReviewFeedbackTruthCandidate,
} from './WorkerReviewCardMutationPersistenceModule';
import { recordReviewFeedbackInnerStep } from '../bootstrap/ReviewFeedbackTimingScope';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WorkerReviewFeedbackRuntime');
const REVIEW_FEEDBACK_QUEUE_IMPACT_STEP_SLOW_MS = 120;

type ProjectionWorkerQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning
  | QueueType.FilterGroup
  | QueueType.FinalDrill
  | QueueType.Leech
  | QueueType.NeuralRoam;

type WorkerReviewFeedbackTransactionOptions = {
  persist?: boolean;
};

type WorkerReviewFeedbackTransactionDb =
  Parameters<RuntimeSqliteDatabaseService['runTransaction']>[1] extends (db: infer TDb) => unknown
    ? TDb
    : never;

type WorkerReviewFeedbackRuntimeDatabase = Pick<RuntimeSqliteDatabaseService, 'run' | 'getOne'> & {
  runTransaction<T>(
    label: string,
    writer: (db: WorkerReviewFeedbackTransactionDb) => T | Promise<T>,
    options?: WorkerReviewFeedbackTransactionOptions,
  ): Promise<T>;
};

export type WorkerReviewFeedbackRuntimeDeps = {
  repository: Pick<SqlUnifiedStorageRepository, 'getCard' | 'upsertCards' | 'queryCards' | 'touchSyncMetadata'>;
  queueProjection: Pick<SqlQueueProjectionRepository, 'readGeneration' | 'readRows' | 'applyQueueProjectionDelta'> | null;
  runtime: WorkerReviewFeedbackRuntimeDatabase;
  domainSyncLedger?: DomainSyncLedger;
  recordUnavailable?: () => void;
  persistReviewJournal?: (request: BackendReviewFeedbackRequest) => Promise<BackendReviewFeedbackRequest>;
  recordReviewTruthCandidate?: (candidate: WorkerReviewFeedbackTruthCandidate) => void;
};

type WorkerReviewFeedbackQueueProjection = NonNullable<WorkerReviewFeedbackRuntimeDeps['queueProjection']>;

type DeferredReviewFeedbackProjectionMaintenanceInput = {
  queueType: ProjectionWorkerQueueType;
  policyHash: string;
  requestedGeneration: number | null;
  requestedCurrentGeneration: number;
  request: BackendReviewFeedbackRequest;
  reviewedCard: FSRSCard;
  committed: boolean;
  reviewedAt: number;
};

type DeferredReviewFeedbackProjectionMaintenanceTask = {
  input: DeferredReviewFeedbackProjectionMaintenanceInput;
  queuedAt: number;
  timer: ReturnType<typeof setTimeout>;
};

const deferredReviewFeedbackProjectionMaintenance = new WeakMap<
  object,
  Map<string, DeferredReviewFeedbackProjectionMaintenanceTask>
>();

export class WorkerReviewFeedbackRuntime {
  constructor(private readonly deps: WorkerReviewFeedbackRuntimeDeps) {}

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    const queueType = String(request.queueType || 'retrieval-practice').trim() || 'retrieval-practice';
    const defaultCommitPolicy = queueType === 'final-drill' ? 'drill-only' : 'write-schedule';
    const commitPolicy = String(request.commitPolicy || defaultCommitPolicy).trim() || defaultCommitPolicy;
    const defaultQueueMode = queueType === 'filter-group'
      ? (commitPolicy === 'preview-only' ? 'filtered-preview' : 'filtered-rescheduling')
      : (queueType === 'final-drill' ? 'drill' : 'formal');
    const queueMode = String(request.queueMode || defaultQueueMode).trim() || defaultQueueMode;
    const reviewedAt = Number(request.reviewedAt || Date.now());
    const rating = Math.max(1, Math.min(4, Math.floor(Number(request.rating) || 0))) as 1 | 2 | 3 | 4;
    const cardId = String(request.cardId || '').trim();
    const idempotencyKey = normalizeOptionalString(request.idempotencyKey);
    if (!cardId) {
      this.recordUnavailable();
      throw new Error('review.feedback requires cardId');
    }

    const supportedQueueTypes = new Set([
      'retrieval-practice',
      'incremental-learning',
      'filter-group',
      'neural-roam',
      'leech',
      'final-drill',
    ]);
    if (!supportedQueueTypes.has(queueType)) {
      this.recordUnavailable();
      throw new Error(`SrsBackendWorker review.feedback unavailable for queueType in current phase: ${queueType}`);
    }
    if (queueType === 'filter-group') {
      const allowed = (
        (queueMode === 'filtered-preview' && commitPolicy === 'preview-only')
        || (queueMode === 'filtered-rescheduling' && commitPolicy === 'write-schedule')
      );
      if (!allowed) {
        this.recordUnavailable();
        throw new Error(
          `SrsBackendWorker review.feedback unavailable for filter-group mode/policy in current phase: `
          + `${queueMode}/${commitPolicy}`,
        );
      }
    } else if (queueType === 'final-drill') {
      if (queueMode !== 'drill' || commitPolicy !== 'drill-only') {
        this.recordUnavailable();
        throw new Error(
          `SrsBackendWorker review.feedback unavailable for final-drill mode/policy in current phase: `
          + `${queueMode}/${commitPolicy}`,
        );
      }
    } else {
      if (queueMode !== 'formal') {
        this.recordUnavailable();
        throw new Error(`SrsBackendWorker review.feedback unavailable for queueMode in current phase: ${queueMode}`);
      }
      if (commitPolicy !== 'write-schedule') {
        this.recordUnavailable();
        throw new Error(`SrsBackendWorker review.feedback unavailable for commitPolicy in current phase: ${commitPolicy}`);
      }
    }

    const normalizedRequest: BackendReviewFeedbackRequest = {
      ...request,
      cardId,
      rating,
      queueType,
      queueMode,
      commitPolicy,
      reviewedAt,
      idempotencyKey,
    };
    const durableRequest = commitPolicy === 'write-schedule' && this.deps.persistReviewJournal
      ? await this.deps.persistReviewJournal(normalizedRequest)
      : normalizedRequest;
    const durableIdempotencyKey = normalizeOptionalString(durableRequest.idempotencyKey);

    const mutationModule = new WorkerReviewCardMutationPersistenceModule({
      repository: this.deps.repository,
      runtime: this.deps.runtime,
      domainSyncLedger: this.deps.domainSyncLedger ?? new DomainSyncLedger(this.deps.runtime),
    });
    return await mutationModule.commitReviewFeedback(
      {
        request: durableRequest,
        cardId,
        queueType,
        queueMode,
        commitPolicy,
        reviewedAt,
        rating,
        idempotencyKey: durableIdempotencyKey,
      },
      (input) => this.buildReviewFeedbackQueueImpact(input),
      (candidate) => this.deps.recordReviewTruthCandidate?.(candidate),
    );
  }

  private recordUnavailable(): void {
    this.deps.recordUnavailable?.();
  }

  private buildReviewFeedbackQueueImpact(input: {
    queueType: string;
    request: BackendReviewFeedbackRequest;
    reviewedCard: FSRSCard;
    reviewedAt: number;
    committed: boolean;
    updatedCard: FSRSCard | null;
  }): BackendReviewFeedbackQueueImpact | null {
    const projectionQueueType = resolveProjectionQueueType(input.queueType);
    if (!projectionQueueType) {
      return null;
    }
    if (isFormalSrsProjectionQueueType(projectionQueueType) && (!input.committed || !input.updatedCard)) {
      return null;
    }

    if (!this.deps.queueProjection) {
      return buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'projection-unavailable',
        requestedGeneration: normalizeOptionalInteger(input.request.projectionGeneration),
      });
    }

    const currentGeneration = this.deps.queueProjection.readGeneration(projectionQueueType);
    if (!currentGeneration) {
      return buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'projection-unavailable',
        requestedGeneration: normalizeOptionalInteger(input.request.projectionGeneration),
      });
    }

    if (currentGeneration.status !== 'ready') {
      return buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'projection-invalidated',
        policyHash: currentGeneration.policyHash,
        currentGeneration: currentGeneration.generation,
        requestedGeneration: normalizeOptionalInteger(input.request.projectionGeneration),
      });
    }

    const requestedGeneration = normalizeOptionalInteger(input.request.projectionGeneration);
    const requestedPolicyHash = normalizeOptionalString(input.request.projectionPolicyHash);
    const hasGenerationMismatch = (
      (requestedGeneration !== null && requestedGeneration !== currentGeneration.generation)
      || (requestedPolicyHash !== null && requestedPolicyHash !== currentGeneration.policyHash)
    );

    const policyHash = currentGeneration.policyHash;
    return this.buildDeferredReviewFeedbackQueueImpact({
      queueType: projectionQueueType,
      policyHash,
      requestedGeneration,
      requestedCurrentGeneration: currentGeneration.generation,
      hasGenerationMismatch,
      request: input.request,
      reviewedCard: input.updatedCard ?? input.reviewedCard,
      committed: input.committed,
      reviewedAt: input.reviewedAt,
    });

  }

  private buildDeferredReviewFeedbackQueueImpact(input: {
    queueType: ProjectionWorkerQueueType;
    policyHash: string;
    requestedGeneration: number | null;
    requestedCurrentGeneration: number;
    hasGenerationMismatch: boolean;
    request: BackendReviewFeedbackRequest;
    reviewedCard: FSRSCard;
    committed: boolean;
    reviewedAt: number;
  }): BackendReviewFeedbackQueueImpact {
    if (!this.deps.queueProjection) {
      return buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'projection-unavailable',
        requestedGeneration: input.requestedGeneration,
      });
    }

    const scheduled = this.scheduleDeferredReviewFeedbackProjectionMaintenance({
      queueType: input.queueType,
      policyHash: input.policyHash,
      requestedGeneration: input.requestedGeneration,
      requestedCurrentGeneration: input.requestedCurrentGeneration,
      request: input.request,
      reviewedCard: input.reviewedCard,
      committed: input.committed,
      reviewedAt: input.reviewedAt,
    });

    if (!scheduled.scheduled) {
      return buildUnavailableQueueImpact({
        queueType: input.queueType,
        reason: 'projection-deferred-schedule-failed',
        policyHash: input.policyHash,
        currentGeneration: input.requestedCurrentGeneration,
        requestedGeneration: input.requestedGeneration,
        unavailableReason: 'deferred-maintenance-schedule-failed',
      });
    }

    if (input.hasGenerationMismatch) {
      return buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'generation-mismatch',
        policyHash: input.policyHash,
        currentGeneration: input.requestedCurrentGeneration,
        requestedGeneration: input.requestedGeneration,
      });
    }

    return buildDeferredQueueImpact({
      queueType: input.queueType,
      policyHash: input.policyHash,
      currentGeneration: input.requestedCurrentGeneration,
      requestedGeneration: input.requestedGeneration,
      queuedAt: scheduled.queuedAt,
      coalesced: scheduled.coalesced,
    });
  }

  private scheduleDeferredReviewFeedbackProjectionMaintenance(
    input: DeferredReviewFeedbackProjectionMaintenanceInput,
  ): { scheduled: boolean; coalesced: boolean; queuedAt: number } {
    const startedAt = Date.now();
    const queuedAt = startedAt;
    const queueProjection = this.deps.queueProjection;
    if (!queueProjection) {
      return { scheduled: false, coalesced: false, queuedAt };
    }

    const queue = resolveDeferredReviewFeedbackProjectionMaintenanceQueue(queueProjection);
    const key = buildDeferredReviewFeedbackProjectionMaintenanceKey(input);
    const existing = queue.get(key);
    if (existing) {
      existing.input = input;
      existing.queuedAt = queuedAt;
      this.recordDeferredProjectionMaintenanceEnqueue(input, Date.now() - startedAt, {
        queuedAt,
        coalesced: true,
      });
      return { scheduled: true, coalesced: true, queuedAt };
    }

    const task: DeferredReviewFeedbackProjectionMaintenanceTask = {
      input,
      queuedAt,
      timer: setTimeout(() => {
        queue.delete(key);
        this.runDeferredReviewFeedbackProjectionMaintenance(task.input, task.queuedAt);
      }, 0),
    };
    queue.set(key, task);
    this.recordDeferredProjectionMaintenanceEnqueue(input, Date.now() - startedAt, {
      queuedAt,
      coalesced: false,
    });
    return { scheduled: true, coalesced: false, queuedAt };
  }

  private recordDeferredProjectionMaintenanceEnqueue(
    input: DeferredReviewFeedbackProjectionMaintenanceInput,
    durationMs: number,
    metadata: { queuedAt: number; coalesced: boolean },
  ): void {
    recordReviewFeedbackInnerStep({
      layer: 'queue-impact',
      step: 'projection-deferred-enqueue',
      cardId: input.reviewedCard.id,
      queueType: input.queueType,
      durationMs,
      extra: {
        policyHash: input.policyHash,
        scheduled: true,
        coalesced: metadata.coalesced,
        queuedAt: metadata.queuedAt,
        outcome: 'deferred',
      },
    });
  }

  private runDeferredReviewFeedbackProjectionMaintenance(
    input: DeferredReviewFeedbackProjectionMaintenanceInput,
    queuedAt: number,
  ): void {
    const startedAt = Date.now();
    try {
      const applied = this.applyDeferredReviewFeedbackProjectionMaintenance(input, queuedAt);
      const durationMs = Date.now() - startedAt;
      recordReviewFeedbackInnerStep({
        layer: 'queue-impact',
        step: 'projection-deferred-run',
        cardId: input.reviewedCard.id,
        queueType: input.queueType,
        durationMs,
        extra: {
          policyHash: input.policyHash,
          queuedAt,
          waitMs: Math.max(0, startedAt - queuedAt),
          applied,
          status: applied ? 'completed' : 'skipped',
        },
      });
      logger.trace?.('[SiYuanMemo][WorkerReviewFeedbackRuntime] deferred review.feedback projection maintenance finished', {
        queueType: input.queueType,
        cardId: input.reviewedCard.id,
        policyHash: input.policyHash,
        applied,
        waitMs: Math.max(0, startedAt - queuedAt),
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      recordReviewFeedbackInnerStep({
        layer: 'queue-impact',
        step: 'projection-deferred-run',
        cardId: input.reviewedCard.id,
        queueType: input.queueType,
        durationMs,
        extra: {
          policyHash: input.policyHash,
          queuedAt,
          waitMs: Math.max(0, startedAt - queuedAt),
          status: 'failed',
          message,
        },
      });
      logger.warn('[SiYuanMemo][WorkerReviewFeedbackRuntime] deferred review.feedback projection maintenance failed', {
        queueType: input.queueType,
        cardId: input.reviewedCard.id,
        policyHash: input.policyHash,
        durationMs,
        error: message,
      });
    }
  }

  private applyDeferredReviewFeedbackProjectionMaintenance(
    input: DeferredReviewFeedbackProjectionMaintenanceInput,
    queuedAt: number,
  ): boolean {
    if (!this.deps.queueProjection) {
      return false;
    }

    const previousRows = this.measureQueueImpactStep(
      'projection-deferred-read-rows',
      input.queueType,
      input.reviewedCard.id,
      () => this.deps.queueProjection!.readRows({
        queueType: input.queueType,
        policyHash: input.policyHash,
        limit: 5000,
      }),
    );
    const nextGeneration = input.requestedCurrentGeneration + 1;
    const nextRows = this.measureQueueImpactStep(
      'projection-deferred-build-rows',
      input.queueType,
      input.reviewedCard.id,
      () => buildDeferredReviewFeedbackNextRows({
        queueType: input.queueType,
        previousRows,
        reviewedCard: input.reviewedCard,
        rating: Number(input.request.rating),
        nextGeneration,
        updatedAt: input.reviewedAt,
      }),
    );
    if (!nextRows) {
      return false;
    }

    const delta = buildQueueProjectionDelta({
      previousRows,
      nextRows,
    });
    const counters = buildQueueProjectionCountersFromRows({
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: nextGeneration,
      updatedAt: input.reviewedAt,
      now: input.reviewedAt,
      rows: nextRows,
    });

    this.measureQueueImpactStep(
      'projection-deferred-apply-delta',
      input.queueType,
      input.reviewedCard.id,
      () => this.deps.queueProjection!.applyQueueProjectionDelta({
        queueType: input.queueType,
        policyHash: input.policyHash,
        generation: nextGeneration,
        removeRowIds: delta.removedRowIds,
        upsertRows: nextRows,
        counters,
        invalidation: {
          queueType: input.queueType,
          reason: 'review-feedback',
          affectedCardIds: [input.reviewedCard.id],
          affectedBlockIds: input.reviewedCard.blockId ? [input.reviewedCard.blockId] : [],
          generation: nextGeneration,
          metadata: {
            reviewedCardId: input.reviewedCard.id,
            committed: input.committed,
            commitPolicy: input.request.commitPolicy ?? null,
            deferred: true,
            deferredQueuedAt: queuedAt,
          },
        },
      }),
    );
    return true;
  }

  private measureQueueImpactStep<TResult>(
    step: string,
    queueType: string,
    cardId: string,
    task: () => TResult,
  ): TResult {
    const startedAt = Date.now();
    try {
      return task();
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= REVIEW_FEEDBACK_QUEUE_IMPACT_STEP_SLOW_MS) {
        recordReviewFeedbackInnerStep({
          layer: 'queue-impact',
          step,
          cardId,
          queueType,
          durationMs,
        });
        logger.trace?.('[SiYuanMemo][WorkerReviewFeedbackRuntime] slow review.feedback queueImpact step', {
          step,
          queueType,
          cardId,
          durationMs,
        });
      }
    }
  }
}

function isProjectionWorkerQueueType(queueType: string): queueType is ProjectionWorkerQueueType {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning
    || queueType === QueueType.FilterGroup
    || queueType === QueueType.FinalDrill
    || queueType === QueueType.Leech
    || queueType === QueueType.NeuralRoam;
}

function resolveProjectionQueueType(queueType: string): ProjectionWorkerQueueType | null {
  if (isProjectionWorkerQueueType(queueType)) {
    return queueType;
  }
  return null;
}

function isFormalSrsProjectionQueueType(queueType: ProjectionWorkerQueueType): boolean {
  return queueType === QueueType.RetrievalPractice || queueType === QueueType.IncrementalLearning;
}

function resolveDeferredReviewFeedbackProjectionMaintenanceQueue(
  queueProjection: WorkerReviewFeedbackQueueProjection,
): Map<string, DeferredReviewFeedbackProjectionMaintenanceTask> {
  const existing = deferredReviewFeedbackProjectionMaintenance.get(queueProjection);
  if (existing) {
    return existing;
  }
  const queue = new Map<string, DeferredReviewFeedbackProjectionMaintenanceTask>();
  deferredReviewFeedbackProjectionMaintenance.set(queueProjection, queue);
  return queue;
}

function buildDeferredReviewFeedbackProjectionMaintenanceKey(
  input: Pick<DeferredReviewFeedbackProjectionMaintenanceInput, 'queueType' | 'policyHash'>,
): string {
  return `${input.queueType}:${input.policyHash}`;
}

function buildDeferredQueueImpact(input: {
  queueType: QueueType;
  policyHash: string;
  currentGeneration: number;
  requestedGeneration: number | null;
  queuedAt: number;
  coalesced: boolean;
}): BackendReviewFeedbackQueueImpact {
  return {
    hotPatchable: false,
    refreshRequired: false,
    affectedQueues: [{
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: input.currentGeneration,
      currentGeneration: input.currentGeneration,
      requestedGeneration: input.requestedGeneration ?? input.currentGeneration,
      outcome: 'deferred',
      hotPatchable: false,
      refreshRequired: false,
      reason: 'review-feedback-deferred',
      removedRowIds: [],
      insertedRows: [],
      updatedRows: [],
      reorderHints: [],
      counterGeneration: null,
      counters: null,
      deferred: {
        reason: 'review-feedback',
        scheduled: true,
        coalesced: input.coalesced,
        queuedAt: input.queuedAt,
      },
    }],
  };
}

function buildRefreshRequiredQueueImpact(input: {
  queueType: QueueType;
  reason: BackendReviewFeedbackQueueImpactEntry['reason'];
  policyHash?: string | null;
  currentGeneration?: number | null;
  requestedGeneration?: number | null;
}): BackendReviewFeedbackQueueImpact {
  return {
    hotPatchable: false,
    refreshRequired: true,
    affectedQueues: [{
      queueType: input.queueType,
      policyHash: input.policyHash ?? null,
      generation: input.currentGeneration ?? null,
      currentGeneration: input.currentGeneration ?? null,
      requestedGeneration: input.requestedGeneration ?? null,
      outcome: 'refresh-required',
      hotPatchable: false,
      refreshRequired: true,
      reason: input.reason,
      removedRowIds: [],
      insertedRows: [],
      updatedRows: [],
      reorderHints: [],
      counterGeneration: null,
      counters: null,
    }],
  };
}

function buildUnavailableQueueImpact(input: {
  queueType: QueueType;
  reason: BackendReviewFeedbackQueueImpactEntry['reason'];
  unavailableReason: string;
  policyHash?: string | null;
  currentGeneration?: number | null;
  requestedGeneration?: number | null;
}): BackendReviewFeedbackQueueImpact {
  return {
    hotPatchable: false,
    refreshRequired: false,
    affectedQueues: [{
      queueType: input.queueType,
      policyHash: input.policyHash ?? null,
      generation: input.currentGeneration ?? null,
      currentGeneration: input.currentGeneration ?? null,
      requestedGeneration: input.requestedGeneration ?? null,
      outcome: 'unavailable',
      unavailableReason: input.unavailableReason,
      hotPatchable: false,
      refreshRequired: false,
      reason: input.reason,
      removedRowIds: [],
      insertedRows: [],
      updatedRows: [],
      reorderHints: [],
      counterGeneration: null,
      counters: null,
    }],
  };
}

function buildQueueProjectionDelta(input: {
  previousRows: QueueProjectionRow[];
  nextRows: QueueProjectionRow[];
}): {
  removedRowIds: string[];
  insertedRows: QueueProjectionRow[];
  updatedRows: QueueProjectionRow[];
  reorderHints: BackendReviewFeedbackQueueImpactReorderHint[];
} {
  const previousByRowId = new Map(input.previousRows.map((row) => [row.rowId, row] as const));
  const nextByRowId = new Map(input.nextRows.map((row) => [row.rowId, row] as const));
  const removedRowIds = input.previousRows
    .filter((row) => !nextByRowId.has(row.rowId))
    .map((row) => row.rowId);
  const insertedRows: QueueProjectionRow[] = [];
  const updatedRows: QueueProjectionRow[] = [];
  const reorderHints: BackendReviewFeedbackQueueImpactReorderHint[] = [];

  for (const nextRow of input.nextRows) {
    const previousRow = previousByRowId.get(nextRow.rowId);
    if (!previousRow) {
      insertedRows.push(nextRow);
      reorderHints.push({
        rowId: nextRow.rowId,
        cardId: nextRow.cardId,
        sortKey: nextRow.sortKey,
        queueIndexHint: nextRow.queueIndexHint,
        reason: 'inserted',
      });
      continue;
    }

    if (queueProjectionRowSignature(previousRow) !== queueProjectionRowSignature(nextRow)) {
      updatedRows.push(nextRow);
      if (
        previousRow.sortKey !== nextRow.sortKey
        || previousRow.queueIndexHint !== nextRow.queueIndexHint
      ) {
        reorderHints.push({
          rowId: nextRow.rowId,
          cardId: nextRow.cardId,
          sortKey: nextRow.sortKey,
          queueIndexHint: nextRow.queueIndexHint,
          previousSortKey: previousRow.sortKey,
          previousQueueIndexHint: previousRow.queueIndexHint,
          reason: 'updated',
        });
      }
    }
  }

  for (const rowId of removedRowIds) {
    const previousRow = previousByRowId.get(rowId);
    if (previousRow) {
      reorderHints.push({
        rowId,
        cardId: previousRow.cardId,
        sortKey: null,
        queueIndexHint: null,
        previousSortKey: previousRow.sortKey,
        previousQueueIndexHint: previousRow.queueIndexHint,
        reason: 'removed',
      });
    }
  }

  return {
    removedRowIds,
    insertedRows,
    updatedRows,
    reorderHints,
  };
}

function queueProjectionRowSignature(row: QueueProjectionRow): string {
  return JSON.stringify({
    cardId: row.cardId,
    blockId: row.blockId,
    deckId: row.deckId,
    membershipReason: row.membershipReason,
    dueAt: row.dueAt,
    dueBucket: row.dueBucket,
    priorityScore: row.priorityScore,
    sortKey: row.sortKey,
    queueIndexHint: row.queueIndexHint,
    payload: row.payload,
  });
}

function buildDeferredReviewFeedbackNextRows(input: {
  queueType: ProjectionWorkerQueueType;
  previousRows: QueueProjectionRow[];
  reviewedCard: FSRSCard;
  rating: number;
  nextGeneration: number;
  updatedAt: number;
}): QueueProjectionRow[] | null {
  const targetRows = input.previousRows.filter((row) => rowMatchesReviewedCard(row, input.reviewedCard));
  if (targetRows.length === 0) {
    return null;
  }

  const remainingRows = input.previousRows.filter((row) => !rowMatchesReviewedCard(row, input.reviewedCard));
  const shouldMoveFinalDrillToTail = input.queueType === QueueType.FinalDrill && input.rating < 4;
  const nextRows = shouldMoveFinalDrillToTail
    ? [...remainingRows, ...targetRows]
    : remainingRows;

  return reindexDeferredProjectionRows(nextRows, {
    nextGeneration: input.nextGeneration,
    updatedAt: input.updatedAt,
  });
}

function rowMatchesReviewedCard(row: QueueProjectionRow, card: FSRSCard): boolean {
  const identities = new Set(
    [card.id, card.blockId, card.riffCardId]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  return identities.has(String(row.rowId || '').trim())
    || identities.has(String(row.cardId || '').trim())
    || identities.has(String(row.blockId || '').trim());
}

function reindexDeferredProjectionRows(
  rows: QueueProjectionRow[],
  input: { nextGeneration: number; updatedAt: number },
): QueueProjectionRow[] {
  return rows.map((row, index) => {
    const queueIndexHint = index + 1;
    return {
      ...row,
      queueIndexHint,
      sortKey: buildProjectionSortKeyFromRow(row, queueIndexHint),
      sourceGeneration: input.nextGeneration,
      updatedAt: input.updatedAt,
      payload: {
        ...row.payload,
        queueIndexHint,
      },
    };
  });
}

function buildProjectionSortKeyFromRow(row: QueueProjectionRow, queueIndexHint: number): string {
  const indexPart = String(queueIndexHint).padStart(9, '0');
  const duePart = String(Math.max(0, Number(row.dueAt) || 0)).padStart(16, '0');
  const priorityPart = String(Math.max(0, Math.min(100, Math.floor(Number(row.priorityScore) || 0)))).padStart(3, '0');
  return `${indexPart}:${duePart}:${priorityPart}:${row.rowId || row.cardId}`;
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
