import type {
  MessagePackCardAggregateTruthRecord,
  MessagePackQueueTruthRecord,
} from '../../packages/contracts/src/backend-rpc';

export interface WorkerTruthReconciliationSource {
  sourceId: string;
  deviceId: string;
  identityEpoch: string;
  manifestPath: string;
  generationId: string;
  records: Record<string, unknown>[];
}

export interface WorkerTruthAggregateConflict {
  aggregateType: 'card' | 'queue' | 'mutation';
  aggregateId: string;
  reason:
    | 'duplicate-mutation-payload-mismatch'
    | 'non-commutative-concurrent-mutations'
    | 'disconnected-causal-history';
  mutationIds: string[];
  sourceIds: string[];
  causalBaseRevision: string | null;
}

export interface WorkerTruthMergeDecision {
  aggregateType: 'queue';
  aggregateId: string;
  policy: 'commutative-distinct-queue-members';
  mutationIds: string[];
}

export interface WorkerTruthReconciliationResult {
  sources: Array<{
    sourceId: string;
    deviceId: string;
    identityEpoch: string;
    manifestPath: string;
    generationId: string;
    recordCount: number;
  }>;
  acceptedRecords: Record<string, unknown>[];
  acceptedMutationIds: string[];
  duplicateMutationIds: string[];
  reviewFacts: Record<string, unknown>[];
  effectiveCardRecords: MessagePackCardAggregateTruthRecord[];
  effectiveQueueRecords: MessagePackQueueTruthRecord[];
  conflicts: WorkerTruthAggregateConflict[];
  mergeDecisions: WorkerTruthMergeDecision[];
  blockedAggregateIds: string[];
}

