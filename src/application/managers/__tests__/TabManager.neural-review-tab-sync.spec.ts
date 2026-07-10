import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'siyuan';
import { QueueType } from '@/types/unified-data-source';
import { TabManager } from '../TabManager';

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  createApp: vi.fn(),
  nextMountedVm: null as unknown,
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

function createSiyuanApiMock() {
  return {
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
}

function createManager() {
  const queueStub = {
    getType: vi.fn(() => QueueType.NeuralRoam),
    subscribe: vi.fn(),
    getEngineMode: vi.fn(() => 'orbit'),
    setEngineMode: vi.fn().mockResolvedValue(undefined),
  };
  const unifiedDataSourceManager = {
    getQueue: vi.fn(() => queueStub),
    neuralRoamCommand: vi.fn(async () => ({ ok: true })),
  };
  const context = {
    getI18n: vi.fn(() => ({
      reviewTitle: 'Review',
    })),
    getSettingsService: vi.fn(() => ({
      getSettings: () => ({
        progressiveReading: {
          altXExcerptEnabled: false,
        },
      }),
    })),
    getUnifiedDataSourceManager: vi.fn(() => unifiedDataSourceManager),
    getReviewService: vi.fn(() => ({
      refreshCdfLiveRelationOnOpen: vi.fn(async () => ({
        refreshed: false,
        reason: 'not-live-cdf',
      })),
    })),
    getEventBus: vi.fn(() => ({
      subscribe: vi.fn(),
    })),
    getSchedulerRouter: vi.fn(),
    getReviewAdmissionModule: vi.fn(() => ({
      admitReviewSession: vi.fn(async ({ target }: {
        target: { kind: string; queueType: QueueType; entrySurface: string };
      }) => ({
        queueType: target.queueType,
        entrySurface: target.entrySurface,
        entryTargetIdentity: `${target.kind}:${target.queueType}:${target.entrySurface}`,
        projectionPolicyHash: `${target.queueType}:test-policy`,
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
        admittedAt: 1,
        source: 'ready-projection',
      })),
    })),
  };

  const plugin: Plugin = {
    name: 'test-plugin',
    app: {} as Plugin['app'],
    addTab: vi.fn(),
  } as unknown as Plugin;

  const tabManager = new TabManager(context as never, plugin, { siyuanApi: createSiyuanApiMock() } as never);
  tabManager.registerAll();

  const reviewRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0];
  return {
    tabManager,
    reviewRegistration,
    queueStub,
    unifiedDataSourceManager,
  };
}

function createRuntime(customId: string, queueType: QueueType) {
  const headElement = document.createElement('button');
  const element = document.createElement('div');
  const switchTab = vi.fn();

  return {
    id: customId,
    element,
    data: {
      providerId: 'queue-based',
      title: `Review ${customId}`,
      queueType,
      entryTarget: queueType === QueueType.NeuralRoam
        ? {
            kind: 'neural-roam',
            queueType: QueueType.NeuralRoam,
            entrySurface: 'test:serialized-neural-review-tab',
            launch: {
              startFromFocus: null,
              semanticPinnedSessionId: null,
            },
            admission: { kind: 'not-required' },
          }
        : {
            kind: 'projection-queue',
            queueType: QueueType.RetrievalPractice,
            entrySurface: 'test:serialized-retrieval-review-tab',
            admission: { kind: 'required' },
          },
      headerVariant: queueType === QueueType.NeuralRoam ? 'neural-roam' : 'retrieval-practice',
    },
    tab: {
      id: `tab:${customId}`,
      headElement,
      parent: {
        switchTab,
      },
    },
  };
}

