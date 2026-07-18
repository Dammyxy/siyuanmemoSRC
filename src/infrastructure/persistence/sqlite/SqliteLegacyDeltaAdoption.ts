import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type StorageAggregateReference,
  type StorageDurabilityReceipt,
  type StorageMutationEnvelope,
  type StorageMutationFamily,
  type StorageMutationOperation,
  type StorageRequiredTruthOutput,
} from '../../../../packages/contracts/src/backend-rpc';
import type { SqliteDeltaChange, SqliteDeltaEntry } from './SqliteDeltaCheckpoint';

const SUPPORTED_TABLES = new Set([
  'algorithm_card_state',
  'cards',
  'domain_sync_operations',
  'queue_state',
  'review_events',
  'review_transaction_undo_journal',
  'store_metadata',
]);

export interface SqliteLegacyDeltaAdoptionUnsupportedEntry {
  entryId: string;
  label: string;
  reason: string;
  tables: string[];
}

export interface SqliteLegacyDeltaAdoptionPlan {
  status: 'ready' | 'not-needed' | 'blocked';
  entries: SqliteDeltaEntry[];
  adoptedEntryCount: number;
  firstJournalSequence: number | null;
  lastJournalSequence: number | null;
  nextJournalSequence: number;
  unsupportedEntries: SqliteLegacyDeltaAdoptionUnsupportedEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function fnv1a32(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function deterministicMutationId(entry: SqliteDeltaEntry): string {
  const evidence = JSON.stringify(canonicalValue({
    id: entry.id,
    version: entry.version,
    label: entry.label,
    createdAt: entry.createdAt,
    schemaFingerprints: entry.schemaFingerprints,
    tables: entry.tables,
    changes: entry.changes,
  }));
  return `legacy-delta:${fnv1a32(evidence, 0x811c9dc5)}${fnv1a32(evidence, 0x9e3779b9)}`;
}

function operation(change: SqliteDeltaChange): StorageMutationOperation {
  return {
    table: change.table,
    operation: change.operation,
    primaryKey: structuredClone(change.primaryKey) as StorageMutationOperation['primaryKey'],
    row: change.row ? structuredClone(change.row) : null,
  };
}

function changeIdentity(change: SqliteDeltaChange, keys: string[]): string | null {
  for (const key of keys) {
    const fromRow = change.row ? normalizedString(change.row[key]) : null;
    if (fromRow) {
      return fromRow;
    }
    const fromPrimaryKey = normalizedString(change.primaryKey[key]);
    if (fromPrimaryKey) {
      return fromPrimaryKey;
    }
  }
  return null;
}

function addStructuredQueueValues(value: unknown, output: Set<string>): void {
  if (!isRecord(value)) {
    return;
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (
      ['queueType', 'queue_type', 'queueFamily', 'queue_family'].includes(key)
      && typeof candidate === 'string'
      && candidate.trim()
    ) {
      output.add(normalizeReviewQueueFamily(candidate));
    }
    if (candidate && typeof candidate === 'object') {
      addStructuredQueueValues(candidate, output);
    }
  }
}

function normalizeReviewQueueFamily(value: string): string {
  const normalized = value.trim();
  switch (normalized) {
    case 'incrementalLearningQueue':
      return 'incremental-learning';
    case 'retrievalPracticeQueue':
      return 'retrieval-practice';
    case 'filterGroupQueue':
      return 'filter-group';
    default:
      return normalized;
  }
}

function reviewQueueFamilies(entry: SqliteDeltaEntry): string[] {
  const output = new Set<string>();
  for (const change of entry.changes) {
    if (change.table === 'queue_state') {
      const key = changeIdentity(change, ['key']);
      if (key) {
        output.add(normalizeReviewQueueFamily(key));
      }
    }
    if (change.table === 'review_transaction_undo_journal') {
      const queueType = changeIdentity(change, ['queue_type', 'queueType']);
      if (queueType) {
        output.add(normalizeReviewQueueFamily(queueType));
      }
    }
    if (!change.row) {
      continue;
    }
    for (const key of ['payload_json', 'dto_json', 'state_json', 'value_json']) {
      const raw = change.row[key];
      if (typeof raw !== 'string') {
        continue;
      }
      try {
        addStructuredQueueValues(JSON.parse(raw), output);
      } catch {
        // Non-JSON legacy columns are not queue evidence.
      }
    }
  }
  return [...output].filter(Boolean).sort();
}

function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function output(
  family: string,
  kind: StorageRequiredTruthOutput['kind'],
  aggregateIds: string[],
): StorageRequiredTruthOutput | null {
  const ids = uniqueSorted(aggregateIds);
  return ids.length > 0 ? { family, kind, aggregateIds: ids } : null;
}

function classifyEntry(entry: SqliteDeltaEntry): {
  family: StorageMutationFamily;
  affectedAggregates: StorageAggregateReference[];
  requiredTruthOutputs: StorageRequiredTruthOutput[];
} | { error: string } {
  const tables = uniqueSorted(entry.changes.map((change) => change.table));
  const unsupportedTables = tables.filter((table) => !SUPPORTED_TABLES.has(table));
  if (unsupportedTables.length > 0) {
    return { error: `unsupported-tables:${unsupportedTables.join(',')}` };
  }
  if (entry.changes.length === 0) {
    return { error: 'empty-legacy-entry' };
  }

  const latestCardChanges = new Map<string, SqliteDeltaChange>();
  const reviewAggregateIds: string[] = [];
  const metadataAggregateIds: string[] = [];
  const queueStateIds: string[] = [];
  for (const change of entry.changes) {
    if (change.table === 'cards') {
      const cardId = changeIdentity(change, ['id', 'card_id', 'cardId']);
      if (!cardId) {
        return { error: 'card-aggregate-id-missing' };
      }
      latestCardChanges.set(cardId, change);
    }
    if (change.table === 'review_events') {
      reviewAggregateIds.push(changeIdentity(change, ['card_id', 'cardId', 'id']));
    }
    if (change.table === 'queue_state') {
      queueStateIds.push(changeIdentity(change, ['key']));
    }
    if (['review_transaction_undo_journal', 'domain_sync_operations', 'store_metadata'].includes(change.table)) {
      const metadataKeys = change.table === 'review_transaction_undo_journal'
        ? ['undo_token', 'undoToken', 'card_id', 'cardId']
        : change.table === 'domain_sync_operations'
          ? ['operation_id', 'operationId', 'id']
          : ['key', 'id'];
      metadataAggregateIds.push(changeIdentity(change, metadataKeys));
    }
  }
  if (tables.includes('algorithm_card_state') && latestCardChanges.size === 0) {
    return { error: 'algorithm-card-state-without-card-row' };
  }

  const isReviewMutation = entry.label === 'review.feedback'
    || entry.label.startsWith('review.session.undo-journal.')
    || tables.includes('review_events')
    || tables.includes('review_transaction_undo_journal');
  const cardChangesetIds = [...latestCardChanges.entries()]
    .filter(([, change]) => change.operation !== 'delete' && change.row !== null)
    .map(([cardId]) => cardId);
  const cardTombstoneIds = [...latestCardChanges.entries()]
    .filter(([, change]) => change.operation === 'delete')
    .map(([cardId]) => cardId);
  const requiredTruthOutputs = [
    output(isReviewMutation ? 'card-schedule' : 'card-crud', 'changeset', cardChangesetIds),
    output('card-crud', 'tombstone', cardTombstoneIds),
    output('review', 'event', reviewAggregateIds),
    output('review', 'metadata', metadataAggregateIds),
  ].filter((candidate): candidate is StorageRequiredTruthOutput => Boolean(candidate));

  const reviewQueueIds = reviewQueueFamilies(entry);
  if (
    (entry.label === 'review.feedback' || entry.label === 'review.session.undo-journal.consume')
    && reviewQueueIds.length !== 1
  ) {
    return { error: `review-queue-family-ambiguous:${reviewQueueIds.join(',') || 'missing'}` };
  }
  const requiresReviewQueueOutput = entry.label === 'review.feedback'
    || entry.label === 'review.session.undo-journal.consume';
  const queueIds = uniqueSorted(requiresReviewQueueOutput ? reviewQueueIds : queueStateIds);
  const queueOutput = output('queue', 'changeset', queueIds);
  if (queueOutput) {
    requiredTruthOutputs.push(queueOutput);
  }
  if (requiredTruthOutputs.length === 0) {
    return { error: 'canonical-output-unclassified' };
  }

  const family: StorageMutationFamily = isReviewMutation
    ? 'review'
    : latestCardChanges.size > 0
      ? 'card-crud'
      : queueIds.length > 0
        ? 'queue'
        : 'repair';
  const affectedAggregates = requiredTruthOutputs.flatMap((truthOutput) => (
    truthOutput.aggregateIds.map((aggregateId) => ({
      family: truthOutput.family,
      aggregateId,
      causalBaseRevision: null,
    }))
  ));
  return {
    family,
    affectedAggregates,
    requiredTruthOutputs,
  };
}

function adoptEntry(
  entry: SqliteDeltaEntry,
  classification: Exclude<ReturnType<typeof classifyEntry>, { error: string }>,
  input: { deviceId: string; identityEpoch: string; journalSequence: number },
): SqliteDeltaEntry {
  const mutationEnvelope: StorageMutationEnvelope = {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId: deterministicMutationId(entry),
    family: classification.family,
    deviceId: input.deviceId,
    identityEpoch: input.identityEpoch,
    journalSequence: input.journalSequence,
    createdAt: entry.createdAt,
    affectedAggregates: classification.affectedAggregates,
    operations: entry.changes.map(operation),
    requiredTruthOutputs: classification.requiredTruthOutputs,
  };
  const durabilityReceipt: StorageDurabilityReceipt = {
    version: STORAGE_DURABILITY_RECEIPT_VERSION,
    mutationId: mutationEnvelope.mutationId,
    family: mutationEnvelope.family,
    stage: 'journaled',
    journalSequence: mutationEnvelope.journalSequence,
    affectedAggregates: mutationEnvelope.affectedAggregates,
    requiredTruthOutputs: mutationEnvelope.requiredTruthOutputs,
    truthGenerationId: null,
    retry: {
      attemptCount: 0,
      nextAttemptAt: null,
      lastError: null,
    },
    diagnosticCode: 'LEGACY_DELTA_ADOPTED',
    diagnosticMessage: `Adopted verified legacy delta entry ${entry.id}`,
    updatedAt: entry.createdAt,
  };
  return {
    ...structuredClone(entry),
    mutationEnvelope,
    durabilityReceipt,
  };
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function rebindProvisionalLegacyAdoption(
  entry: SqliteDeltaEntry,
  classification: Exclude<ReturnType<typeof classifyEntry>, { error: string }>,
  input: { deviceId: string; identityEpoch: string },
): SqliteDeltaEntry | null {
  const envelope = entry.mutationEnvelope;
  const receipt = entry.durabilityReceipt;
  const sequence = envelope?.journalSequence;
  if (
    !envelope
    || !receipt
    || envelope.deviceId !== input.deviceId
    || envelope.identityEpoch === input.identityEpoch
    || !Number.isInteger(sequence)
    || sequence < 1
  ) {
    return null;
  }
  const source: SqliteDeltaEntry = {
    ...structuredClone(entry),
    mutationEnvelope: null,
    durabilityReceipt: null,
  };
  const expected = adoptEntry(source, classification, {
    deviceId: envelope.deviceId,
    identityEpoch: envelope.identityEpoch,
    journalSequence: sequence,
  });
  if (
    !sameCanonicalValue(envelope, expected.mutationEnvelope)
    || !sameCanonicalValue(receipt, expected.durabilityReceipt)
  ) {
    return null;
  }
  return adoptEntry(source, classification, {
    deviceId: input.deviceId,
    identityEpoch: input.identityEpoch,
    journalSequence: sequence,
  });
}

export function planSqliteLegacyDeltaAdoption(input: {
  entries: SqliteDeltaEntry[];
  deviceId: string;
  identityEpoch: string;
  startingJournalSequence: number;
  coveredJournalSequence?: number;
  rebindableLegacyMutationIds?: string[];
}): SqliteLegacyDeltaAdoptionPlan {
  const deviceId = normalizedString(input.deviceId);
  const identityEpoch = normalizedString(input.identityEpoch);
  if (!deviceId || !identityEpoch) {
    throw new Error('legacy-delta-adoption-identity-missing');
  }
  let nextJournalSequence = Math.max(1, Math.floor(Number(input.startingJournalSequence) || 1));
  const entries = input.entries.map((entry) => structuredClone(entry));
  const unsupportedEntries: SqliteLegacyDeltaAdoptionUnsupportedEntry[] = [];
  let adoptedEntryCount = 0;
  let firstJournalSequence: number | null = null;
  let lastJournalSequence: number | null = null;
  const coveredJournalSequence = Math.max(0, Math.floor(Number(input.coveredJournalSequence) || 0));
  const rebindableLegacyMutationIds = new Set(input.rebindableLegacyMutationIds ?? []);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.mutationEnvelope && entry.durabilityReceipt) {
      const sequence = entry.mutationEnvelope.journalSequence;
      if (typeof sequence === 'number' && sequence >= nextJournalSequence) {
        nextJournalSequence = sequence + 1;
      }
      if (
        entry.mutationEnvelope.deviceId === deviceId
        && entry.mutationEnvelope.identityEpoch === identityEpoch
      ) {
        continue;
      }
      if (
        typeof sequence === 'number'
        && sequence >= 1
        && sequence <= coveredJournalSequence
      ) {
        continue;
      }
      const classification = classifyEntry(entry);
      const rebound = !('error' in classification)
        && rebindableLegacyMutationIds.has(entry.mutationEnvelope.mutationId)
        ? rebindProvisionalLegacyAdoption(entry, classification, { deviceId, identityEpoch })
        : null;
      if (!rebound) {
        unsupportedEntries.push({
          entryId: entry.id,
          label: entry.label,
          reason: 'journal-identity-mismatch',
          tables: uniqueSorted(entry.changes.map((change) => change.table)),
        });
        continue;
      }
      entries[index] = rebound;
      firstJournalSequence ??= sequence;
      lastJournalSequence = sequence;
      adoptedEntryCount += 1;
      continue;
    }
    const classification = classifyEntry(entry);
    if ('error' in classification) {
      unsupportedEntries.push({
        entryId: entry.id,
        label: entry.label,
        reason: classification.error,
        tables: uniqueSorted(entry.changes.map((change) => change.table)),
      });
      continue;
    }
    const sequence = nextJournalSequence;
    entries[index] = adoptEntry(entry, classification, {
      deviceId,
      identityEpoch,
      journalSequence: sequence,
    });
    firstJournalSequence ??= sequence;
    lastJournalSequence = sequence;
    nextJournalSequence += 1;
    adoptedEntryCount += 1;
  }
  if (unsupportedEntries.length > 0) {
    return {
      status: 'blocked',
      entries: input.entries.map((entry) => structuredClone(entry)),
      adoptedEntryCount: 0,
      firstJournalSequence: null,
      lastJournalSequence: null,
      nextJournalSequence: Math.max(1, Math.floor(Number(input.startingJournalSequence) || 1)),
      unsupportedEntries,
    };
  }
  return {
    status: adoptedEntryCount > 0 ? 'ready' : 'not-needed',
    entries,
    adoptedEntryCount,
    firstJournalSequence,
    lastJournalSequence,
    nextJournalSequence,
    unsupportedEntries: [],
  };
}
