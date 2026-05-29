import initSqlJs, { type Database, type ParamsObject, type SqlJsStatic, type SqlValue } from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SRS_ARENA_ALGORITHM_REGISTRY } from '@/types/arena';
import { createLogger } from '@/utils/logger';
import { recordRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';
import {
  CARD_PROJECTION_COLUMNS,
  CARD_PROJECTION_INDEX_STATEMENTS,
  SQL_SCHEMA_STATEMENTS,
  SQLITE_DB_FILE,
  SQLITE_SCHEMA_VERSION,
} from './schema';

const logger = createLogger('SqliteDatabaseService');

type SqlParams = SqlValue[] | ParamsObject;
type TransactionOptions = { persist?: boolean };
type PersistOptions = {
  force?: boolean;
  reason?: string;
};
type SqliteDatabaseServiceOptions = {
  applySchemaOnInit?: boolean;
  persistOnInit?: boolean;
};
type SqliteFileService = Pick<IFileService, 'readJSON' | 'writeJSON'>
  & Partial<Pick<IFileService, 'readBinary' | 'writeBinary'>>;

interface SqliteEnvelope {
  encoding: 'base64-sqlite-v1';
  byteLength: number;
  updatedAt: number;
  data: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function fromBase64(value: string): Uint8Array {
  const binary = typeof atob === 'function'
    ? atob(value)
    : Buffer.from(value, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isEnvelope(value: unknown): value is SqliteEnvelope {
  return typeof value === 'object'
    && value !== null
    && (value as SqliteEnvelope).encoding === 'base64-sqlite-v1'
    && typeof (value as SqliteEnvelope).data === 'string';
}

function isSqliteDatabaseBytes(bytes: Uint8Array | null | undefined): bytes is Uint8Array {
  if (!bytes || bytes.byteLength < 16) {
    return false;
  }
  const header = 'SQLite format 3\u0000';
  for (let index = 0; index < header.length; index += 1) {
    if (bytes[index] !== header.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

async function fingerprintBytes(bytes: Uint8Array): Promise<string | null> {
  const subtle = (globalThis as typeof globalThis & {
    crypto?: { subtle?: SubtleCrypto };
  }).crypto?.subtle;
  if (!subtle) {
    return null;
  }

  const digest = await subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${bytes.byteLength}:${hash}`;
}

function resolveSqliteWasmLocation(): string {
  const runtime = globalThis as typeof globalThis & {
    process?: {
      versions?: { node?: string };
      cwd?: () => string;
    };
  };
  if (
    runtime.process?.versions?.node
    && typeof runtime.process.cwd === 'function'
    && sqliteWasmUrl.startsWith('/node_modules/')
  ) {
    return `${runtime.process.cwd().replace(/\\/g, '/')}${sqliteWasmUrl}`;
  }
  return sqliteWasmUrl;
}

export class SqliteDatabaseService {
  private db: Database | null = null;
  private sqlRuntime: SqlJsStatic | null = null;
  private initialized = false;
  private transactionDepth = 0;
  private pendingPersist = false;
  private schemaDirty = false;
  private lastPersistedFingerprint: string | null = null;
  private dirtySincePersist = false;
  private currentTransactionMutated = false;
  private fts5Supported: boolean | null = null;

  constructor(
    private readonly fileService: SqliteFileService,
    private readonly dbFile = SQLITE_DB_FILE,
    private readonly options: SqliteDatabaseServiceOptions = {},
  ) {}

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const SQL = await initSqlJs({
      locateFile: () => resolveSqliteWasmLocation(),
    });
    this.sqlRuntime = SQL;
    const stored = await this.loadStoredDatabaseBytes();
    const shouldPersistLegacyEnvelope = Boolean(stored.legacyEnvelope);
    if (stored.legacyEnvelope) {
      await this.backupLegacyEnvelope(stored.legacyEnvelope);
    }
    this.db = stored.bytes ? new SQL.Database(stored.bytes) : new SQL.Database();
    this.schemaDirty = false;
    if (this.options.applySchemaOnInit !== false) {
      this.applySchema();
      this.detectFts5Support();
      this.seedAlgorithmRegistry();
    }
    this.initialized = true;
    if (this.options.persistOnInit !== false && (this.schemaDirty || shouldPersistLegacyEnvelope)) {
      await this.persist({
        force: shouldPersistLegacyEnvelope,
        reason: 'sqlite.init',
      });
      this.schemaDirty = false;
    }
  }

  async read<T>(reader: (db: Database) => T): Promise<T> {
    return reader(this.requireDb());
  }

  async write<T>(writer: (db: Database) => T | Promise<T>, options: TransactionOptions = {}): Promise<T> {
    return this.runTransaction('write', writer, options);
  }

  async runTransaction<T>(
    label: string,
    writer: (db: Database) => T | Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const db = this.requireDb();
    const shouldPersist = options.persist !== false;
    if (this.transactionDepth > 0) {
      const result = await writer(db);
      if (shouldPersist) {
        this.pendingPersist = true;
        this.dirtySincePersist = true;
        this.currentTransactionMutated = true;
      }
      return result;
    }

    db.run('BEGIN IMMEDIATE');
    this.transactionDepth = 1;
    this.currentTransactionMutated = shouldPersist;
    const startedAt = Date.now();
    let committed = false;
    try {
      const result = await writer(db);
      db.run('COMMIT');
      committed = true;
      this.transactionDepth = 0;
      const persistAfterCommit = shouldPersist || this.pendingPersist;
      this.pendingPersist = false;
      if (this.currentTransactionMutated) {
        this.dirtySincePersist = true;
      }
      this.currentTransactionMutated = false;
      if (persistAfterCommit) {
        try {
          await this.persist({ reason: label });
        } catch (persistError) {
          await this.restoreFromPersistedStore(label, persistError);
          throw persistError;
        }
      }
      logger.debug('SQLite transaction committed', {
        label,
        durationMs: Date.now() - startedAt,
        persisted: persistAfterCommit,
      });
      return result;
    } catch (error) {
      if (!committed) {
        try {
          db.run('ROLLBACK');
        } catch (rollbackError) {
          logger.warn('SQLite rollback failed', { rollbackError });
        }
      }
      this.transactionDepth = 0;
      this.pendingPersist = false;
      this.currentTransactionMutated = false;
      throw error;
    }
  }

  run(sql: string, params?: SqlParams): void {
    this.requireDb().run(sql, params);
    if (this.transactionDepth > 0) {
      this.currentTransactionMutated = true;
    } else {
      this.dirtySincePersist = true;
    }
  }

  runSchemaMutation(sql: string, params?: SqlParams): void {
    this.run(sql, params);
    this.schemaDirty = true;
  }

  private runSchemaStatement(sql: string): void {
    const before = this.getSchemaChangeVersion();
    this.requireDb().run(sql);
    if (this.getSchemaChangeVersion() !== before) {
      this.schemaDirty = true;
      this.dirtySincePersist = true;
    }
  }

  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null {
    const db = this.requireDb();
    const stmt = db.prepare(sql);
    try {
      if (params) {
        stmt.bind(params);
      }
      if (!stmt.step()) {
        return null;
      }
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  getAll<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T[] {
    const db = this.requireDb();
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

  hasMigration(id: string): boolean {
    const row = this.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?',
      [id],
    );
    return Number(row?.count) > 0;
  }

  supportsFts5(): boolean {
    if (this.fts5Supported === null) {
      this.detectFts5Support();
    }
    return this.fts5Supported === true;
  }

  markMigration(id: string, appliedAt = Date.now()): void {
    this.runSchemaMutation(
      'INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      [id, appliedAt],
    );
  }

  async persist(options: string | PersistOptions = {}): Promise<void> {
    if (this.transactionDepth > 0) {
      this.pendingPersist = true;
      return;
    }

    const reason = typeof options === 'string' ? options : options.reason ?? 'explicit';
    const force = typeof options === 'object' && options.force === true;
    const startedAt = Date.now();
    if (!force && !this.dirtySincePersist) {
      recordRuntimePerformanceSpan('sqlite', 'persist', Date.now() - startedAt, {
        dbFile: this.dbFile,
        byteLength: null,
        reason,
        status: 'skipped-clean',
      });
      return;
    }

    const bytes = this.requireDb().export();
    const fingerprint = await fingerprintBytes(bytes);
    if (!force && fingerprint && fingerprint === this.lastPersistedFingerprint) {
      recordRuntimePerformanceSpan('sqlite', 'persist', Date.now() - startedAt, {
        dbFile: this.dbFile,
        byteLength: bytes.byteLength,
        reason,
        status: 'skipped-unchanged',
      });
      this.dirtySincePersist = false;
      return;
    }

    if (this.fileService.writeBinary) {
      await this.fileService.writeBinary(this.dbFile, bytes);
      this.lastPersistedFingerprint = fingerprint;
      this.dirtySincePersist = false;
      recordRuntimePerformanceSpan('sqlite', 'persist', Date.now() - startedAt, {
        dbFile: this.dbFile,
        byteLength: bytes.byteLength,
        reason,
        status: 'written-binary',
      });
      return;
    }

    await this.fileService.writeJSON(
      this.dbFile,
      {
        encoding: 'base64-sqlite-v1',
        byteLength: bytes.byteLength,
        updatedAt: Date.now(),
        data: toBase64(bytes),
      } satisfies SqliteEnvelope,
    );
    this.lastPersistedFingerprint = fingerprint;
    this.dirtySincePersist = false;
    recordRuntimePerformanceSpan('sqlite', 'persist', Date.now() - startedAt, {
      dbFile: this.dbFile,
      byteLength: bytes.byteLength,
      reason,
      status: 'written-json-envelope',
    });
  }

  private async backupLegacyEnvelope(envelope: SqliteEnvelope): Promise<void> {
    try {
      await this.fileService.writeJSON(
        `migration-backups/${this.dbFile}.base64-envelope-${Date.now()}.json`,
        envelope,
      );
    } catch (error) {
      logger.warn('Failed to backup legacy SQLite base64 envelope before binary conversion', { error });
    }
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
    this.sqlRuntime = null;
    this.initialized = false;
  }

  private async loadStoredDatabaseBytes(): Promise<{
    bytes?: Uint8Array;
    legacyEnvelope: SqliteEnvelope | null;
  }> {
    const binaryBytes = await this.fileService.readBinary?.(this.dbFile);
    if (isSqliteDatabaseBytes(binaryBytes)) {
      this.lastPersistedFingerprint = await fingerprintBytes(binaryBytes);
      this.dirtySincePersist = false;
      return { bytes: binaryBytes, legacyEnvelope: null };
    }

    const envelope = await this.fileService.readJSON<SqliteEnvelope>(this.dbFile);
    if (isEnvelope(envelope)) {
      const bytes = fromBase64(envelope.data);
      this.lastPersistedFingerprint = await fingerprintBytes(bytes);
      this.dirtySincePersist = true;
      return {
        bytes,
        legacyEnvelope: envelope,
      };
    }

    this.lastPersistedFingerprint = null;
    this.dirtySincePersist = true;
    return { bytes: undefined, legacyEnvelope: null };
  }

  private async restoreFromPersistedStore(label: string, persistError: unknown): Promise<void> {
    try {
      const SQL = this.sqlRuntime;
      if (!SQL) {
        throw new Error('sql.js runtime is not initialized');
      }
      const stored = await this.loadStoredDatabaseBytes();
      if (!stored.bytes) {
        throw new Error('No persisted SQLite database is available for restore');
      }
      const restored = new SQL.Database(stored.bytes);
      this.db?.close();
      this.db = restored;
      logger.warn('SQLite transaction persist failed; in-memory DB restored from stored file', {
        label,
        error: persistError instanceof Error ? persistError.message : String(persistError),
      });
    } catch (restoreError) {
      logger.error('SQLite transaction persist failed and in-memory DB restore failed', {
        label,
        persistError: persistError instanceof Error ? persistError.message : String(persistError),
        restoreError,
      });
    }
  }

  private applySchema(): void {
    const db = this.requireDb();
    db.run('PRAGMA foreign_keys = ON');
    for (const statement of SQL_SCHEMA_STATEMENTS) {
      this.runSchemaStatement(statement);
    }
    this.ensureCardsProjectionColumns(db);
    this.ensureReviewEventCommitIdempotencyColumn(db);
    this.ensureNeuralRoamRouteHistoryLineageColumns(db);
    for (const statement of CARD_PROJECTION_INDEX_STATEMENTS) {
      this.runSchemaStatement(statement);
    }
    const userVersion = this.getUserVersion();
    if (userVersion !== SQLITE_SCHEMA_VERSION) {
      this.runSchemaMutation(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION}`);
    }
  }

  private detectFts5Support(): void {
    const SQL = this.sqlRuntime;
    if (!SQL) {
      this.fts5Supported = false;
      return;
    }

    let probe: Database | null = null;
    try {
      probe = new SQL.Database();
      probe.run('CREATE VIRTUAL TABLE __siyuanmemo_fts5_probe USING fts5(content)');
      this.fts5Supported = true;
    } catch (error) {
      this.fts5Supported = false;
      logger.debug('SQLite FTS5 unavailable; browser search will use projection LIKE fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      probe?.close();
    }
  }

  private ensureCardsProjectionColumns(db: Database): void {
    const existingColumns = new Set<string>();
    const rows = this.getAll<{ name: string }>('PRAGMA table_info(cards)');
    for (const row of rows) {
      if (typeof row.name === 'string') {
        existingColumns.add(row.name);
      }
    }

    for (const column of CARD_PROJECTION_COLUMNS) {
      if (!existingColumns.has(column.name)) {
        this.runSchemaMutation(`ALTER TABLE cards ADD COLUMN ${column.definition}`);
      }
    }
  }

  private ensureReviewEventCommitIdempotencyColumn(db: Database): void {
    const rows = this.getAll<{ name: string }>('PRAGMA table_info(review_events)');
    const hasColumn = rows.some((row) => row.name === 'commit_idempotency_key');
    if (!hasColumn) {
      this.runSchemaMutation('ALTER TABLE review_events ADD COLUMN commit_idempotency_key TEXT');
    }
    this.runSchemaStatement(
      `CREATE INDEX IF NOT EXISTS idx_review_events_commit_idempotency
        ON review_events(commit_idempotency_key)`,
    );
    this.runSchemaStatement(
      `CREATE INDEX IF NOT EXISTS idx_review_events_formal_facts
        ON review_events(event_type, card_id, reviewed_at, commit_idempotency_key)`,
    );
  }

  private ensureNeuralRoamRouteHistoryLineageColumns(db: Database): void {
    const rows = this.getAll<{ name: string }>('PRAGMA table_info(neural_roam_route_history_events)');
    const existingColumns = new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === 'string'));
    const columns = [
      { name: 'source_event_id', definition: 'source_event_id TEXT' },
      { name: 'branch_root_node_id', definition: 'branch_root_node_id TEXT' },
      { name: 'source_role', definition: 'source_role TEXT' },
      { name: 'origin', definition: 'origin TEXT' },
      { name: 'trace_quality', definition: 'trace_quality TEXT' },
      { name: 'depth', definition: 'depth INTEGER' },
      { name: 'conduction_score', definition: 'conduction_score REAL' },
    ];
    for (const column of columns) {
      if (!existingColumns.has(column.name)) {
        this.runSchemaMutation(`ALTER TABLE neural_roam_route_history_events ADD COLUMN ${column.definition}`);
      }
    }
  }

  private seedAlgorithmRegistry(): void {
    for (const entry of SRS_ARENA_ALGORITHM_REGISTRY) {
      this.seedAlgorithmRegistryEntry({
        algorithmId: entry.id,
        label: entry.label,
        enabled: entry.enabled ? 1 : 0,
        state: entry.state,
        runtimeKind: entry.runtimeKind,
        version: entry.version,
        parameterHash: entry.parameterHash,
        metadata: entry.metadata || {},
      });
    }
    this.seedAlgorithmRegistryEntry({
      algorithmId: 'a-factor-v2',
      label: 'A-Factor v2',
      enabled: 1,
      state: 'enabled',
      runtimeKind: 'browser',
      version: 'a-factor-v2',
      parameterHash: 'settings.topicScheduler',
      metadata: {
        role: 'production-scheduling-state',
      },
    });
  }

  private seedAlgorithmRegistryEntry(input: {
    algorithmId: string;
    label: string;
    enabled: number;
    state: string;
    runtimeKind: string;
    version: string;
    parameterHash: string;
    metadata: Record<string, unknown>;
  }): void {
    const metadataJson = JSON.stringify(input.metadata);
    const row = this.getOne<{
      label: string;
      enabled: number;
      state: string;
      runtime_kind: string;
      version: string;
      parameter_hash: string;
      metadata_json: string;
    }>(
      `SELECT label, enabled, state, runtime_kind, version, parameter_hash, metadata_json
       FROM algorithm_registry
       WHERE algorithm_id = ?`,
      [input.algorithmId],
    );
    if (
      row
      && row.label === input.label
      && Number(row.enabled) === input.enabled
      && row.state === input.state
      && row.runtime_kind === input.runtimeKind
      && row.version === input.version
      && row.parameter_hash === input.parameterHash
      && row.metadata_json === metadataJson
    ) {
      return;
    }

    this.runSchemaMutation(
      `INSERT OR REPLACE INTO algorithm_registry
          (algorithm_id, label, domain, enabled, state, runtime_kind, version, parameter_hash, state_schema_version, metadata_json)
         VALUES (?, ?, 'srs', ?, ?, ?, ?, ?, 1, ?)`,
      [
        input.algorithmId,
        input.label,
        input.enabled,
        input.state,
        input.runtimeKind,
        input.version,
        input.parameterHash,
        metadataJson,
      ],
    );
  }

  private getSchemaChangeVersion(): number {
    return Number(this.getOne<{ schema_version: number }>('PRAGMA schema_version')?.schema_version ?? 0);
  }

  private getUserVersion(): number {
    return Number(this.getOne<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
  }

  private requireDb(): Database {
    if (!this.db) {
      throw new Error('SQLite database is not initialized');
    }
    return this.db;
  }
}
