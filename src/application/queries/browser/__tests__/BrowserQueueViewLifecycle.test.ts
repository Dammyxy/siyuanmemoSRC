import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserQueueViewLifecycle,
  planQueueProjectionLiveIdentityForBrowserQueueView,
  resolveQueueTypeForBrowserQueueView,
} from '../BrowserQueueViewLifecycle';
import { QueueType } from '@/types/unified-data-source';
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';

function createDatasource(id = 'retrieval'): ICardDataSource {
  return {
    id,
    label: id,
    fetchRows: vi.fn(async () => ({ rows: [], totalCount: 0 })),
    getSupportedActions: vi.fn(() => []),
    performAction: vi.fn(async () => undefined),
  };
}

function createLifecycle(readiness: unknown[] = []) {
  const createDataSource = vi.fn(() => createDatasource());
  const browserAppService = {
    ensureQueueReadModelReady: vi.fn(async () => readiness.shift() ?? {
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 1,
    }),
  };
  const lifecycle = createBrowserQueueViewLifecycle({
    createDataSource,
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  });
  return { browserAppService, createDataSource, lifecycle };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    activeDocId: null,
    activeQueueId: 'retrieval',
    activeScopeDocIds: null,
    browserAppService: null,
    cardType: 'all' as const,
    currentPreset: 'all' as const,
    currentQueueType: QueueType.RetrievalPractice,
    forceRefresh: false,
    manager: { getQueue: vi.fn() } as any,
    plugin: {},
    searchText: '',
    ...overrides,
  };
}

describe('BrowserQueueViewLifecycle', () => {
  it('resolves browser queue ids to active queue types', () => {
    expect(resolveQueueTypeForBrowserQueueView('retrieval', '')).toBe(QueueType.RetrievalPractice);
    expect(resolveQueueTypeForBrowserQueueView('retrieval-practice', '')).toBe(QueueType.RetrievalPractice);
    expect(resolveQueueTypeForBrowserQueueView('incremental-learning', '')).toBe(QueueType.IncrementalLearning);
    expect(resolveQueueTypeForBrowserQueueView('neural', '')).toBe(QueueType.NeuralRoam);
    expect(resolveQueueTypeForBrowserQueueView('unknown', QueueType.FinalDrill)).toBeNull();
    expect(resolveQueueTypeForBrowserQueueView('', QueueType.FinalDrill)).toBeNull();
  });

  it('attaches ready queue datasource with projection identity behind lifecycle', async () => {
    const { browserAppService, createDataSource, lifecycle } = createLifecycle([{
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 3,
    }]);

    const result = await lifecycle.prepareQueueView(createRequest({ browserAppService }));

    expect(browserAppService.ensureQueueReadModelReady).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    }));
    expect(createDataSource).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.datasource.id : null).toBe('retrieval');
    expect(result.status === 'ready' ? result.projectionIdentity : null).toEqual({
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 3,
    });
  });

  it('calls readiness through the BrowserApplicationService instance so method context is preserved', async () => {
    const createDataSource = vi.fn(() => createDatasource());
    const lifecycle = createBrowserQueueViewLifecycle({
      createDataSource,
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    });
    const service = {
      unifiedDataSourceManager: { ready: true },
      async ensureQueueReadModelReady(request: { queueType: QueueType }) {
        if (!this.unifiedDataSourceManager.ready) {
          throw new Error('lost browser application service context');
        }
        return {
          status: 'ready' as const,
          queueId: request.queueType,
          policyId: 'policy-bound-service',
          generation: 9,
        };
      },
    };

    const result = await lifecycle.prepareQueueView(createRequest({ browserAppService: service }));

    expect(result.status).toBe('ready');
    expect(createDataSource).toHaveBeenCalledTimes(1);
    expect(result.status === 'ready' ? result.projectionIdentity : null).toEqual({
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-bound-service',
      generation: 9,
    });
  });

  it.each([
    ['preparing', { status: 'refreshing', cause: 'materialization_in_progress', retryAfterMs: 111 }],
    ['repair-required', { status: 'refreshing', cause: 'projection_stale', retryAfterMs: 222 }],
    ['unavailable', { status: 'unavailable', cause: 'backend_unavailable', reason: 'backend down', recoverable: true }],
  ] as const)('reports %s readiness without creating local fallback datasource', async (expectedStatus, readiness) => {
    const { browserAppService, createDataSource, lifecycle } = createLifecycle([{
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      ...readiness,
    }]);

    const result = await lifecycle.prepareQueueView(createRequest({ browserAppService }));

    expect(result.status).toBe(expectedStatus);
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('rejects older queue prepare result after newer queue selection wins', async () => {
    let resolveOld!: (value: any) => void;
    const oldReadiness = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const { browserAppService, lifecycle } = createLifecycle([]);
    browserAppService.ensureQueueReadModelReady
      .mockReturnValueOnce(oldReadiness as never)
      .mockResolvedValueOnce({
        status: 'ready',
        queueId: QueueType.IncrementalLearning,
        policyId: 'policy-b',
        generation: 7,
      } as never);

    const oldResult = lifecycle.prepareQueueView(createRequest({ browserAppService, activeQueueId: 'retrieval' }));
    const nextResult = await lifecycle.prepareQueueView(createRequest({
      activeQueueId: 'incremental-learning',
      browserAppService,
      currentQueueType: QueueType.IncrementalLearning,
    }));
    resolveOld({
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 1,
    });

    expect(nextResult.status).toBe('ready');
    await expect(oldResult).resolves.toMatchObject({
      status: 'stale',
      queueId: 'retrieval',
    });
  });

  it('uses lifecycle metadata token to reject stale async supplements', () => {
    const { lifecycle } = createLifecycle();
    const token = lifecycle.captureAsyncReadToken();
    lifecycle.acceptReadModelSnapshotMetadata({
      queryFingerprint: 'queue-a',
      generation: 1,
      readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
    });

    expect(lifecycle.isAsyncReadTokenCurrent(token)).toBe(false);

    const current = lifecycle.captureAsyncReadToken();
    expect(lifecycle.isAsyncReadTokenCurrent(current)).toBe(true);
    lifecycle.advanceDatasourceVersion();
    expect(lifecycle.isAsyncReadTokenCurrent(current)).toBe(false);
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
