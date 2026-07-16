import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { decode, encode } from '@msgpack/msgpack';
import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type StorageDurabilityReceipt,
  type StorageMutationEnvelope,
  type StorageMutationOperation,
} from '../../../../packages/contracts/src/backend-rpc';
import {
  planSqliteLegacyDeltaAdoption,
  type SqliteLegacyDeltaAdoptionUnsupportedEntry,
} from './SqliteLegacyDeltaAdoption';

export const SQLITE_DELTA_LOG_DIR = 'sqlite-delta/v2';
export const LEGACY_SQLITE_DELTA_LOG_FILE = 'sqlite-delta-log.v2.manifest.json';
export const LEGACY_SQLITE_DELTA_OPEN_SEGMENT_FILE = 'sqlite-delta-log.v2.open.msgpack';
export const SQLITE_DELTA_LOG_FILE = `${SQLITE_DELTA_LOG_DIR}/sqlite-delta-log.v2.manifest.json`;
export const SQLITE_DELTA_OPEN_SEGMENT_FILE = `${SQLITE_DELTA_LOG_DIR}/sqlite-delta-log.v2.open.msgpack`;
export const SQLITE_DELTA_LOG_VERSION = 2;

const AUDIT_TABLE = '__siyuanmemo_delta_audit';
const MAX_PENDING_DELTA_ENTRIES = 256;
const MAX_PENDING_DELTA_BYTES = 512 * 1024;
const MAX_OPEN_SEGMENT_DELTA_ENTRIES = 16;
const MAX_OPEN_SEGMENT_BYTES = 64 * 1024;

type SqlParams = SqlValue[] | ParamsObject;

type SqliteDeltaFileService = {
  readJSON<T>(fileName: string, metadata?: SqliteDeltaFileEffectMetadata): Promise<T | null>;
  writeJSON(fileName: string, data: unknown, metadata?: SqliteDeltaFileEffectMetadata): Promise<void>;
  readBinary(fileName: string, metadata?: SqliteDeltaFileEffectMetadata): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array, metadata?: SqliteDeltaFileEffectMetadata): Promise<void>;
  listFiles?(prefix: string): Promise<Array<{ path: string; size: number | null }>>;
  deleteFile?(fileName: string): Promise<void>;
};

type SqliteDeltaFileEffectMetadata = {
  purpose?: string | null;
  substep?: string | null;
};
type SqliteDeltaDiagnosticRecorder = (
  step: string,
  durationMs: number,
  extra?: Record<string, unknown>,
) => void;

type VerifiedSegmentEvidenceScope = boolean | 'sealed-only';

type SqliteDeltaSnapshotReadOptions = SqliteDeltaFileEffectMetadata & {
  allowVerifiedSegmentEvidence?: VerifiedSegmentEvidenceScope;
};

export type SqliteCheckpointStorageClass = 'durable-checkpoint' | 'volatile-projection';

export type SqliteDeltaOperation = 'insert' | 'update' | 'delete';
export type SqliteDeltaReplayMode = 'primary-key-upsert-delete';
export type SqliteDeltaWriteClassification = 'delta' | 'checkpoint';
export type SqliteDeltaTableDurability = 'durable-replay' | 'derived-cache';

export interface SqliteDeltaTableColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKeyPosition: number;
}

export interface SqliteDeltaTableMetadata {
  tableName: string;
  primaryKeys: string[];
  columns: SqliteDeltaTableColumn[];
  schemaFingerprint: string;
  acceptedSchemaFingerprints: string[];
  replayMode: SqliteDeltaReplayMode;
  durability: SqliteDeltaTableDurability;
}

export interface SqliteDeltaChange {
  table: string;
  operation: SqliteDeltaOperation;
  primaryKey: Record<string, SqlValue>;
  row: Record<string, SqlValue> | null;
}

export interface SqliteDeltaEntry {
  id: string;
  version: 1;
  label: string;
  createdAt: number;
  schemaFingerprints: Record<string, string>;
  tables: string[];
  changes: SqliteDeltaChange[];
  mutationEnvelope?: StorageMutationEnvelope | null;
  durabilityReceipt?: StorageDurabilityReceipt | null;
  byteEstimate: number;
}

export interface SqliteJournaledMutationEntry {
  createdAt: number;
  mutationEnvelope: StorageMutationEnvelope;
  durabilityReceipt: StorageDurabilityReceipt;
}

export interface SqliteDeltaLogSnapshot {
  version: typeof SQLITE_DELTA_LOG_VERSION;
  entries: SqliteDeltaEntry[];
  updatedAt: number;
  manifest: SqliteDeltaSegmentManifest;
  pendingBytes: number;
}

export interface SqliteDeltaSegmentManifestEntry {
  version: typeof SQLITE_DELTA_LOG_VERSION;
  path: string;
  sequence: number;
  sealed: boolean;
  checksum: string;
  entryCount: number;
  byteSize: number;
  minCreatedAt: number | null;
  maxCreatedAt: number | null;
  sealedAt: number | null;
}

export interface SqliteDeltaSegmentManifest {
  version: typeof SQLITE_DELTA_LOG_VERSION;
  path: string;
  openSegment: SqliteDeltaSegmentManifestEntry | null;
  sealedSegments: SqliteDeltaSegmentManifestEntry[];
  updatedAt: number;
  nextSequence: number;
  nextMutationSequence: number;
  checkpoint?: {
    clearedAt: number;
    coveredSegmentPaths: string[];
    reason: string;
  } | null;
}

export interface SqliteDeltaStorageInventory {
  files: number;
  sealedFiles: number;
  openFiles: number;
  entries: number;
  bytes: number;
  oldestCreatedAt: number | null;
}

export interface SqliteDeltaStartupEvidence {
  files: number;
  entries: number;
  segmentPaths: string[];
  checkpoint: SqliteDeltaSegmentManifest['checkpoint'];
  truthCoverageFrontier: number | null;
  uncoveredMutationCount: number | null;
}

export interface SqliteDeltaCompactionResult {
  status: 'compacted' | 'no-progress';
  reason: 'no-progress-uncovered' | null;
  coveredJournalSequence: number;
  candidateSegmentCount: number;
  candidateEntryCount: number;
  candidateBytes: number;
  reclaimableEntryCount: number;
  reclaimableBytes: number;
  retainedEntryCount: number;
  retainedBytes: number;
  deletedSegmentPaths: string[];
  relocatedEntryCount: number;
  relocatedSegmentPaths: string[];
  remainingSealedSegmentCount: number;
}

export interface SqliteDeltaOrphanCleanupResult {
  status: 'dry-run' | 'completed' | 'partial';
  listedFileCount: number;
  protectedSegmentCount: number;
  orphanFileCount: number;
  orphanBytes: number;
  unknownSizeOrphanCount: number;
  deletedFiles: Array<{ path: string; size: number | null }>;
  skippedFiles: Array<{ path: string; size: number | null; reason: string }>;
  failedFiles: Array<{ path: string; size: number | null; reason: string }>;
  remainingOrphanFileCount: number;
  remainingOrphanBytes: number;
  remainingUnknownSizeOrphanCount: number;
}

export interface SqliteDeltaLegacyAdoptionResult {
  status: 'adopted' | 'not-needed' | 'blocked';
  adoptedEntryCount: number;
  firstJournalSequence: number | null;
  lastJournalSequence: number | null;
  nextJournalSequence: number;
  replacedSegmentPaths: string[];
  adoptedSegmentPaths: string[];
  unsupportedEntries: SqliteLegacyDeltaAdoptionUnsupportedEntry[];
}

interface SqliteDeltaSegmentEnvelope {
  version: typeof SQLITE_DELTA_LOG_VERSION;
  kind: 'sqlite-delta-segment';
  path: string;
  sequence: number;
  sealed: boolean;
  createdAt: number;
  updatedAt: number;
  entries: SqliteDeltaEntry[];
}

interface VerifiedSegmentEvidence {
  manifestEntry: SqliteDeltaSegmentManifestEntry;
  envelope: SqliteDeltaSegmentEnvelope;
  provenance: 'generated' | 'persisted-read' | 'persisted-write';
}

export interface SqliteDeltaOperationStatus {
  ok: boolean;
  at: number;
  classification?: SqliteDeltaWriteClassification;
  label?: string;
  cause?: string | null;
  initiator?: string | null;
  projectionGeneration?: number | null;
  hotPath?: boolean;
  reason?: string | null;
  pendingCount?: number;
  pendingBytes?: number;
  deltaEntryId?: string | null;
  deltaEntriesWritten?: number;
  replayedCount?: number;
  skippedInMemoryCount?: number;
  affectedTables?: string[];
  skippedDerivedTables?: string[];
  skippedDerivedChangeCount?: number;
  byteLength?: number | null;
  cleared?: boolean;
  checkpointStorageClass?: SqliteCheckpointStorageClass;
  error?: string | null;
}

export interface SqliteDeltaDiagnostics {
  fileName: string;
  version: number;
  registeredTables: string[];
  durableReplayTables: string[];
  derivedCacheTables: string[];
  pendingCount: number;
  pendingBytes: number;
  affectedTables: string[];
  deltaWritesTotal: number;
  checkpointWritesTotal: number;
  checkpointOnlyTotal: number;
  replayedEntriesTotal: number;
  lastWrite: SqliteDeltaOperationStatus | null;
  lastReplay: SqliteDeltaOperationStatus | null;
  lastCheckpoint: SqliteDeltaOperationStatus | null;
}

export type SqliteDeltaHotPathDiagnostics = Pick<
  SqliteDeltaDiagnostics,
  'lastWrite' | 'lastCheckpoint'
>;

export interface SqliteDeltaTransactionCapture {
  finish(): SqliteDeltaCaptureResult;
  abort(): void;
}

export interface SqliteDeltaCaptureResult {
  label: string;
  setupError: string | null;
  touchedTables: string[];
  schemaMismatchedTables: string[];
  schemaFingerprints: Record<string, string>;
  changes: SqliteDeltaChange[];
  skippedDerivedTables: string[];
  skippedDerivedChangeCount: number;
}

export type SqliteDeltaPersistResult =
  | { mode: 'delta'; entry: SqliteDeltaEntry }
  | { mode: 'skipped'; reason: string; diagnostics: SqliteDeltaDiagnosticsContext }
  | { mode: 'checkpoint'; reason: string; diagnostics: SqliteDeltaDiagnosticsContext };

export interface SqliteDeltaDiagnosticsContext {
  cause?: string | null;
  initiator?: string | null;
  projectionGeneration?: number | null;
  hotPath?: boolean;
}

function recordSqliteDeltaDiagnostic(
  recorder: SqliteDeltaDiagnosticRecorder | undefined,
  step: string,
  startedAt: number,
  extra: Record<string, unknown> = {},
): void {
  recorder?.(step, Math.max(0, Date.now() - startedAt), extra);
}

interface AuditRow {
  table_name: string;
  operation: string;
  primary_key_json: string;
  row_json: string | null;
}

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function estimateJsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  return json ? new TextEncoder().encode(json).byteLength : 0;
}

function normalizeByteEstimate(value: unknown): number {
  const parsed = Math.ceil(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function estimatePendingEntryBytes(entries: SqliteDeltaEntry[]): number {
  return entries.reduce((total, entry) => total + normalizeByteEstimate(entry.byteEstimate), 0);
}

function estimateManifestPendingBytes(manifest: SqliteDeltaSegmentManifest): number {
  return [
    ...manifest.sealedSegments,
    ...(manifest.openSegment ? [manifest.openSegment] : []),
  ].reduce((total, segment) => total + normalizeByteEstimate(segment.byteSize), 0);
}

function calculateSnapshotPendingBytes(
  entries: SqliteDeltaEntry[],
  manifest: SqliteDeltaSegmentManifest,
): number {
  const manifestBytes = estimateManifestPendingBytes(manifest);
  return manifestBytes > 0 || entries.length === 0
    ? manifestBytes
    : estimatePendingEntryBytes(entries);
}

function calculateNextPendingBytes(snapshot: SqliteDeltaLogSnapshot, entry: SqliteDeltaEntry): number {
  return snapshot.pendingBytes + normalizeByteEstimate(entry.byteEstimate);
}

function checksumBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSegmentChecksumMismatch(error: unknown): boolean {
  return describeError(error).startsWith('SQLite delta segment checksum mismatch:');
}

function isOpenSegmentChecksumMismatch(error: unknown): boolean {
  return describeError(error) === `SQLite delta segment checksum mismatch: ${SQLITE_DELTA_OPEN_SEGMENT_FILE}`;
}

function isCorruptOpenSegmentCheckpointRepairReason(reason: string): boolean {
  return normalizeString(reason) === 'corrupt-open-segment-checkpoint-repair'
    || normalizeString(reason).endsWith(':corrupt-open-segment-checkpoint-repair');
}

function emptyManifest(updatedAt = 0): SqliteDeltaSegmentManifest {
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    path: SQLITE_DELTA_LOG_FILE,
    openSegment: null,
    sealedSegments: [],
    updatedAt,
    nextSequence: 1,
    nextMutationSequence: 1,
    checkpoint: null,
  };
}

function sqliteDeltaSealedSegmentFile(sequence: number): string {
  return `${SQLITE_DELTA_LOG_DIR}/sqlite-delta-log.v2.sealed-${sequence}.msgpack`;
}

function legacySqliteDeltaSegmentPath(path: string): string {
  const normalized = normalizeString(path).replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function describeSegmentCandidateMismatch(input: {
  path: string;
  candidatePath: string;
  expectedChecksum: string;
  expectedByteSize: number;
  actualChecksum: string | null;
  actualByteSize: number | null;
}): string {
  return [
    `SQLite delta sealed segment unrecoverable: ${input.path}`,
    `candidate=${input.candidatePath}`,
    `expectedChecksum=${input.expectedChecksum || '<empty>'}`,
    `actualChecksum=${input.actualChecksum ?? '<missing>'}`,
    `expectedByteSize=${input.expectedByteSize}`,
    `actualByteSize=${input.actualByteSize ?? '<missing>'}`,
  ].join(' ');
}

function normalizeManifest(value: unknown): SqliteDeltaSegmentManifest {
  if (value === null || value === undefined) {
    return emptyManifest();
  }
  if (!isRecord(value) || value.version !== SQLITE_DELTA_LOG_VERSION) {
    throw new Error(`SQLite delta log unsupported: expected version ${SQLITE_DELTA_LOG_VERSION}`);
  }
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    path: normalizeString(value.path) || SQLITE_DELTA_LOG_FILE,
    openSegment: value.openSegment ? normalizeManifestEntry(value.openSegment, 'openSegment') : null,
    sealedSegments: Array.isArray(value.sealedSegments)
      ? value.sealedSegments.map((entry, index) => normalizeManifestEntry(entry, `sealedSegments[${index}]`))
      : [],
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt || 0))),
    nextSequence: Math.max(1, Math.floor(Number(value.nextSequence || 1))),
    nextMutationSequence: Math.max(1, Math.floor(Number(value.nextMutationSequence || 1))),
    checkpoint: isRecord(value.checkpoint)
      ? {
        clearedAt: Math.max(0, Math.floor(Number(value.checkpoint.clearedAt || 0))),
        coveredSegmentPaths: uniqueStrings(Array.isArray(value.checkpoint.coveredSegmentPaths)
          ? value.checkpoint.coveredSegmentPaths
          : []),
        reason: normalizeString(value.checkpoint.reason),
      }
      : null,
  };
}

