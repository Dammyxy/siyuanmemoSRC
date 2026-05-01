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
      { dequeueKernelTransactions },
      null,
      null,
      () => ({ handleNativeRiffRemove }),
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
      { dequeueKernelTransactions },
      null,
      null,
      () => ({ handleNativeRiffUpsert, incrementalSync }),
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);
    expect(incrementalSync).not.toHaveBeenCalled();

    await pump.dispose();
  });

  it('uses relay dequeue command when runtime is follower', async () => {
    const dequeueKernelTransactions = vi.fn();
    const submitAndWait = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'runtime-1',
      },
      { submitAndWait },
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
});
