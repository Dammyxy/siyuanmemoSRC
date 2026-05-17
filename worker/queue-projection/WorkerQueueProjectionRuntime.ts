import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import type { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import {
  type QueueProjectionCounters,
  type QueueProjectionDueBucket,
  type QueueProjectionRow,
} from '@/application/ports/QueueProjectionPort';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type {
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendQueueProjectionSnapshotRow,
} from '../../packages/contracts/src/backend-rpc';

export type ProjectionWorkerQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning
  | QueueType.FilterGroup
  | QueueType.FinalDrill
  | QueueType.Leech
  | QueueType.NeuralRoam;

export function isProjectionWorkerQueueType(queueType: string): queueType is ProjectionWorkerQueueType {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning
    || queueType === QueueType.FilterGroup
    || queueType === QueueType.FinalDrill
    || queueType === QueueType.Leech
    || queueType === QueueType.NeuralRoam;
}

export type WorkerQueueProjectionRuntimeDeps = {
  repository: Pick<SqlUnifiedStorageRepository, 'getCardsByIds'>;
  queueProjection: Pick<
    SqlQueueProjectionRepository,
    'readGeneration' | 'readCounters' | 'readRows' | 'replaceQueueProjection'
  > | null;
  runtime: Pick<RuntimeSqliteDatabaseService, 'runTransaction'>;
};

export class WorkerQueueProjectionRuntime {
  constructor(private readonly deps: WorkerQueueProjectionRuntimeDeps) {}

  async snapshot(
    request: BackendQueueProjectionSnapshotRequest,
  ): Promise<BackendQueueProjectionSnapshotResult> {
    const queueType = resolveProjectionQueueType(request.queueType);
    if (!queueType || !this.deps.queueProjection) {
      return buildUnavailableProjectionSnapshotResult(request.queueType);
    }

    const generation = this.deps.queueProjection.readGeneration(queueType);
    if (!generation) {
      return buildUnavailableProjectionSnapshotResult(queueType);
    }

    const policyHash = normalizeOptionalString(request.policyHash) ?? generation.policyHash;
    const requestedGeneration = normalizeOptionalInteger(request.generation) ?? generation.generation;
    const counters = this.deps.queueProjection.readCounters(queueType, policyHash);
    if (generation.status !== 'ready') {
      return {
        queueType,
        policyHash,
        generation: generation.generation,
        status: generation.status,
        rows: [],
        counters,
      };
    }

    const rows = this.deps.queueProjection.readRows({
      queueType,
      policyHash,
      generation: requestedGeneration,
      limit: request.limit,
      offset: request.offset,
    });
    const cards = this.deps.repository.getCardsByIds(rows.map((row) => row.cardId));
    const snapshotRows = buildProjectionSnapshotRows(rows, cards);
    return {
      queueType,
      policyHash,
      generation: requestedGeneration,
      status: 'ready',
      rows: snapshotRows,
      counters: reconcileActiveProjectionCounters({
        queueType,
        policyHash,
        generation: requestedGeneration,
        counters,
        rows: snapshotRows,
      }),
    };
  }

  async rowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> {
    const queueType = resolveProjectionQueueType(request.queueType);
    const ids = uniqueStrings(Array.isArray(request.ids) ? request.ids : []);
    if (!queueType || !this.deps.queueProjection || ids.length === 0) {
      return {
        ...buildUnavailableProjectionSnapshotResult(request.queueType),
        cards: [],
      };
    }

    const generation = this.deps.queueProjection.readGeneration(queueType);
    if (!generation) {
      return {
        ...buildUnavailableProjectionSnapshotResult(queueType),
        cards: [],
      };
    }

    const policyHash = normalizeOptionalString(request.policyHash) ?? generation.policyHash;
    const requestedGeneration = normalizeOptionalInteger(request.generation) ?? generation.generation;
    if (generation.status !== 'ready') {
      return {
        queueType,
        policyHash,
        generation: generation.generation,
        status: generation.status,
        rows: [],
        cards: [],
      };
    }

    const projectionRows = this.deps.queueProjection.readRows({
      queueType,
      policyHash,
      generation: requestedGeneration,
      limit: 5000,
    });
    const rowByIdentity = new Map<string, QueueProjectionRow>();
    for (const row of projectionRows) {
      if (row.rowId) {
        rowByIdentity.set(row.rowId, row);
      }
      if (row.cardId) {
        rowByIdentity.set(row.cardId, row);
      }
      if (row.blockId) {
        rowByIdentity.set(row.blockId, row);
      }
    }

    const orderedRows = ids
      .map((id) => rowByIdentity.get(id))
      .filter((row): row is QueueProjectionRow => Boolean(row));
    const cards = this.deps.repository.getCardsByIds(orderedRows.map((row) => row.cardId));
    const activeCardIds = new Set(cards.map((card) => String(card.id || '').trim()).filter(Boolean));
    const activeRows = orderedRows.filter((row) => activeCardIds.has(String(row.cardId || '').trim()));
    return {
      queueType,
      policyHash,
      generation: requestedGeneration,
      status: 'ready',
      rows: buildProjectionSnapshotRows(activeRows, cards),
      cards,
    };
  }

  async replace(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> {
    const queueType = resolveProjectionQueueType(request.queueType);
    if (!queueType || !this.deps.queueProjection) {
      throw new Error(`BACKEND_UNAVAILABLE: queue projection storage unavailable for ${String(request.queueType || '')}`);
    }

    const policyHash = normalizeOptionalString(request.policyHash);
    if (!policyHash) {
      throw new Error('INVALID_REQUEST: queue.projection.replace requires policyHash');
    }

    const previousGeneration = this.deps.queueProjection.readGeneration(queueType);
    const generation = normalizeOptionalInteger(request.generation)
      ?? Math.max(1, Number(previousGeneration?.generation || 0) + 1);
    if (!Number.isFinite(generation) || generation <= 0) {
      throw new Error('INVALID_REQUEST: queue.projection.replace requires a positive generation');
    }

    const updatedAt = Date.now();
    const rows = normalizeProjectionReplaceRows({
      queueType,
      policyHash,
      generation,
      rows: request.rows,
      updatedAt,
    });
    const counters = buildQueueProjectionCountersFromRows({
      queueType,
      policyHash,
      generation,
      updatedAt,
      now: updatedAt,
      rows,
    });
    const reason = normalizeOptionalString(request.reason) ?? 'explicit-repair';
    const metadata = request.metadata && typeof request.metadata === 'object'
      ? { ...request.metadata }
      : {};

    await this.deps.runtime.runTransaction('queue.projection.replace', () => {
      this.deps.queueProjection!.replaceQueueProjection({
        queueType,
        policyHash,
        generation,
        rows,
        counters,
        metadata: {
          ...metadata,
          reason,
          materializedBy: 'application',
        },
      });
    });

    return {
      queueType,
      policyHash,
      generation,
      status: 'ready',
      rows: rows.length,
      counters,
    };
  }
}

export function resolveProjectionQueueType(queueType: string): ProjectionWorkerQueueType | null {
  if (isProjectionWorkerQueueType(queueType)) {
    return queueType;
  }
  return null;
}

export function buildQueueProjectionCountersFromRows(input: {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  updatedAt: number;
  now: number;
  rows: QueueProjectionRow[];
}): QueueProjectionCounters {
  const buckets = {
    all: 0,
    item: 0,
    descriptor: 0,
    topic: 0,
    concept: 0,
  };
  let currentLearningDue = 0;
  let todayReviewDue = 0;
  let allowedNew = 0;

  for (const row of input.rows) {
    buckets.all += 1;
    buckets[resolveQueueProjectionCounterBucket(row)] += 1;
    if (row.membershipReason === 'learning-due') {
      currentLearningDue += 1;
    } else if (row.membershipReason === 'review-due') {
      todayReviewDue += 1;
    } else if (row.membershipReason === 'new') {
      allowedNew += 1;
    }
  }

  return {
    queueType: input.queueType,
    policyHash: input.policyHash,
    generation: input.generation,
    version: input.generation,
    remaining: input.rows.length,
    due: input.rows.length,
    total: input.rows.length,
    currentLearningDue,
    todayReviewDue,
    allowedNew,
    scheduledTotal: input.rows.length,
    buckets,
    updatedAt: input.updatedAt,
  };
}

function buildUnavailableProjectionSnapshotResult(queueType: unknown): BackendQueueProjectionSnapshotResult {
  return {
    queueType: String(queueType || ''),
    policyHash: null,
    generation: null,
    status: 'unavailable',
    rows: [],
    counters: null,
  };
}

function normalizeProjectionReplaceRows(input: {
  queueType: ProjectionWorkerQueueType;
  policyHash: string;
  generation: number;
  rows: unknown;
  updatedAt: number;
}): QueueProjectionRow[] {
  if (!Array.isArray(input.rows)) {
    throw new Error('INVALID_REQUEST: queue.projection.replace requires rows array');
  }

  return input.rows.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} must be an object`);
    }
    const row = candidate as Record<string, unknown>;
    const rowId = normalizeOptionalString(row.rowId);
    const cardId = normalizeOptionalString(row.cardId);
    const membershipReason = normalizeOptionalString(row.membershipReason);
    const sortKey = normalizeOptionalString(row.sortKey);
    const dueBucket = normalizeProjectionDueBucket(row.dueBucket);
    if (!rowId || !cardId || !membershipReason || !sortKey || !dueBucket) {
      throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} is missing required projection fields`);
    }
    const priorityScore = Number(row.priorityScore);
    if (!Number.isFinite(priorityScore)) {
      throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} priorityScore must be finite`);
    }
    const payload = row.payload && typeof row.payload === 'object'
      ? { ...(row.payload as Record<string, unknown>) }
      : null;
    if (!payload) {
      throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} payload must be an object`);
    }

    return {
      queueType: input.queueType,
      rowId,
      cardId,
      blockId: normalizeOptionalString(row.blockId),
      deckId: normalizeOptionalString(row.deckId),
      membershipReason,
      dueAt: normalizeOptionalInteger(row.dueAt),
      dueBucket,
      priorityScore,
      sortKey,
      queueIndexHint: normalizeOptionalInteger(row.queueIndexHint),
      policyHash: input.policyHash,
      sourceGeneration: input.generation,
      payload,
      updatedAt: normalizeOptionalInteger(row.updatedAt) ?? input.updatedAt,
    };
  });
}

