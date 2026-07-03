import type { QueueType } from '@/types/unified-data-source';

export type QueueProjectionDueBucket = 'overdue' | 'due' | 'future' | 'new' | 'manual' | 'blocked';
export type QueueProjectionGenerationStatus = 'ready' | 'invalidated' | 'rebuilding' | 'repairing' | 'unavailable';
export type QueueProjectionRebuildStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface QueueProjectionRow {
  queueType: QueueType;
  rowId: string;
  cardId: string;
  blockId: string | null;
  deckId: string | null;
  membershipReason: string;
  dueAt: number | null;
  dueBucket: QueueProjectionDueBucket;
  priorityScore: number;
  sortKey: string;
  queueIndexHint: number | null;
  policyHash: string;
  sourceGeneration: number;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface QueueProjectionSourceCardFingerprint {
  version: 1;
  fingerprint: string;
  cardId: string;
  blockId: string | null;
  state: number | string;
  due: number | null;
  priority: number | null;
  reps: number;
  lapses: number;
  lastReview: number | null;
  elapsedDays: number | null;
  scheduledDays: number | null;
  stability: number | null;
  difficulty: number | null;
  cardType: number | string;
  schedulerType: string | null;
  aFactor: number | null;
}

export interface QueueProjectionCounterBuckets {
  all: number;
  item: number;
  descriptor: number;
  topic: number;
  concept: number;
}

export interface QueueProjectionCounters {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  version: number;
  remaining: number;
  due: number;
  total: number;
  currentLearningDue?: number;
  todayReviewDue?: number;
  allowedNew?: number;
  learnAheadAvailable?: number;
  scheduledTotal?: number;
  buckets: QueueProjectionCounterBuckets;
  updatedAt: number;
}

export interface QueueProjectionGeneration {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  status: QueueProjectionGenerationStatus;
  rebuildReason: string | null;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface QueueProjectionInvalidationRecord {
  id: string;
  queueType: QueueType;
  reason: string;
  affectedCardIds: string[];
  affectedBlockIds: string[];
  generation: number;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface QueueProjectionRebuildRecord {
  id: string;
  queueType: QueueType;
  reason: string;
  policyHash: string;
  generation: number;
  status: QueueProjectionRebuildStatus;
  startedAt: number;
  completedAt: number | null;
  metadata: Record<string, unknown>;
}

export interface QueueProjectionRowsQuery {
  queueType: QueueType;
  policyHash?: string | null;
  generation?: number | null;
  limit?: number | null;
  offset?: number | null;
}

export interface QueueProjectionReplaceInput {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  rows: QueueProjectionRow[];
  counters: QueueProjectionCounters;
  metadata?: Record<string, unknown>;
}

export interface QueueProjectionDelta {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  upsertRows?: QueueProjectionRow[];
  removeRowIds?: string[];
  counters?: QueueProjectionCounters | null;
  invalidation?: Omit<QueueProjectionInvalidationRecord, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  };
}

export interface QueueProjectionInvalidationInput {
  queueTypes: QueueType[];
  reason: string;
  affectedCardIds?: string[];
  affectedBlockIds?: string[];
  generation: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export interface QueueProjectionRebuildCommand {
  queueType: QueueType;
  reason: string;
  policyHash: string;
  generation: number;
  startedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface QueueProjectionDiagnostics {
  queueType: QueueType;
  policyHash: string | null;
  generation: number | null;
  projectionRowCount: number;
  projectionCounterTotal: number | null;
  sourceTruthCount: number;
  mismatch: boolean;
  checkedAt: number;
}

export interface QueueProjectionReadPort {
  readRows(query: QueueProjectionRowsQuery): QueueProjectionRow[];
  readRowsByIds(queueType: QueueType, rowIds: string[], policyHash?: string | null): QueueProjectionRow[];
  readCounters(queueType: QueueType, policyHash?: string | null): QueueProjectionCounters | null;
  readGeneration(queueType: QueueType): QueueProjectionGeneration | null;
  listReadyGenerations(queueType: QueueType): QueueProjectionGeneration[];
  readLastReadyGeneration(queueType: QueueType): QueueProjectionGeneration | null;
  listInvalidations(queueType: QueueType, limit?: number): QueueProjectionInvalidationRecord[];
}

export interface QueueProjectionWritePort {
  replaceQueueProjection(input: QueueProjectionReplaceInput): void;
  applyQueueProjectionDelta(delta: QueueProjectionDelta): void;
  invalidateQueues(input: QueueProjectionInvalidationInput): QueueProjectionInvalidationRecord[];
  beginRebuild(command: QueueProjectionRebuildCommand): QueueProjectionRebuildRecord;
  completeRebuild(id: string, status: Extract<QueueProjectionRebuildStatus, 'completed' | 'failed'>, metadata?: Record<string, unknown>): QueueProjectionRebuildRecord | null;
}

export interface QueueProjectionDiagnosticsPort {
  compareCounts(input: {
    queueType: QueueType;
    sourceTruthCount: number;
    policyHash?: string | null;
    checkedAt?: number;
  }): QueueProjectionDiagnostics;
}

export interface QueueProjectionRepositoryPort
  extends QueueProjectionReadPort,
    QueueProjectionWritePort,
    QueueProjectionDiagnosticsPort {}
