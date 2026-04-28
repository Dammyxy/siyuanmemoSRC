import initSqlJs, { type Database, type ParamsObject, type SqlJsStatic, type SqlValue } from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SRS_ARENA_ALGORITHM_REGISTRY } from '@/types/arena';
import { createLogger } from '@/utils/logger';
import {
  CARD_PROJECTION_COLUMNS,
  CARD_PROJECTION_INDEX_STATEMENTS,
  SQL_SCHEMA_STATEMENTS,
  SQLITE_DB_FILE,
} from './schema';

const logger = createLogger('SqliteDatabaseService');

type SqlParams = SqlValue[] | ParamsObject;
type TransactionOptions = { persist?: boolean };
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
  private fts5Supported: boolean | null = null;

  constructor(
    private readonly fileService: SqliteFileService,
    private readonly dbFile = SQLITE_DB_FILE,
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
    if (stored.legacyEnvelope) {
      await this.backupLegacyEnvelope(stored.legacyEnvelope);
    }
    this.db = stored.bytes ? new SQL.Database(stored.bytes) : new SQL.Database();
    this.applySchema();
    this.detectFts5Support();
    this.seedAlgorithmRegistry();
    this.initialized = true;
    await this.persist();
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
      }
      return result;
    }

    db.run('BEGIN IMMEDIATE');
    this.transactionDepth = 1;
    const startedAt = Date.now();
    let committed = false;
    try {
      const result = await writer(db);
      db.run('COMMIT');
      committed = true;
      this.transactionDepth = 0;
      const persistAfterCommit = shouldPersist || this.pendingPersist;
      this.pendingPersist = false;
      if (persistAfterCommit) {
        try {
          await this.persist();
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
      throw error;
    }
  }

  run(sql: string, params?: SqlParams): void {
    this.requireDb().run(sql, params);
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
    this.run(
      'INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      [id, appliedAt],
    );
  }

  async persist(): Promise<void> {
    if (this.transactionDepth > 0) {
      this.pendingPersist = true;
      return;
    }

    const bytes = this.requireDb().export();
    if (this.fileService.writeBinary) {
      await this.fileService.writeBinary(this.dbFile, bytes);
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
      return { bytes: binaryBytes, legacyEnvelope: null };
    }

    const envelope = await this.fileService.readJSON<SqliteEnvelope>(this.dbFile);
    if (isEnvelope(envelope)) {
      return {
        bytes: fromBase64(envelope.data),
        legacyEnvelope: envelope,
      };
    }

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
      db.run(statement);
    }
    this.ensureCardsProjectionColumns(db);
    for (const statement of CARD_PROJECTION_INDEX_STATEMENTS) {
      db.run(statement);
    }
  }

  private detectFts5Support(): void {
    const db = this.requireDb();
    try {
      db.run('CREATE VIRTUAL TABLE __siyuanmemo_fts5_probe USING fts5(content)');
      db.run('DROP TABLE IF EXISTS __siyuanmemo_fts5_probe');
      this.fts5Supported = true;
    } catch (error) {
      this.fts5Supported = false;
      try {
        db.run('DROP TABLE IF EXISTS __siyuanmemo_fts5_probe');
      } catch {
        // Ignore probe cleanup errors; capability remains false.
      }
      logger.debug('SQLite FTS5 unavailable; browser search will use projection LIKE fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
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
        db.run(`ALTER TABLE cards ADD COLUMN ${column.definition}`);
      }
    }
  }

  private seedAlgorithmRegistry(): void {
    const now = Date.now();
    for (const entry of SRS_ARENA_ALGORITHM_REGISTRY) {
      this.run(
        `INSERT OR REPLACE INTO algorithm_registry
          (algorithm_id, label, domain, enabled, state, runtime_kind, version, parameter_hash, state_schema_version, metadata_json)
         VALUES (?, ?, 'srs', ?, ?, ?, ?, ?, 1, ?)`,
        [
          entry.id,
          entry.label,
          entry.enabled ? 1 : 0,
          entry.state,
          entry.runtimeKind,
          entry.version,
          entry.parameterHash,
          JSON.stringify({
            ...(entry.metadata || {}),
            seededAt: now,
          }),
        ],
      );
    }
  }

  private requireDb(): Database {
    if (!this.db) {
      throw new Error('SQLite database is not initialized');
    }
    return this.db;
  }
}
