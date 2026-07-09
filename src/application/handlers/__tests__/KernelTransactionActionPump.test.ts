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
import { KernelCompanionBackgroundWorkRegistry } from '@/application/backgroundWork/KernelCompanionBackgroundWorkRegistry';

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

  it('consumes native-riff actions without routing them to sync services', async () => {
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
      () => undefined,
      { pollIntervalMs: 250, maxActionsPerPoll: 4 },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(dequeueKernelTransactions).toHaveBeenCalledWith({ maxActions: 4 });
    expect(handleNativeRiffRemove).not.toHaveBeenCalled();

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

  it('quietly backs off follower dequeue when another instance holds the writer lease', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const onWriterUnavailable = vi.fn();
    const submitAndWait = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance: primary-app');
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      {
        getMode: () => 'follower',
        getInstanceId: () => 'background-window-instance',
      },
      { submitAndWait },
      () => undefined,
      {
        pollIntervalMs: 250,
        emptyPollBackoffMaxMs: 1_000,
        onWriterUnavailable,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(dequeueKernelTransactions).not.toHaveBeenCalled();
    expect(onWriterUnavailable).toHaveBeenCalledWith(expect.objectContaining({
      method: 'kernel.transaction.dequeue',
      message: 'BACKEND_UNAVAILABLE: writer lease held by another instance: primary-app',
      runtimeMode: 'follower',
      instanceId: 'background-window-instance',
    }));
    expect(actionPumpLoggerMocks.warn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(actionPumpLoggerMocks.warn).not.toHaveBeenCalled();

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

  it('records polling lifecycle in the shared background work registry', async () => {
    const dequeueKernelTransactions = vi.fn(async () => ({
      actions: [],
      remaining: 0,
    }));
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => run(),
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      {
        pollIntervalMs: 250,
        maxActionsPerPoll: 4,
        backgroundWorkRegistry: registry,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(registry.status()).toEqual([
      expect.objectContaining({
        kind: 'kernel-transaction-action-polling',
        state: 'completed',
        attemptCount: 1,
        diagnostics: expect.objectContaining({
          reason: 'timer',
          status: 'empty',
          actionCount: 0,
          remainingActions: 0,
          maxActionsPerPoll: 4,
        }),
      }),
    ]);

    await pump.dispose();
  });

  it('cancels active polling job through the shared background work registry on dispose', async () => {
    let finishDequeue: ((value: { actions: []; remaining: number }) => void) | null = null;
    const dequeueKernelTransactions = vi.fn(() => new Promise<{ actions: []; remaining: number }>((resolve) => {
      finishDequeue = resolve;
    }));
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => run(),
    });

    const pump = new KernelTransactionActionPump(
      { dequeueKernelTransactions, requeueKernelTransactions: vi.fn(async () => ({ requeued: 0, queueLength: 0, maxQueueLength: 4096 })) },
      null,
      null,
      () => undefined,
      {
        pollIntervalMs: 250,
        backgroundWorkRegistry: registry,
      },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    const running = registry.status()[0];
    expect(running).toMatchObject({
      kind: 'kernel-transaction-action-polling',
      state: 'running',
    });

    await pump.dispose();
    expect(registry.status(running.jobId)).toMatchObject({
      state: 'canceled',
      reason: 'action-pump-dispose',
    });

    finishDequeue?.({ actions: [], remaining: 0 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();

    expect(registry.status()).toHaveLength(1);
    expect(registry.status(running.jobId)).toMatchObject({
      state: 'canceled',
      reason: 'action-pump-dispose',
    });
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
      { pollIntervalMs: 250, writerRelayRequired: true },
    );
    pump.start();

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(dequeueKernelTransactions).not.toHaveBeenCalled();

    await pump.dispose();
  });
});
