import { describe, expect, it } from 'vitest';
import { BACKEND_RPC_VERSION } from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS,
  BackendP6OwnershipRuntime,
  type BackendP6OwnershipRpcHandlerContext,
} from '../rpc/BackendP6OwnershipRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';
import { BackendKernel } from '../BackendKernel';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';

describe('BackendP6OwnershipRpcAdapter', () => {
  it('answers P6 ownership query and command through the ownership runtime', async () => {
    const dispatcher = createP6Dispatcher();
    const context = createP6Context();

    await expect(dispatchP6(dispatcher, context, 'p6.ownership.query', {
      requestId: 'p6-query-1',
      surface: 'dialog-manager',
      operation: 'read-block-meta',
      payload: { blockId: 'block-1' },
    })).resolves.toMatchObject({
      result: {
        ok: true,
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        owner: 'compatibility-read',
        status: 'completed',
      },
    });

    await expect(dispatchP6(dispatcher, context, 'p6.ownership.command', {
      requestId: 'p6-command-1',
      surface: 'autocard-scanner',
      operation: 'execute-side-effect',
      idempotencyKey: 'p6-command-key',
      payload: { blockId: 'block-1' },
    })).resolves.toMatchObject({
      result: {
        ok: true,
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        owner: 'writer-relay',
        status: 'completed',
      },
    });
  });

  it('keeps invalid P6 ownership params explicit', async () => {
    const dispatcher = createP6Dispatcher();
    const context = createP6Context();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-p6',
      method: 'p6.ownership.query',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'p6.ownership.query requires named params',
      },
    });

    await expect(dispatchP6(dispatcher, context, 'p6.ownership.query', {
      surface: 'dialog-manager',
      operation: 'execute-side-effect',
    })).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'p6.ownership.query unsupported operation: execute-side-effect',
      },
    });
  });

  it('answers P6 ownership query and command contracts instead of METHOD_NOT_FOUND', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const query = await kernel.handle({
      id: 'p6-query',
      jsonrpc: '2.0',
      method: 'p6.ownership.query',
      params: [{
        requestId: 'p6-query-1',
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        payload: { blockId: 'block-1' },
      }],
    });
    const command = await kernel.handle({
      id: 'p6-command',
      jsonrpc: '2.0',
      method: 'p6.ownership.command',
      params: [{
        requestId: 'p6-command-1',
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        idempotencyKey: 'p6-command-key',
        payload: { blockId: 'block-1' },
      }],
    });

    expect('result' in query).toBe(true);
    if ('result' in query) {
      expect(query.result).toMatchObject({
        ok: true,
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        owner: 'compatibility-read',
        status: 'completed',
        unavailableClass: null,
      });
      expect(query.result.diagnosticEventId).toContain('p6-ownership:dialog-manager:read-block-meta');
    }
    expect('result' in command).toBe(true);
    if ('result' in command) {
      expect(command.result).toMatchObject({
        ok: true,
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        owner: 'writer-relay',
        status: 'completed',
        unavailableClass: null,
      });
      expect(command.result.diagnosticEventId).toContain('p6-ownership:autocard-scanner:execute-side-effect');
    }
  });
});

function createP6Dispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchP6(
  dispatcher: BackendRpcDispatcher<BackendP6OwnershipRpcHandlerContext>,
  context: BackendP6OwnershipRpcHandlerContext,
  method: typeof BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createP6Context(): BackendP6OwnershipRpcHandlerContext {
  return {
    p6Ownership: new BackendP6OwnershipRuntime(),
  };
}
