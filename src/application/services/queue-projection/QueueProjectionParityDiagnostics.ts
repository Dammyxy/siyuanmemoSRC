import type { QueueSnapshotRow } from '@/types/queue-browser';
import type {
  QueueCounterBuckets,
  QueueCounterSnapshot,
  QueueType,
} from '@/types/unified-data-source';

export interface QueueProjectionParitySnapshot {
  rows: QueueSnapshotRow[];
  counters: QueueCounterSnapshot | null;
}

export interface QueueProjectionParityDiagnosticInput {
  queueType: QueueType;
  generation: number | null;
  policyHash?: string | null;
  checkedAt?: number;
  strategy: QueueProjectionParitySnapshot;
  projection: QueueProjectionParitySnapshot;
}

export interface QueueProjectionParityOrderMismatch {
  index: number;
  strategyRowId: string | null;
  projectionRowId: string | null;
}

export interface QueueProjectionParityCounterDelta {
  remaining: number | null;
  due: number | null;
  total: number | null;
  buckets: QueueCounterBuckets;
}

export interface QueueProjectionParityDiagnostic {
  queueType: QueueType;
  generation: number | null;
  policyHash: string | null;
  checkedAt: number;
  mismatch: boolean;
  rowsMatch: boolean;
  countersMatch: boolean;
  rowCount: {
    strategy: number;
    projection: number;
  };
  counterTotal: {
    strategy: number | null;
    projection: number | null;
  };
  missingProjectionRowIds: string[];
  extraProjectionRowIds: string[];
  orderMismatchAt: QueueProjectionParityOrderMismatch | null;
  counterDelta: QueueProjectionParityCounterDelta;
}

const COUNTER_BUCKET_KEYS: Array<keyof QueueCounterBuckets> = [
  'all',
  'item',
  'descriptor',
  'topic',
  'concept',
];

export function compareQueueProjectionParity(
  input: QueueProjectionParityDiagnosticInput,
): QueueProjectionParityDiagnostic {
  const strategyRowIds = normalizeRowIds(input.strategy.rows);
  const projectionRowIds = normalizeRowIds(input.projection.rows);
  const missingProjectionRowIds = strategyRowIds.filter((id) => !projectionRowIds.includes(id));
  const extraProjectionRowIds = projectionRowIds.filter((id) => !strategyRowIds.includes(id));
  const orderMismatchAt = findOrderMismatch(strategyRowIds, projectionRowIds);
  const counterDelta = buildCounterDelta(input.strategy.counters, input.projection.counters);
  const rowsMatch = missingProjectionRowIds.length === 0
    && extraProjectionRowIds.length === 0
    && orderMismatchAt === null;
  const countersMatch = isCounterDeltaZero(counterDelta);

  return {
    queueType: input.queueType,
    generation: normalizeNullableNumber(input.generation),
    policyHash: normalizeNullableString(input.policyHash),
    checkedAt: input.checkedAt ?? Date.now(),
    mismatch: !rowsMatch || !countersMatch,
    rowsMatch,
    countersMatch,
    rowCount: {
      strategy: strategyRowIds.length,
      projection: projectionRowIds.length,
    },
    counterTotal: {
      strategy: normalizeNullableNumber(input.strategy.counters?.total ?? null),
      projection: normalizeNullableNumber(input.projection.counters?.total ?? null),
    },
    missingProjectionRowIds,
    extraProjectionRowIds,
    orderMismatchAt,
    counterDelta,
  };
}

function normalizeRowIds(rows: QueueSnapshotRow[]): string[] {
  return rows
    .map((row) => String(row.id || row.fsrsCardId || '').trim())
    .filter(Boolean);
}

function findOrderMismatch(
  strategyRowIds: string[],
  projectionRowIds: string[],
): QueueProjectionParityOrderMismatch | null {
  const length = Math.max(strategyRowIds.length, projectionRowIds.length);
  for (let index = 0; index < length; index++) {
    const strategyRowId = strategyRowIds[index] ?? null;
    const projectionRowId = projectionRowIds[index] ?? null;
    if (strategyRowId !== projectionRowId) {
      return {
        index,
        strategyRowId,
        projectionRowId,
      };
    }
  }
  return null;
}

function buildCounterDelta(
  strategy: QueueCounterSnapshot | null,
  projection: QueueCounterSnapshot | null,
): QueueProjectionParityCounterDelta {
  return {
    remaining: subtractNullable(projection?.remaining ?? null, strategy?.remaining ?? null),
    due: subtractNullable(projection?.due ?? null, strategy?.due ?? null),
    total: subtractNullable(projection?.total ?? null, strategy?.total ?? null),
    buckets: COUNTER_BUCKET_KEYS.reduce((acc, key) => ({
      ...acc,
      [key]: subtractNullable(projection?.buckets?.[key] ?? null, strategy?.buckets?.[key] ?? null) ?? 0,
    }), {
      all: 0,
      item: 0,
      descriptor: 0,
      topic: 0,
      concept: 0,
    } as QueueCounterBuckets),
  };
}

function subtractNullable(left: number | null, right: number | null): number | null {
  const normalizedLeft = normalizeNullableNumber(left);
  const normalizedRight = normalizeNullableNumber(right);
  if (normalizedLeft === null || normalizedRight === null) {
    return null;
  }
  return normalizedLeft - normalizedRight;
}

function isCounterDeltaZero(delta: QueueProjectionParityCounterDelta): boolean {
  return delta.remaining === 0
    && delta.due === 0
    && delta.total === 0
    && COUNTER_BUCKET_KEYS.every((key) => delta.buckets[key] === 0);
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
