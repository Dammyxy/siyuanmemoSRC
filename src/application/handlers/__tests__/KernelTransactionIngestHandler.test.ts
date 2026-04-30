import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KernelTransactionIngestHandler } from '@/application/handlers/KernelTransactionIngestHandler';
import type { Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';

function createTransaction(id: string): Transaction {
  return {
    doOperations: [{ action: 'update', id, data: {} }],
    undoOperations: null,
  };
}

describe('KernelTransactionIngestHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('batches ws-main transactions and sends them to backend client', async () => {
    const ingestKernelTransactions = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: Date.now(),
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const handler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions },
      null,
      null,
      { batchDebounceMs: 20, maxBatchTransactions: 2 },
    );

    handler.handle([createTransaction('block-1'), createTransaction('block-2'), createTransaction('block-3')]);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(ingestKernelTransactions).toHaveBeenCalledTimes(2);
    const firstPayload = ingestKernelTransactions.mock.calls[0]?.[0];
    const secondPayload = ingestKernelTransactions.mock.calls[1]?.[0];
    expect(firstPayload.transactions).toHaveLength(2);
    expect(secondPayload.transactions).toHaveLength(1);

    handler.dispose();
  });

  it('relays ingest command through writer relay when runtime is follower', async () => {
    const ingestKernelTransactions = vi.fn();
    const submitAndWait = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: Date.now(),
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const handler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'runtime-1',
      },
      { submitAndWait },
      { batchDebounceMs: 10 },
    );

    handler.handle([createTransaction('block-follower')]);
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    expect(ingestKernelTransactions).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(submitAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: 'runtime-1',
        method: 'kernel.transaction.ingest',
      }),
      15000,
    );

    handler.dispose();
  });

  it('retries BACKEND_UNAVAILABLE failures before giving up', async () => {
    const ingestKernelTransactions = vi
      .fn()
      .mockRejectedValueOnce(new Error('BACKEND_UNAVAILABLE: busy'))
      .mockResolvedValueOnce({
        accepted: 1,
        queued: 1,
        receivedAt: Date.now(),
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      });
    const handler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions },
      null,
      null,
      { batchDebounceMs: 10, maxAttempts: 2 },
    );

    handler.handle([createTransaction('block-retry')]);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    expect(ingestKernelTransactions).toHaveBeenCalledTimes(2);

    handler.dispose();
  });
});

