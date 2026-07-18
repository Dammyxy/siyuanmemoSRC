import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendBrowserAggregateIdentity,
  type BackendBrowserDocumentCountsResult,
} from '../../../packages/contracts/src/backend-rpc';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { BackendKernel } from '../BackendKernel';
import {
  beginBackendWorkerTiming,
  endBackendWorkerRequest,
} from '../ReviewFeedbackTimingScope';
import {
  BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS,
  type BackendBrowserAggregateReader,
  type BackendBrowserRpcDatabase,
  type BackendBrowserRpcHandlerContext,
} from '../rpc/BackendBrowserRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';

describe('BackendBrowserRpcAdapter', () => {
  it('serves deck, stats, and source-existence methods through the browser family adapter', async () => {
    const context = createBrowserContext();
    const dispatcher = createBrowserDispatcher();

    await expect(dispatchBrowser(dispatcher, context, 'browser.deck.page', {
      query: { preset: 'all' },
      page: { startRow: 0, endRow: 20 },
    })).resolves.toMatchObject({
      result: { total: 2, cards: [{ id: 'card-1' }], generation: 7 },
    });
    expect(context.browser.database.queryDeckPage).toHaveBeenCalledWith(
      { preset: 'all' },
      { startRow: 0, endRow: 20 },
    );

    await expect(dispatchBrowser(dispatcher, context, 'browser.deck.matchedIds', {
      query: { preset: 'review' },
    })).resolves.toMatchObject({
      result: { ids: ['card-1'] },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.deck.rowsByIds', {
      ids: ['card-1'],
    })).resolves.toMatchObject({
      result: { cards: [{ id: 'card-1' }] },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.deck.documentCounts', {
      scope: { kind: 'deck', docId: 'doc-1' },
    })).resolves.toMatchObject({
      result: { status: 'ready', rows: [{ rootId: 'doc-1', count: 1 }] },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.count', {
      query: { ids: ['card-1'] },
    })).resolves.toMatchObject({
      result: { count: 1 },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.stats', {
      now: 123,
    })).resolves.toMatchObject({
      result: { totalCards: 2, dueCards: 1 },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.sourceExistence.refreshCandidates', {
      request: { blockIds: ['block-1'] },
    })).resolves.toMatchObject({
      result: {
        candidates: [{
          cardId: 'card-1',
          blockId: 'block-1',
          sourceExists: null,
          sourceCheckedAt: null,
        }],
      },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.sourceExistence.update', {
      updates: [{ cardId: 'card-1', blockId: 'block-1', exists: true }],
      checkedAt: 456,
    })).resolves.toMatchObject({
      result: { updated: 1 },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.sourceExistence.byBlockIds', {
      blockIds: ['block-1'],
    })).resolves.toMatchObject({
      result: { statusByBlockId: [{ blockId: 'block-1', exists: true }] },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.sourceExistence.summary', {
      staleBefore: 999,
    })).resolves.toMatchObject({
      result: { unknown: 0, stale: 1, missing: 0 },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.sourceExistence.applySweep', {
      request: { blockIds: ['block-1'] },
      existingBlockIds: ['block-1'],
      checkedAt: 789,
    })).resolves.toMatchObject({
      result: { checked: 1, updated: 1, changed: true, changedToMissing: false, changedBlockIds: ['block-1'] },
    });
  });

  it('serves browser repository methods through the kernel dispatcher', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const deckPageResponse = await kernel.handle({
      id: 'deck-page',
      jsonrpc: '2.0',
      method: 'browser.deck.page',
      params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }],
    });
    expect(deckPageResponse).toEqual({
      id: 'deck-page',
      jsonrpc: '2.0',
      result: {
        total: 0,
        cards: [],
        generation: null,
      },
    });

    const matchedIdsResponse = await kernel.handle({
      id: 'deck-ids',
      jsonrpc: '2.0',
      method: 'browser.deck.matchedIds',
      params: [{ query: { preset: 'review' } }],
    });
    expect(matchedIdsResponse).toEqual({
      id: 'deck-ids',
      jsonrpc: '2.0',
      result: { ids: [] },
    });

    const rowsByIdsResponse = await kernel.handle({
      id: 'deck-rows',
      jsonrpc: '2.0',
      method: 'browser.deck.rowsByIds',
      params: [{ ids: ['card-1'] }],
    });
    expect(rowsByIdsResponse).toEqual({
      id: 'deck-rows',
      jsonrpc: '2.0',
      result: { cards: [] },
    });

    const statsResponse = await kernel.handle({
      id: 'stats',
      jsonrpc: '2.0',
      method: 'browser.stats',
      params: [],
    });
    expect(statsResponse).toEqual({
      id: 'stats',
      jsonrpc: '2.0',
      result: {
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        suspendedCards: 0,
        lostCards: 0,
      },
    });

    const sourceSummaryResponse = await kernel.handle({
      id: 'source-summary',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.summary',
      params: [],
    });
    expect(sourceSummaryResponse).toEqual({
      id: 'source-summary',
      jsonrpc: '2.0',
      result: {
        unknown: 0,
        stale: 0,
        missing: 0,
      },
    });

    const sourceSweepResponse = await kernel.handle({
      id: 'source-sweep',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweep',
      params: [{ request: { blockIds: ['block-1'] }, existingBlockIds: ['block-1'] }],
    });
    expect(sourceSweepResponse).toEqual({
      id: 'source-sweep',
      jsonrpc: '2.0',
      result: {
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      },
    });

    const sourceSweepHostResponse = await kernel.handle({
      id: 'source-sweep-host',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweepHost',
      params: [{ request: { blockIds: ['block-1'] } }],
    });
    expect(sourceSweepHostResponse).toEqual({
      id: 'source-sweep-host',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker host source-existence resolver is unavailable',
      },
    });
  });

  it('records diagnostic inner steps for browser deck page reads', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([
      buildCard({
        id: 'diagnostic-browser-card',
        blockId: 'diagnostic-browser-block',
        due: 1_700_000_100_000,
        meta: { content: 'diagnostic Browser card', rootId: 'doc-diagnostic', deckId: 'deck-diagnostic' },
      }),
    ]);
    const kernel = new BackendKernel({ database });
    const timing = beginBackendWorkerTiming('browser.deck.page');

    try {
      const response = await kernel.handle({
        id: 'browser-diagnostic-page',
        jsonrpc: '2.0',
        method: 'browser.deck.page',
        params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }],
      });

      expect('result' in response).toBe(true);
      if ('result' in response) {
        expect(response.result.total).toBe(1);
      }
      expect(timing.innerSteps.map((step) => `${step.layer}:${step.step}`)).toEqual(expect.arrayContaining([
        'kernel:pre-request-merge',
        'database:queryDeckPage.init',
        'database:queryDeckPage.count',
        'database:queryDeckPage.select',
        'database:queryDeckPage.total',
      ]));
      expect(timing.innerSteps.find((step) => step.step === 'queryDeckPage.select')?.extra).toMatchObject({
        startRow: 0,
        limit: 1,
        total: 1,
      });
      expect(timing.innerSteps.find((step) => step.step === 'queryDeckPage.parse')).toBeUndefined();
      expect(timing.innerSteps.find((step) => step.step === 'pre-request-merge')?.extra).toMatchObject({
        mainDbReadSkipped: true,
        mainDbReadSkipReason: 'sqlite-conflict-copies-non-authoritative',
        nonEmptyConflictSourceCount: 0,
      });
    } finally {
      endBackendWorkerRequest(timing);
    }
  });

  it('does not merge or persist stale main DB bytes during browser deck read preflight', async () => {
    const cardId = 'card-browser-read-external-main-db';
    const blockId = 'block-browser-read-external-main-db';
    const staleBridge = createInMemorySqlitePersistenceBridge();
    const staleDatabase = new WorkerSqliteDatabaseService(staleBridge);
    await staleDatabase.upsertCards([buildCard({
      id: cardId,
      blockId,
      due: 1_779_188_006_000,
      updatedAt: 1_779_188_006_000,
    })]);
    await staleDatabase.persist();
    const stalePersistedBytes = await staleBridge.readBinary('siyuanmemo.db');
    expect(stalePersistedBytes).toBeTruthy();

    const emptyBridge = createInMemorySqlitePersistenceBridge();
    const emptyDatabase = new WorkerSqliteDatabaseService(emptyBridge);
    await emptyDatabase.load();
    await emptyDatabase.persist();
    const emptyPersistedBytes = await emptyBridge.readBinary('siyuanmemo.db');
    expect(emptyPersistedBytes).toBeTruthy();

    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    await persistenceBridge.writeBinary('siyuanmemo.db', emptyPersistedBytes!);
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      writeBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    await expect(database.getCard(cardId)).resolves.toBeUndefined();
    await persistenceBridge.writeBinary('siyuanmemo.db', stalePersistedBytes!);
    const mainDbReadsBeforeBrowser = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const mainDbWritesBeforeBrowser = writeBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const page = await kernel.handle({
      id: 'browser-deck-read-does-not-self-merge-main-db',
      jsonrpc: '2.0',
      method: 'browser.deck.page',
      params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 20 } }],
    });

    expect('result' in page).toBe(true);
    expect(page).toMatchObject({
      result: {
        total: 0,
        cards: [],
      },
    });
    expect(await database.getCard(cardId)).toBeUndefined();
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['siyuan-sync:siyuanmemo.db'],
    )?.count).toBe(0);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsBeforeBrowser);
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbWritesBeforeBrowser);
  });

  it('does not merge or persist stale main DB bytes during unchanged source-existence sweep', async () => {
    const cardId = 'card-browser-source-existence-noop';
    const blockId = 'block-browser-source-existence-noop';
    const staleBridge = createInMemorySqlitePersistenceBridge();
    const staleDatabase = new WorkerSqliteDatabaseService(staleBridge);
    await staleDatabase.upsertCards([buildCard({
      id: 'card-browser-source-existence-stale-main',
      blockId: 'block-browser-source-existence-stale-main',
      due: 1_779_188_016_000,
      updatedAt: 1_779_188_016_000,
    })]);
    await staleDatabase.persist();
    const stalePersistedBytes = await staleBridge.readBinary('siyuanmemo.db');
    expect(stalePersistedBytes).toBeTruthy();

    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    await currentDatabase.upsertCards([buildCard({
      id: cardId,
      blockId,
      due: 1_779_188_015_000,
      updatedAt: 1_779_188_015_000,
    })]);
    await currentDatabase.updateSourceExistence([
      { cardId, blockId, exists: true },
    ], 1_779_188_015_100);
    await currentDatabase.persist();
    const currentPersistedBytes = await currentBridge.readBinary('siyuanmemo.db');
    expect(currentPersistedBytes).toBeTruthy();

    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    await persistenceBridge.writeBinary('siyuanmemo.db', currentPersistedBytes!);
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      writeBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    await persistenceBridge.writeBinary('siyuanmemo.db', stalePersistedBytes!);
    const mainDbReadsBeforeSweep = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const mainDbWritesBeforeSweep = writeBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const sweep = await kernel.handle({
      id: 'browser-source-existence-noop-does-not-self-merge-main-db',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweepHost',
      params: [{ request: { blockIds: [blockId], force: true }, checkedAt: 1_779_188_015_200 }],
    });

    expect(sweep).toEqual({
      id: 'browser-source-existence-noop-does-not-self-merge-main-db',
      jsonrpc: '2.0',
      result: {
        checked: 1,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      },
    });
    expect(await database.getCard('card-browser-source-existence-stale-main')).toBeUndefined();
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['siyuan-sync:siyuanmemo.db'],
    )?.count).toBe(0);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsBeforeSweep);
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbWritesBeforeSweep);
  });

  it('uses the host source-existence resolver explicitly and preserves unavailable errors', async () => {
    const dispatcher = createBrowserDispatcher();
    const unavailableContext = createBrowserContext();

    await expect(dispatchBrowser(
      dispatcher,
      unavailableContext,
      'browser.sourceExistence.applySweepHost',
      { request: { blockIds: ['block-1'] } },
    )).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker host source-existence resolver is unavailable',
      },
    });

    const context = createBrowserContext({
      resolveExistingBlockIds: vi.fn(async () => ['block-1']),
    });
    await expect(dispatchBrowser(
      dispatcher,
      context,
      'browser.sourceExistence.applySweepHost',
      { request: { blockIds: ['block-1'] }, checkedAt: 789 },
    )).resolves.toMatchObject({
      result: { checked: 1, updated: 1, changed: true, changedToMissing: false, changedBlockIds: ['block-1'] },
    });
    expect(context.browser.resolveExistingBlockIds).toHaveBeenCalledWith(['block-1']);
    expect(context.browser.database.applySourceExistenceSweepFromCandidates).toHaveBeenCalledWith(
      [{
        cardId: 'card-1',
        blockId: 'block-1',
        sourceExists: null,
        sourceCheckedAt: null,
      }],
      ['block-1'],
      789,
    );
  });

  it('delegates aggregate methods to the browser aggregate reader and keeps named-param errors centralized', async () => {
    const dispatcher = createBrowserDispatcher();
    const context = createBrowserContext();
    const identity = createAggregateIdentity();

    await expect(dispatchBrowser(dispatcher, context, 'browser.aggregate.snapshot', {
      requestId: 'snapshot-1',
      datasourceId: 'datasource-1',
    })).resolves.toMatchObject({
      result: { status: 'ready', identity, totalCount: 1, pageSize: 20 },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.aggregate.page', {
      requestId: 'page-1',
      identity,
      limit: 20,
    })).resolves.toMatchObject({
      result: { status: 'ready', identity, rows: [{ id: 'card-1' }], nextCursor: null, totalCount: 1 },
    });
    await expect(dispatchBrowser(dispatcher, context, 'browser.aggregate.focus', {
      requestId: 'focus-1',
      identity,
      focus: { type: 'card', cardId: 'card-1' },
    })).resolves.toMatchObject({
      result: { status: 'ready', identity, focusFound: true, rows: [{ id: 'card-1' }] },
    });

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-aggregate',
      method: 'browser.aggregate.snapshot',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'browser.aggregate.snapshot requires named params',
      },
    });
  });
});

function createBrowserDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchBrowser(
  dispatcher: BackendRpcDispatcher<BackendBrowserRpcHandlerContext>,
  context: BackendBrowserRpcHandlerContext,
  method: typeof BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS[number]['method'],
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

function createBrowserContext(overrides: Partial<BackendBrowserRpcHandlerContext['browser']> = {}): BackendBrowserRpcHandlerContext {
  return {
    browser: {
      database: createBrowserDatabase(),
      aggregateReader: createAggregateReader(),
      ...overrides,
    },
  };
}

function createBrowserDatabase(): BackendBrowserRpcDatabase {
  const documentCounts: BackendBrowserDocumentCountsResult = {
    status: 'ready',
    owner: 'sql-card-universe',
    scope: { kind: 'deck', docId: 'doc-1' },
    rows: [{ rootId: 'doc-1', count: 1 }],
    diagnostics: { countOnly: true, rowsHydratedForHierarchy: 0 },
  };
  const candidates = [{
    cardId: 'card-1',
    blockId: 'block-1',
    sourceExists: null,
    sourceCheckedAt: null,
  }];
  return {
    queryDeckPage: vi.fn(async () => ({ total: 2, cards: [{ id: 'card-1' }], generation: 7 })),
    queryDeckMatchedIds: vi.fn(async () => ['card-1']),
    getDeckRowsByIds: vi.fn(async () => [{ id: 'card-1' }]),
    queryBrowserDocumentCounts: vi.fn(async () => documentCounts),
    countCards: vi.fn(async () => 1),
    getBrowserStats: vi.fn(async () => ({ totalCards: 2, dueCards: 1 })),
    getSourceExistenceRefreshCandidates: vi.fn(async () => candidates),
    updateSourceExistence: vi.fn(async () => undefined),
    getSourceExistenceByBlockIds: vi.fn(async () => [{ blockId: 'block-1', exists: true }]),
    getSourceExistenceSummary: vi.fn(async () => ({ unknown: 0, stale: 1, missing: 0 })),
    applySourceExistenceSweep: vi.fn(async () => ({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
      changedBlockIds: ['block-1'],
    })),
    applySourceExistenceSweepFromCandidates: vi.fn(async () => ({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
      changedBlockIds: ['block-1'],
    })),
  };
}

function createAggregateReader(): BackendBrowserAggregateReader {
  const identity = createAggregateIdentity();
  return {
    snapshot: vi.fn(async () => ({
      status: 'ready',
      identity,
      totalCount: 1,
      pageSize: 20,
    })),
    page: vi.fn(async () => ({
      status: 'ready',
      identity,
      rows: [{ id: 'card-1' }],
      nextCursor: null,
      totalCount: 1,
    })),
    focus: vi.fn(async () => ({
      status: 'ready',
      identity,
      focusFound: true,
      rows: [{ id: 'card-1' }],
    })),
  };
}

function createAggregateIdentity(): BackendBrowserAggregateIdentity {
  return {
    snapshotId: 'snapshot-1',
    generation: 1,
    datasourceId: 'datasource-1',
    policyHash: 'policy-1',
    queryFingerprint: 'fingerprint-1',
  };
}
