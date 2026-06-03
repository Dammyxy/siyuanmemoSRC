import { afterEach, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { decode, encode } from '@msgpack/msgpack';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import {
  SQLITE_DB_FILE,
  SQLITE_SKINNY_PROJECTION_COLUMNS,
} from '@/infrastructure/persistence/sqlite/schema';
import { SqlReviewLogRepository } from '@/infrastructure/persistence/sqlite/SqlReviewLogRepository';
import { CardState, CardType, Rating } from '@/types/card';
import {
  getRuntimePerformanceDiagnosticsReport,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

type JsonFileService = Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary' | 'deleteFile'>;

const SQLITE_DELTA_V2_DIR = 'sqlite-delta/v2';
const SQLITE_DELTA_V2_MANIFEST = `${SQLITE_DELTA_V2_DIR}/sqlite-delta-log.v2.manifest.json`;
const SQLITE_DELTA_V2_OPEN_SEGMENT = `${SQLITE_DELTA_V2_DIR}/sqlite-delta-log.v2.open.msgpack`;
const SQLITE_DELTA_V2_SEALED_1 = `${SQLITE_DELTA_V2_DIR}/sqlite-delta-log.v2.sealed-1.msgpack`;
const LEGACY_SQLITE_DELTA_V2_MANIFEST = 'sqlite-delta-log.v2.manifest.json';
const LEGACY_SQLITE_DELTA_V2_OPEN_SEGMENT = 'sqlite-delta-log.v2.open.msgpack';

class MemorySqliteFileService implements JsonFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  readonly writeBinaryFiles: string[] = [];
  readonly deletedFiles: string[] = [];
  writeBinaryCount = 0;
  failNextWriteBinary = false;
  lastWriteBinaryDiagnostics: Record<string, unknown> | null = null;

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array, options?: { diagnostics?: Record<string, unknown> }): Promise<void> {
    this.writeBinaryCount += 1;
    this.writeBinaryFiles.push(fileName);
    this.lastWriteBinaryDiagnostics = options?.diagnostics ?? null;
    if (this.failNextWriteBinary) {
      this.failNextWriteBinary = false;
      throw new Error('mock binary write failed');
    }
    this.binary.set(fileName, new Uint8Array(bytes));
  }

  async deleteFile(fileName: string): Promise<void> {
    this.deletedFiles.push(fileName);
    this.json.delete(fileName);
    this.binary.delete(fileName);
  }

  resetWriteCounts(): void {
    this.writeBinaryCount = 0;
    this.writeBinaryFiles.length = 0;
    this.lastWriteBinaryDiagnostics = null;
  }
}

class SplitProjectionSqliteFileService implements JsonFileService {
  readonly json: Map<string, unknown>;
  readonly durableBinary: Map<string, Uint8Array>;
  readonly tempBinary = new Map<string, Uint8Array>();
  readonly writeBinaryFiles: string[] = [];
  readonly deletedFiles: string[] = [];

