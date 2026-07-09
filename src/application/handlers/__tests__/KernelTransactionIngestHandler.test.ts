import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KernelTransactionIngestHandler } from '@/application/handlers/KernelTransactionIngestHandler';
import type { Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import { classifyTransactionBatch } from '@/core/infrastructure/websocket/transaction-classifier';

function createTransaction(id: string): Transaction {
  return {
    doOperations: [{ action: 'update', id, data: {} }],
    undoOperations: null,
  };
}

function createPlainContentTransaction(id: string): Transaction {
  return {
    doOperations: [{
      action: 'update',
      id,
      data: {
        new: {
          content: 'ordinary text without SiYuanMemo markers',
        },
      },
    }],
    undoOperations: null,
  };
}

function createMarkerTransaction(id: string): Transaction {
  return {
    doOperations: [{
      action: 'update',
      id,
      data: {
        new: {
          content: 'question >> answer',
        },
      },
    }],
    undoOperations: null,
  };
}

function createNativeRiffAndMarkerTransaction(id: string): Transaction {
  return {
    doOperations: [
      {
        action: 'addFlashcards',
        blockIDs: [id],
      },
      {
        action: 'update',
        id: `${id}-marker`,
        data: {
          new: {
            content: 'prompt >> response',
          },
        },
      },
    ],
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

  it('skips ordinary classified no-op batches before backend ingest or relay', async () => {
    const ingestKernelTransactions = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: Date.now(),
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const transaction = createPlainContentTransaction('block-ordinary');
    const classification = classifyTransactionBatch([transaction]);
    const handler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions },
      null,
      null,
      { batchDebounceMs: 20 },
    );

    expect(handler.shouldHandleTransactionBatch(classification)).toBe(false);
    handler.handle([transaction], classification);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(ingestKernelTransactions).not.toHaveBeenCalled();

    handler.dispose();
  });

  it('ignores retired Native Riff action types instead of ingesting their transactions', async () => {
    const ingestKernelTransactions = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: Date.now(),
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const transaction = createNativeRiffAndMarkerTransaction('block-native-riff-only');
    const classification = classifyTransactionBatch([transaction]);
    const handler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions },
      null,
      null,
      {
        batchDebounceMs: 20,
        enabledActionTypes: ['native-riff-remove', 'native-riff-upsert'],
      },
    );

    expect(handler.shouldHandleTransactionBatch(classification)).toBe(false);
    handler.handle([transaction], classification);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(ingestKernelTransactions).not.toHaveBeenCalled();

    handler.dispose();
  });

  it('passes only AutoCard action types to backend ingest', async () => {
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
      {
        batchDebounceMs: 20,
        enabledActionTypes: ['native-riff-remove', 'auto-card-candidates', 'native-riff-upsert'],
      },
    );

    handler.handle([createNativeRiffAndMarkerTransaction('block-native-riff')]);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(ingestKernelTransactions).toHaveBeenCalledWith(expect.objectContaining({
      enabledActionTypes: ['auto-card-candidates'],
    }));

    handler.dispose();
  });

  it('notifies activity after a successful local ingest batch', async () => {
    const onIngested = vi.fn();
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
      { batchDebounceMs: 20, onIngested },
    );

    handler.handle([createTransaction('block-wake')]);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(onIngested).toHaveBeenCalledTimes(1);

    handler.dispose();
  });

  it('sends provenance snapshots with raw transactions without trusting renderer plans', async () => {
    const provenanceRegistry = {
      createSnapshot: vi.fn(() => ({
        capturedAt: 42,
        entries: [{
          blockId: 'excerpt-topic',
          expiresAt: 1_000,
          reason: 'progressive-excerpt-topic-card',
          source: 'progressive-excerpt',
        }],
      })),
    };
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
      { batchDebounceMs: 20, provenanceRegistry },
    );

    handler.handle([createTransaction('excerpt-topic')]);
    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(provenanceRegistry.createSnapshot).toHaveBeenCalledTimes(1);
    expect(ingestKernelTransactions).toHaveBeenCalledWith(expect.objectContaining({
      provenanceSnapshot: {
        capturedAt: 42,
        entries: [{
          blockId: 'excerpt-topic',
          expiresAt: 1_000,
          reason: 'progressive-excerpt-topic-card',
          source: 'progressive-excerpt',
        }],
      },
      transactions: expect.any(Array),
    }));

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

  it('uses deterministic idempotency keys for the same transaction batch across runtime instances', async () => {
    const firstIngestKernelTransactions = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: Date.now(),
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const secondIngestKernelTransactions = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: Date.now(),
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const transaction = createTransaction('block-same-event');
    const firstHandler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions: firstIngestKernelTransactions },
      null,
      null,
      { batchDebounceMs: 10 },
    );
    const secondHandler = new KernelTransactionIngestHandler(
      { ingestKernelTransactions: secondIngestKernelTransactions },
      null,
      null,
      { batchDebounceMs: 10 },
    );

    firstHandler.handle([transaction]);
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    secondHandler.handle([transaction]);
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    const firstKey = firstIngestKernelTransactions.mock.calls[0]?.[0]?.idempotencyKey;
    const secondKey = secondIngestKernelTransactions.mock.calls[0]?.[0]?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(firstKey).toBe(secondKey);

    firstHandler.dispose();
    secondHandler.dispose();
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

  it('fails closed when writer relay runtime is required but unavailable', async () => {
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
      { batchDebounceMs: 10, writerRelayRequired: true },
    );

    handler.handle([createTransaction('block-runtime-required')]);
    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();

    expect(ingestKernelTransactions).not.toHaveBeenCalled();

    handler.dispose();
  });
});
