import { describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { createBrowserQueueProjectionWarmupRuntime } from '../browserQueueProjectionWarmupRuntime';

function ref<T>(value: T): { value: T } {
  return { value };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    activeDocId: ref<string | null>(null),
    activeQueueId: ref<string | null>(null),
    activeScopeDocIds: ref<string[] | null>(null),
    browserAppService: ref({
      ensureQueueReadModelReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-retrieval',
        generation: 7,
      })),
    }),
    currentCardType: ref('all' as const),
    currentPreset: ref('all' as const),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    searchQuery: ref(''),
    ...overrides,
  };
}

describe('browserQueueProjectionWarmupRuntime', () => {
  it('warms active projection-backed queue first, then warms the other sidebar projection queues', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'ready',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      generation: 3,
    }));
    const onQueueReady = vi.fn();
    const deps = createDeps({
      activeQueueId: ref('incremental-learning'),
      browserAppService: ref({ ensureQueueReadModelReady }),
      onQueueReady,
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0);
    await vi.runOnlyPendingTimersAsync();

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(4);
    expect(ensureQueueReadModelReady.mock.calls[0]?.[0]).toMatchObject({
      queueType: QueueType.IncrementalLearning,
      source: 'browser',
    });
    expect(ensureQueueReadModelReady.mock.calls.map((call) => call[0].queueType)).toEqual([
      QueueType.IncrementalLearning,
      QueueType.RetrievalPractice,
      QueueType.FinalDrill,
      QueueType.FilterGroup,
    ]);
    expect(runtime.getStatus('incremental-learning')).toMatchObject({
      status: 'ready',
      queueId: 'incremental-learning',
      queueType: QueueType.IncrementalLearning,
      generation: 3,
    });
    expect(onQueueReady).toHaveBeenCalledTimes(4);
    expect(onQueueReady).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready',
      queueType: QueueType.IncrementalLearning,
    }));
    vi.useRealTimers();
  });

  it('cancels stale warmups before they record readiness', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async () => ({
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-retrieval',
      generation: 1,
    }));
    const deps = createDeps({
      browserAppService: ref({ ensureQueueReadModelReady }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 50);
    runtime.abort();
    await vi.advanceTimersByTimeAsync(50);

    expect(ensureQueueReadModelReady).not.toHaveBeenCalled();
    expect(runtime.getStatus('retrieval')).toBeNull();
    vi.useRealTimers();
  });

  it('rewarms visible projection queues after invalidation identity events', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async () => ({
      status: 'refreshing',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-retrieval',
      cause: 'projection_stale',
      retryAfterMs: 300,
    }));
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({ ensureQueueReadModelReady }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.handleLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: null,
      generation: null,
      reason: 'invalidated',
      source: 'runtime',
      timestamp: 1,
    });
    await vi.runOnlyPendingTimersAsync();

    expect(ensureQueueReadModelReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    }));
    expect(runtime.getStatus('retrieval')).toMatchObject({
      status: 'refreshing',
      cause: 'projection_stale',
    });
    vi.useRealTimers();
  });

  it('rewarms only the affected queue after materialized identity events', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'ready',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      generation: 11,
    }));
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({ ensureQueueReadModelReady }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.handleLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: 'final-drill',
      queueType: QueueType.FinalDrill,
      policyId: 'policy-final-drill',
      generation: 10,
      reason: 'materialized',
      source: 'runtime',
      timestamp: 1,
    });
    await vi.runOnlyPendingTimersAsync();

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(1);
    expect(ensureQueueReadModelReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.FinalDrill,
      source: 'browser',
    }));
    expect(runtime.getStatus('final-drill')).toMatchObject({
      status: 'ready',
      queueId: 'final-drill',
      queueType: QueueType.FinalDrill,
    });
    vi.useRealTimers();
  });
});