  constructor(source?: {
    json?: Map<string, unknown>;
    durableBinary?: Map<string, Uint8Array>;
  }) {
    this.json = source?.json
      ? new Map(Array.from(source.json.entries()).map(([key, value]) => [key, structuredClone(value)]))
      : new Map();
    this.durableBinary = source?.durableBinary
      ? new Map(Array.from(source.durableBinary.entries()).map(([key, value]) => [key, new Uint8Array(value)]))
      : new Map();
  }

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const source = fileName === SQLITE_DB_FILE ? this.tempBinary : this.durableBinary;
    const bytes = source.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.writeBinaryFiles.push(fileName);
    const target = fileName === SQLITE_DB_FILE ? this.tempBinary : this.durableBinary;
    target.set(fileName, new Uint8Array(bytes));
  }

  async deleteFile(fileName: string): Promise<void> {
    this.deletedFiles.push(fileName);
    this.json.delete(fileName);
    this.durableBinary.delete(fileName);
    this.tempBinary.delete(fileName);
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

describe('SqliteDatabaseService', () => {
  afterEach(() => {
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
  });

  it('defers nested persists and writes one binary database file per outer transaction', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.resetWriteCounts();

    await database.runTransaction('hot-path', async () => {
      database.run('CREATE TABLE hot_path_test (id TEXT PRIMARY KEY, value TEXT)');
      database.run('INSERT INTO hot_path_test (id, value) VALUES (?, ?)', ['a', 'one']);
      await database.persist();
      await database.write((db) => {
        db.run('INSERT INTO hot_path_test (id, value) VALUES (?, ?)', ['b', 'two']);
      });
    });

    expect(fileService.writeBinaryCount).toBe(1);
    expect(database.getAll<{ value: string }>('SELECT value FROM hot_path_test ORDER BY id')).toEqual([
      { value: 'one' },
      { value: 'two' },
    ]);
    expect(fileService.binary.get(SQLITE_DB_FILE)?.byteLength).toBeGreaterThan(16);
  });

  it('loads a legacy base64 envelope, backs it up, and rewrites the database as binary', async () => {
    const sourceFileService = new MemorySqliteFileService();
    const sourceDatabase = new SqliteDatabaseService(sourceFileService);
    await sourceDatabase.init();
    await sourceDatabase.runTransaction('seed-legacy-envelope', () => {
      sourceDatabase.run('CREATE TABLE legacy_envelope_test (id TEXT PRIMARY KEY, value TEXT)');
      sourceDatabase.run('INSERT INTO legacy_envelope_test (id, value) VALUES (?, ?)', ['legacy', 'loaded']);
    });
    const legacyBytes = sourceFileService.binary.get(SQLITE_DB_FILE);
    expect(legacyBytes).toBeTruthy();

    const fileService = new MemorySqliteFileService();
    fileService.json.set(SQLITE_DB_FILE, {
      encoding: 'base64-sqlite-v1',
      byteLength: legacyBytes!.byteLength,
      updatedAt: 1,
      data: toBase64(legacyBytes!),
    });
    const database = new SqliteDatabaseService(fileService);
    await database.init();

    expect(database.getOne<{ value: string }>('SELECT value FROM legacy_envelope_test WHERE id = ?', ['legacy'])).toEqual({
      value: 'loaded',
    });
    expect(fileService.binary.get(SQLITE_DB_FILE)?.byteLength).toBeGreaterThan(16);
    expect(Array.from(fileService.json.keys()).some((key) => key.startsWith('migration-backups/siyuanmemo.db.base64-envelope-'))).toBe(true);
  });

  it('does not rewrite an unchanged binary database during init', async () => {
    const fileService = new MemorySqliteFileService();
    const first = new SqliteDatabaseService(fileService);
    await first.init();
    const writesAfterFirstInit = fileService.writeBinaryCount;
    expect(writesAfterFirstInit).toBeGreaterThan(0);

    const second = new SqliteDatabaseService(fileService);
    await second.init();

    expect(fileService.writeBinaryCount).toBe(writesAfterFirstInit);
  });

  it('does not rewrite unchanged database bytes on repeated explicit persist', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.resetWriteCounts();

    await database.persist();
    await database.persist();

    expect(fileService.writeBinaryCount).toBe(0);
  });

  it('does not persist a transaction that performs no material database changes without crypto fingerprinting', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.resetWriteCounts();
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: undefined,
      });
      await database.runTransaction('noop-transaction', () => {
        database.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM cards');
      });
      await database.persist();
    } finally {
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      }
    }

    expect(fileService.writeBinaryCount).toBe(0);
  });

  it('records sqlite write labels on transaction, persist, and file diagnostics', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.resetWriteCounts();

    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    await database.write((db) => {
      db.run('CREATE TABLE diagnostic_label_test (id TEXT PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO diagnostic_label_test (id, value) VALUES (?, ?)', ['a', 'labelled']);
    }, { label: 'diagnostic.transaction' });

    expect(fileService.lastWriteBinaryDiagnostics).toEqual({
      sqlitePersistReason: 'diagnostic.transaction',
      sqlitePendingDelta: false,
    });
    const events = getRuntimePerformanceDiagnosticsReport().events;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'sqlite',
        operation: 'persist',
        metadata: expect.objectContaining({
          reason: 'diagnostic.transaction',
          status: 'written-binary',
        }),
      }),
      expect.objectContaining({
        path: 'sqlite',
        operation: 'transaction',
        metadata: expect.objectContaining({
          label: 'diagnostic.transaction',
          persisted: true,
          status: 'committed',
        }),
      }),
    ]));
  });

  it('restores the in-memory database from the last persisted file when transaction persist fails', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    await database.runTransaction('seed-restore-test', () => {
      database.run('CREATE TABLE restore_test (id TEXT PRIMARY KEY, value TEXT)');
      database.run('INSERT INTO restore_test (id, value) VALUES (?, ?)', ['before', 'persisted']);
    });

    fileService.failNextWriteBinary = true;
    await expect(database.runTransaction('failing-review-feedback', () => {
      database.run('INSERT INTO restore_test (id, value) VALUES (?, ?)', ['after', 'unpersisted']);
    })).rejects.toThrow('mock binary write failed');

    expect(database.getAll<{ id: string; value: string }>('SELECT id, value FROM restore_test ORDER BY id')).toEqual([
      { id: 'before', value: 'persisted' },
    ]);
  });

  it('exposes FTS5 capability without creating an unconditional virtual table dependency', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();

    expect(typeof database.supportsFts5()).toBe('boolean');
    expect(database.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name = '__siyuanmemo_fts5_probe'",
    )).toBeNull();
  });

  it('seeds production scheduling algorithms in the registry', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();

    const rows = database.getAll<{ algorithm_id: string }>(
      "SELECT algorithm_id FROM algorithm_registry WHERE algorithm_id IN ('fsrs-v6', 'a-factor-v2') ORDER BY algorithm_id",
    );

    expect(rows.map((row) => row.algorithm_id)).toEqual(['a-factor-v2', 'fsrs-v6']);
  });

  it('creates review event fact indexes for formal history and idempotency reads', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();

    const indexNames = database.getAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name IN (
         'idx_review_events_commit_idempotency',
         'idx_review_events_formal_facts'
       )
       ORDER BY name`,
    ).map((row) => row.name);

    expect(indexNames).toEqual([
      'idx_review_events_commit_idempotency',
      'idx_review_events_formal_facts',
    ]);
  });

  it('materializes skinny projection ownership columns and diagnostics index table', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();

    for (const column of SQLITE_SKINNY_PROJECTION_COLUMNS) {
      const columnNames = database.getAll<{ name: string }>(
        `PRAGMA table_info(${column.table})`,
      ).map((row) => row.name);
      expect(columnNames, `${column.table}.${column.name}`).toContain(column.name);
    }

    expect(database.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'diagnostics_indexes'",
    )).toEqual({ name: 'diagnostics_indexes' });
    expect(database.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_diagnostics_indexes_category'",
    )).toEqual({ name: 'idx_diagnostics_indexes_category' });
  });

  it('persists ReviewLogV2 commit idempotency through the sqlite review repository', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlReviewLogRepository(database);

    repository.addReviewLogV2({
      schemaVersion: 2,
      id: 'event-idempotency-column',
      attemptId: 'attempt-idempotency-column',
      cardId: 'card-idempotency-column',
      rating: Rating.Good,
      reviewedAt: 1_779_400_000_000,
      commitIdempotencyKey: 'review-commit:repository-key',
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      source: 'queue',
      algorithm: 'fsrs-v6',
      schedulerType: 'fsrs-v6',
      commitPolicy: 'write-schedule',
      before: {
        id: 'card-idempotency-column',
        due: 1_779_300_000_000,
        stability: 5,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: CardState.Review,
        lastReview: 1_779_300_000_000,
        elapsedDays: 1,
        scheduledDays: 1,
        priority: 50,
        type: CardType.Item,
      },
      after: null,
      isDrill: false,
      isFiltered: false,
      customStudy: false,
    });

    expect(database.getOne<{ commit_idempotency_key: string | null }>(
      'SELECT commit_idempotency_key FROM review_events WHERE id = ?',
      ['event-idempotency-column'],
    )).toEqual({ commit_idempotency_key: 'review-commit:repository-key' });
  });

  it('adds domain sync ledger tables to an existing database without dropping review, card, tombstone, or projection rows', async () => {
    const fileService = new MemorySqliteFileService();
    const first = new SqliteDatabaseService(fileService);
    await first.init();
    await first.runTransaction('seed-pre-ledger-db', () => {
      for (const table of [
        'domain_sync_operations',
        'domain_sync_processed_sources',
        'domain_sync_sanity_snapshots',
        'domain_sync_repair_plans',
      ]) {
        first.run(`DROP TABLE IF EXISTS ${table}`);
      }
      first.run(
        `INSERT INTO cards (id, block_id, updated_at, payload_json)
         VALUES (?, ?, ?, ?)`,
        ['card-a', 'block-a', 1_700_000_000_000, '{}'],
      );
      first.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['event-a', 'card-a', 'attempt-a', 3, 1_700_000_000_001, 2026, 5, 'review-v2', '{}'],
      );
      first.run(
        `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        ['card', 'card-deleted', 1_700_000_000_002, 'test', '{}'],
      );
      first.run(
        `INSERT INTO queue_projection_generations
          (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'policy-a', 1, 'ready', null, 1_700_000_000_003, '{}'],
      );
      first.run(
        `INSERT INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, membership_reason, due_at, due_bucket, priority_score,
           sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'retrieval-practice',
          'row-a',
          'card-a',
          'block-a',
          'due',
          1_700_000_000_004,
          'due',
          1,
          '0001',
          0,
          'policy-a',
          1,
          '{}',
          1_700_000_000_004,
        ],
      );
    });
    await first.persist();

    const second = new SqliteDatabaseService(fileService);
    await second.init();

    for (const table of [
      'domain_sync_operations',
      'domain_sync_processed_sources',
      'domain_sync_sanity_snapshots',
      'domain_sync_repair_plans',
    ]) {
      expect(second.getOne<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [table],
      )).toEqual({ name: table });
    }
    expect(second.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM review_events')?.count).toBe(1);
    expect(second.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM cards')?.count).toBeGreaterThanOrEqual(1);
    expect(second.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM tombstones')?.count).toBe(1);
    expect(second.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM queue_projection_rows')?.count).toBe(1);

    const indexNames = second.getAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name LIKE 'idx_domain_sync_%'
       ORDER BY name`,
    ).map((row) => row.name);
    expect(indexNames).toEqual(expect.arrayContaining([
      'idx_domain_sync_operations_entity',
      'idx_domain_sync_operations_idempotency',
      'idx_domain_sync_operations_review_event',
      'idx_domain_sync_operations_source',
      'idx_domain_sync_operations_type',
      'idx_domain_sync_processed_sources_fingerprint',
      'idx_domain_sync_processed_sources_source',
      'idx_domain_sync_repair_plans_apply_key',
      'idx_domain_sync_repair_plans_status',
      'idx_domain_sync_sanity_snapshots_status',
    ]));
  });

  it('adds review event idempotency column and index to an existing legacy database', async () => {
    const fileService = new MemorySqliteFileService();
    const seed = new SqliteDatabaseService(fileService);
    await seed.init();
    await seed.runTransaction('seed-legacy-review-events', () => {
      seed.run('DROP TABLE review_events');
      seed.run(
        `CREATE TABLE review_events (
          id TEXT PRIMARY KEY,
          card_id TEXT,
          attempt_id TEXT,
          rating INTEGER,
          reviewed_at INTEGER NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL
        )`,
      );
      seed.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['event-a', 'card-a', 'attempt-a', 3, 1_700_000_000_001, 2026, 5, 'review-v2', '{}'],
      );
    });
    await seed.persist();

    const database = new SqliteDatabaseService(fileService);
    await database.init();

    const columns = database.getAll<{ name: string }>('PRAGMA table_info(review_events)').map((row) => row.name);
    expect(columns).toContain('commit_idempotency_key');
    expect(database.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      ['idx_review_events_commit_idempotency'],
    )).toEqual({ name: 'idx_review_events_commit_idempotency' });
    expect(database.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      ['idx_review_events_formal_facts'],
    )).toEqual({ name: 'idx_review_events_formal_facts' });
    expect(database.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM review_events')?.count).toBe(1);
  });

  it('persists review event truth ref patches as sqlite delta for legacy review_events column order', async () => {
    const fileService = new MemorySqliteFileService();
    const seed = new SqliteDatabaseService(fileService);
    await seed.init();
    await seed.runTransaction('seed-legacy-review-events-delta', () => {
      seed.run('DROP TABLE review_events');
      seed.run(
        `CREATE TABLE review_events (
          id TEXT PRIMARY KEY,
          card_id TEXT,
          attempt_id TEXT,
          rating INTEGER,
          reviewed_at INTEGER NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL
        )`,
      );
      seed.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['event-legacy-delta', 'card-a', 'attempt-a', 3, 1_700_000_000_001, 2026, 5, 'review-v2', '{}'],
      );
    });
    await seed.persist();

    const migrated = new SqliteDatabaseService(fileService);
    await migrated.init();
    await migrated.persist();
    const legacyColumns = migrated.getAll<{ name: string }>('PRAGMA table_info(review_events)').map((row) => row.name);
    expect(legacyColumns.indexOf('commit_idempotency_key')).toBeGreaterThan(legacyColumns.indexOf('payload_json'));
    fileService.resetWriteCounts();
    const dbBytesBeforePatch = fileService.binary.get(SQLITE_DB_FILE);
    expect(dbBytesBeforePatch).toBeTruthy();

    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.runTransaction('review.truth.backfill.patch-refs', (db) => {
      db.run(
        `UPDATE review_events
            SET msgpack_ref = ?,
                truth_hash = ?,
                truth_schema_version = ?,
                projection_generation = ?
          WHERE id = ?`,
        [
          JSON.stringify({ family: 'review-events', recordId: 'event-legacy-delta' }),
          'truth-hash-a',
          1,
          1_700_000_000_100,
          'event-legacy-delta',
        ],
      );
    });

    expect(fileService.binary.get(SQLITE_DB_FILE)).toBe(dbBytesBeforePatch);
    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeTruthy();
    expect(fileService.json.get(SQLITE_DELTA_V2_MANIFEST)).toMatchObject({
      version: 2,
      openSegment: {
        path: SQLITE_DELTA_V2_OPEN_SEGMENT,
        entryCount: 1,
      },
    });

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();
    const row = reloaded.getOne<{
      msgpack_ref: string | null;
      truth_hash: string | null;
      truth_schema_version: number | null;
      projection_generation: number | null;
    }>(
      `SELECT msgpack_ref, truth_hash, truth_schema_version, projection_generation
         FROM review_events
        WHERE id = ?`,
      ['event-legacy-delta'],
    );
    expect(JSON.parse(row?.msgpack_ref || '{}')).toMatchObject({
      family: 'review-events',
      recordId: 'event-legacy-delta',
    });
    expect(row).toMatchObject({
      truth_hash: 'truth-hash-a',
      truth_schema_version: 1,
      projection_generation: 1_700_000_000_100,
    });
  });

  it('stores sqlite delta v2 manifest and segment files under one versioned directory', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await database.runTransaction('delta-directory', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-delta-directory',
          'card-delta-directory',
          'attempt-delta-directory',
          3,
          1_700_000_000_000,
          'commit-delta-directory',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    expect(fileService.json.has(SQLITE_DELTA_V2_MANIFEST)).toBe(true);
    expect(fileService.binary.has(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBe(true);
    expect(fileService.json.has(LEGACY_SQLITE_DELTA_V2_MANIFEST)).toBe(false);
    expect(fileService.binary.has(LEGACY_SQLITE_DELTA_V2_OPEN_SEGMENT)).toBe(false);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      fileName: SQLITE_DELTA_V2_MANIFEST,
      pendingCount: 1,
    });
  });

  it('replays sqlite delta v2 files from legacy root paths during directory migration', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await database.runTransaction('legacy-delta-source', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-legacy-root-replay',
          'card-legacy-root-replay',
          'attempt-legacy-root-replay',
          3,
          1_700_000_000_000,
          'commit-legacy-root-replay',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    const sourceManifestPath = fileService.json.has(SQLITE_DELTA_V2_MANIFEST)
      ? SQLITE_DELTA_V2_MANIFEST
      : LEGACY_SQLITE_DELTA_V2_MANIFEST;
    const sourceOpenSegmentPath = fileService.binary.has(SQLITE_DELTA_V2_OPEN_SEGMENT)
      ? SQLITE_DELTA_V2_OPEN_SEGMENT
      : LEGACY_SQLITE_DELTA_V2_OPEN_SEGMENT;
    const sourceManifest = structuredClone(fileService.json.get(sourceManifestPath)) as {
      path: string;
      openSegment: { path: string; checksum: string } | null;
    };
    const sourceBytes = fileService.binary.get(sourceOpenSegmentPath);
    expect(sourceManifest).toBeTruthy();
    expect(sourceBytes).toBeTruthy();

    const legacyEnvelope = {
      ...(decode(sourceBytes!) as Record<string, unknown>),
      path: LEGACY_SQLITE_DELTA_V2_OPEN_SEGMENT,
    };
    sourceManifest.path = LEGACY_SQLITE_DELTA_V2_MANIFEST;
    if (sourceManifest.openSegment) {
      sourceManifest.openSegment.path = LEGACY_SQLITE_DELTA_V2_OPEN_SEGMENT;
      sourceManifest.openSegment.checksum = '';
    }
    fileService.json.clear();
    fileService.binary.clear();
    fileService.json.set(LEGACY_SQLITE_DELTA_V2_MANIFEST, sourceManifest);
    fileService.binary.set(LEGACY_SQLITE_DELTA_V2_OPEN_SEGMENT, encode(legacyEnvelope));

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();

    expect(reloaded.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-legacy-root-replay'],
    )).toEqual({ id: 'event-legacy-root-replay' });
  });

  it('removes covered sqlite delta segment files after a durable checkpoint', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    for (let index = 0; index < 17; index += 1) {
      await database.runTransaction(`delta-cleanup-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-cleanup-${index}`,
            'card-cleanup',
            `attempt-cleanup-${index}`,
            3,
            1_700_000_000_000 + index,
            `commit-cleanup-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    expect(fileService.binary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();
    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeTruthy();

    await database.persist('durable-checkpoint-cleanup');

    expect(fileService.binary.get(SQLITE_DELTA_V2_SEALED_1)).toBeUndefined();
    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeUndefined();
    expect(fileService.deletedFiles).toEqual(expect.arrayContaining([
      SQLITE_DELTA_V2_SEALED_1,
      SQLITE_DELTA_V2_OPEN_SEGMENT,
    ]));
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastCheckpoint: {
        ok: true,
        cleared: true,
      },
    });
  });

  it('seals sqlite delta v2 open segments when the entry threshold is reached', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 0; index < 17; index += 1) {
      await database.runTransaction(`delta-seal-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-seal-${index}`,
            'card-seal',
            `attempt-seal-${index}`,
            3,
            1_700_000_000_000 + index,
            `commit-seal-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    const manifest = fileService.json.get(SQLITE_DELTA_V2_MANIFEST) as {
      openSegment: { path: string; sequence: number; sealed: boolean; entryCount: number } | null;
      sealedSegments: Array<{ path: string; sequence: number; sealed: boolean; entryCount: number }>;
    };
    expect(manifest.sealedSegments).toHaveLength(1);
    expect(manifest.sealedSegments[0]).toMatchObject({
      path: SQLITE_DELTA_V2_SEALED_1,
      sequence: 1,
      sealed: true,
      entryCount: 16,
    });
    expect(manifest.openSegment).toMatchObject({
      path: SQLITE_DELTA_V2_OPEN_SEGMENT,
      sequence: 2,
      sealed: false,
      entryCount: 1,
    });
    expect(
      fileService.writeBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1),
    ).toHaveLength(1);
    const sealedBytes = fileService.binary.get(SQLITE_DELTA_V2_SEALED_1);
    expect(sealedBytes).toBeTruthy();

    await database.runTransaction('delta-seal-after-threshold', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-seal-after-threshold',
          'card-seal',
          'attempt-seal-after-threshold',
          3,
          1_700_000_001_000,
          'commit-seal-after-threshold',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    expect(fileService.binary.get(SQLITE_DELTA_V2_SEALED_1)).toBe(sealedBytes);
    expect(
      fileService.writeBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1),
    ).toHaveLength(1);
  });

  it('checkpoints a hot review.feedback transaction when sqlite delta v2 reaches the pending threshold', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 0; index < 256; index += 1) {
      await database.runTransaction(`seed-pending-delta-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-pending-${index}`,
            'card-pending',
            `attempt-pending-${index}`,
            3,
            1_700_000_000_000 + index,
            `commit-pending-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 256,
    });

    await database.runTransaction('review.feedback', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-hot-threshold',
          'card-hot-threshold',
          'attempt-hot-threshold',
          4,
          1_700_000_001_000,
          'commit-hot-threshold',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    expect(database.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-hot-threshold'],
    )).toEqual({ id: 'event-hot-threshold' });
    expect(fileService.writeBinaryFiles.some((fileName) => fileName === SQLITE_DB_FILE)).toBe(true);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        label: 'review.feedback',
        hotPath: true,
        reason: 'delta-threshold-exceeded',
      },
      lastCheckpoint: {
        ok: true,
        cause: 'review.feedback:delta-threshold-exceeded',
        hotPath: true,
      },
    });

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();
    expect(reloaded.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-hot-threshold'],
    )).toEqual({ id: 'event-hot-threshold' });
  });

  it('keeps durable sqlite deltas when a volatile temp projection reaches the checkpoint threshold', async () => {
    const fileService = new SplitProjectionSqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-temp-schema');

    for (let index = 0; index < 256; index += 1) {
      await database.runTransaction(`seed-volatile-pending-delta-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-volatile-pending-${index}`,
            'card-volatile-pending',
            `attempt-volatile-pending-${index}`,
            3,
            1_700_000_000_000 + index,
            `commit-volatile-pending-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    await database.runTransaction('review.feedback', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-volatile-hot-threshold',
          'card-volatile-hot-threshold',
          'attempt-volatile-hot-threshold',
          4,
          1_700_000_001_000,
          'commit-volatile-hot-threshold',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    expect(fileService.writeBinaryFiles.filter((fileName) => fileName === SQLITE_DB_FILE)).toHaveLength(1);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 257,
      lastWrite: {
        ok: true,
        classification: 'delta',
        label: 'review.feedback',
      },
    });

    const reloadedWithoutTemp = new SplitProjectionSqliteFileService({
      json: fileService.json,
      durableBinary: fileService.durableBinary,
    });
    const reloaded = new SqliteDatabaseService(reloadedWithoutTemp, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await reloaded.init();

    expect(reloaded.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-volatile-hot-threshold'],
    )).toEqual({ id: 'event-volatile-hot-threshold' });
  });

  it('recovers volatile projection deltas from a manifest cleared by an old temp checkpoint', async () => {
    const fileService = new SplitProjectionSqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-temp-schema');

    for (let index = 0; index < 16; index += 1) {
      await database.runTransaction(`seed-volatile-sealed-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-volatile-sealed-${index}`,
            'card-volatile-sealed',
            `attempt-volatile-sealed-${index}`,
            3,
            1_700_000_000_000 + index,
            `commit-volatile-sealed-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();
    fileService.json.set(SQLITE_DELTA_V2_MANIFEST, {
      version: 2,
      path: SQLITE_DELTA_V2_MANIFEST,
      openSegment: null,
      sealedSegments: [],
      updatedAt: Date.now(),
      nextSequence: 2,
      checkpoint: {
        clearedAt: Date.now(),
        coveredSegmentPaths: [SQLITE_DELTA_V2_SEALED_1],
        reason: 'review.feedback:delta-threshold-exceeded',
      },
    });

    const reloadedWithoutTemp = new SplitProjectionSqliteFileService({
      json: fileService.json,
      durableBinary: fileService.durableBinary,
    });
    const reloaded = new SqliteDatabaseService(reloadedWithoutTemp, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await reloaded.init();

    expect(reloaded.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-volatile-sealed-15'],
    )).toEqual({ id: 'event-volatile-sealed-15' });
    await expect(reloaded.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 16,
      lastReplay: {
        ok: true,
        replayedCount: 16,
      },
    });
  });
});
