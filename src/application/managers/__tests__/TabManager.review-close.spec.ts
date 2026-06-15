import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'siyuan';
import { QueueType } from '@/types/unified-data-source';
import { TabManager } from '../TabManager';

const mocks = vi.hoisted(() => ({
  createApp: vi.fn(),
}));

vi.mock('siyuan', () => ({
  openTab: vi.fn(),
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

function createContext() {
  const queueStub = {
    getType: vi.fn(() => QueueType.RetrievalPractice),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  return {
    context: {
      getI18n: vi.fn(() => ({
        reviewTitle: 'Review',
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
      getSrsBackendClient: vi.fn(() => ({
        requestReviewTruthFlush: vi.fn(),
      })),
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

function createReviewRuntime(customId: string, options?: {
  close?: ReturnType<typeof vi.fn>;
  removeTab?: ReturnType<typeof vi.fn>;
}) {
  return {
    id: customId,
    element: document.createElement('div'),
    data: {
      providerId: 'retrieval',
      title: '提取练习',
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
    },
    tab: {
      id: customId,
      headElement: document.createElement('button'),
      parent: {
        switchTab: vi.fn(),
        removeTab: options?.removeTab,
      },
      close: options?.close,
    },
  };
}

describe('TabManager closeReviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(() => ({})),
      unmount: vi.fn(),
    }));
  });

  it('closes the review tab through tab.close when available', async () => {
    const { context } = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const close = vi.fn();
    await reviewRegistration.init.call(createReviewRuntime('review-tab-1', { close }));

    tabManager.closeReviewTab('review-tab-1');

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('falls back to parent.removeTab when tab.close is unavailable', async () => {
    const { context } = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = (plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0];
    const removeTab = vi.fn();
    await reviewRegistration.init.call(createReviewRuntime('review-tab-2', { removeTab }));

    tabManager.closeReviewTab('review-tab-2');

    expect(removeTab).toHaveBeenCalledWith('review-tab-2');
  });
});
