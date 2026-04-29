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

vi.mock('vue', () => ({
  createApp: mocks.createApp,
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

vi.mock('@/ui/ai/AiWorkbenchPane.vue', () => ({
  default: {},
}));

function createRegistryStub() {
  const sessionService = {
    state: {
      activeView: 'explain',
    },
  };

  return {
    openReviewSession: vi.fn(async () => sessionService),
    getOrCreateReviewSession: vi.fn(() => sessionService),
    disposeReviewSession: vi.fn(),
  };
}

function createContext(registry = createRegistryStub()) {
  const queueStub = {
    getType: vi.fn(() => QueueType.RetrievalPractice),
    subscribe: vi.fn(),
  };

  return {
    registry,
    context: {
      getI18n: vi.fn(() => ({
        reviewTitle: 'Review',
        aiWorkbench: 'AI Workbench',
      })),
      getUnifiedDataSourceManager: vi.fn(() => ({
        getQueue: vi.fn(() => queueStub),
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
      getReviewAIWorkbenchRegistry: vi.fn(() => registry),
    },
  };
}

function createPlugin(): Plugin {
  return {
    name: 'test-plugin',
    app: {} as Plugin['app'],
    addTab: vi.fn(),
  } as unknown as Plugin;
}

function createSiyuanApiMock() {
  return {
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
}

function createCompanionRuntime(sourceReviewSessionId: string) {
  const headElement = document.createElement('button');
  const element = document.createElement('div');
  const switchTab = vi.fn();

  return {
    id: `runtime-${sourceReviewSessionId}`,
    element,
    data: {
      reviewSessionId: sourceReviewSessionId,
      sourceReviewSessionId,
      title: `AI Explain · ${sourceReviewSessionId}`,
    },
    tab: {
      id: `ai-tab:${sourceReviewSessionId}`,
      headElement,
      parent: {
        switchTab,
      },
      close: vi.fn(),
    },
  };
}

function createReviewRuntime(customId: string) {
  return {
    id: customId,
    element: document.createElement('div'),
    data: {
      providerId: 'retrieval',
      title: `Review ${customId}`,
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
    },
    tab: {
      id: customId,
      headElement: document.createElement('button'),
      parent: {
        switchTab: vi.fn(),
      },
    },
  };
}

describe('TabManager review AI companion tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nextMountedVm = null;
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(() => mocks.nextMountedVm),
      unmount: vi.fn(),
    }));
  });

  it('opens a companion tab once and focuses the existing runtime on repeat opens', async () => {
    const { context, registry } = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewAiRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[2][0];

    await tabManager.openReviewAICompanionTab({
      sessionId: 'review-tab-1',
      title: 'AI Explain · Neural',
      view: 'explain',
    });

    expect(registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'review-tab-1',
      surface: 'review-tab-companion',
      sourceReviewSessionId: 'review-tab-1',
      view: 'explain',
    }));
    expect(mocks.openTab).toHaveBeenCalledTimes(1);
    expect(mocks.openTab).toHaveBeenLastCalledWith(expect.objectContaining({
      position: 'right',
      custom: expect.objectContaining({
        title: 'AI Explain · Neural',
      }),
    }));

    const companionRuntime = createCompanionRuntime('review-tab-1');
    reviewAiRegistration.init.call(companionRuntime);

    await tabManager.openReviewAICompanionTab({
      sessionId: 'review-tab-1',
      title: 'AI Explain · Neural',
      view: 'explain',
    });

    expect(registry.openReviewSession).toHaveBeenCalledTimes(2);
    expect(mocks.openTab).toHaveBeenCalledTimes(1);
    expect(companionRuntime.tab.parent.switchTab).toHaveBeenCalledWith(companionRuntime.tab.headElement);
  });

  it('closes the bound companion tab and disposes the review AI session when the review tab is destroyed', () => {
    const { context, registry } = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const reviewAiRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[2][0];

    const reviewRuntime = createReviewRuntime('review-tab-2');
    const companionRuntime = createCompanionRuntime('review-tab-2');

    reviewRegistration.init.call(reviewRuntime);
    reviewAiRegistration.init.call(companionRuntime);

    reviewRegistration.destroy.call(reviewRuntime);

    expect(companionRuntime.tab.close).toHaveBeenCalledTimes(1);
    expect(registry.disposeReviewSession).toHaveBeenCalledWith('review-tab-2');
    expect(tabManager.focusReviewAICompanionTab('review-tab-2')).toBe(false);
  });
});
