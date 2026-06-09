import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import type { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import {
  type QueueProjectionCounters,
  type QueueProjectionDueBucket,
  type QueueProjectionRow,
  type QueueProjectionSourceCardFingerprint,
} from '@/application/ports/QueueProjectionPort';
import { buildQueueProjectionSourceCardFingerprint } from '@/application/services/queue-projection/QueueProjectionBuilder';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type {
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  type BackendQueueProjectionCacheState,
  type BackendQueueProjectionFreshnessEvidence,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendQueueProjectionSnapshotRow,
} from '../../packages/contracts/src/backend-rpc';

type WorkerQueueProjectionTransactionRuntime = Pick<RuntimeSqliteDatabaseService, 'runTransaction'>;

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
  repository: Pick<SqlUnifiedStorageRepository, 'getCardsByExactIds'>;
  queueProjection: Pick<
    SqlQueueProjectionRepository,
    'readGeneration' | 'readLastReadyGeneration' | 'readCounters' | 'readRows' | 'replaceQueueProjection'
  > | null;
  runtime: WorkerQueueProjectionTransactionRuntime;
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

    const currentGeneration = this.deps.queueProjection.readGeneration(queueType);
    const generation = currentGeneration?.status === 'ready'
      ? currentGeneration
      : request.allowStale === true
        ? this.deps.queueProjection.readLastReadyGeneration(queueType)
        : currentGeneration;
    if (!generation) {
      return buildRefreshingProjectionSnapshotResult({
        queueType,
        policyHash: null,
        generation: null,
        cacheState: 'missing-derived-cache',
      });
    }

    const policyHash = normalizeOptionalString(request.policyHash) ?? generation.policyHash;
    const requestedGeneration = normalizeOptionalInteger(request.generation) ?? generation.generation;
    const counters = this.deps.queueProjection.readCounters(queueType, policyHash);
    if (generation.status !== 'ready') {
      return {
        queueType,
        policyHash,
        generation: generation.generation,
        status: 'refreshing',
        rows: [],
        counters,
        freshness: null,
      };
    }

    const rows = this.deps.queueProjection.readRows({
      queueType,
      policyHash,
      generation: requestedGeneration,
      limit: request.limit,
      offset: request.offset,
    });
    const cards = this.deps.repository.getCardsByExactIds(rows.map((row) => row.cardId));
    const hydrated = buildProjectionSnapshotRows(rows, cards);
    const countersMissingRows = buildCountersMissingRowsFreshnessEvidence({
      counters,
      rows,
      limit: request.limit,
      offset: request.offset,
    });
    const freshness = countersMissingRows
      ? mergeProjectionFreshnessEvidence(countersMissingRows, hydrated.freshness)
      : hydrated.freshness;
    if (!hydrated.freshnessOk || countersMissingRows) {
      const cacheState: BackendQueueProjectionCacheState = countersMissingRows
        ? 'missing-derived-cache'
        : 'stale';
      return {
        queueType,
        policyHash,
        generation: requestedGeneration,
        status: 'refreshing',
        rows: [],
        counters: null,
        freshness,
        cacheState,
      };
    }
    return {
      queueType,
      policyHash,
      generation: requestedGeneration,
      status: 'ready',
      rows: hydrated.rows,
      counters: reconcileActiveProjectionCounters({
        queueType,
        policyHash,
        generation: requestedGeneration,
        counters,
        rows: hydrated.rows,
      }),
      freshness,
      cacheState: hydrated.rows.length === 0 ? 'ready-empty' : 'ready-populated',
      stale: currentGeneration?.status !== 'ready' && request.allowStale === true,
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
        ...buildRefreshingProjectionSnapshotResult({
          queueType,
          policyHash: null,
          generation: null,
          freshness: buildMissingIdentityFreshnessEvidence(ids),
          cacheState: 'missing-derived-cache',
        }),
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
        status: 'refreshing',
        rows: [],
        cards: [],
        freshness: null,
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
    const cards = this.deps.repository.getCardsByExactIds(orderedRows.map((row) => row.cardId));
    const activeCardIds = new Set(cards.map((card) => String(card.id || '').trim()).filter(Boolean));
    const activeRows = orderedRows.filter((row) => activeCardIds.has(String(row.cardId || '').trim()));
    const activeCards = cards.filter((card) => activeCardIds.has(String(card.id || '').trim()));
    const hydrated = buildProjectionSnapshotRows(activeRows, activeCards);
    if (!hydrated.freshnessOk || hydrated.rows.length !== ids.length) {
      const freshness = mergeProjectionFreshnessEvidence(
        buildProjectionFreshnessEvidenceForRequestedIds(ids, orderedRows, cards),
        hydrated.freshness,
      );
      const cacheState: BackendQueueProjectionCacheState = orderedRows.length !== ids.length
        ? 'missing-derived-cache'
        : 'stale';
      return {
        queueType,
        policyHash,
        generation: requestedGeneration,
        status: 'refreshing',
        rows: [],
        cards: [],
        freshness,
        cacheState,
      };
    }
    return {
      queueType,
      policyHash,
      generation: requestedGeneration,
      status: 'ready',
      rows: hydrated.rows,
      cards: activeCards,
      freshness: hydrated.freshness,
      cacheState: hydrated.rows.length === 0 ? 'ready-empty' : 'ready-populated',
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
    freshness: null,
  };
}

function buildRefreshingProjectionSnapshotResult(input: {
  queueType: unknown;
  policyHash: string | null;
  generation: number | null;
  freshness?: BackendQueueProjectionFreshnessEvidence | null;
  cacheState?: BackendQueueProjectionCacheState | null;
}): BackendQueueProjectionSnapshotResult {
  return {
    queueType: String(input.queueType || ''),
    policyHash: input.policyHash,
    generation: input.generation,
    status: 'refreshing',
    rows: [],
    counters: null,
    freshness: input.freshness ?? null,
    cacheState: input.cacheState ?? null,
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
): {
  rows: BackendQueueProjectionSnapshotRow[];
  freshness: BackendQueueProjectionFreshnessEvidence;
  freshnessOk: boolean;
} {
  const cardById = new Map<string, FSRSCard>();
  for (const card of cards) {
    cardById.set(String(card.id || ''), card);
  }
  const freshness = buildProjectionFreshnessEvidence(projectionRows, cards);

  const rows = projectionRows
    .map<BackendQueueProjectionSnapshotRow | null>((row, index) => {
      const card = cardById.get(row.cardId);
      if (!card) {
        return null;
      }
      if (isStaleProjectionMembership(row, card)) {
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
  return {
    rows,
    freshness,
    freshnessOk: freshness.staleRows === 0 && freshness.missingRows === 0 && rows.length === projectionRows.length,
  };
}

function isStaleProjectionMembership(row: QueueProjectionRow, card: FSRSCard): boolean {
  const expected = readSourceCardFingerprint(row.payload);
  if (expected) {
    return expected.fingerprint !== buildQueueProjectionSourceCardFingerprint(card).fingerprint;
  }

  const projectedState = normalizeOptionalInteger((row.payload as Record<string, unknown>).state);
  if (projectedState !== null && projectedState !== Number(card.state)) {
    return true;
  }

  const projectedDue = normalizeOptionalInteger(row.dueAt);
  if (projectedDue !== null && projectedDue !== Number(card.due)) {
    return true;
  }

  return false;
}

function buildProjectionFreshnessEvidence(
  projectionRows: QueueProjectionRow[],
  cards: FSRSCard[],
): BackendQueueProjectionFreshnessEvidence {
  const cardById = new Map(cards.map((card) => [String(card.id || '').trim(), card] as const));
  const staleCardIds: string[] = [];
  const missingCardIds: string[] = [];
  let freshRows = 0;

  for (const row of projectionRows) {
    const cardId = String(row.cardId || '').trim();
    const card = cardById.get(cardId);
    if (!card) {
      missingCardIds.push(cardId);
      continue;
    }
    if (isStaleProjectionMembership(row, card)) {
      staleCardIds.push(cardId);
      continue;
    }
    freshRows += 1;
  }

  return {
    checkedAt: Date.now(),
    totalRows: projectionRows.length,
    freshRows,
    staleRows: staleCardIds.length,
    missingRows: missingCardIds.length,
    staleCardIds,
    missingCardIds,
  };
}

function buildProjectionFreshnessEvidenceForRequestedIds(
  requestedIds: string[],
  projectionRows: QueueProjectionRow[],
  cards: FSRSCard[],
): BackendQueueProjectionFreshnessEvidence {
  const evidence = buildProjectionFreshnessEvidence(projectionRows, cards);
  const foundIdentities = new Set<string>();
  for (const row of projectionRows) {
    foundIdentities.add(String(row.rowId || '').trim());
    foundIdentities.add(String(row.cardId || '').trim());
    foundIdentities.add(String(row.blockId || '').trim());
  }
  const missingRequestedIds = requestedIds
    .map((id) => String(id || '').trim())
    .filter((id) => id && !foundIdentities.has(id));
  return {
    ...evidence,
    totalRows: Math.max(evidence.totalRows, requestedIds.length),
    missingRows: Math.max(evidence.missingRows, missingRequestedIds.length),
    missingCardIds: uniqueStrings([...evidence.missingCardIds, ...missingRequestedIds]),
  };
}

function buildMissingIdentityFreshnessEvidence(ids: string[]): BackendQueueProjectionFreshnessEvidence {
  const missingIds = uniqueStrings(ids);
  return {
    checkedAt: Date.now(),
    totalRows: missingIds.length,
    freshRows: 0,
    staleRows: 0,
    missingRows: missingIds.length,
    staleCardIds: [],
    missingCardIds: missingIds,
  };
}

function buildCountersMissingRowsFreshnessEvidence(input: {
  counters: BackendQueueProjectionSnapshotResult['counters'];
  rows: QueueProjectionRow[];
  limit?: number | null;
  offset?: number | null;
}): BackendQueueProjectionFreshnessEvidence | null {
  if (
    normalizeOptionalInteger(input.limit) !== null
    || normalizeOptionalInteger(input.offset) !== null
  ) {
    return null;
  }
  const counterTotal = Math.max(0, Math.floor(Number(input.counters?.total ?? input.counters?.remaining ?? 0)));
  if (counterTotal <= input.rows.length) {
    return null;
  }
  return {
    checkedAt: Date.now(),
    totalRows: counterTotal,
    freshRows: input.rows.length,
    staleRows: 0,
    missingRows: counterTotal - input.rows.length,
    staleCardIds: [],
    missingCardIds: [],
  };
}

function mergeProjectionFreshnessEvidence(
  primary: BackendQueueProjectionFreshnessEvidence,
  secondary: BackendQueueProjectionFreshnessEvidence,
): BackendQueueProjectionFreshnessEvidence {
  return {
    checkedAt: Math.max(primary.checkedAt, secondary.checkedAt),
    totalRows: Math.max(primary.totalRows, secondary.totalRows),
    freshRows: Math.min(primary.freshRows, secondary.freshRows),
    staleRows: Math.max(primary.staleRows, secondary.staleRows),
    missingRows: Math.max(primary.missingRows, secondary.missingRows),
    staleCardIds: uniqueStrings([...primary.staleCardIds, ...secondary.staleCardIds]),
    missingCardIds: uniqueStrings([...primary.missingCardIds, ...secondary.missingCardIds]),
  };
}

function readSourceCardFingerprint(payload: unknown): QueueProjectionSourceCardFingerprint | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const candidate = (payload as Record<string, unknown>).sourceCardFingerprint;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const record = candidate as Partial<QueueProjectionSourceCardFingerprint>;
  return record.version === 1 && typeof record.fingerprint === 'string' && record.fingerprint.trim()
    ? record as QueueProjectionSourceCardFingerprint
    : null;
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
