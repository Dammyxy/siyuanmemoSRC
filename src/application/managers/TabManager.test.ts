import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('vue', () => ({
  createApp: mocks.createApp,
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

describe('TabManager browser tab opening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createManager() {
    const context = {
      getI18n: vi.fn(() => ({
        srsBrowser: 'SRS Browser',
      })),
    } as any;

    const plugin = {
      name: 'test-plugin',
      app: {} as any,
      addTab: vi.fn(),
    } as any;

    return {
      tabManager: new TabManager(context, plugin),
      plugin,
    };
  }

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

  it('opens a browser tab with serialized open state and explicit position', () => {
    const { tabManager, plugin } = createManager();

    const opened = tabManager.openBrowserTab({
      position: 'bottom',
      initialState: {
        queueId: 'neural-roam',
        neuralSubview: 'roam-history',
        queryText: 'michael nielsen',
      },
    });

    expect(opened).toBe(true);
    expect(mocks.openTab).toHaveBeenCalledWith({
      app: plugin.app,
      custom: {
        icon: 'iconCard',
        title: 'SRS Browser',
        id: 'test-plugintest-plugin-browser',
        data: {
          initialState: {
            queueId: 'neural-roam',
            neuralSubview: 'roam-history',
            queryText: 'michael nielsen',
          },
        },
      },
      position: 'bottom',
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

  it('returns false when openTab throws', () => {
    const { tabManager } = createManager();
    mocks.openTab.mockImplementationOnce(() => {
      throw new Error('open failed');
    });

    const opened = tabManager.openBrowserTab();

    expect(opened).toBe(false);
  });
});
