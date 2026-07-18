import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { TabManager } from './TabManager';
import { ReviewProjectionWorkCoordinator } from '@/application/services/ReviewProjectionWorkCoordinator';

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  createApp: vi.fn(() => ({
    mount: vi.fn(),
    unmount: vi.fn(),
  })),
  unifiedQueueStrategy: vi.fn().mockImplementation(() => ({
    restoreSessionSnapshot: vi.fn(),
    startNeuralRoamFromFocusOnNextAdvance: vi.fn(),
  })),
  unifiedReviewAdapter: vi.fn().mockImplementation((options) => ({ options })),
}));

vi.mock('siyuan', () => ({
  openTab: mocks.openTab,
  Constants: {
    SIYUAN_OPEN_WINDOW: 'siyuan-open-window',
    SIYUAN_VERSION: '3.1.0',
  },
}));

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    createApp: mocks.createApp,
  };
});

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

vi.mock('@/application/adapters/UnifiedQueueStrategy', () => ({
  UnifiedQueueStrategy: mocks.unifiedQueueStrategy,
}));

vi.mock('@/application/adapters/UnifiedReviewAdapter', () => ({
  UnifiedReviewAdapter: mocks.unifiedReviewAdapter,
}));

function createSiyuanApiMock() {
  return {
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
}

function createManager() {
  const reviewProjectionWorkCoordinator = new ReviewProjectionWorkCoordinator({
    info: vi.fn(),
    warn: vi.fn(),
  });
  const refreshCdfLiveRelationOnOpen = vi.fn(async () => ({
    attempted: true,
    card: null,
    updatedCard: null,
    actions: [],
    derivedRelationCount: 0,
    currentReviewDuplicateOutcome: null,
    reason: 'unchanged' as const,
  }));
  const context = {
    getI18n: vi.fn(() => ({
      srsBrowser: 'SRS Browser',
      reviewTitle: 'Review',
      openFailed: 'Open failed',
    })),
    getReviewQueuePreparationService: vi.fn(() => undefined),
    getUnifiedDataSourceManager: vi.fn(() => ({
      getQueue: vi.fn(),
    })),
    getEventBus: vi.fn(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    getSchedulerRouter: vi.fn(() => ({})),
    getSettingsService: vi.fn(() => ({
      getSettings: () => ({
        progressiveReading: {},
      }),
    })),
    getReviewService: vi.fn(() => ({
      refreshCdfLiveRelationOnOpen,
    })),
    getReviewAdmissionModule: vi.fn(() => ({
      admitReviewSession: vi.fn(async ({ target }: any) => ({
        queueType: target.queueType,
        entrySurface: target.entrySurface,
        entryTargetIdentity: `projection-queue:${target.queueType}:${target.entrySurface}`,
        projectionPolicyHash: 'test-policy',
        projectionGeneration: 1,
        readinessRequest: {
          queueType: target.queueType,
          preset: 'all',
          searchText: null,
          docId: null,
          scopeDocIds: [],
          cardType: 'all',
          source: 'browser',
        },
        admittedAt: Date.now(),
        source: 'ready-projection',
      })),
    })),
    getReviewProjectionWorkCoordinator: vi.fn(() => reviewProjectionWorkCoordinator),
  } as any;

  const plugin = {
    name: 'test-plugin',
    app: {} as any,
    addTab: vi.fn(),
  } as any;

  return {
    tabManager: new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never),
    plugin,
    refreshCdfLiveRelationOnOpen,
    reviewProjectionWorkCoordinator,
  };
}

function createReviewOptions(position?: 'right' | 'bottom') {
  return {
    title: 'Review',
    queue: {
      getType: () => QueueType.RetrievalPractice,
    },
    ...(position ? { position } : {}),
  };
}

describe('TabManager browser and review tab wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { require?: unknown }).require;
  });

  it('registers browser and review tabs once', () => {
    const { tabManager, plugin } = createManager();

    tabManager.registerAll();
    tabManager.registerAll();

    expect(plugin.addTab).toHaveBeenCalledTimes(2);
    expect((plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[0][0].type).toBe('test-plugin-browser');
    expect((plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0].type).toBe('test-plugin-review');
  });

  it('opens a browser tab with an empty initial state by default', () => {
    const { tabManager, plugin } = createManager();

    const opened = tabManager.openBrowserTab();

    expect(opened).toBe(true);
    expect(mocks.openTab).toHaveBeenCalledWith({
      app: plugin.app,
      custom: {
        icon: 'iconCard',
        title: 'SRS Browser',
        id: 'test-plugintest-plugin-browser',
        data: {
          initialState: null,
        },
      },
      position: 'right',
    });
  });

  it('hydrates the browser tab component with serialized initial state on init', async () => {
    const { tabManager, plugin } = createManager();
    tabManager.registerAll();

    const browserRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const runtime = {
      element: document.createElement('div'),
      data: {
        initialState: {
          queueId: 'neural-roam',
          neuralSubview: 'roam-history',
        },
      },
    };

    await browserRegistration.init.call(runtime);

    expect(mocks.createApp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mode: 'tab',
        initialOpenState: {
          queueId: 'neural-roam',
          neuralSubview: 'roam-history',
        },
      }),
    );
  });

  it('opens review tabs with distinct new-tab and split semantics', async () => {
    const { tabManager, plugin } = createManager();

    tabManager.openReviewTabInNewTab(createReviewOptions());
    tabManager.openReviewTab(createReviewOptions('right'));
    tabManager.openReviewTab(createReviewOptions('bottom'));
    tabManager.openReviewInNewWindow(createReviewOptions('right'));
    await vi.waitFor(() => expect(mocks.openTab).toHaveBeenCalledTimes(4));

    const [newTabCall, rightSplitCall, bottomSplitCall, fallbackCall] = mocks.openTab.mock.calls.map(([payload]) => payload);
    expect(newTabCall).toMatchObject({
      app: plugin.app,
      custom: expect.objectContaining({
        title: 'Review',
        id: 'test-plugintest-plugin-review',
      }),
      keepCursor: false,
      removeCurrentTab: false,
    });
    expect(newTabCall).not.toHaveProperty('position');
    expect(rightSplitCall).toMatchObject({
      position: 'right',
    });
    expect(bottomSplitCall).toMatchObject({
      position: 'bottom',
    });
    expect(fallbackCall).not.toHaveProperty('position');
  });

  it('injects Review-open CDF live relation refresh into restored review tabs', async () => {
    const { tabManager, plugin, refreshCdfLiveRelationOnOpen } = createManager();
    tabManager.registerAll();

    const reviewRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const runtime = {
      id: 'review-runtime-1',
      element: document.createElement('div'),
      data: {
        providerId: 'retrieval',
        title: 'Review',
        queueType: QueueType.RetrievalPractice,
        headerVariant: 'retrieval-practice',
      },
      tab: {
        id: 'review-runtime-1',
        headElement: document.createElement('button'),
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    await reviewRegistration.init.call(runtime);

    const refresher = mocks.unifiedQueueStrategy.mock.calls[0]?.[4];
    await expect(refresher.refreshCdfLiveRelationOnOpen('card-1')).resolves.toMatchObject({
      reason: 'unchanged',
    });
    expect(refreshCdfLiveRelationOnOpen).toHaveBeenCalledWith('card-1');
    expect(mocks.createApp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mode: 'tab',
        queue: expect.anything(),
      }),
    );
  });

  it('publishes Review tab registration, activity, and destroy transitions', async () => {
    const { tabManager, plugin, reviewProjectionWorkCoordinator } = createManager();
    tabManager.registerAll();
    const reviewRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const createRuntime = (id: string, queueType: QueueType) => ({
      id,
      element: document.createElement('div'),
      data: {
        providerId: queueType,
        title: id,
        queueType,
        headerVariant: queueType,
      },
      tab: {
        id,
        headElement: document.createElement('button'),
        parent: { switchTab: vi.fn() },
      },
    });
    const retrieval = createRuntime('review-retrieval', QueueType.RetrievalPractice);
    const incremental = createRuntime('review-incremental', QueueType.IncrementalLearning);

    await reviewRegistration.init.call(retrieval);
    await reviewRegistration.init.call(incremental);
    expect(reviewProjectionWorkCoordinator.getSnapshot()).toMatchObject({
      activeQueueType: QueueType.IncrementalLearning,
      surfaceId: 'review-incremental',
    });

    retrieval.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(reviewProjectionWorkCoordinator.getSnapshot()).toMatchObject({
      activeQueueType: QueueType.RetrievalPractice,
      surfaceId: 'review-retrieval',
    });

    reviewRegistration.destroy.call(retrieval);
    expect(reviewProjectionWorkCoordinator.getSnapshot().activeQueueType).toBe(QueueType.IncrementalLearning);
    reviewRegistration.destroy.call(incremental);
    expect(reviewProjectionWorkCoordinator.getSnapshot().active).toBe(false);
  });

  it('returns false when openTab throws', () => {
    const { tabManager } = createManager();
    mocks.openTab.mockImplementationOnce(() => {
      throw new Error('open failed');
    });

    const opened = tabManager.openBrowserTab();

    expect(opened).toBe(false);
  });
});
