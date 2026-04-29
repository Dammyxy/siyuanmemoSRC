import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { TabManager } from './TabManager';

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  createApp: vi.fn(() => ({
    mount: vi.fn(),
    unmount: vi.fn(),
  })),
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

function createSiyuanApiMock() {
  return {
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
}

function createManager() {
  const context = {
    getI18n: vi.fn(() => ({
      srsBrowser: 'SRS Browser',
      reviewTitle: 'Review',
      openFailed: 'Open failed',
    })),
    getReviewQueuePreparationService: vi.fn(() => undefined),
  } as any;

  const plugin = {
    name: 'test-plugin',
    app: {} as any,
    addTab: vi.fn(),
  } as any;

  return {
    tabManager: new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never),
    plugin,
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

  it('registers browser, review, and review AI tabs once', () => {
    const { tabManager, plugin } = createManager();

    tabManager.registerAll();
    tabManager.registerAll();

    expect(plugin.addTab).toHaveBeenCalledTimes(3);
    expect((plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[0][0].type).toBe('test-plugin-browser');
    expect((plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[1][0].type).toBe('test-plugin-review');
    expect((plugin.addTab as ReturnType<typeof vi.fn>).mock.calls[2][0].type).toBe('test-plugin-review-ai');
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

  it('hydrates the browser tab component with serialized initial state on init', () => {
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

    browserRegistration.init.call(runtime);

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

  it('opens review tabs with distinct new-tab and split semantics', () => {
    const { tabManager, plugin } = createManager();

    tabManager.openReviewTabInNewTab(createReviewOptions());
    tabManager.openReviewTab(createReviewOptions('right'));
    tabManager.openReviewTab(createReviewOptions('bottom'));
    tabManager.openReviewInNewWindow(createReviewOptions('right'));

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

  it('returns false when openTab throws', () => {
    const { tabManager } = createManager();
    mocks.openTab.mockImplementationOnce(() => {
      throw new Error('open failed');
    });

    const opened = tabManager.openBrowserTab();

    expect(opened).toBe(false);
  });
});