interface IndexedRecord {
  source: WorkerTruthReconciliationSource;
  record: Record<string, unknown>;
  mutationId: string;
  canonical: string;
  logicalTime: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function logicalTime(record: Record<string, unknown>): number {
  const value = Number(record.logicalTime ?? record.recordedAt ?? record.journalSequence ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function recordMutationId(record: Record<string, unknown>, fallback: string): string {
  return stringValue(record.mutationId)
    || stringValue(record.operationId)
    || stringValue(record.idempotencyKey)
    || fallback;
}

function recordFamily(record: Record<string, unknown>): string {
  return stringValue(record.family);
}

function recordType(record: Record<string, unknown>): string {
  return stringValue(record.type);
}

function aggregateIdentity(record: Record<string, unknown>): {
  aggregateType: 'card' | 'queue' | 'mutation';
  aggregateId: string;
} {
  const aggregateId = stringValue(record.aggregateId);
  if (aggregateId) {
    return { aggregateType: 'card', aggregateId };
  }
  const queueFamily = stringValue(record.queueFamily);
  if (queueFamily) {
    return { aggregateType: 'queue', aggregateId: queueFamily };
  }
  return {
    aggregateType: 'mutation',
    aggregateId: recordMutationId(record, 'unknown'),
  };
}

function sortIndexedRecords(records: IndexedRecord[]): IndexedRecord[] {
  return [...records].sort((left, right) => (
    left.logicalTime - right.logicalTime
    || left.source.deviceId.localeCompare(right.source.deviceId)
    || left.source.identityEpoch.localeCompare(right.source.identityEpoch)
    || left.mutationId.localeCompare(right.mutationId)
    || left.canonical.localeCompare(right.canonical)
  ));
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function isCardRecord(record: Record<string, unknown>): record is MessagePackCardAggregateTruthRecord {
  return recordFamily(record) === 'card-memory-facts'
    && recordType(record).startsWith('card-aggregate.')
    && Boolean(stringValue(record.aggregateId))
    && Boolean(stringValue(record.revision));
}

function isQueueRecord(record: Record<string, unknown>): record is MessagePackQueueTruthRecord {
  return recordFamily(record) === 'queue-facts'
    && recordType(record).startsWith('queue-')
    && Boolean(stringValue(record.queueFamily))
    && Boolean(stringValue(record.revision));
}

function isReviewRecord(record: Record<string, unknown>): boolean {
  return recordFamily(record) === 'review-events';
}

function causalBaseRevision(record: Record<string, unknown>): string | null {
  const value = stringValue(record.causalBaseRevision);
  return value || null;
}

function revision(record: Record<string, unknown>): string {
  return stringValue(record.revision);
}

function groupByAggregate(
  records: IndexedRecord[],
  aggregateType: 'card' | 'queue',
): Map<string, IndexedRecord[]> {
  const groups = new Map<string, IndexedRecord[]>();
  for (const item of records) {
    const aggregateId = aggregateType === 'card'
      ? stringValue(item.record.aggregateId)
      : stringValue(item.record.queueFamily);
    if (!aggregateId) {
      continue;
    }
    const aggregateRecords = groups.get(aggregateId) ?? [];
    aggregateRecords.push(item);
    groups.set(aggregateId, aggregateRecords);
  }
  return groups;
}

function siblingGroups(records: IndexedRecord[]): IndexedRecord[][] {
  const byBase = new Map<string, IndexedRecord[]>();
  for (const item of records) {
    const base = causalBaseRevision(item.record) ?? '<root>';
    const siblings = byBase.get(base) ?? [];
    siblings.push(item);
    byBase.set(base, siblings);
  }
  return [...byBase.values()].filter((siblings) => (
    new Set(siblings.map((item) => revision(item.record))).size > 1
  ));
}

function queueChangesAreCommutative(records: IndexedRecord[]): boolean {
  const touchedMembers = new Set<string>();
  for (const item of records) {
    if (recordType(item.record) !== 'queue-family.changeset.v1') {
      return false;
    }
    const changes = item.record.changes;
    if (!Array.isArray(changes) || changes.length === 0) {
      return false;
    }
    for (const change of changes) {
      if (!isRecord(change)) {
        return false;
      }
      const cardId = stringValue(change.cardId);
      if (!cardId || touchedMembers.has(cardId)) {
        return false;
      }
      touchedMembers.add(cardId);
    }
  }
  return true;
}

function terminalRecords(records: IndexedRecord[]): IndexedRecord[] {
  const referencedRevisions = new Set(
    records
      .map((item) => causalBaseRevision(item.record))
      .filter((value): value is string => Boolean(value)),
  );
  return records.filter((item) => !referencedRevisions.has(revision(item.record)));
}

export function reconcileWorkerTruthRecords(
  sources: WorkerTruthReconciliationSource[],
): WorkerTruthReconciliationResult {
  const normalizedSources = [...sources].sort((left, right) => (
    left.deviceId.localeCompare(right.deviceId)
    || left.identityEpoch.localeCompare(right.identityEpoch)
    || left.sourceId.localeCompare(right.sourceId)
  ));
  const indexed = sortIndexedRecords(normalizedSources.flatMap((source) => (
    source.records
      .filter(isRecord)
      .map((record, recordIndex) => ({
        source,
        record: structuredClone(record),
        mutationId: recordMutationId(record, `${source.sourceId}:${recordIndex}`),
        canonical: canonicalJson(record),
        logicalTime: logicalTime(record),
      }))
  )));

  const accepted: IndexedRecord[] = [];
  const firstByMutationId = new Map<string, IndexedRecord>();
  const duplicateMutationIds = new Set<string>();
  const conflicts: WorkerTruthAggregateConflict[] = [];

  for (const item of indexed) {
    const existing = firstByMutationId.get(item.mutationId);
    if (!existing) {
      firstByMutationId.set(item.mutationId, item);
      accepted.push(item);
      continue;
    }
    if (existing.canonical === item.canonical) {
      duplicateMutationIds.add(item.mutationId);
      continue;
    }
    const aggregate = aggregateIdentity(existing.record);
    conflicts.push({
      ...aggregate,
      reason: 'duplicate-mutation-payload-mismatch',
      mutationIds: [item.mutationId],
      sourceIds: uniqueSorted([existing.source.sourceId, item.source.sourceId]),
      causalBaseRevision: causalBaseRevision(existing.record),
    });
  }

  const mergeDecisions: WorkerTruthMergeDecision[] = [];
  const blockedAggregateIds = new Set<string>();
  const effectiveCardRecords: MessagePackCardAggregateTruthRecord[] = [];
  const effectiveQueueRecords: MessagePackQueueTruthRecord[] = [];

  const cardGroups = groupByAggregate(
    accepted.filter((item) => isCardRecord(item.record)),
    'card',
  );
  for (const [aggregateId, records] of cardGroups) {
    const siblings = siblingGroups(records);
    if (siblings.length > 0) {
      const conflictItems = siblings.flat();
      conflicts.push({
        aggregateType: 'card',
        aggregateId,
        reason: 'non-commutative-concurrent-mutations',
        mutationIds: uniqueSorted(conflictItems.map((item) => item.mutationId)),
        sourceIds: uniqueSorted(conflictItems.map((item) => item.source.sourceId)),
        causalBaseRevision: causalBaseRevision(conflictItems[0].record),
      });
      blockedAggregateIds.add(`card:${aggregateId}`);
      continue;
    }
    const terminals = terminalRecords(records);
    if (terminals.length !== 1) {
      conflicts.push({
        aggregateType: 'card',
        aggregateId,
        reason: 'disconnected-causal-history',
        mutationIds: uniqueSorted(terminals.map((item) => item.mutationId)),
        sourceIds: uniqueSorted(terminals.map((item) => item.source.sourceId)),
        causalBaseRevision: null,
      });
      blockedAggregateIds.add(`card:${aggregateId}`);
      continue;
    }
    effectiveCardRecords.push(structuredClone(terminals[0].record) as MessagePackCardAggregateTruthRecord);
  }

  const queueGroups = groupByAggregate(
    accepted.filter((item) => isQueueRecord(item.record)),
    'queue',
  );
  for (const [aggregateId, records] of queueGroups) {
    let blocked = false;
    for (const siblings of siblingGroups(records)) {
      if (queueChangesAreCommutative(siblings)) {
        mergeDecisions.push({
          aggregateType: 'queue',
          aggregateId,
          policy: 'commutative-distinct-queue-members',
          mutationIds: uniqueSorted(siblings.map((item) => item.mutationId)),
        });
        continue;
      }
      conflicts.push({
        aggregateType: 'queue',
        aggregateId,
        reason: 'non-commutative-concurrent-mutations',
        mutationIds: uniqueSorted(siblings.map((item) => item.mutationId)),
        sourceIds: uniqueSorted(siblings.map((item) => item.source.sourceId)),
        causalBaseRevision: causalBaseRevision(siblings[0].record),
      });
      blockedAggregateIds.add(`queue:${aggregateId}`);
      blocked = true;
    }
    if (!blocked) {
      effectiveQueueRecords.push(...sortIndexedRecords(records)
        .map((item) => structuredClone(item.record) as MessagePackQueueTruthRecord));
    }
  }

  for (const conflict of conflicts) {
    if (conflict.aggregateType !== 'mutation') {
      blockedAggregateIds.add(`${conflict.aggregateType}:${conflict.aggregateId}`);
    }
  }

  return {
    sources: normalizedSources.map((source) => ({
      sourceId: source.sourceId,
      deviceId: source.deviceId,
      identityEpoch: source.identityEpoch,
      manifestPath: source.manifestPath,
      generationId: source.generationId,
      recordCount: source.records.length,
    })),
    acceptedRecords: accepted.map((item) => structuredClone(item.record)),
    acceptedMutationIds: uniqueSorted(accepted.map((item) => item.mutationId)),
    duplicateMutationIds: uniqueSorted(duplicateMutationIds),
    reviewFacts: accepted
      .filter((item) => isReviewRecord(item.record))
      .map((item) => structuredClone(item.record)),
    effectiveCardRecords: effectiveCardRecords.sort((left, right) => left.aggregateId.localeCompare(right.aggregateId)),
    effectiveQueueRecords: effectiveQueueRecords.sort((left, right) => (
      left.logicalTime - right.logicalTime
      || left.mutationId.localeCompare(right.mutationId)
    )),
    conflicts: conflicts.sort((left, right) => (
      left.aggregateType.localeCompare(right.aggregateType)
      || left.aggregateId.localeCompare(right.aggregateId)
      || left.reason.localeCompare(right.reason)
    )),
    mergeDecisions: mergeDecisions.sort((left, right) => left.aggregateId.localeCompare(right.aggregateId)),
    blockedAggregateIds: uniqueSorted(blockedAggregateIds),
  };
}
