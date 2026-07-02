import { afterEach, describe, expect, it, vi } from 'vitest';
import { encode } from '@msgpack/msgpack';
import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
} from '../../packages/contracts/src/backend-rpc';
import { CardState, CardType } from '@/types/card';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import {
  createInMemorySqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';
import { createMessagePackTruthSegmentStore } from '../truth/MessagePackTruthSegmentStore';
import { RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH } from '../truth/LegacyUnifiedCardsMigrationReceipt';

const SQLITE_DELTA_V2_MANIFEST = 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json';
const SQLITE_DELTA_V2_OPEN_SEGMENT = 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack';
const WORKER_TRUTH_DEVICE_ID = 'device-worker-test';

type InMemorySqliteBridge = ReturnType<typeof createInMemorySqlitePersistenceBridge>;

async function seedCardMemoryTruth(
  bridge: InMemorySqliteBridge,
  cardId = 'truth-rebuild-card',
): Promise<void> {
  const store = createMessagePackTruthSegmentStore({
    fileStore: bridge.truthFileStore!,
    family: 'card-memory-facts',
    deviceId: WORKER_TRUTH_DEVICE_ID,
    generationId: 'card-memory-facts-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  });
  await store.appendRecords([{
    id: `seed:${cardId}`,
    family: 'card-memory-facts',
    type: 'card-memory.snapshot-imported',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    createdAt: 1_700_000_010_000,
    updatedAt: 1_700_000_010_000,
    source: {
      cardId,
      sourceBlockId: `block-${cardId}`,
      legacySource: 'test-truth-seed',
    },
    memory: {
      stability: 0,
      difficulty: 0,
      due: 1_700_086_400_000,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      priority: 42,
      schedulerType: 'fsrs-v6',
    },
    payload: {
      cardId,
      xiuyuanId: `xy-${cardId}`,
      blockId: `block-${cardId}`,
      type: CardType.Item,
      tags: ['truth', 'startup'],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_010_000,
      meta: {
        sourceHash: `source-hash-${cardId}`,
      },
    },
  }]);
}

async function loadWorkerDatabaseFromBridge(
  bridge: SqlitePersistenceBridge,
): Promise<WorkerSqliteDatabaseService> {
  const database = new WorkerSqliteDatabaseService(bridge);
  await database.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID });
  return database;
}

async function listTruthFiles(bridge: InMemorySqliteBridge): Promise<string[]> {
  return bridge.truthFileStore!.listFiles!('truth/');
}

function wrapBridgeWithTrackedTruthWrites(bridge: InMemorySqliteBridge) {
  const truthWriteBinary = vi.fn(bridge.truthFileStore!.writeBinary.bind(bridge.truthFileStore));
  const truthWriteJSON = vi.fn(bridge.truthFileStore!.writeJSON.bind(bridge.truthFileStore));
  return {
    bridge: {
      ...bridge,
      truthFileStore: {
        ...bridge.truthFileStore!,
        writeBinary: truthWriteBinary,
        writeJSON: truthWriteJSON,
      },
    },
    truthWriteBinary,
    truthWriteJSON,
  };
}

describe('WorkerSqliteDatabaseService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads previously persisted database bytes with sql.js runtime', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();

    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.runTransaction('seed-worker-db', (db) => {
      db.run('CREATE TABLE worker_db_seed (id TEXT PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO worker_db_seed (id, value) VALUES (?, ?)', ['a', 'persisted']);
    });
    await first.persist();
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();
    const row = second.getOne<{ value: string }>(
      'SELECT value FROM worker_db_seed WHERE id = ?',
      ['a'],
    );

    expect(row).toEqual({ value: 'persisted' });
  });

  it('exposes transferable array buffer helper for binary bridge payloads', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const service = new WorkerSqliteDatabaseService(bridge);
    await service.init();
    await service.persist();

    const snapshot = bridge.snapshot();
    expect(snapshot.bytes).toBeTruthy();
    expect(snapshot.bytes!.byteLength).toBeGreaterThan(16);
  });

  it('does not rewrite the sqlite file during worker init', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));

    const first = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await first.init();
    await first.persist();
    const writesAfterSeed = writeBinary.mock.calls.length;
    first.dispose();

    const second = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await second.init();

    expect(writeBinary).toHaveBeenCalledTimes(writesAfterSeed);
  });

  it('does not import retired unified-cards startup snapshots into truth or projection', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await bridge.writeBinary(RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3]));

    const database = await loadWorkerDatabaseFromBridge(bridge);

    expect(database.getOne<{ id: string }>(
      'SELECT id FROM cards WHERE id = ?',
      ['legacy-startup-card'],
    )).toBeNull();
    expect(bridge.jsonSnapshot(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH)).toBeNull();
    await expect(listTruthFiles(bridge)).resolves.toEqual([]);
  });

  it('rebuilds a deleted temp projection from truth without legacy MessagePack bytes', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCardMemoryTruth(bridge, 'truth-rebuild-card');
    const truthFilesBeforeRestart = await listTruthFiles(bridge);
    await bridge.deleteFile!('siyuanmemo.db');

    const { bridge: trackedBridge, truthWriteBinary, truthWriteJSON } = wrapBridgeWithTrackedTruthWrites(bridge);
    const second = await loadWorkerDatabaseFromBridge(trackedBridge);

    expect(second.getOne<{
      id: string;
      block_id: string;
      msgpack_ref: string;
    }>('SELECT id, block_id, msgpack_ref FROM cards WHERE id = ?', ['truth-rebuild-card']))
      .toMatchObject({
        id: 'truth-rebuild-card',
        block_id: 'block-truth-rebuild-card',
        msgpack_ref: expect.stringContaining('truth/card-memory-facts/'),
      });
    await expect(listTruthFiles(bridge)).resolves.toEqual(expect.arrayContaining([
      ...truthFilesBeforeRestart,
      LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
    ]));
    expect(truthWriteBinary).not.toHaveBeenCalled();
    expect(truthWriteJSON).toHaveBeenCalledWith(
      LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
      expect.objectContaining({ status: 'reconciled' }),
    );
  });

  it('uses existing truth and ignores retired legacy source divergence', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCardMemoryTruth(bridge, 'legacy-divergence-card');
    await bridge.writeBinary(RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3]));
    const first = await loadWorkerDatabaseFromBridge(bridge);
    first.dispose();

    const truthFilesAfterMigration = await listTruthFiles(bridge);
    await bridge.deleteFile!('siyuanmemo.db');
    const unchanged = wrapBridgeWithTrackedTruthWrites(bridge);
    const second = await loadWorkerDatabaseFromBridge(unchanged.bridge);

    await expect(listTruthFiles(bridge)).resolves.toEqual(truthFilesAfterMigration);
    expect(unchanged.truthWriteBinary).not.toHaveBeenCalled();
    expect(unchanged.truthWriteJSON).not.toHaveBeenCalled();
    expect(second.getOne<{ id: string }>(
      'SELECT id FROM cards WHERE id = ?',
      ['legacy-divergence-card'],
    )).toEqual({ id: 'legacy-divergence-card' });

    await bridge.deleteFile!('siyuanmemo.db');
    await bridge.writeBinary(RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([9, 9, 9]));
    const diverged = wrapBridgeWithTrackedTruthWrites(bridge);
    const third = await loadWorkerDatabaseFromBridge(diverged.bridge);

    expect(third.getOne<{ id: string }>(
      'SELECT id FROM cards WHERE id = ?',
      ['legacy-divergence-card'],
    )).toEqual({ id: 'legacy-divergence-card' });
    await expect(listTruthFiles(bridge)).resolves.toEqual(truthFilesAfterMigration);
    expect(diverged.truthWriteBinary).not.toHaveBeenCalled();
    expect(diverged.truthWriteJSON).not.toHaveBeenCalled();
  });

  it('keeps repeated queue projection replacements out of durable main database writes', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
      writeJSON,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-card',
      blockId: 'projection-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.length;

    for (const queueType of ['retrieval-practice', 'incremental-learning', 'final-drill']) {
      await database.replaceQueueProjection({
        queueType,
        policyHash: `${queueType}:policy`,
        generation: 1,
        rows: [{
          rowId: `${queueType}:row`,
          cardId: 'projection-card',
          blockId: 'projection-block',
          deckId: null,
          membershipReason: 'test',
          dueAt: 1_700_000_000_000,
          dueBucket: 'due',
          priorityScore: 40,
          sortKey: `0001:${queueType}`,
          queueIndexHint: 1,
          payload: { source: 'test' },
        }],
        reason: 'test-materialization',
      });
    }

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    expect(writeJSON.mock.calls.filter(([path]) => path === 'sqlite-delta-log.v1.json')).toHaveLength(0);
    expect(writeJSON.mock.calls.filter(([path]) => path === SQLITE_DELTA_V2_MANIFEST)).toHaveLength(0);
    expect(writeBinary.mock.calls.filter(([path]) => path === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(0);
    await database.persist();

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        deltaEntriesWritten: 0,
        affectedTables: [],
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
        ]),
        skippedDerivedChangeCount: expect.any(Number),
      },
      lastCheckpoint: {
        ok: true,
        cleared: false,
        cause: 'worker.persist',
        initiator: 'db.persist',
        hotPath: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('does not use explicit persist as a durable delta checkpoint for the temp projection', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-flush-card',
      blockId: 'projection-flush-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection flush card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:flush-policy',
      generation: 1,
      rows: [{
        rowId: 'retrieval-practice:flush-row',
        cardId: 'projection-flush-card',
        blockId: 'projection-flush-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:retrieval-practice',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-flush',
    });

    await database.persist();
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);

    await database.persist();
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        deltaEntriesWritten: 0,
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
        ]),
      },
      lastCheckpoint: {
        ok: true,
        cleared: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('skips queue projection replacement from sqlite delta without writing the main database hot path', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
      writeJSON,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-delta-card',
      blockId: 'projection-delta-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection delta card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:delta-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-delta-row',
        cardId: 'projection-delta-card',
        blockId: 'projection-delta-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-delta',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-delta-hot-path',
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    expect(writeJSON.mock.calls.some(([path]) => path === 'sqlite-delta-log.v1.json')).toBe(false);
    expect(writeJSON.mock.calls.some(([path]) => path === SQLITE_DELTA_V2_MANIFEST)).toBe(false);
    expect(writeBinary.mock.calls.some(([path]) => path === SQLITE_DELTA_V2_OPEN_SEGMENT)).toBe(false);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      fileName: SQLITE_DELTA_V2_MANIFEST,
      version: 2,
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        deltaEntriesWritten: 0,
        affectedTables: [],
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
        ]),
      },
    });
  });

  it('replays review feedback canonical sqlite deltas without queue projection rows', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.persist();
    await first.runTransaction('review.feedback', (db) => {
      db.run(
        `INSERT OR REPLACE INTO cards
          (id, block_id, type, state, due, priority, scheduler_type, updated_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-replay-card',
          'review-replay-block',
          CardType.Item,
          CardState.Review,
          1_700_000_000_000,
          40,
          'fsrs',
          1_700_000_000_100,
          JSON.stringify({ content: 'review replay card' }),
        ],
      );
      db.run(
        `INSERT OR REPLACE INTO algorithm_card_state
          (card_id, algorithm_id, state_json, updated_at)
         VALUES (?, ?, ?, ?)`,
        [
          'review-replay-card',
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
          'review-replay-event',
          'review-replay-card',
          'review-replay-attempt',
          3,
          1_700_000_000_100,
          'review-replay-commit',
          2026,
          5,
          'review-v2',
          JSON.stringify({ source: 'test' }),
        ],
      );
      db.run(
        `INSERT INTO domain_sync_operations
          (operation_id, source_id, source_device_id, source_generation, operation_type,
           entity_type, entity_id, entity_block_id, occurred_at, observed_at,
           payload_fingerprint, idempotency_key, review_event_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-replay-domain-sync',
          'source-review-replay',
          null,
          1,
          'review-committed',
          'card',
          'review-replay-card',
          'review-replay-block',
          1_700_000_000_100,
          1_700_000_000_101,
          'fingerprint-review-replay',
          'domain-sync-review-replay',
          'review-replay-event',
          JSON.stringify({ source: 'test' }),
        ],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_generations
          (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'review-replay-policy', 1, 'ready', null, 1_700_000_000_100, '{}'],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, membership_reason, due_at, due_bucket, priority_score,
           sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'retrieval-practice',
          'review-replay-projection-row',
          'review-replay-card',
          'review-replay-block',
          'test',
          1_700_000_000_000,
          'due',
          40,
          '0001:review-replay-projection',
          1,
          'review-replay-policy',
          1,
          '{}',
          1_700_000_000_100,
        ],
      );
    });
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();

    expect(second.getOne<{ id: string }>('SELECT id FROM cards WHERE id = ?', ['review-replay-card']))
      .toEqual({ id: 'review-replay-card' });
    expect(second.getOne<{ id: string }>('SELECT id FROM review_events WHERE id = ?', ['review-replay-event']))
      .toEqual({ id: 'review-replay-event' });
    expect(second.getOne<{ operation_id: string }>(
      'SELECT operation_id FROM domain_sync_operations WHERE operation_id = ?',
      ['review-replay-domain-sync'],
    )).toEqual({ operation_id: 'review-replay-domain-sync' });
    expect(second.getOne<{ row_id: string }>(
      'SELECT row_id FROM queue_projection_rows WHERE queue_type = ? AND row_id = ?',
      ['retrieval-practice', 'review-replay-projection-row'],
    )).toBeNull();
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastReplay: { ok: true, replayedCount: 1 },
    });

    await second.persist();
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastCheckpoint: {
        ok: true,
        cleared: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('replays registered table deletes by primary key rather than rowid', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const first = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await first.init();
    await first.runTransaction('seed.review-event-row-for-delete', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-delete-row',
          'review-delete-card',
          'review-delete-attempt',
          3,
          1_700_000_000_000,
          'review-delete-commit',
          2026,
          5,
          'review-v2',
          JSON.stringify({ source: 'delete-test' }),
        ],
      );
    });
    await first.persist();
    const writesBeforeDelete = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await first.runTransaction('review-events.delete-row', (db) => {
      db.run(
        'DELETE FROM review_events WHERE id = ?',
        ['review-delete-row'],
      );
    });
    first.dispose();

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeDelete);
    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();

    expect(second.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['review-delete-row'],
    )).toBeNull();
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 2,
      lastReplay: { ok: true, replayedCount: 2 },
    });
  });

  it('uses explicit checkpoint mode for unregistered table transactions', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.runTransaction('seed.unsupported-fixture-table', (db) => {
      db.run('CREATE TABLE delta_unsupported_fixture (id TEXT PRIMARY KEY, value TEXT)');
    });
    await database.persist();
    const writesBeforeUnsupported = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.runTransaction('unsupported.fixture.update', (db) => {
      db.run(
        'INSERT OR REPLACE INTO delta_unsupported_fixture (id, value) VALUES (?, ?)',
        ['unsupported-checkpoint-row', 'changed'],
      );
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeUnsupported + 1);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        reason: 'unsupported-table:delta_unsupported_fixture',
      },
    });
  });

  it('uses explicit checkpoint mode for schema-mutating transactions', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.persist();
    const writesBeforeSchemaChange = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.runTransaction('schema.delta-barrier', (db) => {
      db.run('CREATE TABLE schema_delta_barrier (id TEXT PRIMARY KEY, value TEXT)');
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeSchemaChange + 1);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        reason: 'schema-dirty',
      },
    });
  });

  it('skips projection-only payloads even when their derived cache rows exceed the delta threshold', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-threshold-card',
      blockId: 'projection-threshold-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection threshold card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:threshold-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-threshold-row',
        cardId: 'projection-threshold-card',
        blockId: 'projection-threshold-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-threshold',
        queueIndexHint: 1,
        payload: { source: 'test', large: 'x'.repeat(600_000) },
      }],
      reason: 'test-delta-threshold',
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        cause: 'queue.projection.replace',
        initiator: 'queue.projection.replace',
        projectionGeneration: null,
        hotPath: false,
        checkpointStorageClass: 'volatile-projection',
        deltaEntriesWritten: 0,
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_rows',
        ]),
      },
    });
  });

  it('fails explicitly when a delta-eligible transaction cannot write the sqlite delta log', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    let failDeltaWrite = false;
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const writeBinary = vi.fn(async (path: string, bytes: Uint8Array) => {
      if (path === SQLITE_DELTA_V2_OPEN_SEGMENT && failDeltaWrite) {
        throw new Error('mock delta write failed');
      }
      await bridge.writeBinary(path, bytes);
    });
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
      writeJSON,
    });
    await database.init();
    await database.persist();
    const writesBeforeDurableDelta = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;
    failDeltaWrite = true;

    await expect(database.runTransaction('metadata.delta-write-fail', (db) => {
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['delta-write-fail', JSON.stringify({ source: 'test' }), 1_700_000_000_000],
      );
    })).rejects.toThrow('mock delta write failed');

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeDurableDelta);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: false,
        classification: 'delta',
        error: 'mock delta write failed',
      },
    });
  });

  it('keeps sqlite delta pending when checkpoint write fails after replay', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.persist();
    await first.runTransaction('metadata.checkpoint-fail', (db) => {
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['checkpoint-fail', JSON.stringify({ source: 'test' }), 1_700_000_000_000],
      );
    });
    first.dispose();

    let failMainDbWrite = true;
    const writeBinary = vi.fn(async (path: string, bytes: Uint8Array) => {
      if (path === 'siyuanmemo.db' && failMainDbWrite) {
        failMainDbWrite = false;
        throw new Error('mock checkpoint failed');
      }
      await bridge.writeBinary(path, bytes);
    });
    const second = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await second.init();

    await expect(second.persist()).rejects.toThrow('mock checkpoint failed');
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastCheckpoint: { ok: false, cleared: false },
    });
  });

  it('fails closed when sqlite delta log is corrupt', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await bridge.writeJSON!('sqlite-delta-log.v2.manifest.json', {
      version: 99,
      updatedAt: Date.now(),
    });
    const database = new WorkerSqliteDatabaseService(bridge);

    await expect(database.init()).rejects.toThrow(/SQLite delta log unsupported/);
  });

  it('fails closed when sqlite delta replay references an unsupported table', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const now = Date.now();
    const entry = {
      id: 'sqlite-delta:unsupported-table',
      version: 1,
      label: 'unsupported-table',
      createdAt: now,
      schemaFingerprints: { delta_unsupported_fixture: 'unsupported' },
      tables: ['delta_unsupported_fixture'],
      changes: [{
        table: 'delta_unsupported_fixture',
        operation: 'delete',
        primaryKey: { id: 'card-a' },
        row: null,
      }],
      byteEstimate: 1,
    };
    await bridge.writeBinary('sqlite-delta-log.v2.open.msgpack', encode({
      version: 2,
      kind: 'sqlite-delta-segment',
      path: 'sqlite-delta-log.v2.open.msgpack',
      sequence: 1,
      sealed: false,
      createdAt: now,
      updatedAt: Date.now(),
      entries: [entry],
    }));
    await bridge.writeJSON!('sqlite-delta-log.v2.manifest.json', {
      version: 2,
      path: 'sqlite-delta-log.v2.manifest.json',
      openSegment: {
        version: 2,
        path: 'sqlite-delta-log.v2.open.msgpack',
        sequence: 1,
        sealed: false,
        checksum: '',
        entryCount: 1,
        byteSize: 1,
        minCreatedAt: now,
        maxCreatedAt: now,
        sealedAt: null,
      },
      sealedSegments: [],
      updatedAt: now,
      nextSequence: 2,
    });
    const database = new WorkerSqliteDatabaseService(bridge);

    await expect(database.init()).rejects.toThrow(/SQLite delta replay unsupported table: delta_unsupported_fixture/);
  });

  it('does not persist or append processed-source rows for no-op persisted main DB merge', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'noop-main-merge-card',
      blockId: 'noop-main-merge-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'noop main merge card' },
    }]);
    await database.persist();

    const externalBridge = createInMemorySqlitePersistenceBridge();
    await externalBridge.writeBinary('siyuanmemo.db', bridge.snapshot().bytes!);
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await externalDatabase.init();
    await externalDatabase.runTransaction('seed.noop-processed-main-source', (db) => {
      db.run(
        `INSERT OR REPLACE INTO domain_sync_processed_sources
          (source_id, source_fingerprint, source_kind, path, processed_at,
           imported_operations, ignored_operations, imported_review_events, ignored_review_events,
           imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'siyuan-sync:siyuanmemo.db',
          'external-noop-fingerprint',
          'persisted-main-db',
          null,
          1_700_000_100_000,
          0,
          12,
          0,
          0,
          0,
          1,
          null,
          null,
          '{}',
        ],
      );
    });
    await externalDatabase.persist();
    await bridge.writeBinary('siyuanmemo.db', externalBridge.snapshot().bytes!);

    const writesBeforeMerge = writeBinary.mock.calls.length;
    const processedRowsBefore = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['siyuan-sync:siyuanmemo.db'],
    )?.count ?? 0;

    const result = await database.mergeExternalDatabaseIfChanged(1_700_000_200_000);

    expect(result).toMatchObject({
      ok: true,
      checked: true,
      changed: false,
      mergedCards: 0,
      mergedReviewEvents: 0,
    });
    expect(writeBinary).toHaveBeenCalledTimes(writesBeforeMerge);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['siyuan-sync:siyuanmemo.db'],
    )?.count).toBe(processedRowsBefore);
  });
});
