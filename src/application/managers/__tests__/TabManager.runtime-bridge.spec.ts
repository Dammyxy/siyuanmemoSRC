import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'siyuan';
import { QueueType } from '@/types/unified-data-source';
import { TabManager, type TabRuntimeContext } from '../TabManager';

const mocks = vi.hoisted(() => ({
  createApp: vi.fn(),
  openTab: vi.fn(),
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

vi.mock('@/ui/ai/AiWorkbenchPane.vue', () => ({
  default: {},
}));

function createContext() {
  const queueStub = {
    getType: vi.fn(() => QueueType.RetrievalPractice),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const reviewAIRegistry = {
    getOrCreateReviewSession: vi.fn(() => ({ state: { activeView: 'explain' } })),
    disposeReviewSession: vi.fn(),
  };

  return {
    reviewAIRegistry,
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
      getReviewService: vi.fn(() => ({
        refreshCdfLiveRelationOnOpen: vi.fn(async () => ({
          refreshed: false,
          reason: 'not-live-cdf',
        })),
      })),
      getReviewAIWorkbenchRegistry: vi.fn(() => reviewAIRegistry),
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

type TestTabRuntime = TabRuntimeContext & {
  id: string;
  element: HTMLDivElement;
  data: Record<string, unknown>;
  tab: {
    id: string;
    headElement: HTMLButtonElement;
    parent: {
      switchTab: ReturnType<typeof vi.fn>;
    };
  };
};

function createRuntime(id: string, data: Record<string, unknown> = {}): TestTabRuntime {
  return {
    id,
    element: document.createElement('div'),
    data,
    tab: {
      id,
      headElement: document.createElement('button'),
      parent: {
        switchTab: vi.fn(),
      },
    },
  } as TestTabRuntime;
}

function createMountedApp(vm: unknown = {}) {
  return {
    mount: vi.fn(() => vm),
    unmount: vi.fn(),
  };
}

describe('TabManager custom tab runtime bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApp.mockImplementation(() => createMountedApp());
  });

  it('wires Browser, Review, and Review AI lifecycle callbacks through the custom tab runtime', async () => {
    vi.useFakeTimers();
    const refreshTabSurface = vi.fn(async () => true);
    const reviewVm = {
      syncToNeuralQueueCurrentNode: vi.fn(async () => true),
      refreshTabSurface,
    };
    const mountedApps = [
      createMountedApp(),
      createMountedApp(reviewVm),
      createMountedApp(),
    ];
    mocks.createApp.mockImplementation(() => mountedApps.shift() ?? createMountedApp());
    const { context, reviewAIRegistry } = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin, {
      siyuanApi: {
        pushErrMsg: vi.fn(),
      },
    } as never);

    tabManager.registerAll();

    const [browserRegistration, reviewRegistration, reviewAIRegistration] = (
      plugin.addTab as ReturnType<typeof vi.fn>
    ).mock.calls.map(([registration]) => registration);
    const browserRuntime = createRuntime('browser-tab', {
      initialState: { queueType: QueueType.RetrievalPractice },
    });
    const reviewRuntime = createRuntime('review-tab', {
      providerId: 'retrieval',
      title: 'Review',
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
      reviewState: {
        version: 1,
        showAnswer: false,
        currentCardId: 'card-1',
      },
    });
    const reviewAIRuntime = createRuntime('review-ai-tab', {
      reviewSessionId: 'review-tab',
      sourceReviewSessionId: 'review-tab',
      title: 'AI Explain',
    });

    await browserRegistration.init.call(browserRuntime);
    await reviewRegistration.init.call(reviewRuntime);
    await reviewAIRegistration.init.call(reviewAIRuntime);

    expect(browserRuntime.vueApp).toBeDefined();
    expect(reviewRuntime.vueApp).toBeDefined();
    expect(reviewAIRuntime.vueApp).toBeDefined();
    expect(reviewAIRegistry.getOrCreateReviewSession).toHaveBeenCalledWith('review-tab', {
      surface: 'review-tab-companion',
      sourceReviewSessionId: 'review-tab',
    });

    reviewRegistration.resize.call(reviewRuntime);
    reviewRegistration.update.call(reviewRuntime);
    await vi.runAllTimersAsync();

    expect(refreshTabSurface).toHaveBeenCalledTimes(1);
    expect(refreshTabSurface).toHaveBeenCalledWith('card-1');

    browserRegistration.destroy.call(browserRuntime);
    reviewRegistration.destroy.call(reviewRuntime);
    reviewAIRegistration.destroy.call(reviewAIRuntime);

    expect(browserRuntime.vueApp).toBeUndefined();
    expect(reviewRuntime.vueApp).toBeUndefined();
    expect(reviewAIRuntime.vueApp).toBeUndefined();
    expect(reviewAIRegistry.disposeReviewSession).toHaveBeenCalledWith('review-tab');
    vi.useRealTimers();
  });

  it('keeps the custom tab runtime bridge out of repeated callback double casts', () => {
    const source = readFileSync(resolve(__dirname, '../TabManager.ts'), 'utf8');

    expect(source).not.toContain('this as unknown as TabRuntimeContext');
  });
});
