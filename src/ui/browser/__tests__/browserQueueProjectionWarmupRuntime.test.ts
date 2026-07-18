import { describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { createBrowserQueueProjectionWarmupRuntime } from '../browserQueueProjectionWarmupRuntime';
import { ReviewProjectionWorkCoordinator } from '@/application/services/ReviewProjectionWorkCoordinator';

function ref<T>(value: T): { value: T } {
  return { value };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const workCoordinator = new ReviewProjectionWorkCoordinator({
    info: vi.fn(),
    warn: vi.fn(),
  });
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
      trace: vi.fn(),
      warn: vi.fn(),
    },
    searchQuery: ref(''),
    workCoordinator: () => workCoordinator,
    ...overrides,
  };
}

function createActiveReview(queueType: QueueType) {
  const workCoordinator = new ReviewProjectionWorkCoordinator({
    info: vi.fn(),
    warn: vi.fn(),
  });
  const surface = workCoordinator.activateSurface({
    surfaceId: `review-${queueType}`,
    surfaceKind: 'dialog',
    queueType,
  });
  return { surface, workCoordinator };
}

describe('browserQueueProjectionWarmupRuntime', () => {
  it('defers broad sidebar warmup during active Review and warms only the visible queue immediately', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'ready',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      generation: 12,
    }));
    const { workCoordinator } = createActiveReview(QueueType.IncrementalLearning);
    const deps = createDeps({
      activeQueueId: ref('incremental-learning'),
      browserAppService: ref({ ensureQueueReadModelReady }),
      workCoordinator: () => workCoordinator,
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(ensureQueueReadModelReady.mock.calls.map((call) => call[0].queueType)).toEqual([
      QueueType.IncrementalLearning,
    ]);
    expect(deps.logger.info).not.toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup deferred during active Review',
      expect.anything(),
    );
    expect(deps.logger.trace).toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup deferred during active Review',
      expect.objectContaining({
        reason: 'browser-open',
        deferredQueueIds: ['retrieval', 'final-drill', 'filter-group'],
      }),
    );

    vi.useRealTimers();
  });

  it('coalesces repeated non-active live identity warmups until active Review pressure clears', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'ready',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      generation: 13,
    }));
    const { surface, workCoordinator } = createActiveReview(QueueType.IncrementalLearning);
    const deps = createDeps({
      activeQueueId: ref('incremental-learning'),
      browserAppService: ref({ ensureQueueReadModelReady }),
      workCoordinator: () => workCoordinator,
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.handleLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: 'final-drill',
      queueType: QueueType.FinalDrill,
      policyId: 'policy-final-drill',
      generation: 10,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 1,
    });
    runtime.handleLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: 'final-drill',
      queueType: QueueType.FinalDrill,
      policyId: 'policy-final-drill',
      generation: 11,
      reason: 'materialized',
      source: 'runtime',
      timestamp: 2,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ensureQueueReadModelReady).not.toHaveBeenCalled();

    surface.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(1);
    expect(ensureQueueReadModelReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.FinalDrill,
      source: 'browser',
    }));
    expect(deps.logger.info).not.toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup deferred during active Review',
      expect.anything(),
    );
    expect(deps.logger.trace).toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup deferred during active Review',
      expect.objectContaining({
        reason: 'live-identity:materialized',
        deferredQueueIds: ['final-drill'],
      }),
    );

    vi.useRealTimers();
  });

  it('defers repairable non-active projection repair until active Review pressure clears', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'refreshing',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      cause: 'projection_stale',
      retryAfterMs: 300,
    }));
    const repairQueueReadModel = vi.fn(async () => true);
    const { surface, workCoordinator } = createActiveReview(QueueType.IncrementalLearning);
    const deps = createDeps({
      activeQueueId: ref('incremental-learning'),
      browserAppService: ref({ ensureQueueReadModelReady, repairQueueReadModel }),
      workCoordinator: () => workCoordinator,
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.handleLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: 'filter-group',
      queueType: QueueType.FilterGroup,
      policyId: null,
      generation: null,
      reason: 'invalidated',
      source: 'runtime',
      timestamp: 1,
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(ensureQueueReadModelReady).not.toHaveBeenCalled();
    expect(repairQueueReadModel).not.toHaveBeenCalled();

    surface.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(1);
    expect(repairQueueReadModel).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('keeps deferred non-active warmup pending without a Review-period timer loop', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'refreshing',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      cause: 'projection_stale',
      retryAfterMs: 300,
    }));
    const repairQueueReadModel = vi.fn(async () => true);
    const { surface, workCoordinator } = createActiveReview(QueueType.RetrievalPractice);
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({ ensureQueueReadModelReady, repairQueueReadModel }),
      workCoordinator: () => workCoordinator,
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(ensureQueueReadModelReady.mock.calls.map((call) => call[0].queueType)).toEqual([
      QueueType.RetrievalPractice,
    ]);
    expect(repairQueueReadModel).toHaveBeenCalledTimes(1);

    surface.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(ensureQueueReadModelReady.mock.calls.map((call) => call[0].queueType)).toEqual([
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FinalDrill,
      QueueType.FilterGroup,
    ]);

    vi.useRealTimers();
  });

  it('warms the active queue first and then every sidebar projection-backed queue on browser open', async () => {
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
    expect(runtime.getStatus('neural-roam')).toBeNull();
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

  it('repairs stale projection-backed queues during warmup and rechecks readiness', async () => {
    vi.useFakeTimers();
    let runtime: ReturnType<typeof createBrowserQueueProjectionWarmupRuntime>;
    const ensureQueueReadModelReady = vi.fn(async (request) => (
      ensureQueueReadModelReady.mock.calls.length === 1
        ? {
          status: 'refreshing',
          queueId: request.queueType,
          policyId: `policy-${request.queueType}`,
          cause: 'projection_stale',
          retryAfterMs: 300,
        }
        : {
          status: 'ready',
          queueId: request.queueType,
          policyId: `policy-${request.queueType}`,
          generation: 9,
        }
    ));
    const repairQueueReadModel = vi.fn(async () => {
      runtime.handleLiveIdentityEvent({
        type: 'queue-projection-live-identity',
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-retrieval-practice',
        generation: 9,
        reason: 'materialized',
        source: 'runtime',
        timestamp: 1,
      });
      return true;
    });
    const onQueueReady = vi.fn();
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({ ensureQueueReadModelReady, repairQueueReadModel }),
      onQueueReady,
    });
    runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0, ['retrieval']);
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect(repairQueueReadModel).toHaveBeenCalledTimes(1);
    expect(repairQueueReadModel).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    }));
    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(2);
    expect(runtime.getStatus('retrieval')).toMatchObject({
      status: 'ready',
      queueId: 'retrieval',
      queueType: QueueType.RetrievalPractice,
      generation: 9,
    });
    expect(onQueueReady).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready',
      queueType: QueueType.RetrievalPractice,
      generation: 9,
    }));
    vi.useRealTimers();
  });

  it('retries queue projection repair failures on the readiness delay', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'refreshing',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      cause: 'projection_stale',
      retryAfterMs: 300,
    }));
    const repairQueueReadModel = vi.fn(async () => {
      throw new Error('STORAGE_VALIDATION_ERROR: browser queue projection repair failed validation');
    });
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({ ensureQueueReadModelReady, repairQueueReadModel }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0, ['retrieval']);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(4);
    expect(repairQueueReadModel).toHaveBeenCalledTimes(4);
    expect(runtime.getStatus('retrieval')).toMatchObject({
      status: 'refreshing',
      cause: 'projection_stale',
    });
    expect(deps.logger.warn).toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup repair failed',
      expect.objectContaining({
        error: expect.stringContaining('STORAGE_VALIDATION_ERROR'),
      }),
    );
    vi.useRealTimers();
  });

  it('skips projection repair when the service repair gate is closed', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'refreshing',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      cause: 'projection_stale',
      retryAfterMs: 300,
    }));
    const repairQueueReadModel = vi.fn(async () => {
      throw new Error('repair failed');
    });
    const canRepairQueueReadModel = vi.fn(() => false);
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({
        ensureQueueReadModelReady,
        repairQueueReadModel,
        canRepairQueueReadModel,
      }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0, ['retrieval']);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(1);
    expect(canRepairQueueReadModel).toHaveBeenCalledTimes(1);
    expect(repairQueueReadModel).not.toHaveBeenCalled();
    expect(deps.logger.warn).not.toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup repair failed',
      expect.anything(),
    );
    expect(runtime.getStatus('retrieval')).toMatchObject({
      status: 'refreshing',
      cause: 'projection_stale',
    });
    vi.useRealTimers();
  });

  it('does not retry storage pressure projection repair failures', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'refreshing',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      cause: 'projection_stale',
      retryAfterMs: 300,
    }));
    const repairQueueReadModel = vi.fn(async () => {
      throw new Error('STORAGE_PRESSURE: sqlite-delta:device-A:seg-1.msgpack: Extra 51 of 52 byte(s) found at buffer[1]');
    });
    const deps = createDeps({
      activeQueueId: ref('retrieval'),
      browserAppService: ref({ ensureQueueReadModelReady, repairQueueReadModel }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0, ['retrieval']);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(ensureQueueReadModelReady).toHaveBeenCalledTimes(1);
    expect(repairQueueReadModel).toHaveBeenCalledTimes(1);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      '[SiYuanMemo][SRSBrowser] Queue projection warmup repair failed',
      expect.objectContaining({
        error: expect.stringContaining('STORAGE_PRESSURE'),
      }),
    );
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

  it('keeps FilterGroup browser warmup outside submitted projection identity', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'refreshing',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      cause: 'materialization_in_progress',
      retryAfterMs: 300,
    }));
    const deps = createDeps({
      activeQueueId: ref('filter-group'),
      browserAppService: ref({ ensureQueueReadModelReady }),
      searchQuery: ref('edited draft filter text'),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0, ['filter-group']);
    await vi.runOnlyPendingTimersAsync();

    expect(ensureQueueReadModelReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.FilterGroup,
      source: 'browser',
      searchText: 'edited draft filter text',
    }));
    expect(ensureQueueReadModelReady.mock.calls[0]?.[0]).not.toHaveProperty('filterHash');
    expect(ensureQueueReadModelReady.mock.calls[0]?.[0]).not.toHaveProperty('manualCardIds');
    expect(ensureQueueReadModelReady.mock.calls[0]?.[0]).not.toHaveProperty('temporaryBlacklistIds');
    expect(ensureQueueReadModelReady.mock.calls[0]?.[0]).not.toHaveProperty('customOrder');
    expect(ensureQueueReadModelReady.mock.calls[0]?.[0]).not.toHaveProperty('commitPolicy');
    vi.useRealTimers();
  });

  it('warms all sidebar projection-backed queues when browser opens without an active queue', async () => {
    vi.useFakeTimers();
    const ensureQueueReadModelReady = vi.fn(async (request) => ({
      status: 'ready',
      queueId: request.queueType,
      policyId: `policy-${request.queueType}`,
      generation: 7,
    }));
    const deps = createDeps({
      activeQueueId: ref(null),
      browserAppService: ref({ ensureQueueReadModelReady }),
    });
    const runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0);
    await vi.runOnlyPendingTimersAsync();

    expect(ensureQueueReadModelReady.mock.calls.map((call) => call[0].queueType)).toEqual([
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FinalDrill,
      QueueType.FilterGroup,
    ]);
    expect(runtime.getStatus('retrieval')).toMatchObject({
      status: 'ready',
      queueType: QueueType.RetrievalPractice,
    });
    expect(runtime.getStatus('neural-roam')).toBeNull();
    vi.useRealTimers();
  });

  it('does not cancel browser-open bounded warmup when a ready queue emits a targeted identity rewarm', async () => {
    vi.useFakeTimers();
    let runtime: ReturnType<typeof createBrowserQueueProjectionWarmupRuntime>;
    let emittedIdentity = false;
    const ensureQueueReadModelReady = vi.fn(async (request) => {
      if (request.queueType === QueueType.RetrievalPractice && !emittedIdentity) {
        emittedIdentity = true;
        runtime.handleLiveIdentityEvent({
          type: 'queue-projection-live-identity',
          queueId: QueueType.RetrievalPractice,
          queueType: QueueType.RetrievalPractice,
          policyId: 'policy-retrieval',
          generation: 7,
          reason: 'refreshed',
          source: 'runtime',
          timestamp: 1,
        });
      }
      return {
        status: 'ready',
        queueId: request.queueType,
        policyId: `policy-${request.queueType}`,
        generation: 7,
      };
    });
    const deps = createDeps({
      browserAppService: ref({ ensureQueueReadModelReady }),
    });
    runtime = createBrowserQueueProjectionWarmupRuntime(deps as never);

    runtime.schedule('browser-open', 0);
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect(ensureQueueReadModelReady.mock.calls.map((call) => call[0].queueType)).toEqual([
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FinalDrill,
      QueueType.FilterGroup,
      QueueType.RetrievalPractice,
    ]);
    expect(runtime.getStatus('retrieval')).toMatchObject({
      status: 'ready',
      queueType: QueueType.RetrievalPractice,
    });
    vi.useRealTimers();
  });
});