function normalizeManifestEntry(value: unknown, context: string): SqliteDeltaSegmentManifestEntry {
  if (!isRecord(value)) {
    throw new Error(`SQLite delta manifest corrupt: ${context} must be an object`);
  }
  const path = normalizeString(value.path);
  if (!path) {
    throw new Error(`SQLite delta manifest corrupt: ${context} missing path`);
  }
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    path,
    sequence: Math.max(0, Math.floor(Number(value.sequence || 0))),
    sealed: value.sealed === true,
    checksum: normalizeString(value.checksum),
    entryCount: Math.max(0, Math.floor(Number(value.entryCount || 0))),
    byteSize: Math.max(0, Math.floor(Number(value.byteSize || 0))),
    minCreatedAt: Number.isFinite(Number(value.minCreatedAt)) ? Math.floor(Number(value.minCreatedAt)) : null,
    maxCreatedAt: Number.isFinite(Number(value.maxCreatedAt)) ? Math.floor(Number(value.maxCreatedAt)) : null,
    sealedAt: Number.isFinite(Number(value.sealedAt)) ? Math.floor(Number(value.sealedAt)) : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeSqlValue(value: unknown): SqlValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || value instanceof Uint8Array) {
    return value;
  }
  return String(value);
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toColumn(
  name: string,
  type: string,
  notNull: boolean,
  primaryKeyPosition = 0,
): SqliteDeltaTableColumn {
  return {
    name,
    type,
    notNull,
    primaryKeyPosition,
  };
}

function fingerprintColumns(columns: SqliteDeltaTableColumn[]): string {
  return columns
    .map((column) => [
      column.name,
      column.type.toUpperCase(),
      column.notNull ? 1 : 0,
      column.primaryKeyPosition,
    ].join(':'))
    .join('|');
}

function tableMetadata(
  tableName: string,
  primaryKeys: string[],
  columns: SqliteDeltaTableColumn[],
  acceptedColumnVariants: SqliteDeltaTableColumn[][] = [],
  options: { durability?: SqliteDeltaTableDurability } = {},
): SqliteDeltaTableMetadata {
  const schemaFingerprint = fingerprintColumns(columns);
  return {
    tableName,
    primaryKeys,
    columns,
    schemaFingerprint,
    acceptedSchemaFingerprints: uniqueStrings([
      schemaFingerprint,
      ...acceptedColumnVariants.map((variant) => fingerprintColumns(variant)),
    ]),
    replayMode: 'primary-key-upsert-delete',
    durability: options.durability ?? 'durable-replay',
  };
}

const REVIEW_EVENTS_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('id', 'TEXT', false, 1),
  toColumn('card_id', 'TEXT', false),
  toColumn('attempt_id', 'TEXT', false),
  toColumn('rating', 'INTEGER', false),
  toColumn('reviewed_at', 'INTEGER', true),
  toColumn('commit_idempotency_key', 'TEXT', false),
  toColumn('year', 'INTEGER', true),
  toColumn('month', 'INTEGER', true),
  toColumn('event_type', 'TEXT', true),
  toColumn('payload_json', 'TEXT', true),
  toColumn('msgpack_ref', 'TEXT', false),
  toColumn('truth_hash', 'TEXT', false),
  toColumn('truth_schema_version', 'INTEGER', false),
  toColumn('projection_generation', 'INTEGER', false),
];

const REVIEW_EVENTS_LEGACY_COMMIT_COLUMN_ORDER: SqliteDeltaTableColumn[] = [
  toColumn('id', 'TEXT', false, 1),
  toColumn('card_id', 'TEXT', false),
  toColumn('attempt_id', 'TEXT', false),
  toColumn('rating', 'INTEGER', false),
  toColumn('reviewed_at', 'INTEGER', true),
  toColumn('year', 'INTEGER', true),
  toColumn('month', 'INTEGER', true),
  toColumn('event_type', 'TEXT', true),
  toColumn('payload_json', 'TEXT', true),
  toColumn('commit_idempotency_key', 'TEXT', false),
  toColumn('msgpack_ref', 'TEXT', false),
  toColumn('truth_hash', 'TEXT', false),
  toColumn('truth_schema_version', 'INTEGER', false),
  toColumn('projection_generation', 'INTEGER', false),
];

const CARDS_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('id', 'TEXT', false, 1),
  toColumn('block_id', 'TEXT', false),
  toColumn('xiuyuan_id', 'TEXT', false),
  toColumn('type', 'TEXT', false),
  toColumn('state', 'INTEGER', false),
  toColumn('due', 'INTEGER', false),
  toColumn('priority', 'INTEGER', false),
  toColumn('scheduler_type', 'TEXT', false),
  toColumn('updated_at', 'INTEGER', false),
  toColumn('deck_id', 'TEXT', false),
  toColumn('root_id', 'TEXT', false),
  toColumn('content_text', 'TEXT', false),
  toColumn('tags', 'TEXT', false),
  toColumn('suspended', 'INTEGER', false),
  toColumn('lapses', 'INTEGER', false),
  toColumn('reps', 'INTEGER', false),
  toColumn('last_review', 'INTEGER', false),
  toColumn('created_at', 'INTEGER', false),
  toColumn('scheduled_days', 'INTEGER', false),
  toColumn('stability', 'REAL', false),
  toColumn('difficulty', 'REAL', false),
  toColumn('a_factor', 'REAL', false),
  toColumn('search_text', 'TEXT', false),
  toColumn('card_type_marker', 'TEXT', false),
  toColumn('source_exists', 'INTEGER', false),
  toColumn('source_checked_at', 'INTEGER', false),
  toColumn('source_missing_at', 'INTEGER', false),
  toColumn('payload_json', 'TEXT', true),
  toColumn('dto_json', 'TEXT', false),
  toColumn('msgpack_ref', 'TEXT', false),
  toColumn('truth_hash', 'TEXT', false),
  toColumn('truth_schema_version', 'INTEGER', false),
  toColumn('projection_generation', 'INTEGER', false),
  toColumn('source_hash', 'TEXT', false),
];

const ALGORITHM_CARD_STATE_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('card_id', 'TEXT', true, 1),
  toColumn('algorithm_id', 'TEXT', true, 2),
  toColumn('state_json', 'TEXT', true),
  toColumn('updated_at', 'INTEGER', true),
];

const XIUYUANS_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('id', 'TEXT', false, 1),
  toColumn('updated_at', 'INTEGER', false),
  toColumn('payload_json', 'TEXT', true),
];

const TOMBSTONES_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('kind', 'TEXT', true, 1),
  toColumn('id', 'TEXT', true, 2),
  toColumn('deleted_at', 'INTEGER', true),
  toColumn('deleted_by', 'TEXT', false),
  toColumn('payload_json', 'TEXT', true),
];

const DOMAIN_SYNC_OPERATIONS_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('operation_id', 'TEXT', false, 1),
  toColumn('source_id', 'TEXT', true),
  toColumn('source_device_id', 'TEXT', false),
  toColumn('source_generation', 'INTEGER', false),
  toColumn('operation_type', 'TEXT', true),
  toColumn('entity_type', 'TEXT', true),
  toColumn('entity_id', 'TEXT', true),
  toColumn('entity_block_id', 'TEXT', false),
  toColumn('occurred_at', 'INTEGER', true),
  toColumn('observed_at', 'INTEGER', true),
  toColumn('payload_fingerprint', 'TEXT', true),
  toColumn('idempotency_key', 'TEXT', false),
  toColumn('review_event_id', 'TEXT', false),
  toColumn('payload_json', 'TEXT', true),
  toColumn('msgpack_ref', 'TEXT', false),
  toColumn('truth_hash', 'TEXT', false),
  toColumn('truth_schema_version', 'INTEGER', false),
  toColumn('projection_generation', 'INTEGER', false),
];

const STORE_METADATA_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('key', 'TEXT', false, 1),
  toColumn('value_json', 'TEXT', true),
  toColumn('updated_at', 'INTEGER', true),
];

const QUEUE_STATE_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('key', 'TEXT', false, 1),
  toColumn('value_json', 'TEXT', true),
  toColumn('updated_at', 'INTEGER', true),
];

const REVIEW_TRANSACTION_UNDO_JOURNAL_COLUMNS: SqliteDeltaTableColumn[] = [
  toColumn('undo_token', 'TEXT', false, 1),
  toColumn('transaction_id', 'TEXT', true),
  toColumn('session_id', 'TEXT', true),
  toColumn('queue_type', 'TEXT', true),
  toColumn('operation', 'TEXT', true),
  toColumn('card_id', 'TEXT', false),
  toColumn('original_review_idempotency_key', 'TEXT', false),
  toColumn('status', 'TEXT', true),
  toColumn('recorded_at', 'INTEGER', true),
  toColumn('undone_at', 'INTEGER', false),
  toColumn('payload_json', 'TEXT', true),
];

export const SQLITE_DELTA_TABLE_REGISTRY: SqliteDeltaTableMetadata[] = [
  tableMetadata('cards', ['id'], CARDS_COLUMNS),
  tableMetadata('algorithm_card_state', ['card_id', 'algorithm_id'], ALGORITHM_CARD_STATE_COLUMNS),
  tableMetadata('xiuyuans', ['id'], XIUYUANS_COLUMNS),
  tableMetadata('tombstones', ['kind', 'id'], TOMBSTONES_COLUMNS),
  tableMetadata('domain_sync_operations', ['operation_id'], DOMAIN_SYNC_OPERATIONS_COLUMNS),
  tableMetadata('store_metadata', ['key'], STORE_METADATA_COLUMNS),
  tableMetadata('queue_state', ['key'], QUEUE_STATE_COLUMNS),
  tableMetadata('review_events', ['id'], REVIEW_EVENTS_COLUMNS, [
    REVIEW_EVENTS_LEGACY_COMMIT_COLUMN_ORDER,
  ]),
  tableMetadata('review_transaction_undo_journal', ['undo_token'], REVIEW_TRANSACTION_UNDO_JOURNAL_COLUMNS),
  tableMetadata('queue_projection_generations', ['queue_type'], [
    toColumn('queue_type', 'TEXT', false, 1),
    toColumn('policy_hash', 'TEXT', true),
    toColumn('generation', 'INTEGER', true),
    toColumn('status', 'TEXT', true),
    toColumn('rebuild_reason', 'TEXT', false),
    toColumn('updated_at', 'INTEGER', true),
    toColumn('metadata_json', 'TEXT', true),
    toColumn('truth_generation_id', 'TEXT', false),
    toColumn('truth_schema_version', 'INTEGER', false),
  ], [], { durability: 'derived-cache' }),
  tableMetadata('queue_projection_rows', ['queue_type', 'policy_hash', 'row_id'], [
    toColumn('queue_type', 'TEXT', true, 1),
    toColumn('row_id', 'TEXT', true, 3),
    toColumn('card_id', 'TEXT', true),
    toColumn('block_id', 'TEXT', false),
    toColumn('deck_id', 'TEXT', false),
    toColumn('membership_reason', 'TEXT', true),
    toColumn('due_at', 'INTEGER', false),
    toColumn('due_bucket', 'TEXT', true),
    toColumn('priority_score', 'REAL', true),
    toColumn('sort_key', 'TEXT', true),
    toColumn('queue_index_hint', 'INTEGER', false),
    toColumn('policy_hash', 'TEXT', true, 2),
    toColumn('source_generation', 'INTEGER', true),
    toColumn('payload_json', 'TEXT', true),
    toColumn('updated_at', 'INTEGER', true),
    toColumn('truth_refs_json', 'TEXT', false),
    toColumn('source_hash', 'TEXT', false),
    toColumn('truth_schema_version', 'INTEGER', false),
  ], [], { durability: 'derived-cache' }),
  tableMetadata('queue_projection_counters', ['queue_type', 'policy_hash'], [
    toColumn('queue_type', 'TEXT', true, 1),
    toColumn('policy_hash', 'TEXT', true, 2),
    toColumn('generation', 'INTEGER', true),
    toColumn('version', 'INTEGER', true),
    toColumn('remaining', 'INTEGER', true),
    toColumn('due', 'INTEGER', true),
    toColumn('total', 'INTEGER', true),
    toColumn('buckets_json', 'TEXT', true),
    toColumn('updated_at', 'INTEGER', true),
  ], [], { durability: 'derived-cache' }),
  tableMetadata('queue_projection_invalidations', ['id'], [
    toColumn('id', 'TEXT', false, 1),
    toColumn('queue_type', 'TEXT', true),
    toColumn('reason', 'TEXT', true),
    toColumn('affected_card_ids_json', 'TEXT', true),
    toColumn('affected_block_ids_json', 'TEXT', true),
    toColumn('generation', 'INTEGER', true),
    toColumn('created_at', 'INTEGER', true),
    toColumn('metadata_json', 'TEXT', true),
  ], [], { durability: 'derived-cache' }),
  tableMetadata('queue_projection_rebuilds', ['id'], [
    toColumn('id', 'TEXT', false, 1),
    toColumn('queue_type', 'TEXT', true),
    toColumn('reason', 'TEXT', true),
    toColumn('policy_hash', 'TEXT', true),
    toColumn('generation', 'INTEGER', true),
    toColumn('status', 'TEXT', true),
    toColumn('started_at', 'INTEGER', true),
    toColumn('completed_at', 'INTEGER', false),
    toColumn('metadata_json', 'TEXT', true),
    toColumn('truth_generation_id', 'TEXT', false),
    toColumn('truth_schema_version', 'INTEGER', false),
  ], [], { durability: 'derived-cache' }),
];

function getAll<T extends Record<string, SqlValue>>(db: Database, sql: string, params?: SqlParams): T[] {
  const stmt = db.prepare(sql);
  const rows: T[] = [];
  try {
    if (params) {
      stmt.bind(params);
    }
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function getActualSchemaFingerprint(db: Database, tableName: string): string | null {
  const rows = getAll<TableInfoRow>(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`);
  if (rows.length === 0) {
    return null;
  }
  return fingerprintColumns(rows
    .sort((left, right) => Number(left.cid) - Number(right.cid))
    .map((row) => toColumn(
      String(row.name),
      String(row.type || ''),
      Number(row.notnull) === 1,
      Math.max(0, Math.floor(Number(row.pk) || 0)),
    )));
}

function parseJsonRecord(value: string, context: string): Record<string, SqlValue> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${context}: expected object`);
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, entry]) => [key, normalizeSqlValue(entry)]));
}

function mapAuditRows(rows: AuditRow[]): SqliteDeltaChange[] {
  return rows.map((row) => ({
    table: row.table_name,
    operation: row.operation as SqliteDeltaOperation,
    primaryKey: parseJsonRecord(row.primary_key_json, `SQLite delta audit primary key ${row.table_name}`),
    row: row.row_json ? parseJsonRecord(row.row_json, `SQLite delta audit row ${row.table_name}`) : null,
  }));
}

