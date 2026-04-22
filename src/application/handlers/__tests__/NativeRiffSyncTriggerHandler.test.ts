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
  upsertImpl?: ReturnType<typeof vi.fn>;
  removeImpl?: ReturnType<typeof vi.fn>;
}) {
  const incrementalSync = options?.syncImpl || vi.fn(async () => ({ ok: true }));
  const handleNativeRiffUpsert = options?.upsertImpl;
  const handleNativeRiffRemove = options?.removeImpl;
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
        handleNativeRiffUpsert,
        handleNativeRiffRemove,
      }),
    }),
  };
  return {
    handler: new NativeRiffSyncTriggerHandler(plugin as never, { debounceMs: 200 }),
    incrementalSync,
    handleNativeRiffUpsert,
    handleNativeRiffRemove,
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

function nativeRiffRemoveTransactions(blockIds: string[]) {
  return [{
    doOperations: [{
      action: 'removeFlashcards',
      id: '',
      blockIDs: blockIds,
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

  it('routes removeFlashcards directly to native riff removal without scheduling incremental sync', async () => {
    const handleNativeRiffRemove = vi.fn(async () => ({ success: true }));
    const { handler, incrementalSync } = createHandler({ removeImpl: handleNativeRiffRemove });

    handler.handle(nativeRiffRemoveTransactions(['block-1', 'block-2']) as never);
    await Promise.resolve();

    expect(handleNativeRiffRemove).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffRemove).toHaveBeenCalledWith(['block-1', 'block-2']);

    await vi.advanceTimersByTimeAsync(250);
    expect(incrementalSync).not.toHaveBeenCalled();
  });

  it('queues one follow-up native riff remove batch while the previous delete is in flight', async () => {
    const deferred = createDeferred<{ success: boolean }>();
    const handleNativeRiffRemove = vi.fn(() => deferred.promise);
    const { handler } = createHandler({ removeImpl: handleNativeRiffRemove });

    handler.handle(nativeRiffRemoveTransactions(['block-1']) as never);
    await Promise.resolve();
    expect(handleNativeRiffRemove).toHaveBeenCalledTimes(1);
    expect(handleNativeRiffRemove).toHaveBeenLastCalledWith(['block-1']);

    handler.handle(nativeRiffRemoveTransactions(['block-2', 'block-2']) as never);
    await Promise.resolve();
    expect(handleNativeRiffRemove).toHaveBeenCalledTimes(1);

    deferred.resolve({ success: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(handleNativeRiffRemove).toHaveBeenCalledTimes(2);
    expect(handleNativeRiffRemove).toHaveBeenLastCalledWith(['block-2']);
  });
});
