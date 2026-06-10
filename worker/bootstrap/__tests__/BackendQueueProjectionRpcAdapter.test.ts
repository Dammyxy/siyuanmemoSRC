import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendQueueProjectionReplaceResult,
  type BackendQueueProjectionRowsByIdsResult,
  type BackendQueueProjectionSnapshotResult,
  type BackendStorageProjectionRebuildResult,
} from '../../../packages/contracts/src/backend-rpc';
import { buildQueueProjectionSourceCardFingerprint } from '@/application/services/queue-projection/QueueProjectionBuilder';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../../truth/MessagePackTruthSegmentStore';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { BackendKernel } from '../BackendKernel';
import {
  BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS,
  type BackendQueueProjectionRpcDatabase,
  type BackendQueueProjectionRpcHandlerContext,
} from '../rpc/BackendQueueProjectionRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('BackendQueueProjectionRpcAdapter', () => {
  it('serves queue projection snapshot, rowsByIds, and replace through the family adapter', async () => {
    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext();

    await expect(dispatchQueueProjection(dispatcher, context, 'queue.projection.snapshot', {
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
    })).resolves.toMatchObject({
      result: {
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 2,
        status: 'ready',
      },
    });
    expect(context.queueProjection.database.queueProjectionSnapshot).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
    });

    await expect(dispatchQueueProjection(dispatcher, context, 'queue.projection.rowsByIds', {
      queueType: 'retrieval-practice',
      ids: ['card-1'],
    })).resolves.toMatchObject({
      result: {
        queueType: 'retrieval-practice',
        status: 'ready',
        cards: [{ id: 'card-1' }],
      },
    });
    expect(context.queueProjection.database.queueProjectionRowsByIds).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      ids: ['card-1'],
    });

    await expect(dispatchQueueProjection(dispatcher, context, 'queue.projection.replace', {
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 3,
      rows: [],
    })).resolves.toMatchObject({
      result: {
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        status: 'ready',
        rows: 0,
      },
    });
    expect(context.queueProjection.database.replaceQueueProjection).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 3,
      rows: [],
    });
  });

  it('keeps named-param validation explicit for queue projection methods', async () => {
    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-snapshot',
      method: 'queue.projection.snapshot',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'queue.projection.snapshot requires named params',
      },
    });
    expect(context.queueProjection.database.queueProjectionSnapshot).not.toHaveBeenCalled();
  });

  it('serves projection-backed queue snapshots and row hydration from worker projection storage', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardA = buildCard({
      id: 'projection-card-a',
      blockId: 'projection-block-a',
      due: 1_700_000_000_000,
      priority: 20,
      meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
    });
    const cardB = buildCard({
      id: 'projection-card-b',
      blockId: 'projection-block-b',
      due: 1_700_000_100_000,
      priority: 80,
      meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
    });
    await database.upsertCards([cardA, cardB]);
    await seedQueueProjection(database, {
      generation: 3,
      rows: [cardB, cardA],
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'retrieval-practice' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        status: 'ready',
        counters: {
          generation: 3,
          remaining: 2,
        },
      });
      expect(snapshot.result.rows.map((row: { fsrsCardId: string; queueIndex?: number }) => ({
        fsrsCardId: row.fsrsCardId,
        queueIndex: row.queueIndex,
      }))).toEqual([
        { fsrsCardId: 'projection-card-b', queueIndex: 1 },
        { fsrsCardId: 'projection-card-a', queueIndex: 2 },
      ]);
    }

    const rowsByIds = await kernel.handle({
      id: 'projection-rows-by-ids',
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{ queueType: 'retrieval-practice', ids: ['projection-card-a', 'projection-card-b'] }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        'projection-card-a',
        'projection-card-b',
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-card-a',
        'projection-card-b',
      ]);
    }
  });

  it('returns refreshing projection state when snapshot or row hydration cannot fully hydrate projection rows', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const activeCard = buildCard({
      id: 'projection-active-card',
      blockId: 'projection-active-block',
      due: 1_700_000_000_000,
    });
    const missingCard = buildCard({
      id: 'projection-missing-card',
      blockId: 'projection-missing-block',
      due: 1_700_000_000_000,
    });
    const unknownCard = buildCard({
      id: 'projection-unknown-card',
      blockId: 'projection-unknown-block',
      due: 1_700_000_000_000,
    });
    await database.upsertCards([activeCard, missingCard, unknownCard]);
    await database.updateSourceExistence([
      { blockId: activeCard.blockId, exists: true },
      { blockId: missingCard.blockId, exists: false },
    ], 1_700_000_100_000);
    await seedQueueProjection(database, {
      queueType: 'incremental-learning',
      generation: 9,
      rows: [activeCard, missingCard, unknownCard],
      updatedAt: 1_700_000_100_000,
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-active-source-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'incremental-learning' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 9,
        status: 'refreshing',
        rows: [],
        counters: null,
        freshness: {
          totalRows: 3,
          freshRows: 2,
          missingRows: 1,
          missingCardIds: ['projection-missing-card'],
        },
      });
    }

    const rowsByIds = await kernel.handle({
      id: 'projection-active-source-rows-by-ids',
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{
        queueType: 'incremental-learning',
        ids: ['projection-active-card', 'projection-missing-card', 'projection-unknown-card'],
      }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result).toMatchObject({
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 9,
        status: 'refreshing',
        rows: [],
        cards: [],
        freshness: {
          totalRows: 3,
          freshRows: 2,
          missingRows: 1,
          missingCardIds: ['projection-missing-card'],
        },
      });
    }
  });

  it('invalidates projection generations when source existence changes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-invalidated-card',
      blockId: 'projection-invalidated-block',
      due: 1_700_000_000_000,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'final-drill',
      generation: 3,
      rows: [card],
      updatedAt: 1_700_000_100_000,
    });
    await database.updateSourceExistence([
      { blockId: card.blockId, exists: false },
    ], 1_700_000_200_000);
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-invalidated-source-change',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'final-drill' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'final-drill',
        status: 'refreshing',
        rows: [],
      });
    }
  });

  it('replaces missing queue projection generation through explicit backend materialization', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-rebuild-card',
      blockId: 'projection-rebuild-block',
      due: 1_700_000_000_000,
      priority: 42,
      meta: { content: 'projection rebuild', rootId: 'doc-rebuild', deckId: 'deck-rebuild' },
    });
    await database.upsertCards([card]);
    const kernel = new BackendKernel({ database });

    const before = await kernel.handle({
      id: 'projection-replace-before',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'leech' }],
    });
    expect('result' in before).toBe(true);
    if ('result' in before) {
      expect(before.result).toMatchObject({
        queueType: 'leech',
        status: 'refreshing',
        generation: null,
      });
    }

    const replace = await kernel.handle({
      id: 'projection-replace',
      jsonrpc: '2.0',
      method: 'queue.projection.replace' as never,
      params: [{
        queueType: 'leech',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        rows: [{
          queueType: 'leech',
          rowId: card.id,
          cardId: card.id,
          blockId: card.blockId,
          deckId: 'deck-rebuild',
          membershipReason: 'materialized-strategy',
          dueAt: card.due,
          dueBucket: 'overdue',
          priorityScore: card.priority,
          sortKey: `000000001:${card.id}`,
          queueIndexHint: 1,
          policyHash: 'materialized-leech-v1',
          sourceGeneration: 1,
          payload: { queueKind: 'leech', source: 'application-materialized' },
          updatedAt: 1_700_000_100_000,
        }],
        reason: 'snapshot-refresh',
      }],
    });
    expect('result' in replace).toBe(true);
    if ('result' in replace) {
      expect(replace.result).toMatchObject({
        queueType: 'leech',
        status: 'ready',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        rows: 1,
        counters: {
          remaining: 1,
          total: 1,
        },
      });
    }

    const after = await kernel.handle({
      id: 'projection-replace-after',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'leech' }],
    });
    expect('result' in after).toBe(true);
    if ('result' in after) {
      expect(after.result).toMatchObject({
        queueType: 'leech',
        status: 'ready',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        counters: {
          remaining: 1,
          total: 1,
        },
      });
      expect(after.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-rebuild-card',
      ]);
    }
  });

  it('reports refreshing when source-card fingerprint is stale after synced review state changes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedCard = buildCard({
      id: 'projection-reviewed-card',
      blockId: 'projection-reviewed-block',
      state: 1,
      due: 1_700_000_000_000,
      lastReview: 1_699_999_900_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection stale membership', rootId: 'doc-projection' },
    });
    await database.upsertCards([reviewedCard]);
    const kernel = new BackendKernel({ database });

    const replace = await kernel.handle({
      id: 'projection-stale-replace',
      jsonrpc: '2.0',
      method: 'queue.projection.replace' as never,
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'incremental-learning:materialized:v1',
        generation: 1,
        rows: [{
          queueType: 'incremental-learning',
          rowId: reviewedCard.id,
          cardId: reviewedCard.id,
          blockId: reviewedCard.blockId,
          deckId: null,
          membershipReason: 'rotation',
          dueAt: reviewedCard.due,
          dueBucket: 'overdue',
          priorityScore: reviewedCard.priority,
          sortKey: `000000001:${reviewedCard.id}`,
          queueIndexHint: 1,
          policyHash: 'incremental-learning:materialized:v1',
          sourceGeneration: 1,
          payload: { queueKind: 'incremental-learning', state: 1, source: 'application-materialized' },
          updatedAt: 1_700_000_000_100,
        }],
        reason: 'snapshot-refresh',
      }],
    });
    expect('result' in replace).toBe(true);

    await database.upsertCards([{
      ...reviewedCard,
      state: 2,
      due: 1_700_172_800_000,
      lastReview: 1_700_000_200_000,
      updatedAt: 1_700_000_200_000,
    }]);

    const snapshot = await kernel.handle({
      id: 'projection-stale-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'incremental-learning' }],
    });
    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        status: 'refreshing',
        counters: null,
        freshness: {
          totalRows: 1,
          freshRows: 0,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['projection-reviewed-card'],
        },
      });
      expect(snapshot.result.rows).toEqual([]);
    }
  });

  it('reports refreshing when source-card priority changes without projection rematerialization', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-priority-card',
      blockId: 'projection-priority-block',
      priority: 20,
      due: 1_700_000_000_000,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'retrieval-practice',
      generation: 11,
      rows: [card],
      updatedAt: 1_700_000_100_000,
    });
    await database.upsertCards([{ ...card, priority: 90, updatedAt: 1_700_000_200_000 }]);
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-stale-priority-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'retrieval-practice' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 11,
        status: 'refreshing',
        rows: [],
        counters: null,
        freshness: {
          totalRows: 1,
          freshRows: 0,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['projection-priority-card'],
        },
      });
    }
  });

  it.each([
    'filter-group',
    'final-drill',
    'leech',
    'neural-roam',
  ])('serves deferred queue projection snapshots and row hydration from worker storage for %s', async (queueType) => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardA = buildCard({
      id: `${queueType}-projection-card-a`,
      blockId: `${queueType}-projection-block-a`,
      due: 1_700_000_000_000,
      priority: 20,
      meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
    });
    const cardB = buildCard({
      id: `${queueType}-projection-card-b`,
      blockId: `${queueType}-projection-block-b`,
      due: 1_700_000_100_000,
      priority: 80,
      meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
    });
    await database.upsertCards([cardA, cardB]);
    await seedQueueProjection(database, {
      queueType,
      generation: 7,
      rows: [cardB, cardA],
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: `${queueType}-projection-snapshot`,
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType,
        policyHash: 'policy-a',
        generation: 7,
        status: 'ready',
        counters: {
          generation: 7,
          remaining: 2,
        },
      });
      expect(snapshot.result.rows.map((row: { fsrsCardId: string; queueIndex?: number }) => ({
        fsrsCardId: row.fsrsCardId,
        queueIndex: row.queueIndex,
      }))).toEqual([
        { fsrsCardId: `${queueType}-projection-card-b`, queueIndex: 1 },
        { fsrsCardId: `${queueType}-projection-card-a`, queueIndex: 2 },
      ]);
    }

    const rowsByIds = await kernel.handle({
      id: `${queueType}-projection-rows-by-ids`,
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{
        queueType,
        ids: [`${queueType}-projection-card-a`, `${queueType}-projection-card-b`],
      }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        `${queueType}-projection-card-a`,
        `${queueType}-projection-card-b`,
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        `${queueType}-projection-card-a`,
        `${queueType}-projection-card-b`,
      ]);
    }
  });

  it('preserves explicit storage projection rebuild unavailable behavior when truth store is absent', async () => {
    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext({ truthFileStore: undefined });

    await expect(dispatchQueueProjection(dispatcher, context, 'storage.projection.rebuild', {
      rebuildId: 'rebuild-no-truth-store',
      cause: 'sql-missing',
      families: ['cards'],
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: storage.projection.rebuild requires truth segment file store',
      },
    });
    expect(context.queueProjection.database.rebuildSqlProjections).not.toHaveBeenCalled();
  });

  it('replays truth records, reads source blocks, and delegates storage projection rebuild to worker database authority', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    await createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    }).appendRecords([{
      family: 'card-memory-facts',
      schemaVersion: 1,
      type: 'card-memory.created.v1',
      idempotencyKey: 'card:create:card-1',
      logicalTime: 10,
      recordedAt: 10,
      source: { cardId: 'card-1', blockId: 'block-1' },
      memory: { schedulerOwner: 'fsrs-v6', memoryHash: 'memory-1' },
    }]);

    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext({
      truthFileStore: fileStore,
      resolveNeuralGraphQuery: vi.fn(async (request) => ({
        status: 'found',
        blockId: request.blockId,
        data: { markdown: 'source block' },
        error: null,
      })),
    });

    await expect(dispatchQueueProjection(dispatcher, context, 'storage.projection.rebuild', {
      rebuildId: 'rebuild-cards',
      cause: 'sql-deleted',
      families: ['cards'],
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
    })).resolves.toMatchObject({
      result: {
        status: 'ready',
        rebuildId: 'rebuild-cards',
        rowsRead: 1,
        sourceReadCount: 1,
      },
    });

    expect(context.queueProjection.resolveNeuralGraphQuery).toHaveBeenCalledWith({
      operation: 'fetchBlockData',
      blockId: 'block-1',
    });
    expect(context.queueProjection.database.rebuildSqlProjections).toHaveBeenCalledWith(
      expect.objectContaining({
        rebuildId: 'rebuild-cards',
        cause: 'sql-deleted',
        families: ['cards'],
        deviceId: 'device-A',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
        truthRecords: [expect.objectContaining({
          family: 'card-memory-facts',
          idempotencyKey: 'card:create:card-1',
        })],
        sourceReads: [{
          blockId: 'block-1',
          status: 'found',
          found: true,
          data: { markdown: 'source block' },
          error: null,
        }],
      }),
    );
  });
});

function createQueueProjectionDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchQueueProjection(
  dispatcher: BackendRpcDispatcher<BackendQueueProjectionRpcHandlerContext>,
  context: BackendQueueProjectionRpcHandlerContext,
  method: typeof BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

async function seedQueueProjection(database: WorkerSqliteDatabaseService, input: {
  queueType?: string;
  policyHash?: string;
  generation?: number;
  rows: FSRSCard[];
  updatedAt?: number;
}): Promise<void> {
  const queueType = input.queueType ?? 'retrieval-practice';
  const policyHash = input.policyHash ?? 'policy-a';
  const generation = input.generation ?? 1;
  const updatedAt = input.updatedAt ?? 1_700_000_100_000;
  await database.runTransaction('seed.queue-projection', (db) => {
    db.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [queueType, policyHash, generation, 'ready', null, updatedAt, '{}'],
    );
    db.run(
      `INSERT OR REPLACE INTO queue_projection_counters
        (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        queueType,
        policyHash,
        generation,
        generation,
        input.rows.length,
        input.rows.length,
        input.rows.length,
        JSON.stringify({
          all: input.rows.length,
          item: input.rows.filter((card) => card.type === CardType.Item).length,
          descriptor: input.rows.filter((card) => card.type === CardType.Descriptor).length,
          topic: input.rows.filter((card) => card.type === CardType.Topic).length,
          concept: input.rows.filter((card) => card.type === CardType.Concept).length,
        }),
        updatedAt,
      ],
    );
    for (const [index, card] of input.rows.entries()) {
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
           priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queueType,
          card.id,
          card.id,
          card.blockId,
          null,
          'review-due',
          card.due,
          card.due <= updatedAt ? 'overdue' : 'due',
          card.priority ?? 50,
          `${String(index + 1).padStart(9, '0')}:${card.id}`,
          index + 1,
          policyHash,
          generation,
          JSON.stringify({
            cardType: card.type,
            rowId: card.id,
            state: card.state,
            due: card.due,
            priority: card.priority,
            sourceCardFingerprint: buildQueueProjectionSourceCardFingerprint(card),
          }),
          updatedAt,
        ],
      );
    }
  });
}

function createQueueProjectionContext(
  overrides: Partial<BackendQueueProjectionRpcHandlerContext['queueProjection']> = {},
): BackendQueueProjectionRpcHandlerContext {
  return {
    queueProjection: {
      database: createQueueProjectionDatabase(),
      truthFileStore: new MemoryTruthSegmentFileStore(),
      ...overrides,
    },
  };
}

function createQueueProjectionDatabase(): BackendQueueProjectionRpcDatabase {
  return {
    queueProjectionSnapshot: vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
      status: 'ready',
      rows: [],
      counters: null,
      freshness: null,
      cacheState: 'ready-empty',
    } satisfies BackendQueueProjectionSnapshotResult)),
    queueProjectionRowsByIds: vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
      status: 'ready',
      rows: [],
      cards: [{ id: 'card-1' }],
      freshness: null,
      cacheState: 'ready-populated',
    } satisfies BackendQueueProjectionRowsByIdsResult)),
    replaceQueueProjection: vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 3,
      status: 'ready',
      rows: 0,
      counters: {
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        version: 1,
        remaining: 0,
        due: 0,
        total: 0,
        buckets: {},
        updatedAt: 100,
      },
    } satisfies BackendQueueProjectionReplaceResult)),
    rebuildSqlProjections: vi.fn(async (request) => ({
      status: 'ready',
      at: 100,
      rebuildId: String(request.rebuildId || 'rebuild'),
      cause: String(request.cause || 'manual'),
      projectionGeneration: 1,
      rowsRead: request.truthRecords.length,
      rowsWritten: request.truthRecords.length,
      sourceReadCount: request.sourceReads.length,
      missingSourceIds: [],
      families: request.families.map((family) => ({
        family,
        status: 'ready',
        unavailableReason: null,
        projectionGeneration: 1,
        rowsRead: request.truthRecords.length,
        rowsWritten: request.truthRecords.length,
        sourceReadCount: request.sourceReads.length,
        missingSourceIds: [],
        error: null,
      })),
      error: null,
    } satisfies BackendStorageProjectionRebuildResult)),
  };
}

class MemoryTruthSegmentFileStore implements MessagePackTruthSegmentFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [
      ...Array.from(this.jsonFiles.keys()),
      ...Array.from(this.binaryFiles.keys()),
    ].filter((path) => path.startsWith(prefix));
  }
}
