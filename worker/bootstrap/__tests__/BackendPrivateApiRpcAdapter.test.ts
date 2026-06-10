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
});

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
