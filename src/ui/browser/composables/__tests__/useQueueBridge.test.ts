import { describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { EMPTY_QUEUE_COUNTS, useQueueBridge } from '../useQueueBridge';

function ref<T>(value: T): { value: T } {
  return { value };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createBridge(getQueueCounts: ReturnType<typeof vi.fn>) {
  return useQueueBridge({
    browserService: ref({
      getQueueCounts,
      getQueueById: vi.fn(),
      setFilterGroupFilter: vi.fn(),
      rebuildFilterGroupQueue: vi.fn(),
    } as never),
  });
}

describe('useQueueBridge', () => {
  it('resets queue counts when the browser service is unavailable', async () => {
    const bridge = useQueueBridge({
      browserService: ref(null),
    });
    const queueCounts = ref<Record<string, number>>({
      ...EMPTY_QUEUE_COUNTS,
      retrieval: 2,
      'incremental-learning': 7,
      'neural-roam': 4,
    });

    await bridge.refreshQueueCounts(queueCounts);

    expect(queueCounts.value).toEqual(EMPTY_QUEUE_COUNTS);
  });

  it('keeps a newer targeted queue count when an older full refresh resolves later', async () => {
    const slowFullRefresh = deferred<Record<string, number>>();
    const fastIncrementalRefresh = deferred<Record<string, number>>();
    const getQueueCounts = vi.fn()
      .mockReturnValueOnce(slowFullRefresh.promise)
      .mockReturnValueOnce(fastIncrementalRefresh.promise);
    const bridge = createBridge(getQueueCounts);
    const queueCounts = ref<Record<string, number>>({ ...EMPTY_QUEUE_COUNTS });

    const fullRefresh = bridge.refreshQueueCounts(queueCounts);
    const targetedRefresh = bridge.refreshQueueCounts(queueCounts, {
      forceRefresh: true,
      affectedQueueTypes: [QueueType.IncrementalLearning],
    });

    fastIncrementalRefresh.resolve({
      ...EMPTY_QUEUE_COUNTS,
      'incremental-learning': 5,
    });
    await targetedRefresh;
    expect(queueCounts.value['incremental-learning']).toBe(5);

    slowFullRefresh.resolve({
      ...EMPTY_QUEUE_COUNTS,
      retrieval: 3,
      'incremental-learning': 0,
    });
    await fullRefresh;

    expect(queueCounts.value['incremental-learning']).toBe(5);
  });

  it('merges targeted refresh results without resetting unrelated queue counts', async () => {
    const getQueueCounts = vi.fn(async () => ({
      ...EMPTY_QUEUE_COUNTS,
      'incremental-learning': 7,
    }));
    const bridge = createBridge(getQueueCounts);
    const queueCounts = ref<Record<string, number>>({
      ...EMPTY_QUEUE_COUNTS,
      retrieval: 2,
      'neural-roam': 4,
    });

    await bridge.refreshQueueCounts(queueCounts, {
      forceRefresh: true,
      affectedQueueTypes: [QueueType.IncrementalLearning],
    });

    expect(queueCounts.value).toMatchObject({
      retrieval: 2,
      'incremental-learning': 7,
      'neural-roam': 4,
    });
  });
});
