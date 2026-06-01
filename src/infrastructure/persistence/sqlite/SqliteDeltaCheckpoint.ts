import type { Database, ParamsObject, SqlValue } from 'sql.js';

export const SQLITE_DELTA_LOG_FILE = 'sqlite-delta-log.v1.json';
export const SQLITE_DELTA_LOG_VERSION = 1;

const AUDIT_TABLE = '__siyuanmemo_delta_audit';
const MAX_PENDING_DELTA_ENTRIES = 256;
const MAX_PENDING_DELTA_BYTES = 512 * 1024;

type SqlParams = SqlValue[] | ParamsObject;

type SqliteDeltaFileService = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
};

export type SqliteDeltaOperation = 'insert' | 'update' | 'delete';
export type SqliteDeltaReplayMode = 'primary-key-upsert-delete';
export type SqliteDeltaWriteClassification = 'delta' | 'checkpoint';

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
  byteLength?: number | null;
  cleared?: boolean;
  error?: string | null;
}

export interface SqliteDeltaDiagnostics {
  fileName: string;
  version: number;
  registeredTables: string[];
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
}

export type SqliteDeltaPersistResult =
  | { mode: 'delta'; entry: SqliteDeltaEntry }
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

export const SQLITE_DELTA_TABLE_REGISTRY: SqliteDeltaTableMetadata[] = [
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
  ]),
  tableMetadata('queue_projection_rows', ['queue_type', 'row_id'], [
    toColumn('queue_type', 'TEXT', true, 1),
    toColumn('row_id', 'TEXT', true, 2),
    toColumn('card_id', 'TEXT', true),
    toColumn('block_id', 'TEXT', false),
    toColumn('deck_id', 'TEXT', false),
    toColumn('membership_reason', 'TEXT', true),
    toColumn('due_at', 'INTEGER', false),
    toColumn('due_bucket', 'TEXT', true),
    toColumn('priority_score', 'REAL', true),
    toColumn('sort_key', 'TEXT', true),
    toColumn('queue_index_hint', 'INTEGER', false),
    toColumn('policy_hash', 'TEXT', true),
    toColumn('source_generation', 'INTEGER', true),
    toColumn('payload_json', 'TEXT', true),
    toColumn('updated_at', 'INTEGER', true),
    toColumn('truth_refs_json', 'TEXT', false),
    toColumn('source_hash', 'TEXT', false),
    toColumn('truth_schema_version', 'INTEGER', false),
  ]),
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
  ]),
  tableMetadata('queue_projection_invalidations', ['id'], [
    toColumn('id', 'TEXT', false, 1),
    toColumn('queue_type', 'TEXT', true),
    toColumn('reason', 'TEXT', true),
    toColumn('affected_card_ids_json', 'TEXT', true),
    toColumn('affected_block_ids_json', 'TEXT', true),
    toColumn('generation', 'INTEGER', true),
    toColumn('created_at', 'INTEGER', true),
    toColumn('metadata_json', 'TEXT', true),
  ]),
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
  ]),
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

function normalizeSnapshot(value: unknown): SqliteDeltaLogSnapshot {
  if (value === null || value === undefined) {
    return {
      version: SQLITE_DELTA_LOG_VERSION,
      entries: [],
      updatedAt: 0,
    };
  }
  if (!isRecord(value) || value.version !== SQLITE_DELTA_LOG_VERSION) {
    throw new Error(`SQLite delta log unsupported: expected version ${SQLITE_DELTA_LOG_VERSION}`);
  }
  if (!Array.isArray(value.entries)) {
    throw new Error('SQLite delta log corrupt: entries must be an array');
  }
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    entries: value.entries.map((entry, index) => normalizeEntry(entry, index)),
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt || 0))),
  };
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
  ) {}

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
        return {
          label,
          setupError,
          touchedTables: uniqueStrings(touchedTables),
          schemaMismatchedTables: uniqueStrings(schemaMismatchedTables),
          schemaFingerprints,
          changes,
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
    const snapshot = await this.readSnapshot();
    const pendingBytes = estimateJsonByteLength(snapshot);
    const checkpointReason = this.classifyCheckpointReason(input, snapshot, pendingBytes);
    const diagnostics = normalizeDiagnosticsContext(input.diagnostics);
    const hotPath = diagnostics.hotPath || labelLooksHotPath(input.label);
    if (checkpointReason) {
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
      };
      return {
        mode: 'checkpoint',
        reason: checkpointReason,
        diagnostics: checkpointDiagnostics,
      };
    }

    const capture = input.capture!;
    const entry = this.buildEntry(input.label, capture);
    const nextSnapshot: SqliteDeltaLogSnapshot = {
      version: SQLITE_DELTA_LOG_VERSION,
      entries: [...snapshot.entries, entry],
      updatedAt: Date.now(),
    };
    const nextPendingBytes = estimateJsonByteLength(nextSnapshot);
    if (nextSnapshot.entries.length > MAX_PENDING_DELTA_ENTRIES || nextPendingBytes > MAX_PENDING_DELTA_BYTES) {
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
      };
      return {
        mode: 'checkpoint',
        reason,
        diagnostics: checkpointDiagnostics,
      };
    }
    try {
      await this.fileService.writeJSON(this.fileName, nextSnapshot);
    } catch (error) {
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
        error: error instanceof Error ? error.message : String(error),
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
    };
    return {
      mode: 'delta',
      entry,
    };
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

  async clearAfterCheckpoint(
    reason: string,
    byteLength: number | null,
    diagnosticsContext?: SqliteDeltaDiagnosticsContext,
  ): Promise<void> {
    const snapshot = await this.readSnapshot();
    const pendingBytes = estimateJsonByteLength(snapshot);
    if (snapshot.entries.length > 0) {
      await this.fileService.writeJSON(this.fileName, {
        version: SQLITE_DELTA_LOG_VERSION,
        entries: [],
        updatedAt: Date.now(),
      } satisfies SqliteDeltaLogSnapshot);
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
      cleared: snapshot.entries.length > 0,
      affectedTables: uniqueStrings(snapshot.entries.flatMap((entry) => entry.tables)),
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
      error: error instanceof Error ? error.message : String(error),
    };
  }

  async getDiagnostics(): Promise<SqliteDeltaDiagnostics> {
    const snapshot = await this.readSnapshot();
    return {
      fileName: this.fileName,
      version: SQLITE_DELTA_LOG_VERSION,
      registeredTables: SQLITE_DELTA_TABLE_REGISTRY.map((table) => table.tableName),
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
    return normalizeSnapshot(await this.fileService.readJSON<SqliteDeltaLogSnapshot>(this.fileName));
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
    const schemaDirtyTables = input.capture.schemaMismatchedTables.filter((table) => touchedTables.includes(table));
    if (schemaDirtyTables.length > 0) {
      return `schema-fingerprint-mismatch:${schemaDirtyTables.join(',')}`;
    }
    if (input.capture.changes.length === 0) {
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
