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
import { BackendKernel } from '../BackendKernel';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';

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

  it('serves kernel transaction ingest and dequeue from worker sqlite repository', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const transactionIngestResponse = await kernel.handle({
      id: 'kernel-transaction-ingest',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'kernel-sidecar',
        transactions: [{ id: 'tx-1' }],
        receivedAt: 1,
      }],
    });
    expect(transactionIngestResponse).toEqual({
      id: 'kernel-transaction-ingest',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 1,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    const transactionDequeueResponse = await kernel.handle({
      id: 'kernel-transaction-dequeue',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 4 }],
    });
    expect(transactionDequeueResponse).toEqual({
      id: 'kernel-transaction-dequeue',
      jsonrpc: '2.0',
      result: {
        actions: [],
        remaining: 0,
      },
    });
  });

  it('deduplicates kernel.transaction.ingest by idempotency key', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-a' }],
        receivedAt: 10,
        idempotencyKey: 'same-key',
      }],
    });
    expect(first).toEqual({
      id: 'ingest-first',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 10,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    const second = await kernel.handle({
      id: 'ingest-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-a' }],
        receivedAt: 10,
        idempotencyKey: 'same-key',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-second',
      jsonrpc: '2.0',
      result: {
        accepted: 0,
        queued: 1,
        receivedAt: 10,
        duplicate: true,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });
  });

  it('dequeues native-riff-remove actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-remove-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'remove-action-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'removeFlashcards',
                blockIDs: ['block-a', 'block-b'],
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-remove-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-remove-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-a', 'block-b'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'remove-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('dequeues native-riff-upsert actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-upsert-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'upsert-action-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'addFlashcards',
                blockIDs: ['block-upsert-a', 'block-upsert-b'],
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-upsert-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-upsert-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-upsert',
          blockIds: ['block-upsert-a', 'block-upsert-b'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'upsert-action-key',
        }],
        remaining: 0,
      },
    });

    const status = await kernel.handle({
      id: 'status-upsert-action',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    if ('result' in status) {
      expect(status.result.ingest).toMatchObject({
        actionQueueLength: 0,
        actionEnqueuedTotal: 1,
        actionDequeuedTotal: 1,
        upsertActionQueuedTotal: 1,
      });
    }
  });

  it('dequeues auto-card-candidates actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-action-key',
        transactions: [
          {
            doOperations: [
              { action: 'insert', id: 'block-auto-1' },
              { action: 'update', id: 'block-auto-2' },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'insert', blockId: 'block-auto-1' },
            { action: 'update', blockId: 'block-auto-2' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('prefilters no-marker auto-card insert and update payloads in worker extraction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-prefilter',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-prefilter-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'insert',
                id: 'block-plain-insert',
                data: { new: { content: 'ordinary paragraph without marker' } },
              },
              {
                action: 'update',
                id: 'block-marker-update',
                data: { new: { content: 'question >> answer' } },
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-prefilter',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-prefilter',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'update', blockId: 'block-marker-update' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-prefilter-key',
        }],
        remaining: 0,
      },
    });
  });

  it('coalesces auto-card candidate operations for same block in worker extraction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-coalesce',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-coalesce-key',
        transactions: [
          {
            doOperations: [
              { action: 'insert', id: 'block-auto-c1' },
              { action: 'update', id: 'block-auto-c1' },
              { action: 'delete', id: 'block-auto-c1' },
              { action: 'insert', id: 'block-auto-c2' },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-coalesce',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-coalesce',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'insert', blockId: 'block-auto-c2' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-coalesce-key',
        }],
        remaining: 0,
      },
    });
  });

  it('coalesces mixed dequeue action batch inside worker before dispatch', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingestFirst = await kernel.handle({
      id: 'ingest-mixed-1',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'mixed-1',
        transactions: [{
          doOperations: [
            { action: 'removeFlashcards', blockIDs: ['block-rm-1'] },
            { action: 'addFlashcards', blockIDs: ['block-up-1'] },
            { action: 'insert', id: 'block-auto-x' },
          ],
        }],
      }],
    });
    expect('result' in ingestFirst).toBe(true);

    const ingestSecond = await kernel.handle({
      id: 'ingest-mixed-2',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'mixed-2',
        transactions: [{
          doOperations: [
            { action: 'removeFlashcards', blockIDs: ['block-rm-2'] },
            { action: 'addFlashcards', blockIDs: ['block-up-2'] },
            { action: 'delete', id: 'block-auto-x' },
            { action: 'update', id: 'block-auto-y' },
          ],
        }],
      }],
    });
    expect('result' in ingestSecond).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-mixed-coalesced',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 32 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-mixed-coalesced',
      jsonrpc: '2.0',
      result: {
        actions: [
          {
            type: 'native-riff-remove',
            blockIds: ['block-rm-1', 'block-rm-2'],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
          {
            type: 'native-riff-upsert',
            blockIds: ['block-up-1', 'block-up-2'],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
          {
            type: 'auto-card-candidates',
            operations: [
              { action: 'update', blockId: 'block-auto-y' },
            ],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
        ],
        remaining: 0,
      },
    });
  });

  it('supports kernel.transaction.requeue and keeps actions in queue', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const requeue = await kernel.handle({
      id: 'requeue-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.requeue',
      params: [{
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-rq-1'],
          source: 'ws-main',
          receivedAt: 1,
          idempotencyKey: 'rq-1',
        }],
      }],
    });
    expect(requeue).toEqual({
      id: 'requeue-action',
      jsonrpc: '2.0',
      result: {
        requeued: 1,
        queueLength: 1,
        maxQueueLength: 4096,
      },
    });

    const dequeue = await kernel.handle({
      id: 'dequeue-requeued-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-requeued-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-rq-1'],
          source: 'ws-main',
          receivedAt: 1,
          idempotencyKey: 'rq-1',
        }],
        remaining: 0,
      },
    });
  });

  it('restores persisted action queue snapshot across worker restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const databaseA = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelA = new BackendKernel({ database: databaseA });

    const ingest = await kernelA.handle({
      id: 'ingest-persisted-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'persisted-action-key',
        transactions: [{
          doOperations: [{ action: 'removeFlashcards', id: 'block-persist-1' }],
        }],
      }],
    });
    expect('result' in ingest).toBe(true);

    databaseA.dispose();

    const databaseB = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelB = new BackendKernel({ database: databaseB });
    const dequeue = await kernelB.handle({
      id: 'dequeue-persisted-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-persisted-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-persist-1'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'persisted-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('restores persisted ingest queue snapshot across worker restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const databaseA = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelA = new BackendKernel({ database: databaseA });

    const ingest = await kernelA.handle({
      id: 'ingest-persisted-inbox',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'persisted-inbox-key',
        transactions: [{ id: 'tx-persist-1' }],
      }],
    });
    expect(ingest).toEqual({
      id: 'ingest-persisted-inbox',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: expect.any(Number),
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    databaseA.dispose();

    const databaseB = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelB = new BackendKernel({ database: databaseB });
    const load = await kernelB.handle({
      id: 'load-persisted-inbox',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });
    expect('result' in load).toBe(true);
    const status = await kernelB.handle({
      id: 'status-persisted-inbox',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    if ('result' in status) {
      expect(status.result.ingest).toMatchObject({
        queueLength: 1,
        queuedTransactions: 1,
        acceptedTotal: 1,
      });
    }
  });

  it('returns explicit unavailable when kernel transaction ingest queue is backpressured', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 1,
    });
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-backpressure-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-1' }],
        receivedAt: 1,
        idempotencyKey: 'k1',
      }],
    });
    expect('result' in first).toBe(true);

    const second = await kernel.handle({
      id: 'ingest-backpressure-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-2' }],
        receivedAt: 2,
        idempotencyKey: 'k2',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-backpressure-second',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=1, limit=1)',
      },
    });
  });

  it('drains accepted ingest envelopes when transaction actions are dequeued', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 4,
    });
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-drain-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{
          doOperations: [{ action: 'insert', id: 'block-drain-1' }],
        }],
        receivedAt: 1,
        idempotencyKey: 'drain-first',
      }],
    });
    expect('result' in first).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-drain-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect('result' in dequeue).toBe(true);

    const second = await kernel.handle({
      id: 'ingest-drain-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{
          doOperations: [{ action: 'insert', id: 'block-drain-2' }],
        }],
        receivedAt: 2,
        idempotencyKey: 'drain-second',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-drain-second',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 2,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 1,
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
