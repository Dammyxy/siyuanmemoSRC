import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendKernelTransactionAction,
  type BackendKernelTransactionDequeueResult,
  type BackendKernelTransactionIngestResult,
  type BackendKernelTransactionRequeueResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS,
  type BackendKernelTransactionRpcHandlerContext,
} from '../rpc/BackendKernelTransactionRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('BackendKernelTransactionRpcAdapter', () => {
  it('delegates ingest, dequeue, and requeue to the worker database inbox/action queue authority', async () => {
    const dispatcher = createKernelTransactionDispatcher();
    const context = createKernelTransactionContext();
    const action = createRemoveAction();

    await expect(dispatchKernelTransaction(dispatcher, context, 'kernel.transaction.ingest', {
      source: 'ws-main',
      transactions: [{ id: 'tx-1' }],
      receivedAt: 10,
      idempotencyKey: 'tx-1',
    })).resolves.toMatchObject({
      result: {
        accepted: 1,
        queued: 1,
        duplicate: false,
      },
    });
    expect(context.kernelTransaction.ingestKernelTransactions).toHaveBeenCalledWith({
      source: 'ws-main',
      transactions: [{ id: 'tx-1' }],
      receivedAt: 10,
      idempotencyKey: 'tx-1',
    });

    await expect(dispatchKernelTransaction(dispatcher, context, 'kernel.transaction.dequeue', {
      maxActions: 8,
    })).resolves.toMatchObject({
      result: {
        actions: [action],
        remaining: 0,
      },
    });
    expect(context.kernelTransaction.dequeueKernelTransactionActions).toHaveBeenCalledWith(8);

    await expect(dispatchKernelTransaction(dispatcher, context, 'kernel.transaction.requeue', {
      actions: [action],
    })).resolves.toMatchObject({
      result: {
        requeued: 1,
        queueLength: 1,
      },
    });
    expect(context.kernelTransaction.requeueKernelTransactionActions).toHaveBeenCalledWith([action]);
  });

  it('preserves legacy params defaulting at the family adapter', async () => {
    const dispatcher = createKernelTransactionDispatcher();
    const context = createKernelTransactionContext();

    await dispatchRaw(dispatcher, context, 'kernel.transaction.ingest', []);
    await dispatchRaw(dispatcher, context, 'kernel.transaction.dequeue', undefined);
    await dispatchRaw(dispatcher, context, 'kernel.transaction.requeue', ['not-named']);

    expect(context.kernelTransaction.ingestKernelTransactions).toHaveBeenCalledWith({});
    expect(context.kernelTransaction.dequeueKernelTransactionActions).toHaveBeenCalledWith(16);
    expect(context.kernelTransaction.requeueKernelTransactionActions).toHaveBeenCalledWith([]);
  });

  it('returns explicit backend unavailable when the worker inbox/action queue authority rejects a request', async () => {
    const dispatcher = createKernelTransactionDispatcher();
    const context = createKernelTransactionContext({
      ingestKernelTransactions: vi.fn(async () => {
        throw new Error('SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=1, limit=1)');
      }),
    });

    await expect(dispatchKernelTransaction(dispatcher, context, 'kernel.transaction.ingest', {
      source: 'ws-main',
      transactions: [{ id: 'tx-backpressure' }],
      idempotencyKey: 'tx-backpressure',
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=1, limit=1)',
      },
    });
  });
});

function createKernelTransactionDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchKernelTransaction(
  dispatcher: BackendRpcDispatcher<BackendKernelTransactionRpcHandlerContext>,
  context: BackendKernelTransactionRpcHandlerContext,
  method: typeof BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatchRaw(dispatcher, context, method, params === undefined ? undefined : [params]);
}

function dispatchRaw(
  dispatcher: BackendRpcDispatcher<BackendKernelTransactionRpcHandlerContext>,
  context: BackendKernelTransactionRpcHandlerContext,
  method: typeof BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params,
  }, context);
}

function createKernelTransactionContext(
  overrides: Partial<BackendKernelTransactionRpcHandlerContext['kernelTransaction']> = {},
): BackendKernelTransactionRpcHandlerContext {
  return {
    kernelTransaction: {
      ingestKernelTransactions: vi.fn(async () => ({
        accepted: 1,
        queued: 1,
        receivedAt: 10,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      } satisfies BackendKernelTransactionIngestResult)),
      dequeueKernelTransactionActions: vi.fn(async () => ({
        actions: [createRemoveAction()],
        remaining: 0,
      } satisfies BackendKernelTransactionDequeueResult)),
      requeueKernelTransactionActions: vi.fn(async () => ({
        requeued: 1,
        queueLength: 1,
        maxQueueLength: 4096,
      } satisfies BackendKernelTransactionRequeueResult)),
      ...overrides,
    },
  };
}

function createRemoveAction(): BackendKernelTransactionAction {
  return {
    type: 'native-riff-remove',
    blockIds: ['block-1'],
    source: 'ws-main',
    receivedAt: 10,
    idempotencyKey: 'tx-1',
  };
}