describe('TabManager neural review tab sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(() => mocks.nextMountedVm),
      unmount: vi.fn(),
    }));
    mocks.nextMountedVm = null;
  });

  it('registers a neural review tab runtime on init and unregisters it on destroy', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtime = createRuntime('review-neural-1', QueueType.NeuralRoam);
    const bridge = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
    };

    mocks.nextMountedVm = bridge;
    await reviewRegistration.init.call(runtime);

    expect(tabManager.hasOpenNeuralReviewTab()).toBe(true);

    await expect(
      tabManager.syncExistingNeuralReviewTabToCurrentNode({ fallbackNodeId: 'node-a' }),
    ).resolves.toBe('synced');

    reviewRegistration.destroy.call(runtime);

    expect(tabManager.hasOpenNeuralReviewTab()).toBe(false);

    await expect(
      tabManager.syncExistingNeuralReviewTabToCurrentNode({ fallbackNodeId: 'node-a' }),
    ).resolves.toBe('missing');
  });

  it('targets the most recently active neural review tab and focuses it', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtimeA = createRuntime('review-neural-a', QueueType.NeuralRoam);
    const runtimeB = createRuntime('review-neural-b', QueueType.NeuralRoam);
    const bridgeA = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
    };
    const bridgeB = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
    };

    mocks.nextMountedVm = bridgeA;
    await reviewRegistration.init.call(runtimeA);
    mocks.nextMountedVm = bridgeB;
    await reviewRegistration.init.call(runtimeB);

    runtimeA.tab.headElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await expect(
      tabManager.syncExistingNeuralReviewTabToCurrentNode({ fallbackNodeId: 'node-b' }),
    ).resolves.toBe('synced');

    expect(bridgeA.syncToNeuralQueueCurrentNode).toHaveBeenCalledWith('node-b');
    expect(bridgeB.syncToNeuralQueueCurrentNode).not.toHaveBeenCalled();
    expect(runtimeA.tab.parent.switchTab).toHaveBeenCalledWith(runtimeA.tab.headElement);
    expect(runtimeB.tab.parent.switchTab).not.toHaveBeenCalled();
  });

  it('focuses an existing neural review tab and pins the requested Semantic session', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtime = createRuntime('review-neural-semantic', QueueType.NeuralRoam);
    const bridge = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
      focusSemanticSession: vi.fn().mockResolvedValue(true),
    };

    mocks.nextMountedVm = bridge;
    await reviewRegistration.init.call(runtime);

    await expect(
      tabManager.focusSemanticReviewSession('semantic-session-1', { focus: true }),
    ).resolves.toBe('synced');

    expect(bridge.focusSemanticSession).toHaveBeenCalledWith('semantic-session-1');
    expect(runtime.tab.parent.switchTab).toHaveBeenCalledWith(runtime.tab.headElement);
  });

  it('ignores non-neural review tabs when syncing browser neural jumps', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtime = createRuntime('review-retrieval-1', QueueType.RetrievalPractice);

    mocks.nextMountedVm = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
    };
    await reviewRegistration.init.call(runtime);

    await expect(
      tabManager.syncExistingNeuralReviewTabToCurrentNode({ fallbackNodeId: 'node-c' }),
    ).resolves.toBe('missing');
  });

  it('returns failed when the neural review tab bridge rejects the sync', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtime = createRuntime('review-neural-failed', QueueType.NeuralRoam);
    const bridge = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(false),
    };

    mocks.nextMountedVm = bridge;
    await reviewRegistration.init.call(runtime);

    await expect(
      tabManager.syncExistingNeuralReviewTabToCurrentNode({ fallbackNodeId: 'node-d' }),
    ).resolves.toBe('failed');

    expect(runtime.tab.parent.switchTab).not.toHaveBeenCalled();
  });

  it('resolves the review tab bridge from the mounted component exposed API', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtime = createRuntime('review-neural-exposed', QueueType.NeuralRoam);
    const bridge = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
    };

    mocks.nextMountedVm = {
      $: {
        exposed: bridge,
      },
    };
    await reviewRegistration.init.call(runtime);

    await expect(
      tabManager.syncExistingNeuralReviewTabToCurrentNode({ fallbackNodeId: 'node-exposed' }),
    ).resolves.toBe('synced');

    expect(bridge.syncToNeuralQueueCurrentNode).toHaveBeenCalledWith('node-exposed');
    expect(runtime.tab.parent.switchTab).toHaveBeenCalledWith(runtime.tab.headElement);
  });

  it('reuses the existing neural review tab instead of opening a second tab', async () => {
    const { tabManager, reviewRegistration } = createManager();
    const runtime = createRuntime('review-neural-singleton', QueueType.NeuralRoam);
    const bridge = {
      syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true),
    };

    mocks.nextMountedVm = bridge;
    await reviewRegistration.init.call(runtime);

    tabManager.openReviewTabInNewTab({
      title: '神经漫游',
      queue: { getType: () => QueueType.NeuralRoam },
      entryTarget: {
        kind: 'neural-roam',
        queueType: QueueType.NeuralRoam,
        entrySurface: 'test:open-neural-review-tab',
        launch: {
          startFromFocus: {
            blockId: 'focus-block',
            includeFocusAsFirst: true,
            resetHistory: false,
            startNewSession: true,
          },
          semanticPinnedSessionId: null,
        },
        admission: { kind: 'not-required' },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.openTab).not.toHaveBeenCalled();
    expect(bridge.syncToNeuralQueueCurrentNode).toHaveBeenCalledWith('focus-block');
    expect(runtime.tab.parent.switchTab).toHaveBeenCalledWith(runtime.tab.headElement);
  });

  it('restores temporary NeuralRoam engine mode when the tab closes without manual mode change', async () => {
    const { reviewRegistration, unifiedDataSourceManager } = createManager();
    const runtime = createRuntime('review-neural-temp', QueueType.NeuralRoam);
    runtime.data = {
      ...runtime.data,
      entryTarget: {
        kind: 'neural-roam',
        queueType: QueueType.NeuralRoam,
        entrySurface: 'test:temporary-neural-review-tab',
        launch: {
          startFromFocus: {
            blockId: 'focus-block',
            previousEngineMode: 'hyperspace',
            includeFocusAsFirst: true,
            startNewSession: true,
            entrySessionKind: 'temporary-current-block',
          },
          semanticPinnedSessionId: null,
        },
        admission: { kind: 'not-required' },
      },
    };

    mocks.nextMountedVm = { syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true) };
    await reviewRegistration.init.call(runtime);
    reviewRegistration.destroy.call(runtime);

    expect(unifiedDataSourceManager.neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: {
        type: 'switch-engine-mode',
        mode: 'hyperspace',
        carryCurrentNode: true,
      },
    });
  });

  it('does not restore temporary NeuralRoam engine mode after manual mode change in the tab', async () => {
    const { reviewRegistration, unifiedDataSourceManager } = createManager();
    const runtime = createRuntime('review-neural-temp-touched', QueueType.NeuralRoam);
    runtime.data = {
      ...runtime.data,
      entryTarget: {
        kind: 'neural-roam',
        queueType: QueueType.NeuralRoam,
        entrySurface: 'test:temporary-neural-review-tab',
        launch: {
          startFromFocus: {
            blockId: 'focus-block',
            previousEngineMode: 'hyperspace',
            includeFocusAsFirst: true,
            startNewSession: true,
            entrySessionKind: 'temporary-current-block',
          },
          semanticPinnedSessionId: null,
        },
        admission: { kind: 'not-required' },
      },
    };

    mocks.nextMountedVm = { syncToNeuralQueueCurrentNode: vi.fn().mockResolvedValue(true) };
    await reviewRegistration.init.call(runtime);
    const reviewProps = mocks.createApp.mock.calls.at(-1)?.[1] as {
      onNeuralRoamEngineModeTouched?: () => void;
    };
    reviewProps.onNeuralRoamEngineModeTouched?.();
    reviewRegistration.destroy.call(runtime);

    expect(unifiedDataSourceManager.neuralRoamCommand).not.toHaveBeenCalled();
  });
});
