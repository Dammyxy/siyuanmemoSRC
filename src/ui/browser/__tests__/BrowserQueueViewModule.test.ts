import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserQueueViewModule,
  planQueueProjectionLiveIdentityForBrowserQueueView,
  resolveQueueTypeForBrowserQueueView,
} from '../BrowserQueueViewModule';
import { QueueType } from '@/types/unified-data-source';

function createManager(readinessResults: unknown[]) {
  return {
    getQueue: vi.fn(() => ({
      getConceptBlocks: vi.fn(() => []),
    })),
    ensureQueueProjectionReady: vi.fn(async () => readinessResults.shift() ?? {
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 1,
    }),
  } as any;
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    activeDocId: null,
    activeQueueId: 'retrieval',
    activeScopeDocIds: null,
    browserAppService: { getSiyuanApi: vi.fn(() => ({})) } as any,
    cardType: 'all' as any,
    currentPreset: 'all' as any,
    currentQueueType: QueueType.RetrievalPractice,
    forceRefresh: false,
    plugin: {},
    searchText: '',
    ...overrides,
  };
}

describe('BrowserQueueViewModule', () => {
  it('resolves browser queue ids to active queue types', () => {
    expect(resolveQueueTypeForBrowserQueueView('retrieval', '')).toBe(QueueType.RetrievalPractice);
    expect(resolveQueueTypeForBrowserQueueView('retrieval-practice', '')).toBe(QueueType.RetrievalPractice);
    expect(resolveQueueTypeForBrowserQueueView('incremental-learning', '')).toBe(QueueType.IncrementalLearning);
    expect(resolveQueueTypeForBrowserQueueView('neural', '')).toBe(QueueType.NeuralRoam);
    expect(resolveQueueTypeForBrowserQueueView('unknown', QueueType.FinalDrill)).toBeNull();
    expect(resolveQueueTypeForBrowserQueueView('', QueueType.FinalDrill)).toBeNull();
  });

  it('returns a datasource only after readiness is ready', async () => {
    const manager = createManager([{
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 7,
    }]);
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });

    const result = await module.prepareQueueView(manager, createRequest());

    expect(manager.ensureQueueProjectionReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    }));
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('retrieval');
    expect(result.status === 'ready' ? result.projectionIdentity : null).toEqual({
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 7,
    });
  });

  it('normalizes queue aliases before readiness and datasource creation', async () => {
    const manager = createManager([{
      status: 'ready',
      queueId: QueueType.NeuralRoam,
      policyId: 'policy-neural',
      generation: 1,
    }]);
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });

    const result = await module.prepareQueueView(manager, createRequest({
      activeQueueId: 'neural',
      currentQueueType: '',
    }));

    expect(manager.ensureQueueProjectionReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.NeuralRoam,
    }));
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('neural-roam');
  });

  it('keeps non-neural queue refreshing alive until it becomes ready', async () => {
    const manager = createManager([
      {
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'materialization_in_progress',
        retryAfterMs: 111,
      },
      {
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'materialization_in_progress',
        retryAfterMs: 222,
      },
      {
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'materialization_in_progress',
        retryAfterMs: 333,
      },
      {
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 8,
      },
    ]);
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });
    const request = createRequest();

    const first = await module.prepareQueueView(manager, request);
    const second = await module.prepareQueueView(manager, request);
    const third = await module.prepareQueueView(manager, request);
    const fourth = await module.prepareQueueView(manager, request);

    expect(first).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 111 });
    expect(second).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 222 });
    expect(third).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 333 });
    expect(fourth.status).toBe('ready');
  });

  it('keeps neural-roam refreshing alive until it becomes ready', async () => {
    const manager = createManager([
      {
        status: 'refreshing',
        queueId: QueueType.NeuralRoam,
        policyId: 'policy-neural',
        cause: 'materialization_in_progress',
        retryAfterMs: 111,
      },
      {
        status: 'refreshing',
        queueId: QueueType.NeuralRoam,
        policyId: 'policy-neural',
        cause: 'materialization_in_progress',
        retryAfterMs: 222,
      },
      {
        status: 'refreshing',
        queueId: QueueType.NeuralRoam,
        policyId: 'policy-neural',
        cause: 'materialization_in_progress',
        retryAfterMs: 333,
      },
      {
        status: 'ready',
        queueId: QueueType.NeuralRoam,
        policyId: 'policy-neural',
        generation: 9,
      },
    ]);
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });
    const request = createRequest({
      activeQueueId: 'neural-roam',
      currentQueueType: QueueType.NeuralRoam,
    });

    const first = await module.prepareQueueView(manager, request);
    const second = await module.prepareQueueView(manager, request);
    const third = await module.prepareQueueView(manager, request);
    const fourth = await module.prepareQueueView(manager, request);

    expect(first).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 111 });
    expect(second).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 222 });
    expect(third).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 333 });
    expect(fourth.status).toBe('ready');
  });

  it('maps unavailable readiness to an explicit queue view error', async () => {
    const manager = createManager([{
      status: 'unavailable',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      cause: 'backend_unavailable',
      recoverable: true,
      reason: 'backend down',
    }]);
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });

    const result = await module.prepareQueueView(manager, createRequest());

    expect(result).toEqual({
      status: 'unavailable',
      message: 'Queue projection backend is unavailable',
    });
  });

  it('plans live identity reattach only for newer visible matching queue events', () => {
    const currentProjectionIdentity = {
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 2,
    };
    const event = {
      type: 'queue-projection-live-identity' as const,
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 3,
      reason: 'refreshed' as const,
      source: 'runtime' as const,
      timestamp: 1,
    };

    expect(planQueueProjectionLiveIdentityForBrowserQueueView({
      activeQueueId: 'retrieval',
      currentQueueType: QueueType.RetrievalPractice,
      currentProjectionIdentity,
      event,
      visible: true,
    })).toEqual({
      action: 'reattach',
      identity: {
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 3,
      },
    });

    expect(planQueueProjectionLiveIdentityForBrowserQueueView({
      activeQueueId: 'retrieval',
      currentQueueType: QueueType.RetrievalPractice,
      currentProjectionIdentity,
      event: { ...event, generation: 2 },
      visible: true,
    })).toEqual({ action: 'ignore', reason: 'not-newer' });
    expect(planQueueProjectionLiveIdentityForBrowserQueueView({
      activeQueueId: null,
      currentQueueType: '',
      currentProjectionIdentity,
      event,
      visible: false,
    })).toEqual({ action: 'ignore', reason: 'hidden-browser-mode' });
  });

  it('plans invalidation events as bounded readiness rechecks', () => {
    expect(planQueueProjectionLiveIdentityForBrowserQueueView({
      activeQueueId: 'retrieval',
      currentQueueType: QueueType.RetrievalPractice,
      currentProjectionIdentity: {
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 2,
      },
      event: {
        type: 'queue-projection-live-identity',
        queueId: QueueType.RetrievalPractice,
        queueType: QueueType.RetrievalPractice,
        policyId: null,
        generation: null,
        reason: 'invalidated',
        source: 'runtime',
        timestamp: 1,
      },
      visible: true,
    })).toEqual({ action: 'recheck', reason: 'identity-invalidated' });
  });
});
