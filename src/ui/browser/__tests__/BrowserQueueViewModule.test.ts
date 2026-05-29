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
    browserAppService: {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
      })),
    } as any,
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

  it('attaches a datasource without a synchronous Browser queue read model gate', async () => {
    const manager = createManager([{
      status: 'unavailable',
      queueId: QueueType.RetrievalPractice,
      policyId: 'review-projection',
      cause: 'backend_unavailable',
      recoverable: true,
      reason: 'review projection down',
    }]);
    const browserAppService = {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn(async () => ({
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
      })),
    };
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });

    const result = await module.prepareQueueView(manager, createRequest({ browserAppService }));

    expect(browserAppService.ensureQueueReadModelReady).not.toHaveBeenCalled();
    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('retrieval');
    expect(result.status === 'ready' ? result.projectionIdentity : null).toBeNull();
  });

  it('normalizes neural aliases without gating the datasource on projection readiness', async () => {
    const manager = createManager([{
      status: 'refreshing',
      queueId: QueueType.NeuralRoam,
      policyId: 'policy-neural',
      cause: 'materialization_in_progress',
      retryAfterMs: 111,
    }]);
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });

    const result = await module.prepareQueueView(manager, createRequest({
      activeQueueId: 'neural',
      currentQueueType: '',
    }));

    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('neural-roam');
    expect(result.status === 'ready' ? result.projectionIdentity : null).toBeNull();
  });

  it('attaches a datasource without waiting for Browser queue read model readiness', async () => {
    const manager = createManager([]);
    const browserAppService = {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn(async () => ({
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        cause: 'materialization_in_progress',
        retryAfterMs: 222,
      })),
    };
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });
    const request = createRequest({ browserAppService });

    const first = await module.prepareQueueView(manager, request);
    expect(browserAppService.ensureQueueReadModelReady).not.toHaveBeenCalled();
    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(first.status).toBe('ready');
    expect(first.status === 'ready' ? first.datasource.id : null).toBe('retrieval');
  });

  it('loads neural-roam browser view even when projection readiness would still be refreshing', async () => {
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

    const result = await module.prepareQueueView(manager, request);

    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('neural-roam');
    expect(result.status === 'ready' ? result.projectionIdentity : null).toBeNull();
  });

  it('does not use Browser queue read model availability as a synchronous open gate', async () => {
    const manager = createManager([]);
    const browserAppService = {
      getSiyuanApi: vi.fn(() => ({})),
      ensureQueueReadModelReady: vi.fn(async () => ({
        status: 'unavailable',
        queueId: QueueType.RetrievalPractice,
        cause: 'backend_unavailable',
        reason: 'backend down',
        recoverable: true,
      })),
    };
    const module = createBrowserQueueViewModule({ logger: { info: vi.fn() } });

    const result = await module.prepareQueueView(manager, createRequest({ browserAppService }));

    expect(browserAppService.ensureQueueReadModelReady).not.toHaveBeenCalled();
    expect(manager.ensureQueueProjectionReady).not.toHaveBeenCalled();
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('retrieval');
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
