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
const LEGACY_SQLITE_DELTA_V2_SEALED_1 = 'sqlite-delta-log.v2.sealed-1.msgpack';

type TestSqliteDeltaEntry = {
  tables: string[];
  changes: Array<{ table: string }>;
  byteEstimate: number;
};

class MemorySqliteFileService implements JsonFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  readonly writeBinaryFiles: string[] = [];
  readonly deletedFiles: string[] = [];
  readonly readJSONFiles: string[] = [];
  readonly writeJSONFiles: string[] = [];
  readonly readBinaryFiles: string[] = [];
  readonly readBinaryDiagnostics: Array<{ fileName: string; diagnostics: Record<string, unknown> | null }> = [];
  readonly readJSONDiagnostics: Array<{ fileName: string; diagnostics: Record<string, unknown> | null }> = [];
  readonly writeBinaryDiagnostics: Array<{ fileName: string; diagnostics: Record<string, unknown> | null }> = [];
  readonly writeJSONDiagnostics: Array<{ fileName: string; diagnostics: Record<string, unknown> | null }> = [];
  writeBinaryCount = 0;
  failNextWriteBinary = false;
  lastWriteBinaryDiagnostics: Record<string, unknown> | null = null;

  async readJSON<T>(fileName: string, options?: { diagnostics?: Record<string, unknown> }): Promise<T | null> {
    this.readJSONFiles.push(fileName);
    this.readJSONDiagnostics.push({
      fileName,
      diagnostics: options?.diagnostics ?? null,
    });
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown, options?: { diagnostics?: Record<string, unknown> }): Promise<void> {
    this.writeJSONFiles.push(fileName);
    this.writeJSONDiagnostics.push({
      fileName,
      diagnostics: options?.diagnostics ?? null,
    });
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string, options?: { diagnostics?: Record<string, unknown> }): Promise<Uint8Array | null> {
    this.readBinaryFiles.push(fileName);
    this.readBinaryDiagnostics.push({
      fileName,
      diagnostics: options?.diagnostics ?? null,
    });
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array, options?: { diagnostics?: Record<string, unknown> }): Promise<void> {
    this.writeBinaryCount += 1;
    this.writeBinaryFiles.push(fileName);
    this.writeBinaryDiagnostics.push({
      fileName,
      diagnostics: options?.diagnostics ?? null,
    });
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
    this.readJSONFiles.length = 0;
    this.writeJSONFiles.length = 0;
    this.readBinaryFiles.length = 0;
    this.readJSONDiagnostics.length = 0;
    this.readBinaryDiagnostics.length = 0;
    this.writeJSONDiagnostics.length = 0;
    this.writeBinaryDiagnostics.length = 0;
    this.lastWriteBinaryDiagnostics = null;
  }
}

class OpenSegmentReadWindowFileService extends MemorySqliteFileService {
  pendingManifestAfterOpenRead: unknown | null = null;
  patchedManifestAfterOpenRead = false;

  async readBinary(fileName: string, options?: { diagnostics?: Record<string, unknown> }): Promise<Uint8Array | null> {
    const bytes = await super.readBinary(fileName, options);
    if (
      fileName === SQLITE_DELTA_V2_OPEN_SEGMENT
      && this.pendingManifestAfterOpenRead
      && !this.patchedManifestAfterOpenRead
    ) {
      this.patchedManifestAfterOpenRead = true;
      this.json.set(SQLITE_DELTA_V2_MANIFEST, structuredClone(this.pendingManifestAfterOpenRead));
    }
    return bytes;
  }
}

class CorruptOpenSegmentAfterReadFileService extends MemorySqliteFileService {
  private openSegmentReads = 0;
  corruptAfterOpenSegmentRead = false;
  failOpenSegmentReadAfterFailedCheckpoint = false;

  getOpenSegmentReadCount(): number {
    return this.openSegmentReads;
  }

  async readBinary(fileName: string, options?: { diagnostics?: Record<string, unknown> }): Promise<Uint8Array | null> {
    if (fileName === SQLITE_DELTA_V2_OPEN_SEGMENT && this.failOpenSegmentReadAfterFailedCheckpoint) {
      throw new Error('unexpected corrupt open segment replay after failed checkpoint repair');
    }
    const bytes = await super.readBinary(fileName, options);
    if (fileName === SQLITE_DELTA_V2_OPEN_SEGMENT) {
      this.openSegmentReads += 1;
      if (this.corruptAfterOpenSegmentRead && this.openSegmentReads === 1) {
        this.binary.set(SQLITE_DELTA_V2_OPEN_SEGMENT, new Uint8Array([9, 8, 7, 6]));
      }
    }
    return bytes;
  }

