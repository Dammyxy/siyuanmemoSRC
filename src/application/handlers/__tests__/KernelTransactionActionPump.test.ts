import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KernelTransactionActionPump } from '@/application/handlers/KernelTransactionActionPump';

describe('KernelTransactionActionPump', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('dequeues actions from backend and routes native-riff-remove to hybrid sync service', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [{
        type: 'native-riff-remove' as const,
        blockIds: ['block-1', 'block-2'],
        source: 'ws-main' as const,
        receivedAt: 1,
        idempotencyKey: 'k1',
      }],
      remaining: 0,
    }));
    const handleNativeRiffRemove = vi.fn(async () => ({ success: true }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => ({ handleNativeRiffRemove }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(dequeueKernelTransactions).toHaveBeenCalledWith({ maxActions: 4 });
    expect(handleNativeRiffRemove).toHaveBeenCalledWith(['block-1', 'block-2']);

    await pump.dispose();
  });

  it('routes native-riff-upsert to hybrid sync upsert handler', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [{
        type: 'native-riff-upsert' as const,
        blockIds: ['block-3'],
        source: 'ws-main' as const,
        receivedAt: 2,
        idempotencyKey: 'k2',
      }],
      remaining: 0,
    }));
    const handleNativeRiffUpsert = vi.fn(async () => ({ success: true }));
    const incrementalSync = vi.fn(async () => ({ success: true }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => ({ handleNativeRiffUpsert, incrementalSync }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);
    expect(incrementalSync).not.toHaveBeenCalled();

    await pump.dispose();
  });

  it('coalesces repeated upsert/remove actions in one poll', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [
        {
          type: 'native-riff-upsert' as const,
          blockIds: ['block-a'],
          source: 'ws-main' as const,
          receivedAt: 10,
          idempotencyKey: 'k10',
        },
        {
          type: 'native-riff-upsert' as const,
          blockIds: ['block-b'],
          source: 'ws-main' as const,
          receivedAt: 11,
          idempotencyKey: 'k11',
        },
        {
          type: 'native-riff-remove' as const,
          blockIds: ['block-1', 'block-2'],
          source: 'ws-main' as const,
          receivedAt: 12,
          idempotencyKey: 'k12',
        },
        {
          type: 'native-riff-remove' as const,
          blockIds: ['block-2', 'block-3'],
          source: 'ws-main' as const,
          receivedAt: 13,
          idempotencyKey: 'k13',
        },
      ],
      remaining: 0,
    }));
    const handleNativeRiffUpsert = vi.fn(async () => ({ success: true }));
    const handleNativeRiffRemove = vi.fn(async () => ({ success: true }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => ({ handleNativeRiffUpsert, handleNativeRiffRemove }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 8 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffRemove).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffRemove).toHaveBeenCalledWith(['block-1', 'block-2', 'block-3']);

    await pump.dispose();
  });

  it('uses relay dequeue command when runtime is follower', async () => {
    const dequeueKernelTransactions = vi.fn();
    const submitAndWait = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'runtime-1',
      },
      { submitAndWait },
      () => undefined,
      () => undefined,
      { pollIntervalMs: 250 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(dequeueKernelTransactions).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: 'runtime-1',
        method: 'kernel.transaction.dequeue',
        params: { maxActions: 8 },
      }),
      15000,
    );

    await pump.dispose();
  });

  it('routes auto-card-candidates actions to AutoCardHandler', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [{
        type: 'auto-card-candidates' as const,
        operations: [
          { action: 'insert' as const, blockId: 'block-1' },
          { action: 'update' as const, blockId: 'block-2' },
        ],
        source: 'ws-main' as const,
        receivedAt: 3,
        idempotencyKey: 'k3',
      }],
      remaining: 0,
    }));
    const handle = vi.fn();

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => ({ handle }),
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(handle).toHaveBeenCalledWith([{
      doOperations: [
        { action: 'insert', id: 'block-1' },
        { action: 'update', id: 'block-2' },
      ],
      undoOperations: null,
    }]);

    await pump.dispose();
  });

  it('requeues actions when action processing fails', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [{
        type: 'native-riff-upsert' as const,
        blockIds: ['block-fail'],
        source: 'ws-main' as const,
        receivedAt: 4,
        idempotencyKey: 'k4',
      }],
      remaining: 0,
    }));
    const requeueKernelTransactions = vi.fn(async () => ({
      requeued: 1,
      queueLength: 1,
      maxQueueLength: 4096,
    }));
    const handleNativeRiffUpsert = vi.fn(async () => {
      throw new Error('upsert failed');
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions },
      null,
      null,
      () => ({ handleNativeRiffUpsert }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(requeueKernelTransactions).toHaveBeenCalledWith({
      actions: [{
        type: 'native-riff-upsert',
        blockIds: ['block-fail'],
        source: 'ws-main',
        receivedAt: 4,
        idempotencyKey: 'k4',
      }],
    });

    await pump.dispose();
  });
});
