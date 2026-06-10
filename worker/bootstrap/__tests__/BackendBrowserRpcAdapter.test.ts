import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendBrowserAggregateIdentity,
  type BackendBrowserDocumentCountsResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS,
  type BackendBrowserAggregateReader,
  type BackendBrowserRpcDatabase,
  type BackendBrowserRpcHandlerContext,
} from '../rpc/BackendBrowserRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

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
