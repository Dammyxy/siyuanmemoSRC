import { afterEach, describe, expect, it, vi } from 'vitest';
import { encode } from '@msgpack/msgpack';
import { CardState, CardType } from '@/types/card';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

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
    expect(writeJSON.mock.calls.filter(([path]) => path === 'sqlite-delta-log.v2.manifest.json').length).toBeGreaterThan(0);
    expect(writeBinary.mock.calls.filter(([path]) => path === 'sqlite-delta-log.v2.open.msgpack').length).toBeGreaterThan(0);
    await database.persist();

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 3,
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
      pendingCount: 1,
      lastCheckpoint: {
        ok: true,
        cleared: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('persists queue projection replacement as sqlite delta without writing the main database hot path', async () => {
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
    expect(writeJSON.mock.calls.some(([path]) => path === 'sqlite-delta-log.v2.manifest.json')).toBe(true);
    expect(writeBinary.mock.calls.some(([path]) => path === 'sqlite-delta-log.v2.open.msgpack')).toBe(true);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      fileName: 'sqlite-delta-log.v2.manifest.json',
      version: 2,
      pendingCount: 1,
      lastWrite: { ok: true, classification: 'delta' },
    });
  });

  it('replays sqlite deltas on restart and keeps them pending until full checkpoint succeeds', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.upsertCards([{
      id: 'projection-replay-card',
      blockId: 'projection-replay-block',
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
      meta: { content: 'projection replay card' },
    }]);
    await first.persist();
    await first.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:replay-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-replay-row',
        cardId: 'projection-replay-card',
        blockId: 'projection-replay-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-replay',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-delta-replay',
    });
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();

    expect(second.getOne<{ row_id: string }>(
      'SELECT row_id FROM queue_projection_rows WHERE queue_type = ? AND row_id = ?',
      ['retrieval-practice', 'projection-replay-row'],
    )).toEqual({ row_id: 'projection-replay-row' });
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
    await first.runTransaction('seed.queue-projection-row-for-delete', (db) => {
      db.run(
        `INSERT OR REPLACE INTO queue_projection_generations
          (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'delete-policy', 1, 'ready', null, 1_700_000_000_000, '{}'],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, membership_reason, due_at, due_bucket, priority_score,
           sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'retrieval-practice',
          'projection-delete-row',
          'projection-delete-card',
          'projection-delete-block',
          'test',
          1_700_000_000_000,
          'due',
          40,
          '0001:projection-delete',
          1,
          'delete-policy',
          1,
          '{}',
          1_700_000_000_000,
        ],
      );
    });
    await first.persist();
    const writesBeforeDelete = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await first.runTransaction('queue.projection.delete-row', (db) => {
      db.run(
        'DELETE FROM queue_projection_rows WHERE queue_type = ? AND row_id = ?',
        ['retrieval-practice', 'projection-delete-row'],
      );
    });
    first.dispose();

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeDelete);
    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();

    expect(second.getOne<{ row_id: string }>(
      'SELECT row_id FROM queue_projection_rows WHERE queue_type = ? AND row_id = ?',
      ['retrieval-practice', 'projection-delete-row'],
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

  it('uses explicit checkpoint mode when sqlite delta size threshold would overflow', async () => {
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
      pendingCount: 1,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: null,
        cause: 'queue.projection.replace',
        initiator: 'queue.projection.replace',
        projectionGeneration: 1,
        hotPath: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('fails explicitly when a delta-eligible transaction cannot write the sqlite delta log', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    let failDeltaWrite = false;
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const writeBinary = vi.fn(async (path: string, bytes: Uint8Array) => {
      if (path === 'sqlite-delta-log.v2.open.msgpack' && failDeltaWrite) {
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
    await database.upsertCards([{
      id: 'projection-delta-fail-card',
      blockId: 'projection-delta-fail-block',
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
      meta: { content: 'projection delta fail card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;
    failDeltaWrite = true;

    await expect(database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:delta-fail-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-delta-fail-row',
        cardId: 'projection-delta-fail-card',
        blockId: 'projection-delta-fail-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-delta-fail',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-delta-write-fail',
    })).rejects.toThrow('mock delta write failed');

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
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
    await first.upsertCards([{
      id: 'projection-checkpoint-fail-card',
      blockId: 'projection-checkpoint-fail-block',
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
      meta: { content: 'projection checkpoint fail card' },
    }]);
    await first.persist();
    await first.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:checkpoint-fail-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-checkpoint-fail-row',
        cardId: 'projection-checkpoint-fail-card',
        blockId: 'projection-checkpoint-fail-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-checkpoint-fail',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-checkpoint-fail',
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
