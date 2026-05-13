import { describe, expect, it, vi } from 'vitest';
import { createBrowserQueueViewModule, resolveQueueTypeForBrowserQueueView } from '../BrowserQueueViewModule';
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

  it('bounds refreshing retries and resets them after ready', async () => {
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
        status: 'ready',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 8,
      },
      {
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'materialization_in_progress',
        retryAfterMs: 333,
      },
    ]);
    const module = createBrowserQueueViewModule({
      logger: { info: vi.fn() },
      maxReadinessRetries: 1,
    });
    const request = createRequest();

    const first = await module.prepareQueueView(manager, request);
    const second = await module.prepareQueueView(manager, request);
    const third = await module.prepareQueueView(manager, request);
    const fourth = await module.prepareQueueView(manager, request);

    expect(first).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 111 });
    expect(second).toMatchObject({ status: 'refreshing', keepLoading: false, retryDelayMs: null });
    expect(third.status).toBe('ready');
    expect(fourth).toMatchObject({ status: 'refreshing', keepLoading: true, retryDelayMs: 333 });
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
});
