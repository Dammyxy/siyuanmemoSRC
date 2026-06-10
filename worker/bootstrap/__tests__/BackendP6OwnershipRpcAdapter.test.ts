import { describe, expect, it } from 'vitest';
import { BACKEND_RPC_VERSION } from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS,
  BackendP6OwnershipRuntime,
  type BackendP6OwnershipRpcHandlerContext,
} from '../rpc/BackendP6OwnershipRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

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
