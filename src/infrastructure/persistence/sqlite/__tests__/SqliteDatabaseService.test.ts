import { afterEach, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SqlReviewLogRepository } from '@/infrastructure/persistence/sqlite/SqlReviewLogRepository';
import { CardState, CardType, Rating } from '@/types/card';
import {
  getRuntimePerformanceDiagnosticsReport,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

type JsonFileService = Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'>;

class MemorySqliteFileService implements JsonFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
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
    this.lastWriteBinaryDiagnostics = options?.diagnostics ?? null;
    if (this.failNextWriteBinary) {
      this.failNextWriteBinary = false;
      throw new Error('mock binary write failed');
    }
    this.binary.set(fileName, new Uint8Array(bytes));
  }

  resetWriteCounts(): void {
    this.writeBinaryCount = 0;
    this.lastWriteBinaryDiagnostics = null;
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
});