function buildProjectionSnapshotRows(
  projectionRows: QueueProjectionRow[],
  cards: FSRSCard[],
): BackendQueueProjectionSnapshotRow[] {
  const cardById = new Map<string, FSRSCard>();
  for (const card of cards) {
    cardById.set(String(card.id || ''), card);
  }

  return projectionRows
    .map<BackendQueueProjectionSnapshotRow | null>((row, index) => {
      const card = cardById.get(row.cardId);
      if (!card) {
        return null;
      }
      const queueIndex = Number.isFinite(Number(row.queueIndexHint))
        ? Number(row.queueIndexHint)
        : index + 1;
      const snapshot = buildQueueSnapshotRow(card, { queueIndex });
      return {
        ...snapshot,
        id: row.rowId || snapshot.id,
        fsrsCardId: row.cardId || snapshot.fsrsCardId,
        blockId: row.blockId || snapshot.blockId,
        deckId: row.deckId || snapshot.deckId,
        queueIndex,
        tags: [...snapshot.tags],
      };
    })
    .filter((row): row is BackendQueueProjectionSnapshotRow => Boolean(row));
}

function reconcileActiveProjectionCounters(input: {
  queueType: ProjectionWorkerQueueType;
  policyHash: string;
  generation: number;
  counters: BackendQueueProjectionSnapshotResult['counters'];
  rows: BackendQueueProjectionSnapshotRow[];
}): BackendQueueProjectionSnapshotResult['counters'] {
  const buckets = {
    all: 0,
    item: 0,
    descriptor: 0,
    topic: 0,
    concept: 0,
  };
  const now = Date.now();
  let due = 0;
  for (const row of input.rows) {
    buckets.all += 1;
    const cardType = String(row.cardType || '').trim();
    if (cardType === CardType.Descriptor) {
      buckets.descriptor += 1;
    } else if (cardType === CardType.Topic) {
      buckets.topic += 1;
    } else if (cardType === CardType.Concept) {
      buckets.concept += 1;
    } else {
      buckets.item += 1;
    }
    if (Number(row.due) <= now) {
      due += 1;
    }
  }

  return {
    queueType: input.queueType,
    policyHash: input.policyHash,
    generation: input.generation,
    version: Math.max(0, Math.floor(Number(input.counters?.version || input.generation))),
    remaining: input.rows.length,
    due,
    total: input.rows.length,
    buckets,
    updatedAt: Math.max(0, Math.floor(Number(input.counters?.updatedAt || now))),
  };
}

function resolveQueueProjectionCounterBucket(row: QueueProjectionRow): 'item' | 'descriptor' | 'topic' | 'concept' {
  const cardType = String(row.payload.cardType || CardType.Item);
  if (cardType === CardType.Descriptor) {
    return 'descriptor';
  }
  if (cardType === CardType.Topic) {
    return 'topic';
  }
  if (cardType === CardType.Concept) {
    return 'concept';
  }
  return 'item';
}

function normalizeProjectionDueBucket(value: unknown): QueueProjectionDueBucket | null {
  const normalized = normalizeOptionalString(value);
  if (
    normalized === 'overdue'
    || normalized === 'due'
    || normalized === 'future'
    || normalized === 'new'
    || normalized === 'manual'
    || normalized === 'blocked'
  ) {
    return normalized;
  }
  return null;
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

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