function normalizeEntry(value: unknown, index: number): SqliteDeltaEntry {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error(`SQLite delta log corrupt: entry ${index} has unsupported version`);
  }
  if (!Array.isArray(value.changes)) {
    throw new Error(`SQLite delta log corrupt: entry ${index} changes must be an array`);
  }
  const changes = value.changes.map((change, changeIndex) => normalizeChange(change, index, changeIndex));
  const mutationEnvelope = normalizeMutationEnvelope(value.mutationEnvelope, changes, index);
  const durabilityReceipt = normalizeDurabilityReceipt(value.durabilityReceipt, mutationEnvelope, index);
  return {
    id: normalizeString(value.id) || `sqlite-delta:${index}`,
    version: 1,
    label: normalizeString(value.label) || 'unknown',
    createdAt: Math.max(0, Math.floor(Number(value.createdAt || 0))),
    schemaFingerprints: isRecord(value.schemaFingerprints)
      ? Object.fromEntries(Object.entries(value.schemaFingerprints).map(([key, entry]) => [key, normalizeString(entry)]))
      : {},
    tables: uniqueStrings(Array.isArray(value.tables) ? value.tables : changes.map((change) => change.table)),
    changes,
    mutationEnvelope,
    durabilityReceipt,
    byteEstimate: Math.max(0, Math.floor(Number(value.byteEstimate || 0))),
  };
}

function normalizeDurabilityReceipt(
  value: unknown,
  mutationEnvelope: StorageMutationEnvelope | null,
  entryIndex: number,
): StorageDurabilityReceipt | null {
  if (value === null || value === undefined) {
    if (mutationEnvelope) {
      throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation receipt is missing`);
    }
    return null;
  }
  if (!mutationEnvelope
    || !isRecord(value)
    || value.version !== STORAGE_DURABILITY_RECEIPT_VERSION
    || normalizeString(value.mutationId) !== mutationEnvelope.mutationId
    || Math.floor(Number(value.journalSequence)) !== mutationEnvelope.journalSequence
    || value.stage !== 'journaled') {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation receipt is invalid`);
  }
  const retry = isRecord(value.retry) ? value.retry : {};
  return {
    version: STORAGE_DURABILITY_RECEIPT_VERSION,
    mutationId: mutationEnvelope.mutationId,
    family: mutationEnvelope.family,
    stage: 'journaled',
    journalSequence: mutationEnvelope.journalSequence,
    affectedAggregates: mutationEnvelope.affectedAggregates,
    requiredTruthOutputs: mutationEnvelope.requiredTruthOutputs,
    truthGenerationId: value.truthGenerationId == null ? null : normalizeString(value.truthGenerationId),
    retry: {
      attemptCount: Math.max(0, Math.floor(Number(retry.attemptCount || 0))),
      nextAttemptAt: retry.nextAttemptAt == null ? null : Math.max(0, Math.floor(Number(retry.nextAttemptAt))),
      lastError: retry.lastError == null ? null : normalizeString(retry.lastError),
    },
    diagnosticCode: value.diagnosticCode == null ? null : normalizeString(value.diagnosticCode),
    diagnosticMessage: value.diagnosticMessage == null ? null : normalizeString(value.diagnosticMessage),
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt || 0))),
  };
}

function normalizeMutationEnvelope(
  value: unknown,
  changes: SqliteDeltaChange[],
  entryIndex: number,
): StorageMutationEnvelope | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value) || value.version !== STORAGE_MUTATION_ENVELOPE_VERSION) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation envelope has unsupported version`);
  }
  const mutationId = normalizeString(value.mutationId);
  const deviceId = normalizeString(value.deviceId);
  const identityEpoch = normalizeString(value.identityEpoch);
  const journalSequence = Math.floor(Number(value.journalSequence));
  if (!mutationId || !deviceId || !identityEpoch || !Number.isFinite(journalSequence) || journalSequence < 1) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation envelope is incomplete`);
  }
  if (!Array.isArray(value.operations)
    || !Array.isArray(value.affectedAggregates)
    || !Array.isArray(value.requiredTruthOutputs)) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation envelope collections are invalid`);
  }
  const operations = value.operations.map((operation, operationIndex) => (
    normalizeMutationOperation(operation, entryIndex, operationIndex)
  ));
  const expectedOperations = changes.map(toStorageMutationOperation);
  if (JSON.stringify(operations) !== JSON.stringify(expectedOperations)) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation envelope operations do not match delta changes`);
  }
  return {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId,
    family: normalizeString(value.family) as StorageMutationEnvelope['family'],
    deviceId,
    identityEpoch,
    journalSequence,
    createdAt: Math.max(0, Math.floor(Number(value.createdAt || 0))),
    affectedAggregates: value.affectedAggregates.map((aggregate, aggregateIndex) => {
      if (!isRecord(aggregate)) {
        throw new Error(`SQLite delta log corrupt: entry ${entryIndex} aggregate ${aggregateIndex} is invalid`);
      }
      return {
        family: normalizeString(aggregate.family),
        aggregateId: normalizeString(aggregate.aggregateId),
        causalBaseRevision: aggregate.causalBaseRevision == null
          ? null
          : normalizeString(aggregate.causalBaseRevision),
      };
    }),
    operations,
    requiredTruthOutputs: value.requiredTruthOutputs.map((output, outputIndex) => {
      if (!isRecord(output) || !Array.isArray(output.aggregateIds)) {
        throw new Error(`SQLite delta log corrupt: entry ${entryIndex} truth output ${outputIndex} is invalid`);
      }
      return {
        family: normalizeString(output.family),
        kind: normalizeString(output.kind) as StorageMutationEnvelope['requiredTruthOutputs'][number]['kind'],
        aggregateIds: uniqueStrings(output.aggregateIds),
      };
    }),
  };
}

