import { computed } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBrowserAdapterSync } from '../useBrowserAdapterSync';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';

function createManagerStub(): IUnifiedDataSourceManagerFacade {
  return {
    getCard: vi.fn(async () => {
      throw new Error('not implemented');
    }),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
    getQueue: vi.fn(() => {
      throw new Error('not implemented');
    }),
    getAvailableQueueTypes: vi.fn(() => []),
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  };
}

describe('useBrowserAdapterSync queue-changed aggregation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates queue-changed events by queue type and flushes once', async () => {
    vi.useFakeTimers();
    const manager = createManagerStub();
    const onQueueChanged = vi.fn();

    const { browserAdapter, initBrowserAdapter, destroyBrowserAdapter } = useBrowserAdapterSync({
      manager: computed(() => manager),
      onCardUpdated: vi.fn(async () => {}),
      onCardDeleted: vi.fn(async () => {}),
      onQueueChanged,
      onModeSwitched: vi.fn(),
    });

    initBrowserAdapter();
    const adapter = browserAdapter.value;
    expect(adapter).not.toBeNull();

    adapter?.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.RetrievalPractice,
      timestamp: Date.now(),
    });
    adapter?.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FinalDrill,
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(350);

    expect(onQueueChanged).toHaveBeenCalledTimes(1);
    const arg = onQueueChanged.mock.calls[0]?.[0] as {
      affectedQueueTypes: QueueType[] | null;
      invalidateAllCounts: boolean;
      requiresFullRefresh: boolean;
    };
    expect(arg.invalidateAllCounts).toBe(false);
    expect(arg.requiresFullRefresh).toBe(false);
    expect(arg.affectedQueueTypes).not.toBeNull();
    expect(new Set(arg.affectedQueueTypes ?? [])).toEqual(new Set([QueueType.RetrievalPractice, QueueType.FinalDrill]));

    destroyBrowserAdapter();
  });

  it('falls back to full refresh when queueType is missing', async () => {
    vi.useFakeTimers();
    const manager = createManagerStub();
    const onQueueChanged = vi.fn();

    const { browserAdapter, initBrowserAdapter, destroyBrowserAdapter } = useBrowserAdapterSync({
      manager: computed(() => manager),
      onCardUpdated: vi.fn(async () => {}),
      onCardDeleted: vi.fn(async () => {}),
      onQueueChanged,
      onModeSwitched: vi.fn(),
    });

    initBrowserAdapter();
    const adapter = browserAdapter.value;
    expect(adapter).not.toBeNull();

    adapter?.onDataChanged({
      type: 'queue-changed',
      timestamp: Date.now(),
    });
    adapter?.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(350);

    expect(onQueueChanged).toHaveBeenCalledTimes(1);
    expect(onQueueChanged).toHaveBeenCalledWith({
      affectedQueueTypes: null,
      invalidateAllCounts: true,
      requiresFullRefresh: false,
    });

    destroyBrowserAdapter();
  });

  it('preserves a queued full-refresh hint across aggregated queue-changed events', async () => {
    vi.useFakeTimers();
    const manager = createManagerStub();
    const onQueueChanged = vi.fn();

    const { browserAdapter, initBrowserAdapter, destroyBrowserAdapter } = useBrowserAdapterSync({
      manager: computed(() => manager),
      onCardUpdated: vi.fn(async () => {}),
      onCardDeleted: vi.fn(async () => {}),
      onQueueChanged,
      onModeSwitched: vi.fn(),
    });

    initBrowserAdapter();
    const adapter = browserAdapter.value;
    expect(adapter).not.toBeNull();

    adapter?.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      requiresFullRefresh: true,
      timestamp: Date.now(),
    });
    adapter?.onDataChanged({
      type: 'queue-changed',
      queueType: QueueType.FinalDrill,
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(350);

    expect(onQueueChanged).toHaveBeenCalledTimes(1);
    expect(onQueueChanged).toHaveBeenCalledWith({
      affectedQueueTypes: [QueueType.FilterGroup, QueueType.FinalDrill],
      invalidateAllCounts: false,
      requiresFullRefresh: true,
    });

    destroyBrowserAdapter();
  });
});
