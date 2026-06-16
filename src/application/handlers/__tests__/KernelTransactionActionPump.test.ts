import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actionPumpLoggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => actionPumpLoggerMocks,
}));

import { KernelTransactionActionPump } from '@/application/handlers/KernelTransactionActionPump';

describe('KernelTransactionActionPump', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    actionPumpLoggerMocks.info.mockReset();
    actionPumpLoggerMocks.warn.mockReset();
    actionPumpLoggerMocks.error.mockReset();
    actionPumpLoggerMocks.debug.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function flushDeferredUpsertTimer(): Promise<void> {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
  }

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
    await flushDeferredUpsertTimer();

    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffUpsert).toHaveBeenCalledWith(['block-3']);
    expect(incrementalSync).not.toHaveBeenCalled();

    await pump.dispose();
  });

  it('does not keep pollOnce in flight while native-riff-upsert is still running', async () => {
    let resolveUpsert: (() => void) | null = null;
    const dequeueKernelTransactions = vi.fn()
      .mockResolvedValueOnce({
        actions: [{
          type: 'native-riff-upsert' as const,
          blockIds: ['block-slow'],
          source: 'ws-main' as const,
          receivedAt: 2,
          idempotencyKey: 'slow-upsert',
        }],
        remaining: 0,
      })
      .mockResolvedValue({
        actions: [],
        remaining: 0,
      });
    const handleNativeRiffUpsert = vi.fn(() => new Promise<void>((resolve) => {
      resolveUpsert = resolve;
    }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => ({ handleNativeRiffUpsert }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    await flushDeferredUpsertTimer();
    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(2);

    resolveUpsert?.();
    await Promise.resolve();
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
    await flushDeferredUpsertTimer();

    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffUpsert).toHaveBeenCalledWith(['block-a', 'block-b']);
    expect(handleNativeRiffRemove).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffRemove).toHaveBeenCalledWith(['block-1', 'block-2', 'block-3']);

    await pump.dispose();
  });

  it('falls back to scoped incremental sync when native-riff-upsert handler is unavailable', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [{
        type: 'native-riff-upsert' as const,
        blockIds: ['block-fallback-a', 'block-fallback-b'],
        source: 'ws-main' as const,
        receivedAt: 2,
        idempotencyKey: 'upsert-fallback',
      }],
      remaining: 0,
    }));
    const incrementalSync = vi.fn(async () => ({ success: true }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => ({ incrementalSync }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    await flushDeferredUpsertTimer();

    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      blockIds: ['block-fallback-a', 'block-fallback-b'],
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });

    await pump.dispose();
  });

  it('skips native-riff-upsert actions without block IDs instead of running a broad sync', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [{
        type: 'native-riff-upsert' as const,
        blockIds: [],
        source: 'ws-main' as const,
        receivedAt: 2,
        idempotencyKey: 'upsert-empty',
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
    await flushDeferredUpsertTimer();

    expect(handleNativeRiffUpsert).not.toHaveBeenCalled();
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

  it('reports follower dequeue relay timeout without local dequeue fallback', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const onWriterUnavailable = vi.fn();
    const timeout = Object.assign(new Error('BACKEND_UNAVAILABLE: writer relay timeout'), {
      commandId: 'cmd-dequeue-timeout',
      method: 'kernel.transaction.dequeue',
      timeoutMs: 1200,
    });
    const submitAndWait = vi.fn(async () => {
      throw timeout;
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'runtime-1',
      },
      { submitAndWait },
      () => undefined,
      () => undefined,
      {
        pollIntervalMs: 250,
        relayTimeoutMs: 1200,
        onWriterUnavailable,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(dequeueKernelTransactions).not.toHaveBeenCalled();
    expect(onWriterUnavailable).toHaveBeenCalledWith(expect.objectContaining({
      method: 'kernel.transaction.dequeue',
      message: 'BACKEND_UNAVAILABLE: writer relay timeout',
      runtimeMode: 'follower',
      instanceId: 'runtime-1',
      commandId: 'cmd-dequeue-timeout',
      timeoutMs: 1200,
    }));

    await pump.dispose();
  });

  it('dequeues locally after no-active-writer follower relay recovery restores writer mode', async () => {
    let mode: 'follower' | 'writer' = 'follower';
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const ensureWritable = vi.fn(async () => {
      mode = 'writer';
    });
    const submitAndWait = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      {
        getMode: () => mode,
        getInstanceId: () => 'primary-instance',
        ensureWritable,
      },
      { submitAndWait },
      () => undefined,
      () => undefined,
      { pollIntervalMs: 250 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(dequeueKernelTransactions).toHaveBeenCalledWith({ maxActions: 8 });
    expect(ensureWritable.mock.invocationCallOrder[0]).toBeLessThan(
      dequeueKernelTransactions.mock.invocationCallOrder[0],
    );

    await pump.dispose();
  });

  it('fails closed when no-active-writer follower relay recovery is rejected', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const onWriterUnavailable = vi.fn();
    const ensureWritable = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer unavailable: desktop Electron document window is follower-only');
    });
    const submitAndWait = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'document-window-instance',
        ensureWritable,
      },
      { submitAndWait },
      () => undefined,
      () => undefined,
      {
        pollIntervalMs: 250,
        onWriterUnavailable,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(dequeueKernelTransactions).not.toHaveBeenCalled();
    expect(onWriterUnavailable).toHaveBeenCalledWith(expect.objectContaining({
      method: 'kernel.transaction.dequeue',
      message: 'BACKEND_UNAVAILABLE: writer unavailable: desktop Electron document window is follower-only',
      runtimeMode: 'follower',
      instanceId: 'document-window-instance',
    }));

    await pump.dispose();
  });

  it('backs off repeated no-active-writer dequeue polling warnings', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const ensureWritable = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer unavailable: desktop Electron document window is follower-only');
    });
    const submitAndWait = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'document-window-instance',
        ensureWritable,
      },
      { submitAndWait },
      () => undefined,
      () => undefined,
      {
        pollIntervalMs: 250,
        emptyPollBackoffMaxMs: 1_000,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(submitAndWait).toHaveBeenCalledTimes(2);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(2);

    await pump.dispose();
  });

  it('backs off repeated backend-unavailable dequeue health warnings without fallback', async () => {
    const dequeueKernelTransactions = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: backend worker unhealthy');
    });
    const requeueKernelTransactions = vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions },
      null,
      null,
      () => undefined,
      () => undefined,
      {
        pollIntervalMs: 250,
        emptyPollBackoffMaxMs: 1_000,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(1);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(1);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(2);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(2);
    expect(requeueKernelTransactions).not.toHaveBeenCalled();

    await pump.dispose();
  });

  it('resets backend health warning backoff after a successful dequeue', async () => {
    const dequeueKernelTransactions = vi.fn()
      .mockRejectedValueOnce(new Error('TIMEOUT: backend dequeue timed out'))
      .mockResolvedValueOnce({ actions: [], remaining: 0 })
      .mockRejectedValueOnce(new Error('TIMEOUT: backend dequeue timed out'));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => undefined,
      {
        pollIntervalMs: 250,
        emptyPollBackoffMaxMs: 1_000,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(3);
    expect(actionPumpLoggerMocks.warn).toHaveBeenCalledTimes(2);

    await pump.dispose();
  });

  it('wakes immediately before empty backoff is established', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => undefined,
      { pollIntervalMs: 250, emptyPollBackoffMaxMs: 1_000 },
    );
    pump.start();

    pump.notifyActivity('test-ingest');
    await Promise.resolve();

    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(1);

    await pump.dispose();
  });

  it('backs off empty queue polls and keeps activity wake bounded during empty backoff', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => undefined,
      { pollIntervalMs: 250, emptyPollBackoffMaxMs: 1_000 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(1);

    pump.notifyActivity('test-ingest');
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(dequeueKernelTransactions).toHaveBeenCalledTimes(2);

    await pump.dispose();
  });

  it('dequeues locally when stale follower mode self-relay is rejected by kernel', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const submitAndWait = vi.fn(async () => {
      throw new Error('INVALID_REQUEST: writer instance should execute command locally instead of submitCommand');
    });

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

    expect(submitAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: 'runtime-1',
        method: 'kernel.transaction.dequeue',
      }),
      15000,
    );
    expect(dequeueKernelTransactions).toHaveBeenCalledWith({ maxActions: 8 });

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

  it('drops auto-card candidates when listener handler is disabled instead of retrying forever', async () => {
    const dequeueKernelTransactions = vi.fn()
      .mockResolvedValueOnce({
        actions: [{
          type: 'auto-card-candidates' as const,
          operations: [
            { action: 'insert' as const, blockId: 'block-disabled-1' },
            { action: 'update' as const, blockId: 'block-disabled-2' },
          ],
          source: 'ws-main' as const,
          receivedAt: 3,
          idempotencyKey: 'disabled-autocard',
        }],
        remaining: 0,
      })
      .mockResolvedValue({
        actions: [],
        remaining: 0,
      });
    const requeueKernelTransactions = vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 }));
    const handle = vi.fn();
    const getAutoCardHandler = vi.fn(() => undefined as { handle: typeof handle } | undefined);

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions },
      null,
      null,
      () => undefined,
      getAutoCardHandler,
      { pollIntervalMs: 250, maxActionsPerPoll: 4, autoCardCooldownMs: 1_000 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();

    expect(handle).not.toHaveBeenCalled();
    expect(getAutoCardHandler).toHaveBeenCalledTimes(1);
    expect(requeueKernelTransactions).not.toHaveBeenCalled();

    await pump.dispose();
  });

  it('coalesces same-block auto-card operations across actions before dispatch', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [
        {
          type: 'auto-card-candidates' as const,
          operations: [
            { action: 'insert' as const, blockId: 'block-1' },
            { action: 'update' as const, blockId: 'block-1' },
            { action: 'delete' as const, blockId: 'block-1' },
          ],
          source: 'ws-main' as const,
          receivedAt: 4,
          idempotencyKey: 'k4',
        },
        {
          type: 'auto-card-candidates' as const,
          operations: [
            { action: 'insert' as const, blockId: 'block-2' },
            { action: 'update' as const, blockId: 'block-2' },
          ],
          source: 'ws-main' as const,
          receivedAt: 5,
          idempotencyKey: 'k5',
        },
      ],
      remaining: 0,
    }));
    const handle = vi.fn();

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => ({ handle }),
      { pollIntervalMs: 250, maxActionsPerPoll: 8 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(handle).toHaveBeenCalledWith([{
      doOperations: [
        { action: 'insert', id: 'block-2' },
      ],
      undoOperations: null,
    }]);

    await pump.dispose();
  });

  it('buffers auto-card actions within cooldown window and dispatches once', async () => {
    const dequeueKernelTransactions = vi.fn()
      .mockResolvedValueOnce({
        actions: [{
          type: 'auto-card-candidates' as const,
          operations: [{ action: 'insert' as const, blockId: 'block-cool-1' }],
          source: 'ws-main' as const,
          receivedAt: 10,
          idempotencyKey: 'cool-1',
        }],
        remaining: 0,
      })
      .mockResolvedValueOnce({
        actions: [{
          type: 'auto-card-candidates' as const,
          operations: [{ action: 'update' as const, blockId: 'block-cool-2' }],
          source: 'ws-main' as const,
          receivedAt: 11,
          idempotencyKey: 'cool-2',
        }],
        remaining: 0,
      })
      .mockResolvedValue({
        actions: [],
        remaining: 0,
      });
    const handle = vi.fn();

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => ({ handle }),
      { pollIntervalMs: 250, maxActionsPerPoll: 8, autoCardCooldownMs: 1_000 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenLastCalledWith([{
      doOperations: [{ action: 'insert', id: 'block-cool-1' }],
      undoOperations: null,
    }]);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(handle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenLastCalledWith([{
      doOperations: [{ action: 'update', id: 'block-cool-2' }],
      undoOperations: null,
    }]);

    await pump.dispose();
  });

  it('keeps native-riff-upsert pending for cooldown retry when background processing fails', async () => {
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
    await flushDeferredUpsertTimer();

    expect(requeueKernelTransactions).not.toHaveBeenCalled();
    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_500);
    await Promise.resolve();
    await flushDeferredUpsertTimer();
    expect(handleNativeRiffUpsert).toHaveBeenCalledTimes(2);

    await pump.dispose();
  });

  it('requeues locally when stale follower mode self-relay is rejected by kernel', async () => {
    const action = {
      type: 'native-riff-upsert' as const,
      blockIds: ['block-fail'],
      source: 'ws-main' as const,
      receivedAt: 4,
      idempotencyKey: 'k4',
    };
    const submitAndWait = vi.fn()
      .mockResolvedValueOnce({
        actions: [action],
        remaining: 0,
      })
      .mockRejectedValueOnce(new Error('INVALID_REQUEST: writer instance should execute command locally instead of submitCommand'));
    const requeueKernelTransactions = vi.fn(async () => ({
      requeued: 1,
      queueLength: 1,
      maxQueueLength: 4096,
    }));
    const handleNativeRiffUpsert = vi.fn(async () => {
      throw new Error('upsert failed');
    });

    const pump = new KernelTransactionActionPump(
      {
        dequeueKernelTransactions: vi.fn(async () => ({ actions: [], remaining: 0 })),
        requeueKernelTransactions,
      },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'runtime-1',
      },
      { submitAndWait },
      () => ({ handleNativeRiffUpsert }),
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(submitAndWait).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        instanceId: 'runtime-1',
        method: 'kernel.transaction.dequeue',
      }),
      15000,
    );
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(requeueKernelTransactions).not.toHaveBeenCalled();

    await pump.dispose();
  });

  it('fails closed when writer relay runtime is required but unavailable', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      () => undefined,
      { pollIntervalMs: 250, writerRelayRequired: true },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(dequeueKernelTransactions).not.toHaveBeenCalled();

    await pump.dispose();
  });
});