  async writeBinary(fileName: string, bytes: Uint8Array, options?: { diagnostics?: Record<string, unknown> }): Promise<void> {
    try {
      await super.writeBinary(fileName, bytes, options);
    } catch (error) {
      if (fileName === SQLITE_DB_FILE) {
        this.failOpenSegmentReadAfterFailedCheckpoint = true;
      }
      throw error;
    }
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

function readSqliteDeltaEntries(fileService: MemorySqliteFileService): TestSqliteDeltaEntry[] {
  const manifest = fileService.json.get(SQLITE_DELTA_V2_MANIFEST) as {
    openSegment?: { path: string } | null;
    sealedSegments?: Array<{ path: string }>;
  } | undefined;
  expect(manifest).toBeTruthy();
  const segmentPaths = [
    ...(manifest?.sealedSegments ?? []).map((segment) => segment.path),
    ...(manifest?.openSegment ? [manifest.openSegment.path] : []),
  ];
  return segmentPaths.flatMap((path) => {
    const bytes = fileService.binary.get(path);
    expect(bytes).toBeTruthy();
    const envelope = decode(bytes!) as { entries?: TestSqliteDeltaEntry[] };
    return envelope.entries ?? [];
  });
}

function readPrimaryKeyColumns(database: SqliteDatabaseService, tableName: string): string[] {
  return database.getAll<{ name: string; pk: number }>(`PRAGMA table_info(${tableName})`)
    .filter((column) => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((column) => column.name);
}

function insertReviewEventForSqliteDeltaWindow(
  database: SqliteDatabaseService,
  id: string,
  reviewedAt: number,
): Promise<void> {
  return database.runTransaction('review.feedback', (db) => {
    db.run(
      `INSERT INTO review_events
        (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        `card-${id}`,
        `attempt-${id}`,
        3,
        reviewedAt,
        `commit-${id}`,
        2026,
        7,
        'review-v2',
        '{}',
      ],
    );
  });
}

function insertReviewUndoJournalEntryForSqliteDeltaWindow(
  database: SqliteDatabaseService,
  undoToken: string,
): Promise<void> {
  return database.runTransaction('review.session.undo-journal.append', (db) => {
    db.run(
      `INSERT OR REPLACE INTO review_transaction_undo_journal
        (undo_token, transaction_id, session_id, queue_type, operation, card_id,
         original_review_idempotency_key, status, recorded_at, undone_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        undoToken,
        `tx-${undoToken}`,
        'session-review-hot-path',
        'final-drill',
        'feedback',
        'card-review-hot-path',
        `review-key-${undoToken}`,
        'open',
        1_700_000_005_000,
        null,
        JSON.stringify({
          undoToken,
          transactionId: `tx-${undoToken}`,
          sessionId: 'session-review-hot-path',
          queueType: 'final-drill',
          operation: 'feedback',
          cardId: 'card-review-hot-path',
          originalReviewIdempotencyKey: `review-key-${undoToken}`,
          status: 'open',
          recordedAt: 1_700_000_005_000,
        }),
      ],
    );
  });
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

  it('creates queue projection rows with policy hash in the durable primary key', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();

    expect(readPrimaryKeyColumns(database, 'queue_projection_rows')).toEqual([
      'queue_type',
      'policy_hash',
      'row_id',
    ]);
  });

  it('migrates legacy queue projection row primary keys without dropping existing rows', async () => {
    const fileService = new MemorySqliteFileService();
    const legacy = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      applySchemaOnInit: false,
    });
    await legacy.init();
    await legacy.runTransaction('seed-legacy-queue-projection-rows-pk', () => {
      legacy.run(
        `CREATE TABLE queue_projection_rows (
          queue_type TEXT NOT NULL,
          row_id TEXT NOT NULL,
          card_id TEXT NOT NULL,
          block_id TEXT,
          deck_id TEXT,
          membership_reason TEXT NOT NULL,
          due_at INTEGER,
          due_bucket TEXT NOT NULL,
          priority_score REAL NOT NULL,
          sort_key TEXT NOT NULL,
          queue_index_hint INTEGER,
          policy_hash TEXT NOT NULL,
          source_generation INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(queue_type, row_id)
        )`,
      );
      legacy.run(
        `INSERT INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
           priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'incremental-learning',
          '20260415034044-66oa2em',
          'card-20260415034039-4gpdpyo',
          'block-shared',
          null,
          'materialized-strategy',
          1_700_000_000_000,
          'due',
          20,
          '0001',
          1,
          'policy-legacy',
          7,
          '{}',
          1_700_000_000_000,
        ],
      );
    });
    await legacy.persist('seed-legacy-queue-projection-rows-pk');

    const migrated = new SqliteDatabaseService(fileService);
    await migrated.init();

    expect(readPrimaryKeyColumns(migrated, 'queue_projection_rows')).toEqual([
      'queue_type',
      'policy_hash',
      'row_id',
    ]);
    expect(migrated.getOne<{ card_id: string }>(
      'SELECT card_id FROM queue_projection_rows WHERE queue_type = ? AND policy_hash = ? AND row_id = ?',
      ['incremental-learning', 'policy-legacy', '20260415034044-66oa2em'],
    )).toEqual({ card_id: 'card-20260415034039-4gpdpyo' });
    expect(migrated.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'queue_projection_rows__legacy_policy_pk'",
    )).toBeNull();
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

  it('persists review transaction undo journal appends as sqlite delta without rewriting the database', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();
    const dbBytesBeforeAppend = fileService.binary.get(SQLITE_DB_FILE);
    expect(dbBytesBeforeAppend).toBeTruthy();

    await insertReviewUndoJournalEntryForSqliteDeltaWindow(database, 'undo-review-hot-path');

    expect(fileService.binary.get(SQLITE_DB_FILE)).toBe(dbBytesBeforeAppend);
    expect(fileService.writeBinaryFiles).not.toContain(SQLITE_DB_FILE);
    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeTruthy();
    expect(fileService.json.get(SQLITE_DELTA_V2_MANIFEST)).toMatchObject({
      version: 2,
      openSegment: {
        path: SQLITE_DELTA_V2_OPEN_SEGMENT,
        entryCount: 1,
      },
    });
    expect(readSqliteDeltaEntries(fileService)).toEqual([
      expect.objectContaining({
        tables: ['review_transaction_undo_journal'],
        changes: [
          expect.objectContaining({
            table: 'review_transaction_undo_journal',
          }),
        ],
      }),
    ]);

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await reloaded.init();
    const row = reloaded.getOne<{
      undo_token: string;
      transaction_id: string;
      session_id: string;
      queue_type: string;
      status: string;
      recorded_at: number;
      payload_json: string;
    }>(
      `SELECT undo_token, transaction_id, session_id, queue_type, status, recorded_at, payload_json
         FROM review_transaction_undo_journal
        WHERE undo_token = ?`,
      ['undo-review-hot-path'],
    );
    expect(row).toMatchObject({
      undo_token: 'undo-review-hot-path',
      transaction_id: 'tx-undo-review-hot-path',
      session_id: 'session-review-hot-path',
      queue_type: 'final-drill',
      status: 'open',
      recorded_at: 1_700_000_005_000,
    });
    expect(JSON.parse(row?.payload_json || '{}')).toMatchObject({
      undoToken: 'undo-review-hot-path',
      transactionId: 'tx-undo-review-hot-path',
      sessionId: 'session-review-hot-path',
      queueType: 'final-drill',
      status: 'open',
    });
  });

  it('labels sqlite delta append host effects for open, sealed, and manifest writes', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 0; index < 16; index += 1) {
      await insertReviewEventForSqliteDeltaWindow(
        database,
        `event-delta-metadata-${index}`,
        1_700_000_006_000 + index,
      );
    }

    expect(fileService.writeBinaryDiagnostics).toEqual(expect.arrayContaining([
      {
        fileName: SQLITE_DELTA_V2_OPEN_SEGMENT,
        diagnostics: {
          sqliteDeltaPurpose: 'sqlite-delta.append',
          sqliteDeltaSubstep: 'write-open-segment',
        },
      },
      {
        fileName: SQLITE_DELTA_V2_SEALED_1,
        diagnostics: {
          sqliteDeltaPurpose: 'sqlite-delta.append',
          sqliteDeltaSubstep: 'write-sealed-segment',
        },
      },
    ]));
    expect(fileService.writeJSONDiagnostics).toEqual(expect.arrayContaining([
      {
        fileName: SQLITE_DELTA_V2_MANIFEST,
        diagnostics: {
          sqliteDeltaPurpose: 'sqlite-delta.append',
          sqliteDeltaSubstep: 'write-manifest',
        },
      },
    ]));
  });

  it('records sqlite transaction and delta internals through diagnosticRecorder', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    const spans: Array<{ step: string; durationMs: number; extra?: Record<string, unknown> }> = [];
    await database.init();
    await database.persist('seed-schema');

    await database.runTransaction('review.feedback', (db) => {
      db.run(
        `INSERT OR REPLACE INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-transaction-trace',
          'card-transaction-trace',
          'attempt-transaction-trace',
          3,
          1_700_000_006_100,
          'commit-transaction-trace',
          2026,
          7,
          'review-v2',
          JSON.stringify({ cardId: 'card-transaction-trace' }),
        ],
      );
    }, {
      diagnosticRecorder: (step, durationMs, extra) => {
        spans.push({ step, durationMs, extra });
      },
    });

    expect(spans.map((span) => span.step)).toEqual(expect.arrayContaining([
      'sqlite.transaction-begin',
      'sqlite.transaction-writer',
      'sqlite.transaction-change-detection',
      'sqlite.delta-capture',
      'sqlite.transaction-sql-commit',
      'sqlite.delta-append-preflight',
      'sqlite.delta-pending-estimate',
      'sqlite.delta-build-entry',
      'sqlite.delta-next-pending-estimate',
      'sqlite.delta-encode-segment',
      'sqlite.delta-write-segment',
      'sqlite.delta-write-manifest',
      'sqlite.delta-append-entry-to-segments',
      'sqlite.delta-persist-total',
    ]));
    expect(spans.find((span) => span.step === 'sqlite.delta-capture')?.extra).toMatchObject({
      label: 'review.feedback',
      touchedTables: expect.arrayContaining(['review_events']),
      changeCount: expect.any(Number),
    });
    expect(spans.find((span) => span.step === 'sqlite.delta-persist-total')?.extra).toMatchObject({
      label: 'review.feedback',
      mode: 'delta',
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

  it('retries a sqlite delta open-segment read when manifest lags a rewritten open file', async () => {
    const fileService = new OpenSegmentReadWindowFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await insertReviewEventForSqliteDeltaWindow(database, 'event-open-window-1', 1_783_060_000_001);
    const staleManifest = structuredClone(fileService.json.get(SQLITE_DELTA_V2_MANIFEST));
    await insertReviewEventForSqliteDeltaWindow(database, 'event-open-window-2', 1_783_060_000_002);
    const currentManifest = structuredClone(fileService.json.get(SQLITE_DELTA_V2_MANIFEST));

    fileService.json.set(SQLITE_DELTA_V2_MANIFEST, staleManifest);
    fileService.pendingManifestAfterOpenRead = currentManifest;

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();

    expect(reloaded.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-open-window-2'],
    )).toEqual({ id: 'event-open-window-2' });
  });

  it('reuses verified sqlite delta open-segment evidence on consecutive review feedback appends', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    await insertReviewEventForSqliteDeltaWindow(database, 'event-hot-cache-1', 1_783_060_000_101);
    await insertReviewEventForSqliteDeltaWindow(database, 'event-hot-cache-2', 1_783_060_000_102);

    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(0);
    expect(fileService.writeBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(2);
    expect(fileService.writeJSONFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_MANIFEST)).toHaveLength(2);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 2,
    });
    expect(fileService.readJSONFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_MANIFEST)).toHaveLength(2);
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(1);
  });

  it('reuses verified sqlite delta sealed-segment evidence after the open segment rolls over', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 1; index <= 17; index += 1) {
      await insertReviewEventForSqliteDeltaWindow(
        database,
        `event-hot-sealed-${index}`,
        1_783_060_000_200 + index,
      );
    }

    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(0);
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(0);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 17,
    });
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(1);
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(1);
  });

  it('reuses verified volatile sqlite delta sealed-segment evidence after append preflight validates it', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 1; index <= 17; index += 1) {
      await insertReviewEventForSqliteDeltaWindow(
        database,
        `event-volatile-hot-sealed-${index}`,
        1_783_060_000_220 + index,
      );
    }

    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(0);
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(0);
    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-volatile-hot-sealed-reuse',
      1_783_060_000_300,
    );
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(0);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 18,
    });
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(1);
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(1);
  });

  it('reuses persisted-read sealed sqlite delta evidence after diagnostics before append preflight', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 1; index <= 17; index += 1) {
      await insertReviewEventForSqliteDeltaWindow(
        database,
        `event-diagnostics-sealed-${index}`,
        1_783_060_000_250 + index,
      );
    }

    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(0);

    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 17,
    });
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(1);
    fileService.resetWriteCounts();

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-diagnostics-sealed-append',
      1_783_060_000_300,
    );

    expect(fileService.readBinaryDiagnostics.filter((entry) => (
      entry.fileName === SQLITE_DELTA_V2_SEALED_1
      && entry.diagnostics?.sqliteDeltaPurpose === 'sqlite-delta.append-preflight'
    ))).toHaveLength(0);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 18,
    });
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(1);
  });

  it('keeps sealed evidence after diagnostics clears the append hot snapshot', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');
    fileService.resetWriteCounts();

    for (let index = 1; index <= 17; index += 1) {
      await insertReviewEventForSqliteDeltaWindow(
        database,
        `event-volatile-diagnostics-sealed-${index}`,
        1_783_060_000_320 + index,
      );
    }

    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(0);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 17,
    });
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1)).toHaveLength(1);
    fileService.resetWriteCounts();

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-volatile-diagnostics-sealed-append',
      1_783_060_000_400,
    );

    expect(fileService.readBinaryDiagnostics.filter((entry) => (
      entry.fileName === SQLITE_DELTA_V2_SEALED_1
      && entry.diagnostics?.sqliteDeltaPurpose === 'sqlite-delta.append-preflight'
    ))).toHaveLength(0);
  });

  it('reuses startup-verified sealed sqlite delta evidence during append preflight after reload', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    for (let index = 1; index <= 17; index += 1) {
      await insertReviewEventForSqliteDeltaWindow(
        database,
        `event-reload-sealed-${index}`,
        1_783_060_000_300 + index,
      );
    }

    expect(fileService.binary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();
    expect(fileService.readBinaryFiles.filter((fileName) => fileName === SQLITE_DELTA_V2_SEALED_1).length)
      .toBeGreaterThan(0);
    fileService.resetWriteCounts();

    await insertReviewEventForSqliteDeltaWindow(
      reloaded,
      'event-reload-sealed-append',
      1_783_060_000_400,
    );

    expect(fileService.readBinaryDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: SQLITE_DELTA_V2_OPEN_SEGMENT,
        diagnostics: expect.objectContaining({
          sqliteDeltaPurpose: 'sqlite-delta.append-preflight',
          sqliteDeltaSubstep: expect.stringMatching(
            /^(read-append-hot-path-snapshot|persist-committed-transaction-read-snapshot)$/,
          ),
        }),
      }),
    ]));
    expect(fileService.readBinaryDiagnostics.filter((entry) => (
      entry.fileName === SQLITE_DELTA_V2_SEALED_1
      && entry.diagnostics?.sqliteDeltaPurpose === 'sqlite-delta.append-preflight'
    ))).toHaveLength(0);
  });

  it('excludes queue projection cache from review feedback sqlite delta while retaining canonical writes', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');

    await database.runTransaction('review.feedback', (db) => {
      db.run(
        `INSERT OR REPLACE INTO cards
          (id, block_id, type, state, due, priority, scheduler_type, updated_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'card-delta-slim',
          'block-delta-slim',
          CardType.Item,
          CardState.Review,
          1_700_000_000_000,
          40,
          'fsrs',
          1_700_000_000_100,
          JSON.stringify({ content: 'canonical card payload' }),
        ],
      );
      db.run(
        `INSERT OR REPLACE INTO algorithm_card_state
          (card_id, algorithm_id, state_json, updated_at)
         VALUES (?, ?, ?, ?)`,
        [
          'card-delta-slim',
          'fsrs',
          JSON.stringify({ stability: 4, difficulty: 5 }),
          1_700_000_000_100,
        ],
      );
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-delta-slim',
          'card-delta-slim',
          'attempt-delta-slim',
          3,
          1_700_000_000_100,
          'commit-delta-slim',
          2026,
          5,
          'review-v2',
          JSON.stringify({ summary: 'review event index' }),
        ],
      );
      db.run(
        `INSERT INTO domain_sync_operations
          (operation_id, source_id, source_device_id, source_generation, operation_type,
           entity_type, entity_id, entity_block_id, occurred_at, observed_at,
           payload_fingerprint, idempotency_key, review_event_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'domain-sync-delta-slim',
          'source-delta-slim',
          null,
          1,
          'review-committed',
          'card',
          'card-delta-slim',
          'block-delta-slim',
          1_700_000_000_100,
          1_700_000_000_101,
          'fingerprint-delta-slim',
          'domain-sync-key-delta-slim',
          'event-delta-slim',
          JSON.stringify({ summary: 'domain sync index' }),
        ],
      );
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['review-feedback:last-applied', JSON.stringify({ eventId: 'event-delta-slim' }), 1_700_000_000_100],
      );
      db.run(
        'INSERT OR REPLACE INTO queue_state (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['retrievalPracticeQueue', JSON.stringify(['card-delta-slim-peer']), 1_700_000_000_100],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_generations
          (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'policy-delta-slim', 7, 'ready', null, 1_700_000_000_100, '{}'],
      );
      for (let index = 0; index < 96; index += 1) {
        const rowId = `projection-delta-slim-${index}`;
        db.run(
          `INSERT OR REPLACE INTO queue_projection_rows
            (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
             priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'retrieval-practice',
            rowId,
            `card-delta-slim-${index}`,
            `block-delta-slim-${index}`,
            null,
            'due',
            1_700_000_000_000 + index,
            'due',
            40,
            `0001:${rowId}`,
            index,
            'policy-delta-slim',
            7,
            JSON.stringify({
              rowId,
              stableSalt: 'stable-salt-for-review-feedback-delta-slimming-fixture',
              sourceCardFingerprint: {
                version: 1,
                cardId: `card-delta-slim-${index}`,
                blockId: `block-delta-slim-${index}`,
                schedulerType: 'fsrs',
                fingerprint: `fingerprint-${index}`,
                due: 1_700_000_000_000 + index,
                stability: 4,
                difficulty: 5,
                reps: 2,
                lapses: 0,
                state: CardState.Review,
              },
            }),
            1_700_000_000_100,
          ],
        );
      }
      db.run(
        `INSERT OR REPLACE INTO queue_projection_counters
          (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'retrieval-practice',
          'policy-delta-slim',
          7,
          1,
          96,
          96,
          96,
          JSON.stringify({ due: 96 }),
          1_700_000_000_100,
        ],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_invalidations
          (id, queue_type, reason, affected_card_ids_json, affected_block_ids_json, generation, created_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'projection-invalidation-delta-slim',
          'retrieval-practice',
          'review-feedback',
          JSON.stringify(['card-delta-slim']),
          JSON.stringify(['block-delta-slim']),
          7,
          1_700_000_000_100,
          '{}',
        ],
      );
    });

    const [entry] = readSqliteDeltaEntries(fileService);
    expect(entry.tables).toEqual(expect.arrayContaining([
      'cards',
      'algorithm_card_state',
      'review_events',
      'domain_sync_operations',
      'store_metadata',
      'queue_state',
    ]));
    expect(entry.tables).not.toEqual(expect.arrayContaining([
      'queue_projection_generations',
      'queue_projection_rows',
      'queue_projection_counters',
      'queue_projection_invalidations',
    ]));
    expect(entry.changes.map((change) => change.table)).not.toEqual(expect.arrayContaining([
      'queue_projection_rows',
      'queue_projection_counters',
    ]));
    expect(entry.byteEstimate).toBeLessThan(64 * 1024);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastWrite: {
        ok: true,
        classification: 'delta',
        affectedTables: expect.arrayContaining([
          'cards',
          'review_events',
          'domain_sync_operations',
          'queue_state',
        ]),
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
          'queue_projection_invalidations',
        ]),
        skippedDerivedChangeCount: expect.any(Number),
      },
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

  it('clears corrupted pending sqlite delta segments after a durable checkpoint writes the full database', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await database.runTransaction('delta-corrupt-open', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-corrupt-open',
          'card-corrupt-open',
          'attempt-corrupt-open',
          3,
          1_700_000_000_100,
          'commit-corrupt-open',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeTruthy();
    fileService.binary.set(SQLITE_DELTA_V2_OPEN_SEGMENT, new Uint8Array([1, 2, 3, 4]));

    await database.persist('durable-checkpoint-corrupt-open');

    expect(database.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-corrupt-open'],
    )).toEqual({ id: 'event-corrupt-open' });
    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeUndefined();
    expect(fileService.deletedFiles).toContain(SQLITE_DELTA_V2_OPEN_SEGMENT);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastCheckpoint: {
        ok: true,
        cleared: true,
        reason: 'durable-checkpoint-corrupt-open',
      },
    });
  });

  it('checkpoints instead of failing when a transaction finds a corrupted pending sqlite delta segment', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await database.runTransaction('delta-corrupt-before-transaction', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-corrupt-before-transaction',
          'card-corrupt-before-transaction',
          'attempt-corrupt-before-transaction',
          3,
          1_700_000_000_101,
          'commit-corrupt-before-transaction',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
    });
    fileService.binary.set(SQLITE_DELTA_V2_OPEN_SEGMENT, new Uint8Array([5, 6, 7, 8]));

    await database.runTransaction('queue.projection.replace', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-after-corrupt-delta',
          'card-after-corrupt-delta',
          'attempt-after-corrupt-delta',
          3,
          1_700_000_000_102,
          'commit-after-corrupt-delta',
          2026,
          5,
          'review-v2',
          '{}',
        ],
      );
    });

    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeUndefined();
    expect(fileService.deletedFiles).toContain(SQLITE_DELTA_V2_OPEN_SEGMENT);
    expect(database.getAll<{ id: string }>(
      "SELECT id FROM review_events WHERE id IN ('event-corrupt-before-transaction', 'event-after-corrupt-delta') ORDER BY id",
    )).toEqual([
      { id: 'event-after-corrupt-delta' },
      { id: 'event-corrupt-before-transaction' },
    ]);

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();

    expect(reloaded.getAll<{ id: string }>(
      "SELECT id FROM review_events WHERE id IN ('event-corrupt-before-transaction', 'event-after-corrupt-delta') ORDER BY id",
    )).toEqual([
      { id: 'event-after-corrupt-delta' },
      { id: 'event-corrupt-before-transaction' },
    ]);
  });

  it('repairs a corrupted open sqlite delta segment discovered while appending review.feedback', async () => {
    const fileService = new CorruptOpenSegmentAfterReadFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-corrupt-open-before-review-feedback',
      1_700_000_000_201,
    );
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
    });
    fileService.resetWriteCounts();
    fileService.binary.set(SQLITE_DELTA_V2_OPEN_SEGMENT, new Uint8Array([9, 8, 7, 6]));

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-after-corrupt-open-review-feedback',
      1_700_000_000_202,
    );

    expect(fileService.writeBinaryFiles).toContain(SQLITE_DB_FILE);
    expect(fileService.binary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeUndefined();
    expect(fileService.deletedFiles).toContain(SQLITE_DELTA_V2_OPEN_SEGMENT);
    expect(database.getAll<{ id: string }>(
      `SELECT id FROM review_events
       WHERE id IN ('event-corrupt-open-before-review-feedback', 'event-after-corrupt-open-review-feedback')
       ORDER BY id`,
    )).toEqual([
      { id: 'event-after-corrupt-open-review-feedback' },
      { id: 'event-corrupt-open-before-review-feedback' },
    ]);

    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        label: 'review.feedback',
        hotPath: true,
        reason: 'corrupt-open-segment-checkpoint-repair',
      },
      lastCheckpoint: {
        ok: true,
        cause: 'review.feedback:corrupt-open-segment-checkpoint-repair',
        hotPath: true,
        cleared: true,
      },
    });

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();

    expect(reloaded.getAll<{ id: string }>(
      `SELECT id FROM review_events
       WHERE id IN ('event-corrupt-open-before-review-feedback', 'event-after-corrupt-open-review-feedback')
       ORDER BY id`,
    )).toEqual([
      { id: 'event-after-corrupt-open-review-feedback' },
      { id: 'event-corrupt-open-before-review-feedback' },
    ]);
  });

  it('fails corrupt open segment checkpoint repair without replaying the corrupt segment during restore', async () => {
    const fileService = new CorruptOpenSegmentAfterReadFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-corrupt-open-before-failed-repair',
      1_700_000_000_301,
    );
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
    });
    fileService.resetWriteCounts();
    fileService.binary.set(SQLITE_DELTA_V2_OPEN_SEGMENT, new Uint8Array([9, 8, 7, 6]));
    fileService.failNextWriteBinary = true;

    await expect(insertReviewEventForSqliteDeltaWindow(
      database,
      'event-after-corrupt-open-failed-repair',
      1_700_000_000_302,
    )).rejects.toThrow('SQLITE_DELTA_REPAIR_REQUIRED: corrupt open segment checkpoint repair failed');

    expect(fileService.writeBinaryFiles).toEqual([SQLITE_DB_FILE]);
    expect(database.getAll<{ id: string }>(
      `SELECT id FROM review_events
       WHERE id IN ('event-corrupt-open-before-failed-repair', 'event-after-corrupt-open-failed-repair')
       ORDER BY id`,
    )).toEqual([
      { id: 'event-after-corrupt-open-failed-repair' },
      { id: 'event-corrupt-open-before-failed-repair' },
    ]);

    fileService.failOpenSegmentReadAfterFailedCheckpoint = false;
    await expect(database.getSqliteDeltaDiagnostics()).rejects.toThrow(
      'SQLite delta segment checksum mismatch: sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack',
    );
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

  it('keeps review feedback hot path open when delta-sync sealed evidence is corrupted', async () => {
    const fileService = new SplitProjectionSqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');

    for (let index = 0; index < 17; index += 1) {
      await database.runTransaction(`delta-corrupt-sealed-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-corrupt-sealed-${index}`,
            'card-corrupt-sealed',
            `attempt-corrupt-sealed-${index}`,
            3,
            1_700_000_003_000 + index,
            `commit-corrupt-sealed-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();
    fileService.durableBinary.set(SQLITE_DELTA_V2_SEALED_1, new Uint8Array([6, 6, 6, 6]));
    fileService.writeBinaryFiles.length = 0;

    await expect(insertReviewEventForSqliteDeltaWindow(
      database,
      'event-after-corrupt-sealed',
      1_700_000_003_099,
    )).resolves.toBeUndefined();

    expect(fileService.writeBinaryFiles).not.toContain(SQLITE_DELTA_V2_SEALED_1);
    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();
    expect(fileService.deletedFiles).not.toContain(SQLITE_DELTA_V2_SEALED_1);
  });

  it('fails closed when diagnostics verifies a sealed sqlite delta segment checksum mismatch', async () => {
    const fileService = new SplitProjectionSqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-schema');

    for (let index = 0; index < 17; index += 1) {
      await database.runTransaction(`delta-diagnostics-corrupt-sealed-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-diagnostics-corrupt-sealed-${index}`,
            'card-diagnostics-corrupt-sealed',
            `attempt-diagnostics-corrupt-sealed-${index}`,
            3,
            1_700_000_004_000 + index,
            `commit-diagnostics-corrupt-sealed-${index}`,
            2026,
            5,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();
    fileService.durableBinary.set(SQLITE_DELTA_V2_SEALED_1, new Uint8Array([6, 6, 6, 6]));
    fileService.writeBinaryFiles.length = 0;

    await expect(database.getSqliteDeltaDiagnostics()).rejects.toThrow(
      'SQLite delta segment checksum mismatch: sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
    );

    expect(fileService.writeBinaryFiles).not.toContain(SQLITE_DB_FILE);
    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_SEALED_1)).toBeTruthy();
    expect(fileService.deletedFiles).not.toContain(SQLITE_DELTA_V2_SEALED_1);
  });

  it('recovers a missing versioned sealed sqlite delta segment from an exact legacy candidate', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    for (let index = 0; index < 16; index += 1) {
      await database.runTransaction(`delta-legacy-sealed-source-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-legacy-sealed-${index}`,
            'card-legacy-sealed',
            `attempt-legacy-sealed-${index}`,
            3,
            1_700_000_004_000 + index,
            `commit-legacy-sealed-${index}`,
            2026,
            7,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    const sealedBytes = fileService.binary.get(SQLITE_DELTA_V2_SEALED_1);
    expect(sealedBytes).toBeTruthy();
    fileService.binary.delete(SQLITE_DELTA_V2_SEALED_1);
    fileService.binary.set(LEGACY_SQLITE_DELTA_V2_SEALED_1, sealedBytes!);
    fileService.writeBinaryFiles.length = 0;

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await reloaded.init();

    expect(reloaded.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['event-legacy-sealed-15'],
    )).toEqual({ id: 'event-legacy-sealed-15' });
    expect(fileService.binary.get(SQLITE_DELTA_V2_SEALED_1)).toEqual(sealedBytes);
    expect(fileService.writeBinaryFiles).toContain(SQLITE_DELTA_V2_SEALED_1);
    await expect(reloaded.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 16,
      lastReplay: {
        ok: true,
        replayedCount: 16,
      },
    });
  });

  it('fails closed when a missing sealed sqlite delta segment has a mismatched legacy candidate', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });
    await database.init();
    await database.persist('seed-schema');

    for (let index = 0; index < 16; index += 1) {
      await database.runTransaction(`delta-mismatched-legacy-sealed-${index}`, (db) => {
        db.run(
          `INSERT INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `event-mismatched-legacy-sealed-${index}`,
            'card-mismatched-legacy-sealed',
            `attempt-mismatched-legacy-sealed-${index}`,
            3,
            1_700_000_005_000 + index,
            `commit-mismatched-legacy-sealed-${index}`,
            2026,
            7,
            'review-v2',
            '{}',
          ],
        );
      });
    }

    fileService.binary.delete(SQLITE_DELTA_V2_SEALED_1);
    fileService.binary.set(LEGACY_SQLITE_DELTA_V2_SEALED_1, new Uint8Array([1, 2, 3, 4]));
    fileService.writeBinaryFiles.length = 0;

    const reloaded = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });

    await expect(reloaded.init()).rejects.toThrow(
      'SQLite delta sealed segment unrecoverable: sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
    );
    expect(fileService.binary.get(SQLITE_DELTA_V2_SEALED_1)).toBeUndefined();
    expect(fileService.writeBinaryFiles).not.toContain(SQLITE_DELTA_V2_SEALED_1);
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

  it('repairs a corrupt volatile open sqlite delta segment with a full checkpoint', async () => {
    const fileService = new SplitProjectionSqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
      checkpointStorageClass: 'volatile-projection',
    });
    await database.init();
    await database.persist('seed-volatile-corrupt-open-schema');

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-volatile-corrupt-open-before',
      1_700_000_002_001,
    );
    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeTruthy();
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
    });
    fileService.durableBinary.set(SQLITE_DELTA_V2_OPEN_SEGMENT, new Uint8Array([9, 8, 7, 6]));

    await insertReviewEventForSqliteDeltaWindow(
      database,
      'event-volatile-corrupt-open-after',
      1_700_000_002_002,
    );

    expect(fileService.writeBinaryFiles).toContain(SQLITE_DB_FILE);
    expect(fileService.durableBinary.get(SQLITE_DELTA_V2_OPEN_SEGMENT)).toBeUndefined();
    expect(fileService.deletedFiles).toContain(SQLITE_DELTA_V2_OPEN_SEGMENT);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        label: 'review.feedback',
        reason: 'corrupt-open-segment-checkpoint-repair',
      },
      lastCheckpoint: {
        ok: true,
        cause: 'review.feedback:corrupt-open-segment-checkpoint-repair',
        cleared: true,
      },
    });
    expect(database.getAll<{ id: string }>(
      `SELECT id FROM review_events
       WHERE id IN ('event-volatile-corrupt-open-before', 'event-volatile-corrupt-open-after')
       ORDER BY id`,
    )).toEqual([
      { id: 'event-volatile-corrupt-open-after' },
      { id: 'event-volatile-corrupt-open-before' },
    ]);

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

    await expect(reloaded.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
    });
    expect(reloaded.getAll<{ id: string }>(
      `SELECT id FROM review_events
       WHERE id IN ('event-volatile-corrupt-open-before', 'event-volatile-corrupt-open-after')
       ORDER BY id`,
    )).toEqual([]);
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
