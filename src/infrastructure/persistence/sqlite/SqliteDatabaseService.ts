import initSqlJs, { type Database, type ParamsObject, type SqlValue } from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SRS_ARENA_ALGORITHM_REGISTRY } from '@/types/arena';
import { createLogger } from '@/utils/logger';
import { SQL_SCHEMA_STATEMENTS, SQLITE_DB_FILE } from './schema';

const logger = createLogger('SqliteDatabaseService');

type SqlParams = SqlValue[] | ParamsObject;

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

export class SqliteDatabaseService {
  private db: Database | null = null;
  private initialized = false;

  constructor(
    private readonly fileService: Pick<IFileService, 'readJSON' | 'writeJSON'>,
    private readonly dbFile = SQLITE_DB_FILE,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const SQL = await initSqlJs({
      locateFile: () => sqliteWasmUrl,
    });
    const envelope = await this.fileService.readJSON<SqliteEnvelope>(this.dbFile);
    const bytes = isEnvelope(envelope) ? fromBase64(envelope.data) : undefined;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.applySchema();
    this.seedAlgorithmRegistry();
    this.initialized = true;
    await this.persist();
  }

  async read<T>(reader: (db: Database) => T): Promise<T> {
    return reader(this.requireDb());
  }

  async write<T>(writer: (db: Database) => T): Promise<T> {
    const db = this.requireDb();
    db.run('BEGIN IMMEDIATE');
    try {
      const result = writer(db);
      db.run('COMMIT');
      await this.persist();
      return result;
    } catch (error) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackError) {
        logger.warn('SQLite rollback failed', { rollbackError });
      }
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

  markMigration(id: string, appliedAt = Date.now()): void {
    this.run(
      'INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      [id, appliedAt],
    );
  }

  async persist(): Promise<void> {
    const bytes = this.requireDb().export();
    await this.fileService.writeJSON(this.dbFile, {
      encoding: 'base64-sqlite-v1',
      byteLength: bytes.byteLength,
      updatedAt: Date.now(),
      data: toBase64(bytes),
    } satisfies SqliteEnvelope);
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
    this.initialized = false;
  }

  private applySchema(): void {
    const db = this.requireDb();
    db.run('PRAGMA foreign_keys = ON');
    for (const statement of SQL_SCHEMA_STATEMENTS) {
      db.run(statement);
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
