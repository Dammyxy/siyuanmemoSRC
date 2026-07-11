import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  isMessagePackCardAggregateTruthRecord,
  isMessagePackQueueTruthRecord,
  type MessagePackCardAggregateCardState,
  type MessagePackCardAggregateChangesetTruthRecord,
  type MessagePackCardAggregateScheduleState,
  type MessagePackCardAggregateTombstoneMetadata,
  type MessagePackCardAggregateTombstoneTruthRecord,
  type MessagePackCardAggregateTruthRecord,
  type MessagePackQueueChangesetTruthRecord,
  type MessagePackQueueMemberChange,
  type MessagePackQueueMemberState,
  type MessagePackQueueStateChangesetTruthRecord,
  type MessagePackQueueTruthRecord,
  type StorageMutationEnvelope,
  type StorageMutationOperation,
} from '../../packages/contracts/src/backend-rpc';

export type CardAggregateTruthReplayDiagnosticReason =
  | 'causal-revision-mismatch'
  | 'invalid-record';

export interface CardAggregateTruthReplayDiagnostic {
  reason: CardAggregateTruthReplayDiagnosticReason;
  aggregateId: string | null;
  revision: string | null;
  expectedRevision?: string | null;
  actualBaseRevision?: string | null;
}

export interface CardAggregateTruthState {
  aggregateId: string;
  causalBaseRevision: string | null;
  revision: string;
  journalSequence: number;
  mutationId: string;
  card: MessagePackCardAggregateCardState | null;
  schedule: MessagePackCardAggregateScheduleState | null;
  tombstone: MessagePackCardAggregateTombstoneMetadata | null;
}

export interface CardAggregateTruthReplayResult {
  aggregates: CardAggregateTruthState[];
  diagnostics: CardAggregateTruthReplayDiagnostic[];
}

export interface QueueFamilyTruthState {
  queueFamily: string;
  causalBaseRevision: string | null;
  revision: string;
  journalSequence: number;
  mutationId: string;
  members: MessagePackQueueMemberState[];
}

export interface QueueFamilyTruthReplayResult {
  queues: QueueFamilyTruthState[];
  queueState: QueueStateTruthState[];
  diagnostics: CardAggregateTruthReplayDiagnostic[];
}

export interface QueueStateTruthState {
  key: string;
  causalBaseRevision: string | null;
  revision: string;
  journalSequence: number;
  mutationId: string;
  value: unknown;
}

export interface CanonicalTruthReconstructionInput {
  truthRecords: unknown[];
  uncoveredMutations: StorageMutationEnvelope[];
}

