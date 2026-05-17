import { buildQueueProjectionRows } from '@/application/services/queue-projection/QueueProjectionBuilder';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import { QueueType } from '@/types/unified-data-source';
import { SchedulerRouter } from '@/core/scheduler';
import type { SchedulerType } from '@/core/scheduler/schedulerPolicy';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import { createReviewLogV2 } from '@/types/review';
import { CardType, type FSRSCard } from '@/types/card';
import { DEFAULT_SETTINGS, type FSRSParameters } from '@/types/settings';
import type { StructuredCardQuery } from '@/types/card-query';
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
import { buildQueueProjectionCountersFromRows } from '../queue-projection/WorkerQueueProjectionRuntime';

type ProjectionWorkerQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning
  | QueueType.FilterGroup
  | QueueType.FinalDrill
  | QueueType.Leech
  | QueueType.NeuralRoam;

type SrsProjectionWorkerQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

export type WorkerReviewFeedbackRuntimeDeps = {
  repository: Pick<SqlUnifiedStorageRepository, 'getCard' | 'upsertCards' | 'queryCards'>;
  queueProjection: Pick<SqlQueueProjectionRepository, 'readGeneration' | 'readRows' | 'applyQueueProjectionDelta'> | null;
  runtime: Pick<RuntimeSqliteDatabaseService, 'runTransaction' | 'run'>;
  recordUnavailable?: () => void;
};

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

    const schedulerConfig = resolveWorkerReviewSchedulerConfig(request);
    return await this.deps.runtime.runTransaction('review.feedback', async () => {
      const card = this.deps.repository.getCard(cardId);
      if (!card) {
        throw new Error(`review.feedback card not found: ${cardId}`);
      }

      const scheduler = new SchedulerRouter(
        {
          defaultScheduler: schedulerConfig.defaultScheduler,
          fsrsParams: schedulerConfig.fsrsParams,
        },
        {
          batchUpdateCardsWithoutEvents: async (cards) => {
            this.deps.repository.upsertCards(
              cards.map((c) => canonicalizeSchedulingState(c, {
                source: 'review-commit',
                mode: 'assert-internal',
              }).card),
            );
          },
          addReviewLogV2: async () => undefined,
        },
      );

      const decision = scheduler.answer(card, rating, {
        queueType,
        queueMode,
        commitPolicy: commitPolicy as 'write-schedule' | 'preview-only' | 'drill-only',
        source: 'queue',
        sessionId: request.sessionId,
        reviewTime: reviewedAt,
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
          isDrill: decision.attempt.isDrill,
          isFiltered: decision.attempt.isFiltered,
          customStudy: decision.attempt.customStudy,
        });
        const month = new Date(log.reviewedAt);
        this.deps.runtime.run(
          `INSERT OR REPLACE INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            log.cardId,
            log.attemptId,
            log.rating,
            log.reviewedAt,
            month.getFullYear(),
            month.getMonth() + 1,
            'review-v2',
            JSON.stringify(log),
          ],
        );
      }
      const queueImpact = this.buildReviewFeedbackQueueImpact({
        queueType,
        request,
        reviewedCard: card,
        reviewedAt,
        committed: commitResult.committed,
        updatedCard: commitResult.updatedCard ?? null,
      });

      return {
        cardId,
        committed: commitResult.committed,
        reviewedAt,
        queueType,
        updatedCard: commitResult.updatedCard ?? null,
        queueImpact,
      };
    });
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
    if (isSrsProjectionQueueType(projectionQueueType) && (!input.committed || !input.updatedCard)) {
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
    if (!isSrsProjectionQueueType(projectionQueueType)) {
      return this.buildDeferredReviewFeedbackQueueImpact({
        queueType: projectionQueueType,
        policyHash,
        requestedGeneration,
        requestedCurrentGeneration: currentGeneration.generation,
        hasGenerationMismatch,
        request: input.request,
        reviewedCard: input.reviewedCard,
        committed: input.committed,
        reviewedAt: input.reviewedAt,
      });
    }

    const previousRows = this.deps.queueProjection.readRows({
      queueType: projectionQueueType,
      policyHash,
      limit: 5000,
    });
    const nextGeneration = currentGeneration.generation + 1;
    const updatedAt = input.reviewedAt;
    const dayEnd = getDayEndForTimestamp(
      input.reviewedAt,
      normalizeDayStartHour(DEFAULT_SETTINGS.fsrs.dayStartHour),
    );
    const baseCards = this.readProjectionSourceCards(projectionQueueType, dayEnd);
    const buildResult = buildQueueProjectionRows({
      queueType: projectionQueueType,
      baseCards,
      now: input.reviewedAt,
      dayEnd,
      newCardsPerDay: DEFAULT_SETTINGS.newCardsPerDay,
      reviewsPerDay: DEFAULT_SETTINGS.reviewsPerDay,
      priorityRandomness: DEFAULT_SETTINGS.priorityRandomness,
      learnAheadWindowEnd: input.reviewedAt
        + DEFAULT_SETTINGS.scheduler.srsV2.learnAhead.windowMinutes * 60 * 1000,
      learnAheadMaxCards: DEFAULT_SETTINGS.scheduler.srsV2.learnAhead.maxCards,
      stableSalt: `${projectionQueueType}:${policyHash}`,
      policyHash,
      sourceGeneration: nextGeneration,
      updatedAt,
    });

    const nextRows = buildResult.rows;
    const delta = buildQueueProjectionDelta({
      previousRows,
      nextRows,
    });

    this.deps.queueProjection.applyQueueProjectionDelta({
      queueType: projectionQueueType,
      policyHash,
      generation: nextGeneration,
      removeRowIds: delta.removedRowIds,
      upsertRows: nextRows,
      counters: buildResult.counters,
      invalidation: {
        queueType: projectionQueueType,
        reason: 'review-feedback',
        affectedCardIds: [input.updatedCard.id],
        affectedBlockIds: input.updatedCard.blockId ? [input.updatedCard.blockId] : [],
        generation: nextGeneration,
        metadata: {
          reviewedCardId: input.updatedCard.id,
          hotPatchable: true,
        },
      },
    });

    if (hasGenerationMismatch) {
      return buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'generation-mismatch',
        policyHash,
        currentGeneration: nextGeneration,
        requestedGeneration,
      });
    }

    const affectedQueue: BackendReviewFeedbackQueueImpactEntry = {
      queueType: projectionQueueType,
      policyHash,
      generation: nextGeneration,
      currentGeneration: nextGeneration,
      requestedGeneration: requestedGeneration ?? currentGeneration.generation,
      hotPatchable: true,
      refreshRequired: false,
      reason: 'review-feedback',
      removedRowIds: delta.removedRowIds,
      insertedRows: delta.insertedRows,
      updatedRows: delta.updatedRows,
      reorderHints: delta.reorderHints,
      counterGeneration: buildResult.counters.generation,
      counters: buildResult.counters,
    };

    return {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [affectedQueue],
    };
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

    const previousRows = this.deps.queueProjection.readRows({
      queueType: input.queueType,
      policyHash: input.policyHash,
      limit: 5000,
    });
    const nextGeneration = input.requestedCurrentGeneration + 1;
    const nextRows = buildDeferredReviewFeedbackNextRows({
      queueType: input.queueType,
      previousRows,
      reviewedCard: input.reviewedCard,
      rating: Number(input.request.rating),
      nextGeneration,
      updatedAt: input.reviewedAt,
    });
    if (!nextRows) {
      return buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'review-feedback',
        policyHash: input.policyHash,
        currentGeneration: input.requestedCurrentGeneration,
        requestedGeneration: input.requestedGeneration,
      });
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

    this.deps.queueProjection.applyQueueProjectionDelta({
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
          hotPatchable: true,
        },
      },
    });

    if (input.hasGenerationMismatch) {
      return buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'generation-mismatch',
        policyHash: input.policyHash,
        currentGeneration: nextGeneration,
        requestedGeneration: input.requestedGeneration,
      });
    }

    const affectedQueue: BackendReviewFeedbackQueueImpactEntry = {
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: nextGeneration,
      currentGeneration: nextGeneration,
      requestedGeneration: input.requestedGeneration ?? input.requestedCurrentGeneration,
      hotPatchable: true,
      refreshRequired: false,
      reason: 'review-feedback',
      removedRowIds: delta.removedRowIds,
      insertedRows: delta.insertedRows,
      updatedRows: delta.updatedRows,
      reorderHints: delta.reorderHints,
      counterGeneration: counters.generation,
      counters,
    };

    return {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [affectedQueue],
    };
  }

  private readProjectionSourceCards(
    queueType: SrsProjectionWorkerQueueType,
    dayEnd: number,
  ): FSRSCard[] {
    const cardTypes = queueType === QueueType.RetrievalPractice
      ? [CardType.Item, CardType.Descriptor]
      : [
        CardType.Item,
        CardType.Descriptor,
        CardType.Topic,
        CardType.Concept,
        CardType.Incremental,
        CardType.Webpage,
      ];
    return this.deps.repository.queryCards({
      cardTypes,
      dueDate: { lte: dayEnd },
      includeSuspended: false,
      sourceStatus: 'active',
    } satisfies StructuredCardQuery);
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

function isSrsProjectionQueueType(queueType: ProjectionWorkerQueueType): queueType is SrsProjectionWorkerQueueType {
  return queueType === QueueType.RetrievalPractice || queueType === QueueType.IncrementalLearning;
}

function resolveProjectionQueueType(queueType: string): ProjectionWorkerQueueType | null {
  if (isProjectionWorkerQueueType(queueType)) {
    return queueType;
  }
  return null;
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

function getDayEndForTimestamp(timestamp: number, dayStartHour: number): number {
  const now = new Date(timestamp);
  const start = new Date(now);
  if (now.getHours() < dayStartHour) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(dayStartHour, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  return start.getTime();
}

function normalizeDayStartHour(value: unknown): number {
  const hour = Math.floor(Number(value));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4;
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