function normalizeMutationOperation(
  value: unknown,
  entryIndex: number,
  operationIndex: number,
): StorageMutationOperation {
  if (!isRecord(value) || !isRecord(value.primaryKey)) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} mutation operation ${operationIndex} is invalid`);
  }
  return {
    table: normalizeString(value.table),
    operation: normalizeString(value.operation) as StorageMutationOperation['operation'],
    primaryKey: Object.fromEntries(
      Object.entries(value.primaryKey).map(([key, entry]) => [key, normalizeSqlValue(entry)]),
    ),
    row: value.row == null
      ? null
      : isRecord(value.row)
        ? Object.fromEntries(Object.entries(value.row).map(([key, entry]) => [key, normalizeSqlValue(entry)]))
        : null,
  };
}

function toStorageMutationOperation(change: SqliteDeltaChange): StorageMutationOperation {
  return {
    table: change.table,
    operation: change.operation,
    primaryKey: { ...change.primaryKey },
    row: change.row ? { ...change.row } : null,
  };
}

function findExistingMutationEntry(
  entries: SqliteDeltaEntry[],
  candidate: StorageMutationEnvelope,
): SqliteDeltaEntry | null {
  const existing = [...entries].reverse().find((entry) => (
    entry.mutationEnvelope?.mutationId === candidate.mutationId
  )) ?? null;
  if (!existing?.mutationEnvelope || !existing.durabilityReceipt) {
    return null;
  }
  const existingSignature = JSON.stringify({
    family: existing.mutationEnvelope.family,
    deviceId: existing.mutationEnvelope.deviceId,
    identityEpoch: existing.mutationEnvelope.identityEpoch,
    affectedAggregates: existing.mutationEnvelope.affectedAggregates,
    requiredTruthOutputs: existing.mutationEnvelope.requiredTruthOutputs,
  });
  const candidateSignature = JSON.stringify({
    family: candidate.family,
    deviceId: candidate.deviceId,
    identityEpoch: candidate.identityEpoch,
    affectedAggregates: candidate.affectedAggregates,
    requiredTruthOutputs: candidate.requiredTruthOutputs,
  });
  if (existingSignature !== candidateSignature) {
    throw new Error(`INVALID_REQUEST: conflicting mutation payload for ${candidate.mutationId}`);
  }
  return existing;
}

function normalizeSegmentEnvelope(value: unknown, path: string): SqliteDeltaSegmentEnvelope {
  if (!isRecord(value)
    || value.version !== SQLITE_DELTA_LOG_VERSION
    || value.kind !== 'sqlite-delta-segment'
    || normalizeString(value.path) !== path
    || !Array.isArray(value.entries)) {
    throw new Error(`SQLite delta segment corrupt: ${path}`);
  }
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    kind: 'sqlite-delta-segment',
    path,
    sequence: Math.max(0, Math.floor(Number(value.sequence || 0))),
    sealed: value.sealed === true,
    createdAt: Math.max(0, Math.floor(Number(value.createdAt || 0))),
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt || 0))),
    entries: value.entries.map((entry, index) => normalizeEntry(entry, index)),
  };
}

function buildSegmentEnvelope(input: {
  path: string;
  sequence: number;
  sealed: boolean;
  entries: SqliteDeltaEntry[];
  previous?: SqliteDeltaSegmentEnvelope | null;
}): SqliteDeltaSegmentEnvelope {
  const now = Date.now();
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    kind: 'sqlite-delta-segment',
    path: input.path,
    sequence: input.sequence,
    sealed: input.sealed,
    createdAt: input.previous?.createdAt ?? now,
    updatedAt: now,
    entries: input.entries,
  };
}

function buildSegmentManifestEntry(input: {
  envelope: SqliteDeltaSegmentEnvelope;
  bytes: Uint8Array;
  sealedAt?: number | null;
}): SqliteDeltaSegmentManifestEntry {
  const createdAtValues = input.envelope.entries.map((entry) => entry.createdAt);
  const minCreatedAt = createdAtValues.length > 0 ? Math.min(...createdAtValues) : null;
  const maxCreatedAt = createdAtValues.length > 0 ? Math.max(...createdAtValues) : null;
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    path: input.envelope.path,
    sequence: input.envelope.sequence,
    sealed: input.envelope.sealed,
    checksum: checksumBytes(input.bytes),
    entryCount: input.envelope.entries.length,
    byteSize: input.bytes.byteLength,
    minCreatedAt,
    maxCreatedAt,
    sealedAt: input.sealedAt ?? (input.envelope.sealed ? Date.now() : null),
  };
}

function uniqueSegmentEntriesByPath(entries: SqliteDeltaSegmentManifestEntry[]): SqliteDeltaSegmentManifestEntry[] {
  const byPath = new Map<string, SqliteDeltaSegmentManifestEntry>();
  for (const entry of entries) {
    byPath.set(entry.path, entry);
  }
  return Array.from(byPath.values()).sort((left, right) => left.sequence - right.sequence);
}

function manifestReadSignature(manifest: SqliteDeltaSegmentManifest): string {
  return JSON.stringify({
    openSegment: manifest.openSegment,
    sealedSegments: manifest.sealedSegments,
    checkpoint: manifest.checkpoint ?? null,
    nextSequence: manifest.nextSequence,
    nextMutationSequence: manifest.nextMutationSequence,
  });
}

function segmentManifestIdentityMatches(
  left: SqliteDeltaSegmentManifestEntry,
  right: SqliteDeltaSegmentManifestEntry,
): boolean {
  return left.path === right.path
    && left.sequence === right.sequence
    && left.sealed === right.sealed
    && left.checksum === right.checksum
    && left.entryCount === right.entryCount
    && left.byteSize === right.byteSize;
}

function normalizeChange(value: unknown, entryIndex: number, changeIndex: number): SqliteDeltaChange {
  if (!isRecord(value)) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} change ${changeIndex} must be an object`);
  }
  const table = normalizeString(value.table);
  const operation = normalizeString(value.operation) as SqliteDeltaOperation;
  if (!table || (operation !== 'insert' && operation !== 'update' && operation !== 'delete')) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} change ${changeIndex} has invalid identity`);
  }
  if (!isRecord(value.primaryKey)) {
    throw new Error(`SQLite delta log corrupt: entry ${entryIndex} change ${changeIndex} missing primary key`);
  }
  return {
    table,
    operation,
    primaryKey: Object.fromEntries(Object.entries(value.primaryKey).map(([key, entry]) => [key, normalizeSqlValue(entry)])),
    row: isRecord(value.row)
      ? Object.fromEntries(Object.entries(value.row).map(([key, entry]) => [key, normalizeSqlValue(entry)]))
      : null,
  };
}

function normalizeDiagnosticsContext(
  context: SqliteDeltaDiagnosticsContext | undefined,
): Required<SqliteDeltaDiagnosticsContext> {
  const hasProjectionGeneration = context?.projectionGeneration !== null
    && context?.projectionGeneration !== undefined
    && context?.projectionGeneration !== '';
  const projectionGeneration = hasProjectionGeneration ? Number(context?.projectionGeneration) : NaN;
  return {
    cause: normalizeString(context?.cause) || null,
    initiator: normalizeString(context?.initiator) || null,
    projectionGeneration: Number.isFinite(projectionGeneration) ? Math.floor(projectionGeneration) : null,
    hotPath: context?.hotPath === true,
  };
}

function labelLooksHotPath(label: string): boolean {
  return normalizeString(label).startsWith('review.feedback');
}

function projectionGenerationFromChange(change: SqliteDeltaChange): number | null {
  const raw = change.row?.generation ?? change.row?.source_generation ?? change.row?.projection_generation ?? null;
  const generation = Number(raw);
  return Number.isFinite(generation) ? Math.floor(generation) : null;
}

function maxProjectionGenerationFromEntries(entries: SqliteDeltaEntry[]): number | null {
  let result: number | null = null;
  for (const entry of entries) {
    for (const change of entry.changes) {
      const generation = projectionGenerationFromChange(change);
      if (generation === null) {
        continue;
      }
      result = result === null ? generation : Math.max(result, generation);
    }
  }
  return result;
}

function maxProjectionGenerationFromChanges(changes: SqliteDeltaChange[]): number | null {
  let result: number | null = null;
  for (const change of changes) {
    const generation = projectionGenerationFromChange(change);
    if (generation === null) {
      continue;
    }
    result = result === null ? generation : Math.max(result, generation);
  }
  return result;
}

export class SqliteDeltaCheckpointLayer {
  private readonly tableByName = new Map(SQLITE_DELTA_TABLE_REGISTRY.map((table) => [table.tableName, table]));
  private lastWrite: SqliteDeltaOperationStatus | null = null;
  private lastReplay: SqliteDeltaOperationStatus | null = null;
  private lastCheckpoint: SqliteDeltaOperationStatus | null = null;
  private deltaWritesTotal = 0;
  private checkpointWritesTotal = 0;
  private checkpointOnlyTotal = 0;
  private replayedEntriesTotal = 0;
  private appendHotPathSnapshot: SqliteDeltaLogSnapshot | null = null;
  private verifiedSegmentEvidenceByPath = new Map<string, VerifiedSegmentEvidence>();

  constructor(
    private readonly fileService: SqliteDeltaFileService,
    private readonly fileName = SQLITE_DELTA_LOG_FILE,
    private readonly options: {
      checkpointStorageClass?: SqliteCheckpointStorageClass;
    } = {},
  ) {}

  private get checkpointStorageClass(): SqliteCheckpointStorageClass {
    return this.options.checkpointStorageClass ?? 'durable-checkpoint';
  }

  private canClearDeltaAfterCheckpoint(): boolean {
    return this.checkpointStorageClass === 'durable-checkpoint';
  }

  canClearPendingAfterCheckpoint(): boolean {
    return this.canClearDeltaAfterCheckpoint();
  }

  private canUseCheckpointForThreshold(): boolean {
    return this.checkpointStorageClass === 'durable-checkpoint';
  }

  private rememberAppendHotPathSnapshot(snapshot: SqliteDeltaLogSnapshot): void {
    this.appendHotPathSnapshot = snapshot;
  }

  private clearAppendHotPathSnapshot(): void {
    this.appendHotPathSnapshot = null;
  }

  private rememberVerifiedSegmentEvidence(
    manifestEntry: SqliteDeltaSegmentManifestEntry,
    envelope: SqliteDeltaSegmentEnvelope,
    provenance: VerifiedSegmentEvidence['provenance'] = 'generated',
  ): void {
    if (
      envelope.path !== manifestEntry.path
      || envelope.sequence !== manifestEntry.sequence
      || envelope.sealed !== manifestEntry.sealed
      || envelope.entries.length !== manifestEntry.entryCount
    ) {
      this.verifiedSegmentEvidenceByPath.delete(manifestEntry.path);
      return;
    }
    const storedProvenance = manifestEntry.sealed && provenance === 'generated'
      ? 'persisted-write'
      : provenance;
    this.verifiedSegmentEvidenceByPath.set(manifestEntry.path, {
      manifestEntry: { ...manifestEntry },
      envelope,
      provenance: storedProvenance,
    });
  }

  private clearVerifiedSegmentEvidence(): void {
    this.verifiedSegmentEvidenceByPath.clear();
  }

  private readVerifiedSegmentEvidence(
    manifestEntry: SqliteDeltaSegmentManifestEntry,
  ): SqliteDeltaSegmentEnvelope | null {
    const evidence = this.verifiedSegmentEvidenceByPath.get(manifestEntry.path);
    if (!evidence) {
      return null;
    }
    if (
      manifestEntry.sealed
      && this.checkpointStorageClass !== 'durable-checkpoint'
      && evidence.provenance !== 'persisted-read'
      && evidence.provenance !== 'persisted-write'
    ) {
      return null;
    }
    if (!segmentManifestIdentityMatches(evidence.manifestEntry, manifestEntry)) {
      this.verifiedSegmentEvidenceByPath.delete(manifestEntry.path);
      return null;
    }
    if (
      evidence.envelope.path !== manifestEntry.path
      || evidence.envelope.sequence !== manifestEntry.sequence
      || evidence.envelope.sealed !== manifestEntry.sealed
      || evidence.envelope.entries.length !== manifestEntry.entryCount
    ) {
      this.verifiedSegmentEvidenceByPath.delete(manifestEntry.path);
      return null;
    }
    return evidence.envelope;
  }

  private async readAppendHotPathSnapshot(): Promise<SqliteDeltaLogSnapshot | null> {
    const cached = this.appendHotPathSnapshot;
    if (!cached) {
      return null;
    }
    try {
      return await this.readSnapshotFromManifest(cached.manifest, {
        allowVerifiedSegmentEvidence: true,
        purpose: 'sqlite-delta.append-preflight',
        substep: 'read-append-hot-path-snapshot',
      });
    } catch (error) {
      this.clearAppendHotPathSnapshot();
      if (!isSegmentChecksumMismatch(error)) {
        throw error;
      }
      return this.readSnapshot({
        purpose: 'sqlite-delta.append-preflight',
        substep: 'read-append-hot-path-snapshot-refresh',
      });
    }
  }

  private isDerivedCacheTable(tableName: string): boolean {
    return this.tableByName.get(tableName)?.durability === 'derived-cache';
  }

  private isDurableReplayTable(tableName: string): boolean {
    return this.tableByName.get(tableName)?.durability !== 'derived-cache';
  }

  private acceptsSchemaFingerprint(metadata: SqliteDeltaTableMetadata, fingerprint: string | null | undefined): boolean {
    return Boolean(fingerprint && metadata.acceptedSchemaFingerprints.includes(fingerprint));
  }

  beginTransaction(db: Database, label: string): SqliteDeltaTransactionCapture {
    const touchedTables = new Set<string>();
    const triggerNames: string[] = [];
    const schemaMismatchedTables: string[] = [];
    const schemaFingerprints: Record<string, string> = {};
    let setupError: string | null = null;

    try {
      if (typeof db.updateHook !== 'function') {
        throw new Error('sql.js updateHook unavailable');
      }
      db.updateHook((_operation, _database, table) => {
        if (this.isInternalTable(table)) {
          return;
        }
        touchedTables.add(table);
      });
      db.run(
        `CREATE TEMP TABLE IF NOT EXISTS ${AUDIT_TABLE} (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          operation TEXT NOT NULL,
          primary_key_json TEXT NOT NULL,
          row_json TEXT
        )`,
      );
      db.run(`DELETE FROM ${AUDIT_TABLE}`);
      for (const table of SQLITE_DELTA_TABLE_REGISTRY) {
        const actualFingerprint = getActualSchemaFingerprint(db, table.tableName);
        if (actualFingerprint) {
          schemaFingerprints[table.tableName] = actualFingerprint;
        }
        if (!this.acceptsSchemaFingerprint(table, actualFingerprint)) {
          schemaMismatchedTables.push(table.tableName);
          continue;
        }
        triggerNames.push(...this.installAuditTriggers(db, table));
      }
    } catch (error) {
      setupError = error instanceof Error ? error.message : String(error);
    }

    const cleanup = (): void => {
      try {
        db.updateHook(null);
      } catch {
        // Ignore cleanup failure; transaction outcome already decided.
      }
      for (const triggerName of triggerNames.reverse()) {
        try {
          db.run(`DROP TRIGGER IF EXISTS temp.${quoteIdentifier(triggerName)}`);
        } catch {
          // Ignore cleanup failure; temp triggers die with the connection.
        }
      }
    };

    return {
      finish: (): SqliteDeltaCaptureResult => {
        let changes: SqliteDeltaChange[] = [];
        try {
          if (!setupError) {
            changes = mapAuditRows(getAll<AuditRow>(
              db,
              `SELECT table_name, operation, primary_key_json, row_json
               FROM ${AUDIT_TABLE}
               ORDER BY seq ASC`,
            ));
          }
        } catch (error) {
          setupError = error instanceof Error ? error.message : String(error);
        } finally {
          cleanup();
        }
        const skippedDerivedChanges = changes.filter((change) => this.isDerivedCacheTable(change.table));
        const durableChanges = changes.filter((change) => this.isDurableReplayTable(change.table));
        const skippedDerivedTables = uniqueStrings([
          ...Array.from(touchedTables).filter((table) => this.isDerivedCacheTable(table)),
          ...skippedDerivedChanges.map((change) => change.table),
        ]);
        return {
          label,
          setupError,
          touchedTables: uniqueStrings(touchedTables),
          schemaMismatchedTables: uniqueStrings(schemaMismatchedTables),
          schemaFingerprints,
          changes: durableChanges,
          skippedDerivedTables,
          skippedDerivedChangeCount: skippedDerivedChanges.length,
        };
      },
      abort: cleanup,
    };
  }

  async persistCommittedTransaction(input: {
    label: string;
    capture: SqliteDeltaCaptureResult | null;
    schemaChanged: boolean;
    mutationEnvelope?: StorageMutationEnvelope;
    diagnostics?: SqliteDeltaDiagnosticsContext;
    diagnosticRecorder?: SqliteDeltaDiagnosticRecorder;
  }): Promise<SqliteDeltaPersistResult> {
    const diagnostics = normalizeDiagnosticsContext(input.diagnostics);
    const hotPath = diagnostics.hotPath || labelLooksHotPath(input.label);
    let snapshot: SqliteDeltaLogSnapshot;
    const preflightStartedAt = Date.now();
    try {
      snapshot = await this.readAppendHotPathSnapshot() ?? await this.readSnapshot({
        allowVerifiedSegmentEvidence: 'sealed-only',
        purpose: 'sqlite-delta.append-preflight',
        substep: 'persist-committed-transaction-read-snapshot',
      });
    } catch (error) {
      recordSqliteDeltaDiagnostic(input.diagnosticRecorder, 'sqlite.delta-append-preflight', preflightStartedAt, {
        label: input.label,
        status: 'failed',
      });
      this.clearAppendHotPathSnapshot();
      if (!this.canClearDeltaAfterCheckpoint() && !isOpenSegmentChecksumMismatch(error)) {
        throw error;
      }
      const repairReason = isOpenSegmentChecksumMismatch(error)
        ? 'corrupt-open-segment-checkpoint-repair'
        : 'pending-delta-unreadable';
      this.checkpointOnlyTotal += 1;
      this.lastWrite = {
        ok: true,
        at: Date.now(),
        classification: 'checkpoint',
        label: input.label,
        cause: input.label,
        initiator: diagnostics.initiator,
        projectionGeneration: diagnostics.projectionGeneration
          ?? maxProjectionGenerationFromChanges(input.capture?.changes ?? []),
        hotPath,
        reason: repairReason,
        pendingCount: 0,
        pendingBytes: 0,
        affectedTables: input.capture?.touchedTables ?? [],
        skippedDerivedTables: input.capture?.skippedDerivedTables ?? [],
        skippedDerivedChangeCount: input.capture?.skippedDerivedChangeCount ?? 0,
        checkpointStorageClass: this.checkpointStorageClass,
        error: error instanceof Error ? error.message : String(error),
      };
      return {
        mode: 'checkpoint',
        reason: repairReason,
        diagnostics: {
          cause: input.label,
          initiator: diagnostics.initiator,
          projectionGeneration: diagnostics.projectionGeneration
            ?? maxProjectionGenerationFromChanges(input.capture?.changes ?? []),
          hotPath,
        },
      };
    }
    recordSqliteDeltaDiagnostic(input.diagnosticRecorder, 'sqlite.delta-append-preflight', preflightStartedAt, {
      label: input.label,
      status: 'ok',
      pendingCount: snapshot.entries.length,
    });
    const pendingAccountingStartedAt = Date.now();
    const pendingBytes = snapshot.pendingBytes;
    recordSqliteDeltaDiagnostic(input.diagnosticRecorder, 'sqlite.delta-pending-accounting', pendingAccountingStartedAt, {
      label: input.label,
      pendingCount: snapshot.entries.length,
      pendingBytes,
      source: 'snapshot.pendingBytes',
    });
    const existingMutationEntry = input.mutationEnvelope
      ? findExistingMutationEntry(snapshot.entries, input.mutationEnvelope)
      : null;
    if (existingMutationEntry) {
      return {
        mode: 'delta',
        entry: existingMutationEntry,
      };
    }
    const rawCheckpointReason = this.classifyCheckpointReason(input, snapshot, pendingBytes);
    const checkpointReason = rawCheckpointReason === 'delta-threshold-exceeded' && !this.canUseCheckpointForThreshold()
      ? null
      : rawCheckpointReason;
    const skippedDerivedTables = input.capture?.skippedDerivedTables ?? [];
    const skippedDerivedChangeCount = input.capture?.skippedDerivedChangeCount ?? 0;
    if (checkpointReason === 'derived-cache-only') {
      const skipDiagnostics: SqliteDeltaDiagnosticsContext = {
        cause: input.label,
        initiator: diagnostics.initiator,
        projectionGeneration: diagnostics.projectionGeneration,
        hotPath,
      };
      this.lastWrite = {
        ok: true,
        at: Date.now(),
        classification: 'delta',
        label: input.label,
        ...skipDiagnostics,
        reason: checkpointReason,
        pendingCount: snapshot.entries.length,
        pendingBytes,
        deltaEntryId: null,
        deltaEntriesWritten: 0,
        affectedTables: [],
        skippedDerivedTables,
        skippedDerivedChangeCount,
        checkpointStorageClass: this.checkpointStorageClass,
      };
      return {
        mode: 'skipped',
        reason: checkpointReason,
        diagnostics: skipDiagnostics,
      };
    }
    if (checkpointReason) {
      this.clearAppendHotPathSnapshot();
      if (hotPath && checkpointReason !== 'delta-threshold-exceeded') {
        const error = new Error(
          `BACKEND_UNAVAILABLE: SQLite delta durability unavailable for hot path ${input.label}: ${checkpointReason}`,
        );
        this.lastWrite = {
          ok: false,
          at: Date.now(),
          classification: 'delta',
          label: input.label,
          cause: input.label,
          initiator: diagnostics.initiator,
          projectionGeneration: diagnostics.projectionGeneration
            ?? maxProjectionGenerationFromChanges(input.capture?.changes ?? []),
          hotPath,
          reason: checkpointReason,
          pendingCount: snapshot.entries.length,
          pendingBytes,
          affectedTables: input.capture?.touchedTables ?? [],
          skippedDerivedTables,
          skippedDerivedChangeCount,
          error: error.message,
          checkpointStorageClass: this.checkpointStorageClass,
        };
        throw error;
      }
      this.checkpointOnlyTotal += 1;
      const checkpointDiagnostics: SqliteDeltaDiagnosticsContext = {
        cause: input.label,
        initiator: diagnostics.initiator,
        projectionGeneration: diagnostics.projectionGeneration
          ?? maxProjectionGenerationFromChanges(input.capture?.changes ?? []),
        hotPath,
      };
      this.lastWrite = {
        ok: true,
        at: Date.now(),
        classification: 'checkpoint',
        label: input.label,
        ...checkpointDiagnostics,
        reason: checkpointReason,
        pendingCount: snapshot.entries.length,
        pendingBytes,
        affectedTables: input.capture?.touchedTables ?? [],
        skippedDerivedTables,
        skippedDerivedChangeCount,
        checkpointStorageClass: this.checkpointStorageClass,
      };
      return {
        mode: 'checkpoint',
        reason: checkpointReason,
        diagnostics: checkpointDiagnostics,
      };
    }

    const capture = input.capture!;
    const buildEntryStartedAt = Date.now();
    const entry = this.buildEntry(
      input.label,
      capture,
      input.mutationEnvelope
        ? {
            ...input.mutationEnvelope,
            journalSequence: snapshot.manifest.nextMutationSequence,
            operations: capture.changes.map(toStorageMutationOperation),
          }
        : null,
    );
    recordSqliteDeltaDiagnostic(input.diagnosticRecorder, 'sqlite.delta-build-entry', buildEntryStartedAt, {
      label: input.label,
      tableCount: entry.tables.length,
      changeCount: entry.changes.length,
      byteEstimate: entry.byteEstimate,
    });
    const nextEntries = [...snapshot.entries, entry];
    const nextSnapshot: SqliteDeltaLogSnapshot = {
      version: SQLITE_DELTA_LOG_VERSION,
      entries: nextEntries,
      updatedAt: Date.now(),
      manifest: snapshot.manifest,
      pendingBytes: calculateNextPendingBytes(snapshot, entry),
    };
    const nextPendingAccountingStartedAt = Date.now();
    const nextPendingBytes = nextSnapshot.pendingBytes;
    recordSqliteDeltaDiagnostic(input.diagnosticRecorder, 'sqlite.delta-next-pending-accounting', nextPendingAccountingStartedAt, {
      label: input.label,
      pendingCount: nextEntries.length,
      pendingBytes: nextPendingBytes,
      previousPendingBytes: pendingBytes,
      entryByteEstimate: normalizeByteEstimate(entry.byteEstimate),
      source: 'snapshot.pendingBytes+entry.byteEstimate',
    });
    if (this.canUseCheckpointForThreshold()
      && (nextEntries.length > MAX_PENDING_DELTA_ENTRIES || nextPendingBytes > MAX_PENDING_DELTA_BYTES)) {
      const reason = 'delta-threshold-exceeded';
      this.clearAppendHotPathSnapshot();
      this.checkpointOnlyTotal += 1;
      const checkpointDiagnostics: SqliteDeltaDiagnosticsContext = {
        cause: input.label,
        initiator: diagnostics.initiator,
        projectionGeneration: diagnostics.projectionGeneration ?? maxProjectionGenerationFromEntries([entry]),
        hotPath,
      };
      this.lastWrite = {
        ok: true,
        at: Date.now(),
        classification: 'checkpoint',
        label: input.label,
        ...checkpointDiagnostics,
        reason,
        pendingCount: snapshot.entries.length,
        pendingBytes,
        affectedTables: entry.tables,
        skippedDerivedTables,
        skippedDerivedChangeCount,
        checkpointStorageClass: this.checkpointStorageClass,
      };
      return {
        mode: 'checkpoint',
        reason,
        diagnostics: checkpointDiagnostics,
      };
    }
    try {
      const appendStartedAt = Date.now();
      const writeResult = await this.appendDeltaEntryToSegments(
        snapshot.manifest,
        entry,
        input.diagnosticRecorder,
      );
      recordSqliteDeltaDiagnostic(input.diagnosticRecorder, 'sqlite.delta-append-entry-to-segments', appendStartedAt, {
        label: input.label,
        tableCount: entry.tables.length,
        changeCount: entry.changes.length,
      });
      nextSnapshot.manifest = writeResult.manifest;
    } catch (error) {
      this.clearAppendHotPathSnapshot();
      if (isOpenSegmentChecksumMismatch(error)) {
        const reason = 'corrupt-open-segment-checkpoint-repair';
        this.checkpointOnlyTotal += 1;
        const checkpointDiagnostics: SqliteDeltaDiagnosticsContext = {
          cause: input.label,
          initiator: diagnostics.initiator,
          projectionGeneration: diagnostics.projectionGeneration ?? maxProjectionGenerationFromEntries([entry]),
          hotPath,
        };
        this.lastWrite = {
          ok: true,
          at: Date.now(),
          classification: 'checkpoint',
          label: input.label,
          ...checkpointDiagnostics,
          reason,
          pendingCount: snapshot.entries.length,
          pendingBytes,
          deltaEntryId: entry.id,
          deltaEntriesWritten: 0,
          affectedTables: entry.tables,
          skippedDerivedTables,
          skippedDerivedChangeCount,
          checkpointStorageClass: this.checkpointStorageClass,
          error: describeError(error),
        };
        return {
          mode: 'checkpoint',
          reason,
          diagnostics: checkpointDiagnostics,
        };
      }
      this.lastWrite = {
        ok: false,
        at: Date.now(),
        classification: 'delta',
        label: input.label,
        reason: null,
        pendingCount: snapshot.entries.length,
        pendingBytes,
        deltaEntryId: entry.id,
        affectedTables: entry.tables,
        skippedDerivedTables,
        skippedDerivedChangeCount,
        error: error instanceof Error ? error.message : String(error),
        checkpointStorageClass: this.checkpointStorageClass,
      };
      throw error;
    }
    this.rememberAppendHotPathSnapshot(nextSnapshot);
    this.deltaWritesTotal += 1;
    this.lastWrite = {
      ok: true,
      at: Date.now(),
      classification: 'delta',
      label: input.label,
      cause: input.label,
      initiator: diagnostics.initiator,
      projectionGeneration: diagnostics.projectionGeneration ?? maxProjectionGenerationFromEntries([entry]),
      hotPath,
      reason: null,
      pendingCount: nextSnapshot.entries.length,
      pendingBytes: nextPendingBytes,
      deltaEntryId: entry.id,
      deltaEntriesWritten: 1,
      affectedTables: entry.tables,
      skippedDerivedTables,
      skippedDerivedChangeCount,
      checkpointStorageClass: this.checkpointStorageClass,
    };
    return {
      mode: 'delta',
      entry,
    };
  }

  private async appendDeltaEntryToSegments(
    manifest: SqliteDeltaSegmentManifest,
    entry: SqliteDeltaEntry,
    diagnosticRecorder?: SqliteDeltaDiagnosticRecorder,
  ): Promise<{ manifest: SqliteDeltaSegmentManifest }> {
    const openReadStartedAt = Date.now();
    const openEnvelope = manifest.openSegment
      ? await this.readSegmentEnvelope(manifest.openSegment, {
        allowVerifiedSegmentEvidence: true,
      })
      : null;
    if (manifest.openSegment) {
      recordSqliteDeltaDiagnostic(diagnosticRecorder, 'sqlite.delta-read-open-segment', openReadStartedAt, {
        path: manifest.openSegment.path,
        sequence: manifest.openSegment.sequence,
        byteSize: manifest.openSegment.byteSize,
        entryCount: manifest.openSegment.entryCount,
      });
    }
    const openEntries = openEnvelope?.entries ?? [];
    const candidateEntries = [...openEntries, entry];
    const candidateSequence = openEnvelope?.sequence ?? manifest.nextSequence;
    const candidateEnvelope = buildSegmentEnvelope({
      path: SQLITE_DELTA_OPEN_SEGMENT_FILE,
      sequence: candidateSequence,
      sealed: false,
      entries: candidateEntries,
      previous: openEnvelope,
    });
    const candidateEncodeStartedAt = Date.now();
    const candidateBytes = encode(candidateEnvelope);
    recordSqliteDeltaDiagnostic(diagnosticRecorder, 'sqlite.delta-encode-segment', candidateEncodeStartedAt, {
      segmentRole: 'candidate',
      sequence: candidateSequence,
      entryCount: candidateEntries.length,
      byteLength: candidateBytes.byteLength,
    });
    const shouldSealCandidate = candidateEntries.length >= MAX_OPEN_SEGMENT_DELTA_ENTRIES
      || candidateBytes.byteLength >= MAX_OPEN_SEGMENT_BYTES;

    let sealedSegments = manifest.sealedSegments;
    let nextSequence = Math.max(manifest.nextSequence, candidateSequence + 1);
    let openSegmentEntry: SqliteDeltaSegmentManifestEntry | null = null;
    let sealedSegmentEvidence: {
      manifestEntry: SqliteDeltaSegmentManifestEntry;
      envelope: SqliteDeltaSegmentEnvelope;
    } | null = null;

    if (shouldSealCandidate) {
      const sealedPath = sqliteDeltaSealedSegmentFile(candidateSequence);
      if (manifest.sealedSegments.some((segment) => segment.path === sealedPath)) {
        throw new Error(`SQLite delta sealed segment already exists in manifest: ${sealedPath}`);
      }
      const sealedEnvelope = buildSegmentEnvelope({
        path: sealedPath,
        sequence: candidateSequence,
        sealed: true,
        entries: candidateEntries,
        previous: openEnvelope,
      });
      const sealedEncodeStartedAt = Date.now();
      const sealedBytes = encode(sealedEnvelope);
      recordSqliteDeltaDiagnostic(diagnosticRecorder, 'sqlite.delta-encode-segment', sealedEncodeStartedAt, {
        segmentRole: 'sealed',
        sequence: candidateSequence,
        entryCount: candidateEntries.length,
        byteLength: sealedBytes.byteLength,
      });
      const writeSegmentStartedAt = Date.now();
      await this.fileService.writeBinary(sealedPath, sealedBytes, {
        purpose: 'sqlite-delta.append',
        substep: 'write-sealed-segment',
      });
      recordSqliteDeltaDiagnostic(diagnosticRecorder, 'sqlite.delta-write-segment', writeSegmentStartedAt, {
        segmentRole: 'sealed',
        path: sealedPath,
        sequence: candidateSequence,
        byteLength: sealedBytes.byteLength,
      });
      sealedSegments = [
        ...manifest.sealedSegments.filter((segment) => segment.path !== sealedPath),
        buildSegmentManifestEntry({
          envelope: sealedEnvelope,
          bytes: sealedBytes,
          sealedAt: Date.now(),
        }),
      ].sort((left, right) => left.sequence - right.sequence);
      sealedSegmentEvidence = {
        manifestEntry: sealedSegments.find((segment) => segment.path === sealedPath)!,
        envelope: sealedEnvelope,
      };
    } else {
      const writeSegmentStartedAt = Date.now();
      await this.fileService.writeBinary(SQLITE_DELTA_OPEN_SEGMENT_FILE, candidateBytes, {
        purpose: 'sqlite-delta.append',
        substep: 'write-open-segment',
      });
      recordSqliteDeltaDiagnostic(diagnosticRecorder, 'sqlite.delta-write-segment', writeSegmentStartedAt, {
        segmentRole: 'open',
        path: SQLITE_DELTA_OPEN_SEGMENT_FILE,
        sequence: candidateSequence,
        byteLength: candidateBytes.byteLength,
      });
      openSegmentEntry = buildSegmentManifestEntry({
        envelope: candidateEnvelope,
        bytes: candidateBytes,
        sealedAt: null,
      });
    }

    const nextManifest: SqliteDeltaSegmentManifest = {
      version: SQLITE_DELTA_LOG_VERSION,
      path: this.fileName,
      openSegment: openSegmentEntry,
      sealedSegments,
      updatedAt: Date.now(),
      nextSequence,
      nextMutationSequence: entry.mutationEnvelope?.journalSequence
        ? Math.max(manifest.nextMutationSequence, entry.mutationEnvelope.journalSequence + 1)
        : manifest.nextMutationSequence,
      checkpoint: null,
    };
    const writeManifestStartedAt = Date.now();
    await this.fileService.writeJSON(this.fileName, nextManifest, {
      purpose: 'sqlite-delta.append',
      substep: 'write-manifest',
    });
    recordSqliteDeltaDiagnostic(diagnosticRecorder, 'sqlite.delta-write-manifest', writeManifestStartedAt, {
      path: this.fileName,
      nextSequence,
      sealedSegmentCount: sealedSegments.length,
      openSegment: Boolean(openSegmentEntry),
    });
    if (openSegmentEntry) {
      this.rememberVerifiedSegmentEvidence(openSegmentEntry, candidateEnvelope);
    } else {
      this.verifiedSegmentEvidenceByPath.delete(SQLITE_DELTA_OPEN_SEGMENT_FILE);
    }
    if (sealedSegmentEvidence) {
      this.rememberVerifiedSegmentEvidence(
        sealedSegmentEvidence.manifestEntry,
        sealedSegmentEvidence.envelope,
        'persisted-write',
      );
    }
    return { manifest: nextManifest };
  }

  async replayPending(db: Database): Promise<SqliteDeltaOperationStatus> {
    this.clearAppendHotPathSnapshot();
    const snapshot = await this.readSnapshot({
      allowVerifiedSegmentEvidence: true,
      purpose: 'sqlite-delta.replay',
      substep: 'read-pending-snapshot',
    });
    const pendingBytes = snapshot.pendingBytes;
    if (snapshot.entries.length === 0) {
      this.lastReplay = {
        ok: true,
        at: Date.now(),
        replayedCount: 0,
        pendingCount: 0,
        pendingBytes,
      };
      return this.lastReplay;
    }

    try {
      for (const entry of snapshot.entries) {
        this.validateEntryForReplay(db, entry);
        for (const change of entry.changes) {
          this.replayChange(db, change);
        }
      }
      this.replayedEntriesTotal += snapshot.entries.length;
      this.lastReplay = {
        ok: true,
        at: Date.now(),
        replayedCount: snapshot.entries.length,
        pendingCount: snapshot.entries.length,
        pendingBytes,
        affectedTables: uniqueStrings(snapshot.entries.flatMap((entry) => entry.tables)),
      };
      return this.lastReplay;
    } catch (error) {
      this.lastReplay = {
        ok: false,
        at: Date.now(),
        replayedCount: 0,
        pendingCount: snapshot.entries.length,
        pendingBytes,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async hasPendingDeltas(): Promise<boolean> {
    this.clearAppendHotPathSnapshot();
    return (await this.readSnapshot()).entries.length > 0;
  }

  async hasCheckpointablePendingDeltas(): Promise<boolean> {
    this.clearAppendHotPathSnapshot();
    return this.canClearDeltaAfterCheckpoint() && (await this.readSnapshot()).entries.length > 0;
  }

  async hasCheckpointablePendingDeltasForPersistPreflight(): Promise<boolean> {
    if (!this.canClearDeltaAfterCheckpoint()) {
      return false;
    }
    const snapshot = await this.readAppendHotPathSnapshot() ?? await this.readSnapshot();
    return snapshot.entries.length > 0;
  }

  async discardPending(
    reason: string,
    diagnosticsContext?: SqliteDeltaDiagnosticsContext,
  ): Promise<void> {
    this.clearAppendHotPathSnapshot();
    let snapshot: SqliteDeltaLogSnapshot | null = null;
    let snapshotReadError: unknown = null;
    try {
      snapshot = await this.readSnapshot();
    } catch (error) {
      snapshotReadError = error;
    }
    const pendingBytes = snapshot ? snapshot.pendingBytes : 0;
    const coveredSegmentPaths = snapshot
      ? uniqueStrings([
        ...snapshot.manifest.sealedSegments.map((segment) => segment.path),
        ...(snapshot.manifest.openSegment ? [snapshot.manifest.openSegment.path] : []),
        ...(snapshot.manifest.checkpoint?.coveredSegmentPaths ?? []),
      ])
      : [];
    await this.fileService.writeJSON(this.fileName, emptyManifest(Date.now()));
    const cleanupError = await this.deleteCoveredSegmentFiles(coveredSegmentPaths);
    this.checkpointOnlyTotal += 1;
    const diagnostics = normalizeDiagnosticsContext(diagnosticsContext);
    this.lastCheckpoint = {
      ok: true,
      at: Date.now(),
      classification: 'checkpoint',
      cause: reason,
      initiator: diagnostics.initiator,
      projectionGeneration: diagnostics.projectionGeneration
        ?? (snapshot ? maxProjectionGenerationFromEntries(snapshot.entries) : null),
      hotPath: diagnostics.hotPath || labelLooksHotPath(reason),
      reason,
      pendingCount: snapshot?.entries.length ?? 0,
      pendingBytes,
      byteLength: null,
      cleared: true,
      affectedTables: snapshot ? uniqueStrings(snapshot.entries.flatMap((entry) => entry.tables)) : [],
      checkpointStorageClass: this.checkpointStorageClass,
      error: cleanupError ?? (snapshotReadError
        ? `sqlite-delta-discard-read-failed: ${snapshotReadError instanceof Error ? snapshotReadError.message : String(snapshotReadError)}`
        : null),
    };
  }

  async clearAfterCheckpoint(
    reason: string,
    byteLength: number | null,
    diagnosticsContext?: SqliteDeltaDiagnosticsContext,
  ): Promise<void> {
    this.clearAppendHotPathSnapshot();
    const snapshot = await this.readSnapshot().catch(async (snapshotReadError) => {
      const canClearUnreadablePending = this.canClearDeltaAfterCheckpoint()
        || (
          isCorruptOpenSegmentCheckpointRepairReason(reason)
          && isOpenSegmentChecksumMismatch(snapshotReadError)
        );
      if (!canClearUnreadablePending) {
        throw snapshotReadError;
      }
      await this.clearUnreadablePendingAfterCheckpoint(reason, byteLength, diagnosticsContext, snapshotReadError);
      return null;
    });
    if (!snapshot) {
      return;
    }
    const pendingBytes = snapshot.pendingBytes;
    const clearCoveredDeltas = this.canClearDeltaAfterCheckpoint()
      || isCorruptOpenSegmentCheckpointRepairReason(reason);
    let cleanupError: string | null = null;
    if (snapshot.entries.length > 0 && clearCoveredDeltas) {
      const coveredSegmentPaths = [
        ...snapshot.manifest.sealedSegments.map((segment) => segment.path),
        ...(snapshot.manifest.openSegment ? [snapshot.manifest.openSegment.path] : []),
      ];
      await this.fileService.writeJSON(this.fileName, {
        ...emptyManifest(Date.now()),
        checkpoint: {
          clearedAt: Date.now(),
          coveredSegmentPaths,
          reason,
        },
      } satisfies SqliteDeltaSegmentManifest);
      cleanupError = await this.deleteCoveredSegmentFiles(coveredSegmentPaths);
    }
    this.checkpointWritesTotal += 1;
    const diagnostics = normalizeDiagnosticsContext(diagnosticsContext);
    this.lastCheckpoint = {
      ok: true,
      at: Date.now(),
      classification: 'checkpoint',
      cause: reason,
      initiator: diagnostics.initiator,
      projectionGeneration: diagnostics.projectionGeneration ?? maxProjectionGenerationFromEntries(snapshot.entries),
      hotPath: diagnostics.hotPath || labelLooksHotPath(reason),
      reason,
      pendingCount: snapshot.entries.length,
      pendingBytes,
      byteLength,
      cleared: snapshot.entries.length > 0 && clearCoveredDeltas,
      affectedTables: uniqueStrings(snapshot.entries.flatMap((entry) => entry.tables)),
      checkpointStorageClass: this.checkpointStorageClass,
      error: cleanupError,
    };
  }

  private async clearUnreadablePendingAfterCheckpoint(
    reason: string,
    byteLength: number | null,
    diagnosticsContext: SqliteDeltaDiagnosticsContext | undefined,
    snapshotReadError: unknown,
  ): Promise<void> {
    this.clearAppendHotPathSnapshot();
    const manifest = await this.readManifest().catch(() => emptyManifest(Date.now()));
    const coveredSegmentPaths = uniqueStrings([
      ...manifest.sealedSegments.map((segment) => segment.path),
      ...(manifest.openSegment ? [manifest.openSegment.path] : []),
      ...(manifest.checkpoint?.coveredSegmentPaths ?? []),
    ]);
    const pendingCount = manifest.sealedSegments.reduce((total, segment) => total + segment.entryCount, 0)
      + (manifest.openSegment?.entryCount ?? 0);
    const pendingBytes = manifest.sealedSegments.reduce((total, segment) => total + segment.byteSize, 0)
      + (manifest.openSegment?.byteSize ?? 0);
    await this.fileService.writeJSON(this.fileName, {
      ...emptyManifest(Date.now()),
      checkpoint: {
        clearedAt: Date.now(),
        coveredSegmentPaths,
        reason,
      },
    } satisfies SqliteDeltaSegmentManifest);
    const cleanupError = await this.deleteCoveredSegmentFiles(coveredSegmentPaths);
    this.checkpointWritesTotal += 1;
    const diagnostics = normalizeDiagnosticsContext(diagnosticsContext);
    this.lastCheckpoint = {
      ok: true,
      at: Date.now(),
      classification: 'checkpoint',
      cause: reason,
      initiator: diagnostics.initiator,
      projectionGeneration: diagnostics.projectionGeneration,
      hotPath: diagnostics.hotPath || labelLooksHotPath(reason),
      reason,
      pendingCount,
      pendingBytes,
      byteLength,
      cleared: true,
      affectedTables: [],
      checkpointStorageClass: this.checkpointStorageClass,
      error: [
        `sqlite-delta-clear-after-checkpoint-read-failed: ${describeError(snapshotReadError)}`,
        cleanupError,
      ].filter((entry): entry is string => Boolean(entry)).join('; ') || null,
    };
  }

  async recordCheckpointFailure(
    reason: string,
    error: unknown,
    diagnosticsContext?: SqliteDeltaDiagnosticsContext,
  ): Promise<void> {
    this.clearAppendHotPathSnapshot();
    const snapshot = await this.readSnapshot().catch(() => null);
    const diagnostics = normalizeDiagnosticsContext(diagnosticsContext);
    this.lastCheckpoint = {
      ok: false,
      at: Date.now(),
      classification: 'checkpoint',
      cause: reason,
      initiator: diagnostics.initiator,
      projectionGeneration: diagnostics.projectionGeneration ?? (snapshot ? maxProjectionGenerationFromEntries(snapshot.entries) : null),
      hotPath: diagnostics.hotPath || labelLooksHotPath(reason),
      reason,
      pendingCount: snapshot?.entries.length ?? 0,
      pendingBytes: snapshot ? snapshot.pendingBytes : 0,
      cleared: false,
      checkpointStorageClass: this.checkpointStorageClass,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  private async deleteCoveredSegmentFiles(
    paths: string[],
    options: { skipAbsent?: boolean } = {},
  ): Promise<string | null> {
    if (!this.fileService.deleteFile) {
      return null;
    }
    const uniquePaths = uniqueStrings(paths);
    let pathsToDelete = uniquePaths;
    if (options.skipAbsent && this.fileService.listFiles) {
      const listedPaths = new Set(
        (await this.fileService.listFiles(SQLITE_DELTA_LOG_DIR))
          .map((entry) => normalizeString(entry.path).replace(/\\/g, '/'))
          .filter(Boolean),
      );
      pathsToDelete = uniquePaths.filter((path) => listedPaths.has(path));
    }
    const failures: string[] = [];
    for (const path of pathsToDelete) {
      try {
        await this.fileService.deleteFile(path);
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return failures.length > 0 ? `sqlite-delta-segment-cleanup-failed: ${failures.join('; ')}` : null;
  }

  async getDiagnostics(): Promise<SqliteDeltaDiagnostics> {
    this.clearAppendHotPathSnapshot();
    const snapshot = await this.readSnapshot();
    return {
      fileName: this.fileName,
      version: SQLITE_DELTA_LOG_VERSION,
      registeredTables: SQLITE_DELTA_TABLE_REGISTRY.map((table) => table.tableName),
      durableReplayTables: SQLITE_DELTA_TABLE_REGISTRY
        .filter((table) => table.durability === 'durable-replay')
        .map((table) => table.tableName),
      derivedCacheTables: SQLITE_DELTA_TABLE_REGISTRY
        .filter((table) => table.durability === 'derived-cache')
        .map((table) => table.tableName),
      pendingCount: snapshot.entries.length,
      pendingBytes: snapshot.pendingBytes,
      affectedTables: uniqueStrings(snapshot.entries.flatMap((entry) => entry.tables)),
      deltaWritesTotal: this.deltaWritesTotal,
      checkpointWritesTotal: this.checkpointWritesTotal,
      checkpointOnlyTotal: this.checkpointOnlyTotal,
      replayedEntriesTotal: this.replayedEntriesTotal,
      lastWrite: this.lastWrite,
      lastReplay: this.lastReplay,
      lastCheckpoint: this.lastCheckpoint,
    };
  }

  async getStorageInventory(): Promise<SqliteDeltaStorageInventory> {
    const manifest = await this.readManifest({
      purpose: 'sqlite-delta.storage-inventory',
      substep: 'read-manifest',
    });
    const segments = [
      ...manifest.sealedSegments,
      ...(manifest.openSegment ? [manifest.openSegment] : []),
    ];
    return {
      files: segments.length,
      sealedFiles: manifest.sealedSegments.length,
      openFiles: manifest.openSegment ? 1 : 0,
      entries: segments.reduce((total, segment) => total + segment.entryCount, 0),
      bytes: segments.reduce((total, segment) => total + segment.byteSize, 0),
      oldestCreatedAt: segments.reduce<number | null>(
        (oldest, segment) => segment.minCreatedAt !== null && (oldest === null || segment.minCreatedAt < oldest)
          ? segment.minCreatedAt
          : oldest,
        null,
      ),
    };
  }

  async inspectStartupEvidence(
    truthCoverageFrontier: number | null,
  ): Promise<SqliteDeltaStartupEvidence> {
    this.clearAppendHotPathSnapshot();
    const snapshot = await this.readSnapshot({
      allowVerifiedSegmentEvidence: true,
      purpose: 'sqlite-delta.startup-evidence',
      substep: 'verify-manifest-and-segments',
    });
    const segments = [
      ...snapshot.manifest.sealedSegments,
      ...(snapshot.manifest.openSegment ? [snapshot.manifest.openSegment] : []),
    ];
    const normalizedFrontier = truthCoverageFrontier === null
      ? null
      : Math.max(0, Math.floor(Number(truthCoverageFrontier) || 0));
    return {
      files: segments.length,
      entries: snapshot.entries.length,
      segmentPaths: segments.map((segment) => segment.path),
      checkpoint: snapshot.manifest.checkpoint
        ? structuredClone(snapshot.manifest.checkpoint)
        : null,
      truthCoverageFrontier: normalizedFrontier,
      uncoveredMutationCount: normalizedFrontier === null
        ? null
        : snapshot.entries.filter((entry) => (
          entry.mutationEnvelope?.journalSequence !== null
          && entry.mutationEnvelope?.journalSequence !== undefined
          && entry.mutationEnvelope.journalSequence > normalizedFrontier
          && entry.durabilityReceipt?.stage !== 'failed'
        )).length,
    };
  }

  async compactCoveredSegments(input: {
    coveredJournalSequence: number;
    retainSealedSegments?: number;
  }): Promise<SqliteDeltaCompactionResult> {
    this.clearAppendHotPathSnapshot();
    const coveredJournalSequence = Math.max(
      0,
      Math.floor(Number(input.coveredJournalSequence) || 0),
    );
    const retainSealedSegments = Math.max(
      0,
      Math.floor(Number(input.retainSealedSegments) || 0),
    );
    let manifest = await this.readManifest({
      purpose: 'sqlite-delta.compaction',
      substep: 'read-manifest',
    });

    if (
      manifest.checkpoint?.reason === 'coverage-compaction'
      && manifest.checkpoint.coveredSegmentPaths.length > 0
    ) {
      if (!this.fileService.deleteFile) {
        throw new Error('sqlite-delta-compaction-delete-unavailable');
      }
      const pendingCleanupError = await this.deleteCoveredSegmentFiles(
        manifest.checkpoint.coveredSegmentPaths,
        { skipAbsent: true },
      );
      if (pendingCleanupError) {
        throw new Error(pendingCleanupError);
      }
      manifest = {
        ...manifest,
        checkpoint: null,
        updatedAt: Date.now(),
      };
      await this.fileService.writeJSON(this.fileName, manifest, {
        purpose: 'sqlite-delta.compaction',
        substep: 'clear-completed-cleanup-checkpoint',
      });
    }

    const orderedSealed = manifest.sealedSegments
      .slice()
      .sort((left, right) => left.sequence - right.sequence || left.path.localeCompare(right.path));
    const candidateCount = Math.max(0, orderedSealed.length - retainSealedSegments);
    const candidates = orderedSealed.slice(0, candidateCount);
    if (candidates.length === 0) {
      return {
        status: 'compacted',
        reason: null,
        coveredJournalSequence,
        candidateSegmentCount: 0,
        candidateEntryCount: 0,
        candidateBytes: 0,
        reclaimableEntryCount: 0,
        reclaimableBytes: 0,
        retainedEntryCount: 0,
        retainedBytes: 0,
        deletedSegmentPaths: [],
        relocatedEntryCount: 0,
        relocatedSegmentPaths: [],
        remainingSealedSegmentCount: orderedSealed.length,
      };
    }
    if (!this.fileService.deleteFile) {
      throw new Error('sqlite-delta-compaction-delete-unavailable');
    }

    const candidateEnvelopes = await Promise.all(candidates.map((candidate) => (
      this.readSegmentEnvelope(candidate, {
        allowVerifiedSegmentEvidence: true,
        purpose: 'sqlite-delta.compaction',
        substep: 'read-candidate-segment',
      })
    )));
    const candidateEntries = candidateEnvelopes.flatMap((envelope) => envelope.entries);
    const relocatedEntries = candidateEntries.filter((entry) => {
      const sequence = entry.mutationEnvelope?.journalSequence
        ?? entry.durabilityReceipt?.journalSequence
        ?? null;
      return sequence === null || sequence > coveredJournalSequence;
    });
    const reclaimableEntries = candidateEntries.filter((entry) => !relocatedEntries.includes(entry));
    const candidateBytes = candidates.reduce((total, candidate) => total + candidate.byteSize, 0);
    const reclaimableBytes = reclaimableEntries.reduce((total, entry) => total + entry.byteEstimate, 0);
    const retainedBytes = relocatedEntries.reduce((total, entry) => total + entry.byteEstimate, 0);
    if (reclaimableEntries.length === 0) {
      return {
        status: 'no-progress',
        reason: 'no-progress-uncovered',
        coveredJournalSequence,
        candidateSegmentCount: candidates.length,
        candidateEntryCount: candidateEntries.length,
        candidateBytes,
        reclaimableEntryCount: 0,
        reclaimableBytes: 0,
        retainedEntryCount: relocatedEntries.length,
        retainedBytes,
        deletedSegmentPaths: [],
        relocatedEntryCount: 0,
        relocatedSegmentPaths: [],
        remainingSealedSegmentCount: orderedSealed.length,
      };
    }
    const relocation = await this.writeRelocatedSegments(
      relocatedEntries,
      manifest.nextSequence,
    );
    const candidatePaths = candidates.map((candidate) => candidate.path);
    const retainedSegments = orderedSealed.filter((segment) => !candidatePaths.includes(segment.path));
    const switchedManifest: SqliteDeltaSegmentManifest = {
      ...manifest,
      sealedSegments: [...retainedSegments, ...relocation.manifestEntries]
        .sort((left, right) => left.sequence - right.sequence || left.path.localeCompare(right.path)),
      updatedAt: Date.now(),
      nextSequence: relocation.nextSequence,
      checkpoint: {
        clearedAt: Date.now(),
        coveredSegmentPaths: candidatePaths,
        reason: 'coverage-compaction',
      },
    };
    await this.fileService.writeJSON(this.fileName, switchedManifest, {
      purpose: 'sqlite-delta.compaction',
      substep: 'publish-compacted-manifest',
    });
    const published = await this.readManifest({
      purpose: 'sqlite-delta.compaction',
      substep: 'verify-compacted-manifest',
    });
    if (manifestReadSignature(published) !== manifestReadSignature(switchedManifest)) {
      throw new Error('sqlite-delta-compaction-manifest-verification-failed');
    }

    const cleanupError = await this.deleteCoveredSegmentFiles(candidatePaths);
    if (cleanupError) {
      throw new Error(cleanupError);
    }
    const completedManifest: SqliteDeltaSegmentManifest = {
      ...switchedManifest,
      checkpoint: null,
      updatedAt: Date.now(),
    };
    await this.fileService.writeJSON(this.fileName, completedManifest, {
      purpose: 'sqlite-delta.compaction',
      substep: 'complete-compaction-cleanup',
    });
    for (const path of candidatePaths) {
      this.verifiedSegmentEvidenceByPath.delete(path);
    }
    this.rememberAppendHotPathSnapshot(await this.readSnapshotFromManifest(
      completedManifest,
      {
        allowVerifiedSegmentEvidence: true,
        purpose: 'sqlite-delta.compaction',
        substep: 'remember-compacted-snapshot',
      },
    ));
    return {
      status: 'compacted',
      reason: null,
      coveredJournalSequence,
      candidateSegmentCount: candidates.length,
      candidateEntryCount: candidateEntries.length,
      candidateBytes,
      reclaimableEntryCount: reclaimableEntries.length,
      reclaimableBytes,
      retainedEntryCount: relocatedEntries.length,
      retainedBytes,
      deletedSegmentPaths: candidatePaths,
      relocatedEntryCount: relocatedEntries.length,
      relocatedSegmentPaths: relocation.manifestEntries.map((entry) => entry.path),
      remainingSealedSegmentCount: completedManifest.sealedSegments.length,
    };
  }

  async cleanupOrphanSegments(input: {
    dryRun?: boolean;
    maxFiles?: number;
    maxBytes?: number;
  } = {}): Promise<SqliteDeltaOrphanCleanupResult> {
    if (!this.fileService.listFiles) {
      throw new Error('sqlite-delta-orphan-inventory-unavailable');
    }
    if (!input.dryRun && !this.fileService.deleteFile) {
      throw new Error('sqlite-delta-orphan-delete-unavailable');
    }
    const maxFiles = Math.max(1, Math.floor(Number(input.maxFiles) || 32));
    const maxBytes = Math.max(1, Math.floor(Number(input.maxBytes) || 16 * 1024 * 1024));
    const manifest = await this.readManifest({
      purpose: 'sqlite-delta.orphan-cleanup',
      substep: 'read-protected-manifest',
    });
    const protectedPaths = this.protectedSegmentPaths(manifest);
    const listed = await this.fileService.listFiles(`${SQLITE_DELTA_LOG_DIR}/`);
    const byPath = new Map<string, { path: string; size: number | null }>();
    for (const entry of listed) {
      const path = String(entry.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!path || path.includes('..') || byPath.has(path)) {
        continue;
      }
      byPath.set(path, {
        path,
        size: Number.isFinite(Number(entry.size))
          ? Math.max(0, Math.floor(Number(entry.size)))
          : null,
      });
    }
    const orphanFiles = Array.from(byPath.values())
      .filter((entry) => this.isSqliteDeltaSealedSegmentPath(entry.path))
      .filter((entry) => !protectedPaths.has(entry.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    const orphanBytes = orphanFiles.reduce((total, entry) => total + (entry.size ?? 0), 0);
    const unknownSizeOrphanCount = orphanFiles.filter((entry) => entry.size === null).length;
    if (input.dryRun) {
      return {
        status: 'dry-run',
        listedFileCount: byPath.size,
        protectedSegmentCount: protectedPaths.size,
        orphanFileCount: orphanFiles.length,
        orphanBytes,
        unknownSizeOrphanCount,
        deletedFiles: [],
        skippedFiles: [],
        failedFiles: [],
        remainingOrphanFileCount: orphanFiles.length,
        remainingOrphanBytes: orphanBytes,
        remainingUnknownSizeOrphanCount: unknownSizeOrphanCount,
      };
    }

    const deletedFiles: Array<{ path: string; size: number | null }> = [];
    const skippedFiles: Array<{ path: string; size: number | null; reason: string }> = [];
    const failedFiles: Array<{ path: string; size: number | null; reason: string }> = [];
    let deletedBytes = 0;
    for (const entry of orphanFiles) {
      if (deletedFiles.length >= maxFiles) {
        break;
      }
      if (entry.size !== null && deletedBytes + entry.size > maxBytes) {
        skippedFiles.push({ ...entry, reason: 'byte-budget' });
        continue;
      }
      const latestManifest = await this.readManifest({
        purpose: 'sqlite-delta.orphan-cleanup',
        substep: 'revalidate-protected-manifest',
      });
      if (this.protectedSegmentPaths(latestManifest).has(entry.path)) {
        skippedFiles.push({ ...entry, reason: 'became-protected' });
        continue;
      }
      try {
        await this.fileService.deleteFile!(entry.path);
        deletedFiles.push(entry);
        deletedBytes += entry.size ?? 0;
        this.verifiedSegmentEvidenceByPath.delete(entry.path);
      } catch (error) {
        failedFiles.push({
          ...entry,
          reason: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    const deletedPaths = new Set(deletedFiles.map((entry) => entry.path));
    const remaining = orphanFiles.filter((entry) => !deletedPaths.has(entry.path));
    const remainingOrphanBytes = remaining.reduce((total, entry) => total + (entry.size ?? 0), 0);
    const remainingUnknownSizeOrphanCount = remaining.filter((entry) => entry.size === null).length;
    return {
      status: remaining.length === 0 && failedFiles.length === 0 ? 'completed' : 'partial',
      listedFileCount: byPath.size,
      protectedSegmentCount: protectedPaths.size,
      orphanFileCount: orphanFiles.length,
      orphanBytes,
      unknownSizeOrphanCount,
      deletedFiles,
      skippedFiles,
      failedFiles,
      remainingOrphanFileCount: remaining.length,
      remainingOrphanBytes,
      remainingUnknownSizeOrphanCount,
    };
  }

  async adoptLegacyEntries(input: {
    deviceId: string;
    identityEpoch: string;
    afterJournalSequence: number;
  }): Promise<SqliteDeltaLegacyAdoptionResult> {
    this.clearAppendHotPathSnapshot();
    if (!this.fileService.deleteFile) {
      throw new Error('sqlite-delta-legacy-adoption-delete-unavailable');
    }
    let manifest = await this.readManifest({
      purpose: 'sqlite-delta.legacy-adoption',
      substep: 'read-manifest',
    });
    if (
      manifest.checkpoint?.reason === 'legacy-adoption'
      && manifest.checkpoint.coveredSegmentPaths.length > 0
    ) {
      const cleanupError = await this.deleteCoveredSegmentFiles(
        manifest.checkpoint.coveredSegmentPaths,
      );
      if (cleanupError) {
        throw new Error(cleanupError);
      }
      manifest = {
        ...manifest,
        checkpoint: null,
        updatedAt: Date.now(),
      };
      await this.fileService.writeJSON(this.fileName, manifest, {
        purpose: 'sqlite-delta.legacy-adoption',
        substep: 'clear-resumed-cleanup-checkpoint',
      });
    }
    const snapshot = await this.readSnapshotFromManifest(manifest, {
      allowVerifiedSegmentEvidence: true,
      purpose: 'sqlite-delta.legacy-adoption',
      substep: 'read-verified-entries',
    });
    const existingSequenceFrontier = snapshot.entries.reduce((frontier, entry) => {
      const sequence = entry.mutationEnvelope?.journalSequence
        ?? entry.durabilityReceipt?.journalSequence
        ?? 0;
      return Math.max(frontier, sequence);
    }, 0);
    const startingJournalSequence = Math.max(
      1,
      manifest.nextMutationSequence,
      existingSequenceFrontier + 1,
      Math.max(0, Math.floor(Number(input.afterJournalSequence) || 0)) + 1,
    );
    const plan = planSqliteLegacyDeltaAdoption({
      entries: snapshot.entries,
      deviceId: input.deviceId,
      identityEpoch: input.identityEpoch,
      startingJournalSequence,
    });
    if (plan.status === 'blocked') {
      return {
        status: 'blocked',
        adoptedEntryCount: 0,
        firstJournalSequence: null,
        lastJournalSequence: null,
        nextJournalSequence: manifest.nextMutationSequence,
        replacedSegmentPaths: [],
        adoptedSegmentPaths: [],
        unsupportedEntries: plan.unsupportedEntries,
      };
    }
    if (plan.status === 'not-needed') {
      return {
        status: 'not-needed',
        adoptedEntryCount: 0,
        firstJournalSequence: null,
        lastJournalSequence: null,
        nextJournalSequence: manifest.nextMutationSequence,
        replacedSegmentPaths: [],
        adoptedSegmentPaths: [],
        unsupportedEntries: [],
      };
    }

    const replacement = await this.writeRelocatedSegments(plan.entries, manifest.nextSequence);
    const replacedSegmentPaths = uniqueStrings([
      ...manifest.sealedSegments.map((segment) => segment.path),
      ...(manifest.openSegment ? [manifest.openSegment.path] : []),
    ]);
    const switchedManifest: SqliteDeltaSegmentManifest = {
      ...manifest,
      openSegment: null,
      sealedSegments: replacement.manifestEntries,
      updatedAt: Date.now(),
      nextSequence: replacement.nextSequence,
      nextMutationSequence: plan.nextJournalSequence,
      checkpoint: {
        clearedAt: Date.now(),
        coveredSegmentPaths: replacedSegmentPaths,
        reason: 'legacy-adoption',
      },
    };
    await this.fileService.writeJSON(this.fileName, switchedManifest, {
      purpose: 'sqlite-delta.legacy-adoption',
      substep: 'publish-adopted-manifest',
    });
    const published = await this.readManifest({
      purpose: 'sqlite-delta.legacy-adoption',
      substep: 'verify-adopted-manifest',
    });
    if (manifestReadSignature(published) !== manifestReadSignature(switchedManifest)) {
      throw new Error('sqlite-delta-legacy-adoption-manifest-verification-failed');
    }
    const cleanupError = await this.deleteCoveredSegmentFiles(replacedSegmentPaths);
    if (cleanupError) {
      throw new Error(cleanupError);
    }
    const completedManifest: SqliteDeltaSegmentManifest = {
      ...switchedManifest,
      checkpoint: null,
      updatedAt: Date.now(),
    };
    await this.fileService.writeJSON(this.fileName, completedManifest, {
      purpose: 'sqlite-delta.legacy-adoption',
      substep: 'complete-adoption-cleanup',
    });
    for (const path of replacedSegmentPaths) {
      this.verifiedSegmentEvidenceByPath.delete(path);
    }
    this.rememberAppendHotPathSnapshot(await this.readSnapshotFromManifest(
      completedManifest,
      {
        allowVerifiedSegmentEvidence: true,
        purpose: 'sqlite-delta.legacy-adoption',
        substep: 'remember-adopted-snapshot',
      },
    ));
    return {
      status: 'adopted',
      adoptedEntryCount: plan.adoptedEntryCount,
      firstJournalSequence: plan.firstJournalSequence,
      lastJournalSequence: plan.lastJournalSequence,
      nextJournalSequence: plan.nextJournalSequence,
      replacedSegmentPaths,
      adoptedSegmentPaths: replacement.manifestEntries.map((entry) => entry.path),
      unsupportedEntries: [],
    };
  }

  async listJournaledMutations(input: {
    afterJournalSequence?: number;
    limit?: number;
  } = {}): Promise<SqliteJournaledMutationEntry[]> {
    this.clearAppendHotPathSnapshot();
    const afterJournalSequence = Math.max(0, Math.floor(Number(input.afterJournalSequence) || 0));
    const limit = Math.max(1, Math.floor(Number(input.limit) || 32));
    const snapshot = await this.readSnapshot({
      allowVerifiedSegmentEvidence: true,
      purpose: 'sqlite-delta.truth-promotion',
      substep: 'list-journaled-mutations',
    });
    return snapshot.entries
      .filter((entry): entry is SqliteDeltaEntry & {
        mutationEnvelope: StorageMutationEnvelope;
        durabilityReceipt: StorageDurabilityReceipt;
      } => Boolean(
        entry.mutationEnvelope
        && entry.durabilityReceipt
        && entry.mutationEnvelope.journalSequence !== null
        && entry.mutationEnvelope.journalSequence > afterJournalSequence
        && entry.durabilityReceipt.stage !== 'failed',
      ))
      .sort((left, right) => (
        (left.mutationEnvelope.journalSequence ?? 0) - (right.mutationEnvelope.journalSequence ?? 0)
      ))
      .slice(0, limit)
      .map((entry) => ({
        createdAt: entry.createdAt,
        mutationEnvelope: structuredClone(entry.mutationEnvelope),
        durabilityReceipt: structuredClone(entry.durabilityReceipt),
      }));
  }

  private async writeRelocatedSegments(
    entries: SqliteDeltaEntry[],
    startSequence: number,
  ): Promise<{
    manifestEntries: SqliteDeltaSegmentManifestEntry[];
    nextSequence: number;
  }> {
    if (entries.length === 0) {
      return {
        manifestEntries: [],
        nextSequence: startSequence,
      };
    }
    const groups: SqliteDeltaEntry[][] = [];
    let current: SqliteDeltaEntry[] = [];
    for (const entry of entries) {
      const candidate = [...current, entry];
      const candidateEnvelope = buildSegmentEnvelope({
        path: 'sqlite-delta-relocation-size-probe',
        sequence: startSequence + groups.length,
        sealed: true,
        entries: candidate,
      });
      const exceedsLimit = candidate.length > MAX_OPEN_SEGMENT_DELTA_ENTRIES
        || encode(candidateEnvelope).byteLength > MAX_OPEN_SEGMENT_BYTES;
      if (current.length > 0 && exceedsLimit) {
        groups.push(current);
        current = [entry];
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) {
      groups.push(current);
    }

    const manifestEntries: SqliteDeltaSegmentManifestEntry[] = [];
    let nextSequence = Math.max(1, startSequence);
    for (const group of groups) {
      const path = sqliteDeltaSealedSegmentFile(nextSequence);
      const envelope = buildSegmentEnvelope({
        path,
        sequence: nextSequence,
        sealed: true,
        entries: group,
      });
      const bytes = encode(envelope);
      await this.fileService.writeBinary(path, bytes, {
        purpose: 'sqlite-delta.compaction',
        substep: 'write-relocated-segment',
      });
      const manifestEntry = buildSegmentManifestEntry({
        envelope,
        bytes,
        sealedAt: Date.now(),
      });
      const verified = await this.readSegmentEnvelope(manifestEntry, {
        purpose: 'sqlite-delta.compaction',
        substep: 'verify-relocated-segment',
      });
      this.rememberVerifiedSegmentEvidence(manifestEntry, verified, 'persisted-write');
      manifestEntries.push(manifestEntry);
      nextSequence += 1;
    }
    return {
      manifestEntries,
      nextSequence,
    };
  }

  private protectedSegmentPaths(manifest: SqliteDeltaSegmentManifest): Set<string> {
    return new Set(uniqueStrings([
      ...manifest.sealedSegments.map((segment) => segment.path),
      ...(manifest.openSegment ? [manifest.openSegment.path] : []),
      ...(manifest.checkpoint?.coveredSegmentPaths ?? []),
    ]));
  }

  private isSqliteDeltaSealedSegmentPath(path: string): boolean {
    return new RegExp(
      `^${SQLITE_DELTA_LOG_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sqlite-delta-log\\.v2\\.sealed-\\d+\\.msgpack$`,
    ).test(path);
  }

  getHotPathDiagnostics(): SqliteDeltaHotPathDiagnostics {
    return {
      lastWrite: this.lastWrite,
      lastCheckpoint: this.lastCheckpoint,
    };
  }

  private async readSnapshot(
    metadata: SqliteDeltaSnapshotReadOptions = {},
  ): Promise<SqliteDeltaLogSnapshot> {
    const manifest = await this.readManifest(metadata);
    try {
      return await this.readSnapshotFromManifest(manifest, metadata);
    } catch (error) {
      if (!isSegmentChecksumMismatch(error)) {
        throw error;
      }
      const refreshedManifest = await this.readManifest({
        ...metadata,
        substep: metadata.substep ? `${metadata.substep}:refresh-manifest` : 'refresh-manifest',
      });
      if (manifestReadSignature(refreshedManifest) === manifestReadSignature(manifest)) {
        throw error;
      }
      return this.readSnapshotFromManifest(refreshedManifest, {
        ...metadata,
        substep: metadata.substep ? `${metadata.substep}:refreshed` : 'refreshed',
      });
    }
  }

  private async readSnapshotFromManifest(
    manifest: SqliteDeltaSegmentManifest,
    options: {
      allowVerifiedSegmentEvidence?: VerifiedSegmentEvidenceScope;
      purpose?: string | null;
      substep?: string | null;
    } = {},
  ): Promise<SqliteDeltaLogSnapshot> {
    const segmentRefs = [
      ...manifest.sealedSegments,
      ...(manifest.openSegment ? [manifest.openSegment] : []),
    ].sort((left, right) => left.sequence - right.sequence);
    const envelopes: SqliteDeltaSegmentEnvelope[] = [];
    const seenPaths = new Set<string>();
    const recoveredSealedSegments: SqliteDeltaSegmentManifestEntry[] = [];
    let recoveredOpenSegment: SqliteDeltaSegmentManifestEntry | null = null;
    for (const segment of segmentRefs) {
      envelopes.push(await this.readSegmentEnvelope(segment, {
        allowVerifiedSegmentEvidence: options.allowVerifiedSegmentEvidence,
        purpose: options.purpose,
        substep: options.substep,
      }));
      seenPaths.add(segment.path);
    }
    if (this.shouldReplayVolatileCheckpointSegments(manifest)) {
      for (const path of manifest.checkpoint?.coveredSegmentPaths ?? []) {
        if (seenPaths.has(path)) {
          continue;
        }
        const recovered = await this.readSegmentEnvelopeByPath(path, {
          purpose: options.purpose ?? 'sqlite-delta.checkpoint-recovery',
          substep: 'volatile-checkpoint-covered-segment-replay',
        });
        envelopes.push(recovered.envelope);
        if (recovered.envelope.sealed) {
          recoveredSealedSegments.push(recovered.manifestEntry);
        } else if (!manifest.openSegment && !recoveredOpenSegment) {
          recoveredOpenSegment = recovered.manifestEntry;
        }
        seenPaths.add(path);
      }
    }
    envelopes.sort((left, right) => left.sequence - right.sequence || left.path.localeCompare(right.path));
    const entries = envelopes.flatMap((envelope) => envelope.entries);
    const recoveredManifest = recoveredSealedSegments.length > 0 || recoveredOpenSegment
      ? {
        ...manifest,
        openSegment: manifest.openSegment ?? recoveredOpenSegment,
        sealedSegments: uniqueSegmentEntriesByPath([
          ...manifest.sealedSegments,
          ...recoveredSealedSegments,
        ]),
        nextSequence: Math.max(
          manifest.nextSequence,
          ...envelopes.map((envelope) => envelope.sequence + 1),
          1,
        ),
        nextMutationSequence: Math.max(
          manifest.nextMutationSequence,
          ...entries.map((entry) => (entry.mutationEnvelope?.journalSequence ?? 0) + 1),
          1,
        ),
      }
      : manifest;
    return {
      version: SQLITE_DELTA_LOG_VERSION,
      entries,
      updatedAt: recoveredManifest.updatedAt,
      manifest: recoveredManifest,
      pendingBytes: calculateSnapshotPendingBytes(entries, recoveredManifest),
    };
  }

  private async readManifest(
    metadata: SqliteDeltaFileEffectMetadata = {},
  ): Promise<SqliteDeltaSegmentManifest> {
    const current = await this.fileService.readJSON<SqliteDeltaSegmentManifest>(this.fileName, metadata);
    if (current !== null && current !== undefined) {
      return normalizeManifest(current);
    }
    if (this.fileName !== SQLITE_DELTA_LOG_FILE) {
      return normalizeManifest(null);
    }
    const legacy = await this.fileService.readJSON<SqliteDeltaSegmentManifest>(LEGACY_SQLITE_DELTA_LOG_FILE, {
      ...metadata,
      substep: metadata.substep ? `${metadata.substep}:legacy-manifest` : 'legacy-manifest',
    });
    return normalizeManifest(legacy);
  }

  private shouldReplayVolatileCheckpointSegments(manifest: SqliteDeltaSegmentManifest): boolean {
    return this.checkpointStorageClass === 'volatile-projection'
      && !isCorruptOpenSegmentCheckpointRepairReason(manifest.checkpoint?.reason ?? '')
      && Array.isArray(manifest.checkpoint?.coveredSegmentPaths)
      && manifest.checkpoint.coveredSegmentPaths.length > 0;
  }

  private async readSegmentEnvelope(
    segment: SqliteDeltaSegmentManifestEntry,
    options: {
      allowVerifiedSegmentEvidence?: VerifiedSegmentEvidenceScope;
      purpose?: string | null;
      substep?: string | null;
    } = {},
  ): Promise<SqliteDeltaSegmentEnvelope> {
    const canUseVerifiedSegmentEvidence = options.allowVerifiedSegmentEvidence === true
      || (options.allowVerifiedSegmentEvidence === 'sealed-only' && segment.sealed);
    if (canUseVerifiedSegmentEvidence) {
      const evidence = this.readVerifiedSegmentEvidence(segment);
      if (evidence) {
        return evidence;
      }
    }
    const bytes = await this.readSegmentBytes(segment, {
      purpose: options.purpose,
      substep: options.substep,
    });
    const envelope = normalizeSegmentEnvelope(decode(bytes), segment.path);
    if (envelope.entries.length !== segment.entryCount) {
      throw new Error(`SQLite delta segment entry count mismatch: ${segment.path}`);
    }
    this.rememberVerifiedSegmentEvidence(segment, envelope, 'persisted-read');
    return envelope;
  }

  private async readSegmentBytes(
    segment: SqliteDeltaSegmentManifestEntry,
    metadata: SqliteDeltaFileEffectMetadata = {},
  ): Promise<Uint8Array> {
    const bytes = await this.fileService.readBinary(segment.path, metadata);
    if (!bytes) {
      return this.recoverMissingSealedSegmentBytes(segment, metadata);
    }
    const checksum = checksumBytes(bytes);
    if (segment.checksum && checksum !== segment.checksum) {
      throw new Error(`SQLite delta segment checksum mismatch: ${segment.path}`);
    }
    return bytes;
  }

  private async recoverMissingSealedSegmentBytes(
    segment: SqliteDeltaSegmentManifestEntry,
    metadata: SqliteDeltaFileEffectMetadata = {},
  ): Promise<Uint8Array> {
    if (!segment.sealed) {
      throw new Error(`SQLite delta segment missing: ${segment.path}`);
    }
    const candidatePath = legacySqliteDeltaSegmentPath(segment.path);
    if (!candidatePath || candidatePath === segment.path) {
      throw new Error(`SQLite delta segment missing: ${segment.path}`);
    }
    const candidateBytes = await this.fileService.readBinary(candidatePath, {
      ...metadata,
      substep: metadata.substep ? `${metadata.substep}:legacy-segment-recovery` : 'legacy-segment-recovery',
    });
    if (!candidateBytes) {
      throw new Error(describeSegmentCandidateMismatch({
        path: segment.path,
        candidatePath,
        expectedChecksum: segment.checksum,
        expectedByteSize: segment.byteSize,
        actualChecksum: null,
        actualByteSize: null,
      }));
    }
    const candidateChecksum = checksumBytes(candidateBytes);
    if (
      candidateBytes.byteLength !== segment.byteSize
      || (segment.checksum && candidateChecksum !== segment.checksum)
    ) {
      throw new Error(describeSegmentCandidateMismatch({
        path: segment.path,
        candidatePath,
        expectedChecksum: segment.checksum,
        expectedByteSize: segment.byteSize,
        actualChecksum: candidateChecksum,
        actualByteSize: candidateBytes.byteLength,
      }));
    }
    await this.fileService.writeBinary(segment.path, candidateBytes);
    return candidateBytes;
  }

  private async readSegmentEnvelopeByPath(
    path: string,
    metadata: SqliteDeltaFileEffectMetadata = {},
  ): Promise<{
    envelope: SqliteDeltaSegmentEnvelope;
    manifestEntry: SqliteDeltaSegmentManifestEntry;
  }> {
    const bytes = await this.fileService.readBinary(path, metadata);
    if (!bytes) {
      throw new Error(`SQLite delta segment missing: ${path}`);
    }
    const envelope = normalizeSegmentEnvelope(decode(bytes), path);
    return {
      envelope,
      manifestEntry: buildSegmentManifestEntry({
        envelope,
        bytes,
        sealedAt: envelope.sealed ? envelope.updatedAt : null,
      }),
    };
  }

  private classifyCheckpointReason(input: {
    capture: SqliteDeltaCaptureResult | null;
    schemaChanged: boolean;
  }, snapshot: SqliteDeltaLogSnapshot, pendingBytes: number): string | null {
    if (input.schemaChanged) {
      return 'schema-dirty';
    }
    if (!input.capture) {
      return 'delta-capture-unavailable';
    }
    if (input.capture.setupError) {
      return `delta-capture-failed:${input.capture.setupError}`;
    }
    const touchedTables = uniqueStrings(input.capture.touchedTables);
    const unsupportedTables = touchedTables.filter((table) => !this.tableByName.has(table));
    if (unsupportedTables.length > 0) {
      return `unsupported-table:${unsupportedTables.join(',')}`;
    }
    const schemaDirtyTables = input.capture.schemaMismatchedTables
      .filter((table) => touchedTables.includes(table) && this.isDurableReplayTable(table));
    if (schemaDirtyTables.length > 0) {
      return `schema-fingerprint-mismatch:${schemaDirtyTables.join(',')}`;
    }
    if (input.capture.changes.length === 0) {
      if ((input.capture.skippedDerivedTables.length > 0 || input.capture.skippedDerivedChangeCount > 0)
        && touchedTables.every((table) => this.tableByName.has(table))) {
        return 'derived-cache-only';
      }
      return 'delta-capture-empty';
    }
    if (snapshot.entries.length >= MAX_PENDING_DELTA_ENTRIES || pendingBytes >= MAX_PENDING_DELTA_BYTES) {
      return 'delta-threshold-exceeded';
    }
    return null;
  }

  private buildEntry(
    label: string,
    capture: SqliteDeltaCaptureResult,
    mutationEnvelope: StorageMutationEnvelope | null,
  ): SqliteDeltaEntry {
    const changes = capture.changes;
    const tables = uniqueStrings(changes.map((change) => change.table));
    const entry: Omit<SqliteDeltaEntry, 'byteEstimate'> = {
      id: `sqlite-delta:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      version: 1,
      label,
      createdAt: Date.now(),
      schemaFingerprints: Object.fromEntries(tables.map((tableName) => [
        tableName,
        capture.schemaFingerprints[tableName] || this.tableByName.get(tableName)?.schemaFingerprint || '',
      ])),
      tables,
      changes,
      mutationEnvelope,
      durabilityReceipt: mutationEnvelope
        ? {
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
            diagnosticCode: null,
            diagnosticMessage: null,
            updatedAt: Date.now(),
          }
        : null,
    };
    return {
      ...entry,
      byteEstimate: estimateJsonByteLength(entry),
    };
  }

  private validateEntryForReplay(db: Database, entry: SqliteDeltaEntry): void {
    for (const tableName of entry.tables) {
      const metadata = this.tableByName.get(tableName);
      if (!metadata) {
        throw new Error(`SQLite delta replay unsupported table: ${tableName}`);
      }
      const actual = getActualSchemaFingerprint(db, tableName);
      const expected = entry.schemaFingerprints[tableName] || metadata.schemaFingerprint;
      if (!this.acceptsSchemaFingerprint(metadata, actual) || !this.acceptsSchemaFingerprint(metadata, expected)) {
        throw new Error(`SQLite delta replay schema mismatch: ${tableName}`);
      }
    }
  }

  private replayChange(db: Database, change: SqliteDeltaChange): void {
    const metadata = this.tableByName.get(change.table);
    if (!metadata) {
      throw new Error(`SQLite delta replay unsupported table: ${change.table}`);
    }
    if (change.operation === 'delete') {
      this.deleteByPrimaryKey(db, metadata, change.primaryKey);
      return;
    }
    if (!change.row) {
      throw new Error(`SQLite delta replay missing row payload: ${change.table}`);
    }
    this.upsertByPrimaryKey(db, metadata, change.row);
  }

  private deleteByPrimaryKey(
    db: Database,
    metadata: SqliteDeltaTableMetadata,
    primaryKey: Record<string, SqlValue>,
  ): void {
    const where = metadata.primaryKeys.map((column) => `${quoteIdentifier(column)} = ?`).join(' AND ');
    db.run(
      `DELETE FROM ${quoteIdentifier(metadata.tableName)} WHERE ${where}`,
      metadata.primaryKeys.map((column) => primaryKey[column] ?? null),
    );
  }

  private upsertByPrimaryKey(
    db: Database,
    metadata: SqliteDeltaTableMetadata,
    row: Record<string, SqlValue>,
  ): void {
    const columns = metadata.columns.map((column) => column.name);
    const columnSql = columns.map(quoteIdentifier).join(', ');
    const placeholderSql = columns.map(() => '?').join(', ');
    db.run(
      `INSERT OR REPLACE INTO ${quoteIdentifier(metadata.tableName)} (${columnSql}) VALUES (${placeholderSql})`,
      columns.map((column) => row[column] ?? null),
    );
  }

  private installAuditTriggers(db: Database, table: SqliteDeltaTableMetadata): string[] {
    const names = [
      this.installAuditTrigger(db, table, 'insert', 'AFTER INSERT', 'NEW'),
      this.installAuditTrigger(db, table, 'update', 'AFTER UPDATE', 'NEW'),
      this.installAuditTrigger(db, table, 'delete', 'BEFORE DELETE', 'OLD'),
    ];
    return names;
  }

  private installAuditTrigger(
    db: Database,
    table: SqliteDeltaTableMetadata,
    operation: SqliteDeltaOperation,
    timing: string,
    rowAlias: 'NEW' | 'OLD',
  ): string {
    const triggerName = `__siyuanmemo_delta_${table.tableName}_${operation}`;
    const primaryKeyJson = this.jsonObjectExpression(table.primaryKeys, rowAlias);
    const rowJson = operation === 'delete'
      ? this.jsonObjectExpression(table.columns.map((column) => column.name), rowAlias)
      : this.jsonObjectExpression(table.columns.map((column) => column.name), rowAlias);
    db.run(
      `CREATE TEMP TRIGGER ${quoteIdentifier(triggerName)}
       ${timing} ON ${quoteIdentifier(table.tableName)}
       BEGIN
         INSERT INTO ${AUDIT_TABLE} (table_name, operation, primary_key_json, row_json)
         VALUES (${JSON.stringify(table.tableName)}, ${JSON.stringify(operation)}, ${primaryKeyJson}, ${rowJson});
       END`,
    );
    return triggerName;
  }

  private jsonObjectExpression(columns: string[], rowAlias: 'NEW' | 'OLD'): string {
    return `json_object(${columns
      .flatMap((column) => [JSON.stringify(column), `${rowAlias}.${quoteIdentifier(column)}`])
      .join(', ')})`;
  }

  private isInternalTable(tableName: string): boolean {
    return tableName.startsWith('__siyuanmemo_') || tableName === 'sqlite_sequence';
  }
}