export interface CanonicalTruthReconstructionResult {
  cards: CardAggregateTruthState[];
  queues: QueueFamilyTruthState[];
  queueState: QueueStateTruthState[];
  reviewEvents: Array<Record<string, unknown>>;
  undoEntries: Array<Record<string, unknown>>;
  tombstones: Array<{
    aggregateId: string;
    revision: string;
    tombstone: MessagePackCardAggregateTombstoneMetadata;
  }>;
  appliedUncoveredMutationIds: string[];
  diagnostics: Array<CardAggregateTruthReplayDiagnostic & {
    family: 'card-aggregate' | 'queue-family';
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function readNullableString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = readString(record, keys);
  return value || null;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function readNullableNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (record[key] === null || record[key] === undefined || record[key] === '') {
      continue;
    }
    const value = Number(record[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 1 || value === '1') {
      return true;
    }
    if (value === 0 || value === '0') {
      return false;
    }
  }
  return fallback;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return structuredClone(value);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readTags(card: Record<string, unknown>, row: Record<string, unknown>): string[] {
  if (Array.isArray(card.tags)) {
    return card.tags.map(String).map((tag) => tag.trim()).filter(Boolean);
  }
  const rowTags = row.tags;
  if (Array.isArray(rowTags)) {
    return rowTags.map(String).map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof rowTags === 'string') {
    return rowTags
      .split(/\r?\n|,/g)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function readFaceKey(card: Record<string, unknown>): MessagePackCardAggregateCardState['faceKey'] {
  if (!isRecord(card.faceKey)) {
    return null;
  }
  const ruleId = readString(card.faceKey, ['ruleId']);
  if (!ruleId) {
    return null;
  }
  return {
    ruleId,
    faceIndex: readNullableNumber(card.faceKey, ['faceIndex']),
  };
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(isRecord).map((entry) => structuredClone(entry))
    : [];
}

function cardFromRow(
  aggregateId: string,
  row: Record<string, unknown>,
): {
  card: MessagePackCardAggregateCardState;
  schedule: MessagePackCardAggregateScheduleState;
} {
  const payload = parseRecord(row.payload_json) ?? parseRecord(row.dto_json) ?? row;
  const id = readString(payload, ['id'], readString(row, ['id'], aggregateId));
  const blockId = readString(payload, ['blockId', 'block_id'], readString(row, ['block_id', 'blockId']));
  if (!id || id !== aggregateId || !blockId) {
    throw new Error(`card-aggregate-current-state-invalid:${aggregateId}`);
  }
  const card: MessagePackCardAggregateCardState = {
    id,
    blockId,
    xiuyuanId: readNullableString(payload, ['xiuyuanID', 'xiuyuanId', 'xiuyuan_id'])
      ?? readNullableString(row, ['xiuyuan_id', 'xiuyuanId']),
    faceKey: readFaceKey(payload),
    type: readString(payload, ['type'], readString(row, ['type'], 'item')),
    priority: readNumber(payload, ['priority'], readNumber(row, ['priority'])),
    tags: readTags(payload, row),
    cardTypeMarker: readNullableString(payload, ['cardTypeMarker'])
      ?? readNullableString(row, ['card_type_marker']),
    neuralRoamSeed: readBoolean(payload, ['neuralRoamSeed']),
    skipped: readBoolean(payload, ['skipped']),
    skipNote: readNullableString(payload, ['skipNote']),
    skipUntil: readNullableNumber(payload, ['skipUntil']),
    sourceUrl: readNullableString(payload, ['sourceUrl']),
    extractedFrom: readNullableString(payload, ['extractedFrom']),
    createdAt: readNumber(payload, ['createdAt'], readNumber(row, ['created_at'])),
    updatedAt: readNumber(payload, ['updatedAt'], readNumber(row, ['updated_at'])),
    meta: isRecord(payload.meta) ? structuredClone(payload.meta) : null,
  };
  const schedule: MessagePackCardAggregateScheduleState = {
    schedulerType: readNullableString(payload, ['schedulerType'])
      ?? readNullableString(row, ['scheduler_type']),
    due: readNumber(payload, ['due'], readNumber(row, ['due'])),
    stability: readNumber(payload, ['stability'], readNumber(row, ['stability'])),
    difficulty: readNumber(payload, ['difficulty'], readNumber(row, ['difficulty'])),
    reps: readNumber(payload, ['reps'], readNumber(row, ['reps'])),
    lapses: readNumber(payload, ['lapses'], readNumber(row, ['lapses'])),
    state: readNumber(payload, ['state'], readNumber(row, ['state'])),
    lastReview: readNumber(payload, ['lastReview'], readNumber(row, ['last_review'])),
    elapsedDays: readNumber(payload, ['elapsedDays']),
    scheduledDays: readNumber(payload, ['scheduledDays'], readNumber(row, ['scheduled_days'])),
    learningStep: readNullableNumber(payload, ['learning_step', 'learningStep']),
    leechCount: readNumber(payload, ['leechCount']),
    isLeech: readBoolean(payload, ['isLeech']),
    aFactor: readNullableNumber(payload, ['aFactor'])
      ?? readNullableNumber(row, ['a_factor']),
    riffCardId: readNullableString(payload, ['riffCardId']),
    schedulerMeta: isRecord(payload.schedulerMeta) ? structuredClone(payload.schedulerMeta) : null,
    postponeCount: readNumber(payload, ['postponeCount']),
    lastPostponeDate: readNullableNumber(payload, ['lastPostponeDate']),
    rescheduleHistory: readRecordArray(payload.rescheduleHistory),
  };
  return { card, schedule };
}

function operationAggregateId(operation: StorageMutationOperation): string | null {
  const row = isRecord(operation.row) ? operation.row : {};
  return readNullableString(operation.primaryKey, ['id', 'card_id', 'cardId'])
    ?? readNullableString(row, ['id', 'card_id', 'cardId']);
}

function latestCardOperation(
  operations: StorageMutationOperation[],
  aggregateId: string,
): StorageMutationOperation | null {
  return operations
    .filter((operation) => operation.table === 'cards' && operationAggregateId(operation) === aggregateId)
    .at(-1) ?? null;
}

function revisionFor(envelope: StorageMutationEnvelope, aggregateId: string): string {
  return [
    envelope.deviceId,
    envelope.identityEpoch,
    envelope.journalSequence,
    envelope.mutationId,
    aggregateId,
  ].join(':');
}

function cardAggregateOutputIds(
  envelope: StorageMutationEnvelope,
  kind: 'changeset' | 'tombstone',
): string[] {
  return Array.from(new Set(
    envelope.requiredTruthOutputs
      .filter((output) => (
        (output.family === 'card-schedule' || output.family === 'card-crud')
        && output.kind === kind
      ))
      .flatMap((output) => output.aggregateIds)
      .map((aggregateId) => String(aggregateId || '').trim())
      .filter(Boolean),
  )).sort();
}

export function encodeCardAggregateChangesets(
  envelope: StorageMutationEnvelope,
): MessagePackCardAggregateChangesetTruthRecord[] {
  if (envelope.journalSequence === null || envelope.journalSequence < 1) {
    throw new Error(`card-aggregate-journal-sequence-missing:${envelope.mutationId}`);
  }
  const aggregateIds = cardAggregateOutputIds(envelope, 'changeset');
  return aggregateIds.map((aggregateId) => {
    const operation = latestCardOperation(envelope.operations, aggregateId);
    if (!operation || operation.operation === 'delete' || !isRecord(operation.row)) {
      throw new Error(`card-aggregate-current-state-missing:${aggregateId}`);
    }
    const { card, schedule } = cardFromRow(aggregateId, operation.row);
    const causalBaseRevision = envelope.affectedAggregates.find((aggregate) => (
      aggregate.aggregateId === aggregateId
      && (aggregate.family === 'card-schedule' || aggregate.family === 'card-crud')
    ))?.causalBaseRevision ?? null;
    const revision = revisionFor(envelope, aggregateId);
    return {
      family: 'card-memory-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'card-aggregate.changeset.v1',
      idempotencyKey: `card-aggregate:${envelope.mutationId}:${aggregateId}:changeset`,
      mutationId: envelope.mutationId,
      aggregateId,
      causalBaseRevision,
      revision,
      journalSequence: envelope.journalSequence!,
      logicalTime: envelope.createdAt,
      recordedAt: envelope.createdAt,
      card,
      schedule,
      tombstone: null,
    };
  });
}

function encodeCardAggregateTombstones(
  envelope: StorageMutationEnvelope,
): MessagePackCardAggregateTombstoneTruthRecord[] {
  if (envelope.journalSequence === null || envelope.journalSequence < 1) {
    throw new Error(`card-aggregate-journal-sequence-missing:${envelope.mutationId}`);
  }
  return cardAggregateOutputIds(envelope, 'tombstone').map((aggregateId) => {
    const operation = latestCardOperation(envelope.operations, aggregateId);
    if (!operation || operation.operation !== 'delete') {
      throw new Error(`card-aggregate-delete-operation-missing:${aggregateId}`);
    }
    const causalBaseRevision = envelope.affectedAggregates.find((aggregate) => (
      aggregate.aggregateId === aggregateId
      && (aggregate.family === 'card-schedule' || aggregate.family === 'card-crud')
    ))?.causalBaseRevision ?? null;
    return {
      family: 'card-memory-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'card-aggregate.tombstone.v1',
      idempotencyKey: `card-aggregate:${envelope.mutationId}:${aggregateId}:tombstone`,
      mutationId: envelope.mutationId,
      aggregateId,
      causalBaseRevision,
      revision: revisionFor(envelope, aggregateId),
      journalSequence: envelope.journalSequence!,
      logicalTime: envelope.createdAt,
      recordedAt: envelope.createdAt,
      card: null,
      schedule: null,
      tombstone: {
        deletedAt: envelope.createdAt,
        deletedByMutationId: envelope.mutationId,
        deletedByDeviceId: envelope.deviceId,
        identityEpoch: envelope.identityEpoch,
        reason: envelope.family === 'card-crud' ? 'user-delete' : 'card-aggregate-delete',
      },
    };
  });
}

export function encodeCardAggregateTruthRecords(
  envelope: StorageMutationEnvelope,
): MessagePackCardAggregateTruthRecord[] {
  return [
    ...encodeCardAggregateChangesets(envelope),
    ...encodeCardAggregateTombstones(envelope),
  ];
}

export function replayCardAggregateTruthRecords(
  records: unknown[],
): CardAggregateTruthReplayResult {
  const diagnostics: CardAggregateTruthReplayDiagnostic[] = [];
  const valid: MessagePackCardAggregateTruthRecord[] = [];
  for (const record of records) {
    if (!isMessagePackCardAggregateTruthRecord(record)) {
      const candidate = isRecord(record) ? record : {};
      diagnostics.push({
        reason: 'invalid-record',
        aggregateId: readNullableString(candidate, ['aggregateId']),
        revision: readNullableString(candidate, ['revision']),
      });
      continue;
    }
    valid.push(structuredClone(record));
  }
  valid.sort((left, right) => (
    left.journalSequence - right.journalSequence
    || left.logicalTime - right.logicalTime
    || left.revision.localeCompare(right.revision)
  ));
  const states = new Map<string, CardAggregateTruthState>();
  for (const record of valid) {
    const current = states.get(record.aggregateId);
    if (
      current
      && record.causalBaseRevision !== null
      && record.causalBaseRevision !== current.revision
    ) {
      diagnostics.push({
        reason: 'causal-revision-mismatch',
        aggregateId: record.aggregateId,
        revision: record.revision,
        expectedRevision: current.revision,
        actualBaseRevision: record.causalBaseRevision,
      });
      continue;
    }
    states.set(record.aggregateId, {
      aggregateId: record.aggregateId,
      causalBaseRevision: record.causalBaseRevision,
      revision: record.revision,
      journalSequence: record.journalSequence,
      mutationId: record.mutationId,
      card: record.card ? structuredClone(record.card) : null,
      schedule: record.schedule ? structuredClone(record.schedule) : null,
      tombstone: record.tombstone ? structuredClone(record.tombstone) : null,
    });
  }
  return {
    aggregates: [...states.values()].sort((left, right) => left.aggregateId.localeCompare(right.aggregateId)),
    diagnostics,
  };
}

function queueMemberFromCardOperation(
  operation: StorageMutationOperation,
): MessagePackQueueMemberChange | null {
  const cardId = operationAggregateId(operation);
  if (!cardId) {
    return null;
  }
  if (operation.operation === 'delete') {
    return {
      operation: 'remove',
      cardId,
      member: null,
    };
  }
  if (!isRecord(operation.row)) {
    return null;
  }
  const { card, schedule } = cardFromRow(cardId, operation.row);
  return {
    operation: 'upsert',
    cardId,
    member: {
      cardId,
      due: schedule.due,
      priority: card.priority,
      state: schedule.state,
      schedulerType: schedule.schedulerType,
      membershipReason: null,
      sortKey: null,
    },
  };
}

function queueStateOperationKey(operation: StorageMutationOperation): string | null {
  const row = isRecord(operation.row) ? operation.row : {};
  return readNullableString(operation.primaryKey, ['key'])
    ?? readNullableString(row, ['key']);
}

function queueStateChangeRecord(
  envelope: StorageMutationEnvelope,
  queueFamily: string,
  operation: StorageMutationOperation,
): MessagePackQueueStateChangesetTruthRecord {
  if (operation.operation === 'delete') {
    return {
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-state.changeset.v1',
      idempotencyKey: `queue-state:${envelope.mutationId}:${queueFamily}:delete`,
      mutationId: envelope.mutationId,
      queueFamily,
      causalBaseRevision: envelope.affectedAggregates.find((aggregate) => (
        aggregate.family === 'queue' && aggregate.aggregateId === queueFamily
      ))?.causalBaseRevision ?? null,
      revision: revisionFor(envelope, queueFamily),
      journalSequence: envelope.journalSequence!,
      logicalTime: envelope.createdAt,
      recordedAt: envelope.createdAt,
      members: null,
      changes: null,
      stateChange: {
        operation: 'delete',
        key: queueFamily,
        value: null,
      },
    };
  }
  if (!isRecord(operation.row)) {
    throw new Error(`queue-state-current-value-missing:${queueFamily}`);
  }
  const rawValue = operation.row.value_json ?? operation.row.valueJson ?? operation.row.value;
  if (rawValue === undefined) {
    throw new Error(`queue-state-current-value-missing:${queueFamily}`);
  }
  let value: unknown;
  try {
    value = typeof rawValue === 'string' ? JSON.parse(rawValue) : structuredClone(rawValue);
  } catch {
    throw new Error(`queue-state-current-value-invalid:${queueFamily}`);
  }
  return {
    family: 'queue-facts',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: 'queue-state.changeset.v1',
    idempotencyKey: `queue-state:${envelope.mutationId}:${queueFamily}:set`,
    mutationId: envelope.mutationId,
    queueFamily,
    causalBaseRevision: envelope.affectedAggregates.find((aggregate) => (
      aggregate.family === 'queue' && aggregate.aggregateId === queueFamily
    ))?.causalBaseRevision ?? null,
    revision: revisionFor(envelope, queueFamily),
    journalSequence: envelope.journalSequence!,
    logicalTime: envelope.createdAt,
    recordedAt: envelope.createdAt,
    members: null,
    changes: null,
    stateChange: {
      operation: 'set',
      key: queueFamily,
      value,
    },
  };
}

export function encodeQueueFamilyTruthRecords(
  envelope: StorageMutationEnvelope,
): MessagePackQueueTruthRecord[] {
  if (envelope.journalSequence === null || envelope.journalSequence < 1) {
    throw new Error(`queue-family-journal-sequence-missing:${envelope.mutationId}`);
  }
  const queueFamilies = Array.from(new Set(
    envelope.requiredTruthOutputs
      .filter((output) => output.family === 'queue' && output.kind === 'changeset')
      .flatMap((output) => output.aggregateIds)
      .map((queueFamily) => String(queueFamily || '').trim())
      .filter(Boolean),
  )).sort();
  const changesByCardId = new Map<string, MessagePackQueueMemberChange>();
  const queueStateOperations = new Map<string, StorageMutationOperation>();
  for (const operation of envelope.operations) {
    if (operation.table === 'queue_state') {
      const key = queueStateOperationKey(operation);
      if (key) {
        queueStateOperations.set(key, operation);
      }
      continue;
    }
    if (operation.table !== 'cards') {
      continue;
    }
    const change = queueMemberFromCardOperation(operation);
    if (change) {
      changesByCardId.set(change.cardId, change);
    }
  }
  const changes = [...changesByCardId.values()].sort((left, right) => left.cardId.localeCompare(right.cardId));
  return queueFamilies.map((queueFamily) => {
    const queueStateOperation = queueStateOperations.get(queueFamily);
    if (queueStateOperation) {
      return queueStateChangeRecord(envelope, queueFamily, queueStateOperation);
    }
    if (changes.length === 0) {
      throw new Error(`queue-family-current-state-missing:${queueFamily}`);
    }
    const record: MessagePackQueueChangesetTruthRecord = {
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-family.changeset.v1',
      idempotencyKey: `queue-family:${envelope.mutationId}:${queueFamily}:changeset`,
      mutationId: envelope.mutationId,
      queueFamily,
      causalBaseRevision: envelope.affectedAggregates.find((aggregate) => (
        aggregate.family === 'queue' && aggregate.aggregateId === queueFamily
      ))?.causalBaseRevision ?? null,
      revision: revisionFor(envelope, queueFamily),
      journalSequence: envelope.journalSequence!,
      logicalTime: envelope.createdAt,
      recordedAt: envelope.createdAt,
      members: null,
      changes: structuredClone(changes),
    };
    return record;
  });
}

export function replayQueueFamilyTruthRecords(
  records: unknown[],
): QueueFamilyTruthReplayResult {
  const diagnostics: CardAggregateTruthReplayDiagnostic[] = [];
  const valid: MessagePackQueueTruthRecord[] = [];
  for (const record of records) {
    if (!isMessagePackQueueTruthRecord(record)) {
      const candidate = isRecord(record) ? record : {};
      diagnostics.push({
        reason: 'invalid-record',
        aggregateId: readNullableString(candidate, ['queueFamily']),
        revision: readNullableString(candidate, ['revision']),
      });
      continue;
    }
    valid.push(structuredClone(record));
  }
  valid.sort((left, right) => (
    left.journalSequence - right.journalSequence
    || left.logicalTime - right.logicalTime
    || left.revision.localeCompare(right.revision)
  ));
  const states = new Map<string, {
    meta: Omit<QueueFamilyTruthState, 'members'>;
    members: Map<string, MessagePackQueueMemberState>;
  }>();
  const queueState = new Map<string, QueueStateTruthState>();
  const revisions = new Map<string, string>();
  for (const record of valid) {
    const current = states.get(record.queueFamily);
    const currentRevision = revisions.get(record.queueFamily);
    if (
      currentRevision
      && record.causalBaseRevision !== null
      && record.causalBaseRevision !== currentRevision
    ) {
      diagnostics.push({
        reason: 'causal-revision-mismatch',
        aggregateId: record.queueFamily,
        revision: record.revision,
        expectedRevision: currentRevision,
        actualBaseRevision: record.causalBaseRevision,
      });
      continue;
    }
    if (record.type === 'queue-state.changeset.v1') {
      if (record.stateChange.operation === 'delete') {
        queueState.delete(record.stateChange.key);
      } else {
        queueState.set(record.stateChange.key, {
          key: record.stateChange.key,
          causalBaseRevision: record.causalBaseRevision,
          revision: record.revision,
          journalSequence: record.journalSequence,
          mutationId: record.mutationId,
          value: structuredClone(record.stateChange.value),
        });
      }
      revisions.set(record.queueFamily, record.revision);
      continue;
    }
    const members = record.type === 'queue-family.snapshot.v1'
      ? new Map(record.members.map((member) => [member.cardId, structuredClone(member)]))
      : new Map(current?.members ?? []);
    if (record.type === 'queue-family.changeset.v1') {
      for (const change of record.changes) {
        if (change.operation === 'remove') {
          members.delete(change.cardId);
        } else if (change.member) {
          members.set(change.cardId, structuredClone(change.member));
        }
      }
    }
    states.set(record.queueFamily, {
      meta: {
        queueFamily: record.queueFamily,
        causalBaseRevision: record.causalBaseRevision,
        revision: record.revision,
        journalSequence: record.journalSequence,
        mutationId: record.mutationId,
      },
      members,
    });
    revisions.set(record.queueFamily, record.revision);
  }
  return {
    queues: [...states.values()]
      .map((state) => ({
        ...state.meta,
        members: [...state.members.values()].sort((left, right) => left.cardId.localeCompare(right.cardId)),
      }))
      .sort((left, right) => left.queueFamily.localeCompare(right.queueFamily)),
    queueState: [...queueState.values()]
      .sort((left, right) => left.key.localeCompare(right.key)),
    diagnostics,
  };
}

function normalizeOperation(value: unknown): StorageMutationOperation | null {
  if (!isRecord(value)) {
    return null;
  }
  const table = readString(value, ['table']);
  const operation = readString(value, ['operation']);
  if (
    !table
    || (operation !== 'insert' && operation !== 'update' && operation !== 'delete')
    || !isRecord(value.primaryKey)
    || !(value.row === null || isRecord(value.row))
  ) {
    return null;
  }
  return {
    table,
    operation,
    primaryKey: structuredClone(value.primaryKey) as Record<string, string | number | null>,
    row: value.row === null ? null : structuredClone(value.row),
  };
}

function operationsFromTruthRecord(record: Record<string, unknown>): StorageMutationOperation[] {
  return Array.isArray(record.operations)
    ? record.operations.map(normalizeOperation).filter((operation): operation is StorageMutationOperation => Boolean(operation))
    : [];
}

function evidenceKey(
  row: Record<string, unknown>,
  primaryKey: Record<string, string | number | null>,
  keys: string[],
  fallback: string,
): string {
  return readNullableString(row, keys)
    ?? readNullableString(primaryKey, keys)
    ?? fallback;
}

function applyOperationEvidence(
  operation: StorageMutationOperation,
  reviewEvents: Map<string, Record<string, unknown>>,
  undoEntries: Map<string, Record<string, unknown>>,
  fallback: string,
): void {
  const row = isRecord(operation.row) ? structuredClone(operation.row) : null;
  if (operation.table === 'review_events') {
    const key = row
      ? evidenceKey(row, operation.primaryKey, ['id', 'event_id', 'eventId'], fallback)
      : evidenceKey({}, operation.primaryKey, ['id', 'event_id', 'eventId'], fallback);
    if (operation.operation === 'delete') {
      reviewEvents.delete(key);
    } else if (row) {
      reviewEvents.set(key, row);
    }
    return;
  }
  if (operation.table === 'review_transaction_undo_journal') {
    const key = row
      ? evidenceKey(row, operation.primaryKey, ['undo_token', 'undoToken'], fallback)
      : evidenceKey({}, operation.primaryKey, ['undo_token', 'undoToken'], fallback);
    if (operation.operation === 'delete') {
      undoEntries.delete(key);
    } else if (row) {
      undoEntries.set(key, row);
    }
  }
}

function reviewTruthKey(record: Record<string, unknown>, index: number): string {
  return readNullableString(record, ['eventId', 'journalEntryId', 'id', 'idempotencyKey'])
    ?? `review-truth:${index}`;
}

function evidenceOrder(record: Record<string, unknown>): number {
  return readNumber(record, ['logicalTime', 'recordedAt', 'reviewed_at', 'reviewedAt'], 0);
}

export function reconstructCanonicalTruthState(
  input: CanonicalTruthReconstructionInput,
): CanonicalTruthReconstructionResult {
  const cardRecords: MessagePackCardAggregateTruthRecord[] = [];
  const queueRecords: MessagePackQueueTruthRecord[] = [];
  const reviewEvents = new Map<string, Record<string, unknown>>();
  const undoEntries = new Map<string, Record<string, unknown>>();

  input.truthRecords.forEach((record, index) => {
    if (isMessagePackCardAggregateTruthRecord(record)) {
      cardRecords.push(structuredClone(record));
      return;
    }
    if (isMessagePackQueueTruthRecord(record)) {
      queueRecords.push(structuredClone(record));
      return;
    }
    if (!isRecord(record) || record.family !== 'review-events') {
      return;
    }
    const type = readString(record, ['type']);
    if (type.startsWith('review.')) {
      reviewEvents.set(reviewTruthKey(record, index), structuredClone(record));
    }
    operationsFromTruthRecord(record).forEach((operation, operationIndex) => {
      applyOperationEvidence(
        operation,
        reviewEvents,
        undoEntries,
        `truth:${index}:${operationIndex}`,
      );
    });
  });

  const appliedUncoveredMutationIds: string[] = [];
  [...input.uncoveredMutations]
    .sort((left, right) => (
      (left.journalSequence ?? Number.MAX_SAFE_INTEGER)
      - (right.journalSequence ?? Number.MAX_SAFE_INTEGER)
      || left.mutationId.localeCompare(right.mutationId)
    ))
    .forEach((mutation) => {
      if (mutation.requiredTruthOutputs.some((output) => (
        output.family === 'card-schedule' || output.family === 'card-crud'
      ))) {
        cardRecords.push(...encodeCardAggregateTruthRecords(mutation));
      }
      if (mutation.requiredTruthOutputs.some((output) => output.family === 'queue')) {
        queueRecords.push(...encodeQueueFamilyTruthRecords(mutation));
      }
      mutation.operations.forEach((operation, operationIndex) => {
        applyOperationEvidence(
          operation,
          reviewEvents,
          undoEntries,
          `delta:${mutation.mutationId}:${operationIndex}`,
        );
      });
      appliedUncoveredMutationIds.push(mutation.mutationId);
    });

  const cardReplay = replayCardAggregateTruthRecords(cardRecords);
  const queueReplay = replayQueueFamilyTruthRecords(queueRecords);
  const diagnostics: CanonicalTruthReconstructionResult['diagnostics'] = [
    ...cardReplay.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      family: 'card-aggregate' as const,
    })),
    ...queueReplay.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      family: 'queue-family' as const,
    })),
  ];
  return {
    cards: cardReplay.aggregates,
    queues: queueReplay.queues,
    queueState: queueReplay.queueState,
    reviewEvents: [...reviewEvents.values()].sort((left, right) => (
      evidenceOrder(left) - evidenceOrder(right)
      || reviewTruthKey(left, 0).localeCompare(reviewTruthKey(right, 0))
    )),
    undoEntries: [...undoEntries.values()].sort((left, right) => (
      evidenceOrder(left) - evidenceOrder(right)
      || readString(left, ['undo_token', 'undoToken']).localeCompare(
        readString(right, ['undo_token', 'undoToken']),
      )
    )),
    tombstones: cardReplay.aggregates
      .filter((state): state is CardAggregateTruthState & {
        tombstone: MessagePackCardAggregateTombstoneMetadata;
      } => state.tombstone !== null)
      .map((state) => ({
        aggregateId: state.aggregateId,
        revision: state.revision,
        tombstone: structuredClone(state.tombstone),
      })),
    appliedUncoveredMutationIds,
    diagnostics,
  };
}
