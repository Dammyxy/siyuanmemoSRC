import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTR_RIFF_DECKS } from '@/core/siyuan/block';
import { NativeRiffSyncTriggerHandler } from '@/application/handlers/NativeRiffSyncTriggerHandler';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function createHandler(options?: {
  incrementalEnabled?: boolean;
  syncImpl?: ReturnType<typeof vi.fn>;
}) {
  const incrementalSync = options?.syncImpl || vi.fn(async () => ({ ok: true }));
  const plugin = {
    getContext: () => ({
      getSettingsService: () => ({
        getSettings: () => ({
          riffIntegration: {
            incrementalSync: {
              enabled: options?.incrementalEnabled ?? true,
            },
          },
        }),
      }),
      getHybridSyncService: () => ({
        incrementalSync,
      }),
    }),
  };
  return {
    handler: new NativeRiffSyncTriggerHandler(plugin as never, { debounceMs: 200 }),
    incrementalSync,
  };
}

function nativeRiffTransactions() {
  return [{
    doOperations: [{
      action: 'update',
      id: 'block-1',
      data: {
        new: {
          attrs: {
            [ATTR_RIFF_DECKS]: 'deck-1',
          },
        },
      },
    }],
    undoOperations: null,
  }];
}

describe('NativeRiffSyncTriggerHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('debounces relevant native-riff transactions into one incremental sync', async () => {
    const { handler, incrementalSync } = createHandler();

    handler.handle(nativeRiffTransactions() as never);
    handler.handle(nativeRiffTransactions() as never);

    await vi.advanceTimersByTimeAsync(199);
    expect(incrementalSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(incrementalSync).toHaveBeenCalledTimes(1);
    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });
  });

  it('ignores unrelated transactions', async () => {
    const { handler, incrementalSync } = createHandler();

    handler.handle([{
      doOperations: [{
        action: 'update',
        id: 'block-1',
        data: {
          new: {
            attrs: {
              'custom-xiuyuan-id': 'xy-1',
            },
          },
        },
      }],
      undoOperations: null,
    }] as never);

    await vi.advanceTimersByTimeAsync(250);
    expect(incrementalSync).not.toHaveBeenCalled();
  });

  it('does not run when riff incremental sync is disabled', async () => {
    const { handler, incrementalSync } = createHandler({ incrementalEnabled: false });

    handler.handle(nativeRiffTransactions() as never);
    await vi.advanceTimersByTimeAsync(250);

    expect(incrementalSync).not.toHaveBeenCalled();
  });

  it('queues one follow-up sync when a relevant transaction arrives during an in-flight sync', async () => {
    const deferred = createDeferred<{ ok: boolean }>();
    const incrementalSync = vi.fn(() => deferred.promise);
    const { handler } = createHandler({ syncImpl: incrementalSync });

    handler.handle(nativeRiffTransactions() as never);
    await vi.advanceTimersByTimeAsync(200);
    expect(incrementalSync).toHaveBeenCalledTimes(1);
    expect(incrementalSync).toHaveBeenLastCalledWith(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });

    handler.handle(nativeRiffTransactions() as never);
    await vi.advanceTimersByTimeAsync(200);
    expect(incrementalSync).toHaveBeenCalledTimes(1);

    deferred.resolve({ ok: true });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);

    expect(incrementalSync).toHaveBeenCalledTimes(2);
    expect(incrementalSync).toHaveBeenLastCalledWith(undefined, {
      source: 'native-riff-transaction',
      persistIdleCheckpoint: false,
    });
  });
});
