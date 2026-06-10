import { describe, expect, it, vi } from 'vitest';
import { BACKEND_RPC_VERSION } from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS,
  BackendPrivateApiRuntime,
  type BackendPrivateApiDatabase,
  type BackendPrivateApiRpcHandlerContext,
} from '../rpc/BackendPrivateApiRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';
import { BackendKernel } from '../BackendKernel';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';
import { CardState, CardType, type FSRSCard } from '@/types/card';

describe('BackendPrivateApiRpcAdapter', () => {
  it('records private reads and audit queries through the private API runtime', async () => {
    const dispatcher = createPrivateApiDispatcher();
    const context = createPrivateApiContext();

    await expect(dispatchPrivateApi(dispatcher, context, 'private.read.cards', {
      requestId: 'private-read-1',
      method: 'private.read.cards',
      callerIntent: 'test-private-read',
      limit: 5,
    })).resolves.toMatchObject({
      result: {
        ok: true,
        data: [{ id: 'card-1' }],
        auditStatus: 'recorded',
      },
    });

    await expect(dispatchPrivateApi(dispatcher, context, 'private.audit.query', {
      requestId: 'private-audit-1',
      method: 'private.audit.query',
      callerIntent: 'test-private-audit',
      limit: 10,
    })).resolves.toMatchObject({
      result: {
        ok: true,
        auditStatus: 'recorded',
        data: expect.arrayContaining([
          expect.objectContaining({ requestId: 'private-read-1', status: 'accepted' }),
          expect.objectContaining({ requestId: 'private-read-1', status: 'completed' }),
        ]),
      },
    });
    expect(context.privateApi.auditEventCount()).toBe(2);
  });

  it('executes private source-existence mutation through browser runtime authority and replays idempotency', async () => {
    const dispatcher = createPrivateApiDispatcher();
    const context = createPrivateApiContext({ resolveExistingBlockIds: vi.fn(async () => ['block-1']) });
    const request = {
      requestId: 'private-command-1',
      method: 'private.command.execute',
      callerIntent: 'test-private-mutation',
      idempotencyKey: 'private-key-1',
      capabilityResult: authorizedPrivateCapability(),
      params: {
        operation: 'browser.sourceExistence.applySweepHost',
        request: { blockIds: ['block-1'] },
        checkedAt: 20,
      },
    };

    await expect(dispatchPrivateApi(dispatcher, context, 'private.command.execute', request)).resolves.toMatchObject({
      result: {
        ok: true,
        commandId: 'private-command-1',
        changed: { blockIds: ['block-1'] },
        result: {
          operation: 'browser.sourceExistence.applySweepHost',
          idempotencyKey: 'private-key-1',
          committed: true,
        },
      },
    });
    await expect(dispatchPrivateApi(dispatcher, context, 'private.command.execute', {
      ...request,
      requestId: 'private-command-duplicate',
    })).resolves.toMatchObject({
      result: {
        commandId: 'private-command-1',
      },
    });
    expect(context.privateApi.auditEventCount()).toBe(3);
  });

  it('keeps private command capability and operation errors explicit', async () => {
    const dispatcher = createPrivateApiDispatcher();
    const context = createPrivateApiContext();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-private',
      method: 'private.command.execute',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'private.command.execute requires named params',
      },
    });

    await expect(dispatchPrivateApi(dispatcher, context, 'private.command.execute', {
      requestId: 'private-direct-1',
      method: 'private.command.execute',
      callerIntent: 'test-private-mutation',
      idempotencyKey: 'private-direct-key',
      params: { operation: 'browser.sourceExistence.applySweepHost' },
    })).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'private.command.execute requires authorized private API capability',
      },
    });

    await expect(dispatchPrivateApi(dispatcher, context, 'private.command.execute', {
      requestId: 'private-unknown-1',
      method: 'private.command.execute',
      callerIntent: 'test-private-mutation',
      idempotencyKey: 'private-unknown-key',
      capabilityResult: authorizedPrivateCapability(),
      params: { operation: 'unknown.operation' },
    })).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'unsupported private.command.execute operation: unknown.operation',
      },
    });
  });

  it('serves private read and private command methods with audit trail', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-private-1' })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const read = await kernel.handle({
      id: 'private-read-cards',
      jsonrpc: '2.0',
      method: 'private.read.cards',
      params: [{
        requestId: 'private-read-1',
        method: 'private.read.cards',
        callerIntent: 'test-private-read',
        limit: 5,
      }],
    });
    expect('result' in read).toBe(true);
    if ('result' in read) {
      expect(read.result).toMatchObject({
        ok: true,
        auditStatus: 'recorded',
      });
    }

    const mutate = await kernel.handle({
      id: 'private-command-execute',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-mutate-1',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-key-1',
        capabilityResult: authorizedPrivateCapability(),
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 20,
        },
      }],
    });
    expect('result' in mutate).toBe(true);
    if ('result' in mutate) {
      expect(mutate.result).toMatchObject({
        ok: true,
        commandId: 'private-mutate-1',
        changed: {
          blockIds: ['block-1'],
        },
        result: {
          operation: 'browser.sourceExistence.applySweepHost',
          idempotencyKey: 'private-key-1',
          committed: true,
          sweep: {
            checked: 1,
            updated: 1,
            changed: true,
            changedToMissing: false,
          },
        },
      });
    }

    const health = await kernel.handle({
      id: 'private-health',
      jsonrpc: '2.0',
      method: 'private.health',
      params: [],
    });
    expect('result' in health).toBe(true);
    if ('result' in health) {
      expect(health.result).toMatchObject({
        ok: true,
        feature: 'private-api',
      });
    }

    const diagnostics = await kernel.handle({
      id: 'private-diagnostics-status',
      jsonrpc: '2.0',
      method: 'private.diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result).toMatchObject({
        ok: true,
      });
    }

    const audit = await kernel.handle({
      id: 'private-audit-query',
      jsonrpc: '2.0',
      method: 'private.audit.query',
      params: [{
        requestId: 'private-audit-1',
        method: 'private.audit.query',
        callerIntent: 'test-private-audit',
        limit: 10,
      }],
    });
    expect('result' in audit).toBe(true);
    if ('result' in audit) {
      expect(Array.isArray(audit.result.data)).toBe(true);
      expect(audit.result.data.length).toBeGreaterThan(0);
    }
  });

  it('rejects direct private command calls without an authorized capability result', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'private-command-direct',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-direct-1',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-direct-key',
        params: { operation: 'browser.sourceExistence.applySweepHost' },
      }],
    });

    expect(response).toEqual({
      id: 'private-command-direct',
      jsonrpc: '2.0',
      error: {
        code: 'INVALID_REQUEST',
        message: 'private.command.execute requires authorized private API capability',
      },
    });
  });

  it('replays private command result for duplicate idempotency keys', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.upsertCards([buildCard({ id: 'card-private-replay', blockId: 'block-1' })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });
    const capabilityResult = authorizedPrivateCapability();

    const first = await kernel.handle({
      id: 'private-command-first',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-first',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-same-key',
        capabilityResult,
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 20,
        },
      }],
    });
    const second = await kernel.handle({
      id: 'private-command-second',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-second',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-same-key',
        capabilityResult,
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 30,
        },
      }],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in second) {
      expect(second.result.commandId).toBe('private-first');
      expect(second.result.changed).toMatchObject({
        blockIds: ['block-1'],
      });
      expect(second.result.result).toMatchObject({
        idempotencyKey: 'private-same-key',
        committed: true,
      });
    }
  });

  it('rejects unsupported private command operations', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'private-command-unknown',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-unknown',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-unknown-key',
        capabilityResult: authorizedPrivateCapability(),
        params: { operation: 'unknown.operation' },
      }],
    });

    expect(response).toEqual({
      id: 'private-command-unknown',
      jsonrpc: '2.0',
      error: {
        code: 'INVALID_REQUEST',
        message: 'unsupported private.command.execute operation: unknown.operation',
      },
    });
  });
});

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

function createPrivateApiDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchPrivateApi(
  dispatcher: BackendRpcDispatcher<BackendPrivateApiRpcHandlerContext>,
  context: BackendPrivateApiRpcHandlerContext,
  method: typeof BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createPrivateApiContext(
  overrides: Partial<BackendPrivateApiRpcHandlerContext['privateApi']> &
    { resolveExistingBlockIds?: (blockIds: string[]) => Promise<string[]> | string[] } = {},
): BackendPrivateApiRpcHandlerContext {
  const database = createPrivateApiDatabase();
  const runtime = new BackendPrivateApiRuntime({
    database,
    browser: {
      database: {
        queryDeckPage: database.queryDeckPage,
        queryDeckMatchedIds: vi.fn(async () => []),
        getDeckRowsByIds: vi.fn(async () => []),
        queryBrowserDocumentCounts: vi.fn(),
        countCards: vi.fn(async () => 0),
        getBrowserStats: vi.fn(async () => ({ totalCards: 0, dueCards: 0 })),
        getSourceExistenceRefreshCandidates: vi.fn(async () => [{
          cardId: 'card-1',
          blockId: 'block-1',
          sourceExists: null,
          sourceCheckedAt: null,
        }]),
        updateSourceExistence: vi.fn(),
        getSourceExistenceByBlockIds: vi.fn(async () => []),
        getSourceExistenceSummary: vi.fn(async () => ({ unknown: 0, stale: 0, missing: 0 })),
        applySourceExistenceSweep: vi.fn(),
        applySourceExistenceSweepFromCandidates: vi.fn(async () => ({
          checked: 1,
          updated: 1,
          changed: true,
          changedToMissing: false,
          changedBlockIds: ['block-1'],
        })),
      },
      aggregateReader: {
        snapshot: vi.fn(),
        page: vi.fn(),
        focus: vi.fn(),
      },
      resolveExistingBlockIds: overrides.resolveExistingBlockIds ?? vi.fn(async () => ['block-1']),
    },
    now: () => 100,
  });
  return {
    privateApi: Object.assign(runtime, overrides),
  };
}

function createPrivateApiDatabase(): BackendPrivateApiDatabase {
  return {
    queryDeckPage: vi.fn(async () => ({ cards: [{ id: 'card-1' }] })),
    getStatus: vi.fn(() => ({ ingest: { queueLength: 0 } })),
  };
}

function authorizedPrivateCapability() {
  return {
    available: true,
    methodAllowed: true,
    kernelSidecarAvailable: true,
    backendWorkerAvailable: true,
    writerAvailable: true,
  };
}
