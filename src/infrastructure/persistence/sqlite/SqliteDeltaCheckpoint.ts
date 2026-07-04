import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { decode, encode } from '@msgpack/msgpack';

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
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  readBinary(fileName: string): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array): Promise<void>;
  deleteFile?(fileName: string): Promise<void>;
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
  byteEstimate: number;
}

export interface SqliteDeltaLogSnapshot {
  version: typeof SQLITE_DELTA_LOG_VERSION;
  entries: SqliteDeltaEntry[];
  updatedAt: number;
  manifest: SqliteDeltaSegmentManifest;
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
  checkpoint?: {
    clearedAt: number;
    coveredSegmentPaths: string[];
    reason: string;
  } | null;
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

function emptyManifest(updatedAt = 0): SqliteDeltaSegmentManifest {
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    path: SQLITE_DELTA_LOG_FILE,
    openSegment: null,
    sealedSegments: [],
    updatedAt,
    nextSequence: 1,
    checkpoint: null,
  };
}

function sqliteDeltaSealedSegmentFile(sequence: number): string {
  return `${SQLITE_DELTA_LOG_DIR}/sqlite-delta-log.v2.sealed-${sequence}.msgpack`;
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

export const SQLITE_DELTA_TABLE_REGISTRY: SqliteDeltaTableMetadata[] = [
  tableMetadata('cards', ['id'], CARDS_COLUMNS),
  tableMetadata('algorithm_card_state', ['card_id', 'algorithm_id'], ALGORITHM_CARD_STATE_COLUMNS),
  tableMetadata('domain_sync_operations', ['operation_id'], DOMAIN_SYNC_OPERATIONS_COLUMNS),
  tableMetadata('store_metadata', ['key'], STORE_METADATA_COLUMNS),
  tableMetadata('review_events', ['id'], REVIEW_EVENTS_COLUMNS, [
    REVIEW_EVENTS_LEGACY_COMMIT_COLUMN_ORDER,
  ]),
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
    byteEstimate: Math.max(0, Math.floor(Number(value.byteEstimate || 0))),
  };
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
  });
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
    diagnostics?: SqliteDeltaDiagnosticsContext;
  }): Promise<SqliteDeltaPersistResult> {
    let snapshot: SqliteDeltaLogSnapshot;
    try {
      snapshot = await this.readSnapshot();
    } catch (error) {
      if (!this.canClearDeltaAfterCheckpoint()) {
        throw error;
      }
      const diagnostics = normalizeDiagnosticsContext(input.diagnostics);
      const hotPath = diagnostics.hotPath || labelLooksHotPath(input.label);
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
    const pendingBytes = estimateJsonByteLength(snapshot);
    const rawCheckpointReason = this.classifyCheckpointReason(input, snapshot, pendingBytes);
    const checkpointReason = rawCheckpointReason === 'delta-threshold-exceeded' && !this.canUseCheckpointForThreshold()
      ? null
      : rawCheckpointReason;
    const diagnostics = normalizeDiagnosticsContext(input.diagnostics);
    const hotPath = diagnostics.hotPath || labelLooksHotPath(input.label);
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
    const entry = this.buildEntry(input.label, capture);
    const nextEntries = [...snapshot.entries, entry];
    const nextSnapshot: SqliteDeltaLogSnapshot = {
      version: SQLITE_DELTA_LOG_VERSION,
      entries: nextEntries,
      updatedAt: Date.now(),
      manifest: snapshot.manifest,
    };
    const nextPendingBytes = estimateJsonByteLength(nextSnapshot);
    if (this.canUseCheckpointForThreshold()
      && (nextEntries.length > MAX_PENDING_DELTA_ENTRIES || nextPendingBytes > MAX_PENDING_DELTA_BYTES)) {
      const reason = 'delta-threshold-exceeded';
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
      const writeResult = await this.appendDeltaEntryToSegments(snapshot.manifest, entry);
      nextSnapshot.manifest = writeResult.manifest;
    } catch (error) {
      if (this.canClearDeltaAfterCheckpoint() && isOpenSegmentChecksumMismatch(error)) {
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
  ): Promise<{ manifest: SqliteDeltaSegmentManifest }> {
    const openEnvelope = manifest.openSegment
      ? await this.readSegmentEnvelope(manifest.openSegment)
      : null;
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
    const candidateBytes = encode(candidateEnvelope);
    const shouldSealCandidate = candidateEntries.length >= MAX_OPEN_SEGMENT_DELTA_ENTRIES
      || candidateBytes.byteLength >= MAX_OPEN_SEGMENT_BYTES;

    let sealedSegments = manifest.sealedSegments;
    let nextSequence = Math.max(manifest.nextSequence, candidateSequence + 1);
    let openSegmentEntry: SqliteDeltaSegmentManifestEntry | null = null;

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
      const sealedBytes = encode(sealedEnvelope);
      await this.fileService.writeBinary(sealedPath, sealedBytes);
      sealedSegments = [
        ...manifest.sealedSegments.filter((segment) => segment.path !== sealedPath),
        buildSegmentManifestEntry({
          envelope: sealedEnvelope,
          bytes: sealedBytes,
          sealedAt: Date.now(),
        }),
      ].sort((left, right) => left.sequence - right.sequence);
    } else {
      await this.fileService.writeBinary(SQLITE_DELTA_OPEN_SEGMENT_FILE, candidateBytes);
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
      checkpoint: null,
    };
    await this.fileService.writeJSON(this.fileName, nextManifest);
    return { manifest: nextManifest };
  }

  async replayPending(db: Database): Promise<SqliteDeltaOperationStatus> {
    const snapshot = await this.readSnapshot();
    const pendingBytes = estimateJsonByteLength(snapshot);
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
    return (await this.readSnapshot()).entries.length > 0;
  }

  async hasCheckpointablePendingDeltas(): Promise<boolean> {
    return this.canClearDeltaAfterCheckpoint() && (await this.readSnapshot()).entries.length > 0;
  }

  async discardPending(
    reason: string,
    diagnosticsContext?: SqliteDeltaDiagnosticsContext,
  ): Promise<void> {
    let snapshot: SqliteDeltaLogSnapshot | null = null;
    let snapshotReadError: unknown = null;
    try {
      snapshot = await this.readSnapshot();
    } catch (error) {
      snapshotReadError = error;
    }
    const pendingBytes = snapshot ? estimateJsonByteLength(snapshot) : 0;
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
    const snapshot = await this.readSnapshot().catch(async (snapshotReadError) => {
      if (!this.canClearDeltaAfterCheckpoint()) {
        throw snapshotReadError;
      }
      await this.clearUnreadablePendingAfterCheckpoint(reason, byteLength, diagnosticsContext, snapshotReadError);
      return null;
    });
    if (!snapshot) {
      return;
    }
    const pendingBytes = estimateJsonByteLength(snapshot);
    const clearCoveredDeltas = this.canClearDeltaAfterCheckpoint();
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
      pendingBytes: snapshot ? estimateJsonByteLength(snapshot) : 0,
      cleared: false,
      checkpointStorageClass: this.checkpointStorageClass,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  private async deleteCoveredSegmentFiles(paths: string[]): Promise<string | null> {
    if (!this.fileService.deleteFile) {
      return null;
    }
    const failures: string[] = [];
    for (const path of uniqueStrings(paths)) {
      try {
        await this.fileService.deleteFile(path);
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return failures.length > 0 ? `sqlite-delta-segment-cleanup-failed: ${failures.join('; ')}` : null;
  }

  async getDiagnostics(): Promise<SqliteDeltaDiagnostics> {
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
      pendingBytes: estimateJsonByteLength(snapshot),
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

  private async readSnapshot(): Promise<SqliteDeltaLogSnapshot> {
    const manifest = await this.readManifest();
    try {
      return await this.readSnapshotFromManifest(manifest);
    } catch (error) {
      if (!isSegmentChecksumMismatch(error)) {
        throw error;
      }
      const refreshedManifest = await this.readManifest();
      if (manifestReadSignature(refreshedManifest) === manifestReadSignature(manifest)) {
        throw error;
      }
      return this.readSnapshotFromManifest(refreshedManifest);
    }
  }

  private async readSnapshotFromManifest(manifest: SqliteDeltaSegmentManifest): Promise<SqliteDeltaLogSnapshot> {
    const segmentRefs = [
      ...manifest.sealedSegments,
      ...(manifest.openSegment ? [manifest.openSegment] : []),
    ].sort((left, right) => left.sequence - right.sequence);
    const envelopes: SqliteDeltaSegmentEnvelope[] = [];
    const seenPaths = new Set<string>();
    const recoveredSealedSegments: SqliteDeltaSegmentManifestEntry[] = [];
    let recoveredOpenSegment: SqliteDeltaSegmentManifestEntry | null = null;
    for (const segment of segmentRefs) {
      envelopes.push(await this.readSegmentEnvelope(segment));
      seenPaths.add(segment.path);
    }
    if (this.shouldReplayVolatileCheckpointSegments(manifest)) {
      for (const path of manifest.checkpoint?.coveredSegmentPaths ?? []) {
        if (seenPaths.has(path)) {
          continue;
        }
        const recovered = await this.readSegmentEnvelopeByPath(path);
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
      }
      : manifest;
    return {
      version: SQLITE_DELTA_LOG_VERSION,
      entries,
      updatedAt: recoveredManifest.updatedAt,
      manifest: recoveredManifest,
    };
  }

  private async readManifest(): Promise<SqliteDeltaSegmentManifest> {
    const current = await this.fileService.readJSON<SqliteDeltaSegmentManifest>(this.fileName);
    if (current !== null && current !== undefined) {
      return normalizeManifest(current);
    }
    if (this.fileName !== SQLITE_DELTA_LOG_FILE) {
      return normalizeManifest(null);
    }
    const legacy = await this.fileService.readJSON<SqliteDeltaSegmentManifest>(LEGACY_SQLITE_DELTA_LOG_FILE);
    return normalizeManifest(legacy);
  }

  private shouldReplayVolatileCheckpointSegments(manifest: SqliteDeltaSegmentManifest): boolean {
    return this.checkpointStorageClass === 'volatile-projection'
      && Array.isArray(manifest.checkpoint?.coveredSegmentPaths)
      && manifest.checkpoint.coveredSegmentPaths.length > 0;
  }

  private async readSegmentEnvelope(segment: SqliteDeltaSegmentManifestEntry): Promise<SqliteDeltaSegmentEnvelope> {
    const bytes = await this.fileService.readBinary(segment.path);
    if (!bytes) {
      throw new Error(`SQLite delta segment missing: ${segment.path}`);
    }
    const checksum = checksumBytes(bytes);
    if (segment.checksum && checksum !== segment.checksum) {
      throw new Error(`SQLite delta segment checksum mismatch: ${segment.path}`);
    }
    const envelope = normalizeSegmentEnvelope(decode(bytes), segment.path);
    if (envelope.entries.length !== segment.entryCount) {
      throw new Error(`SQLite delta segment entry count mismatch: ${segment.path}`);
    }
    return envelope;
  }

  private async readSegmentEnvelopeByPath(path: string): Promise<{
    envelope: SqliteDeltaSegmentEnvelope;
    manifestEntry: SqliteDeltaSegmentManifestEntry;
  }> {
    const bytes = await this.fileService.readBinary(path);
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

  private buildEntry(label: string, capture: SqliteDeltaCaptureResult): SqliteDeltaEntry {
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
