import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { TabManager } from '@/application/managers/TabManager';

const mocks = vi.hoisted(() => ({
  applicationContextCreate: vi.fn(),
  addTab: vi.fn(),
  addTopBar: vi.fn(() => document.createElement('button')),
  addDock: vi.fn(),
  addCommand: vi.fn(),
  addIcons: vi.fn(),
  openTab: vi.fn(),
  createApp: vi.fn(() => ({
    mount: vi.fn(() => ({})),
    unmount: vi.fn(),
  })),
  pushErrMsg: vi.fn(async () => undefined),
  pushMsg: vi.fn(async () => undefined),
  getFrontend: vi.fn(() => 'desktop'),
  showMessage: vi.fn(),
  eventBusOn: vi.fn(),
}));

vi.mock('siyuan', () => {
  class MockPlugin {
    public name = 'test-plugin';
    public app = {};
    public i18n = {
      loading: '插件初始化中...',
      initFailed: 'FSRS 插件初始化失败',
      reviewTitle: 'Review',
      srsBrowser: 'SRS Browser',
      aiWorkbench: 'AI Workbench',
      topbarTitle: '间隔重复系统',
    };
    public eventBus = {
      on: mocks.eventBusOn,
    };
    public protyleSlash: Array<{ id: string }> = [];
    public addTab = mocks.addTab;
    public addTopBar = mocks.addTopBar;
    public addDock = mocks.addDock;
    public addCommand = mocks.addCommand;
    public addIcons = mocks.addIcons;
    public removeData = vi.fn(async () => undefined);
  }

  return {
    Plugin: MockPlugin,
    getFrontend: mocks.getFrontend,
    showMessage: mocks.showMessage,
    openTab: mocks.openTab,
    Constants: {
      SIYUAN_OPEN_WINDOW: 'siyuan-open-window',
      SIYUAN_VERSION: '3.1.0',
    },
  };
});

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

vi.mock('@/application/ApplicationContext', () => ({
  ApplicationContext: {
    create: mocks.applicationContextCreate,
  },
}));

vi.mock('@/infrastructure/siyuan/api', () => ({
  pushErrMsg: mocks.pushErrMsg,
  pushMsg: mocks.pushMsg,
}));

vi.mock('@/utils/configMigrator', () => ({
  ConfigMigrator: {
    needsMigration: () => false,
    migrate: vi.fn((config) => config),
    getMigrationMessage: vi.fn(() => 'migrated'),
  },
}));

vi.mock('@/utils/simpleModeRemovalMigrator', () => ({
  SimpleModeRemovalMigrator: {
    needsMigration: () => false,
    performMigration: vi.fn(),
    handleMigrationError: vi.fn(),
  },
}));

vi.mock('@/application/handlers/FormulaClozeAssistant', () => ({
  FormulaClozeAssistant: class {
    start(): void {}
    stop(): void {}
  },
}));

vi.mock('@/application/handlers/ImageOcclusionHandler', () => ({
  ImageOcclusionHandler: class {
    dispose(): void {}
    handleImageMenu(): void {}
    openFromActiveEditor(): void {}
    openFromEditor(): void {}
  },
}));

vi.mock('@/application/handlers/ProgressiveExcerptHotkeyHandler', () => ({
  ProgressiveExcerptHotkeyHandler: class {
    stop(): void {}
    handleContentMenu(): void {}
    runFromCommand(): void {}
    runFromEditor(): void {}
    runItemFromCommand(): void {}
    runItemFromEditor(): void {}
  },
}));

vi.mock('@/utils/siyuanMenuComponentFallbacks', () => ({
  ensureSiyuanMenuComponentFallbacks: () => [],
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createContext(plugin: any) {
  const queueStub = {
    getType: vi.fn(() => QueueType.RetrievalPractice),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const reviewRegistry = {
    openReviewSession: vi.fn(async () => ({
      state: {
        activeView: 'explain',
      },
    })),
    getOrCreateReviewSession: vi.fn(() => ({
      state: {
        activeView: 'explain',
      },
    })),
    disposeReviewSession: vi.fn(),
  };
  const settingsService = {
    getSettings: vi.fn(() => ({
      progressiveReading: {},
      riffIntegration: {},
    })),
    updateSettings: vi.fn(async () => undefined),
  };
  const dialogManager = {
    openSettingsDialog: vi.fn(),
    openBrowserDialog: vi.fn(),
    openReviewDialog: vi.fn(),
    openMobileQueueLauncherDialog: vi.fn(async () => undefined),
    openSubsetReviewDialog: vi.fn(async () => undefined),
  };
  const menuManager = {
    openTopBarMenu: vi.fn(),
    runTopBarQuickEntryAction: vi.fn(async () => undefined),
  };
  const dockManager = {
    initDockPanel: vi.fn(),
  };
  const blockMenuHandler = {
    handleBlockIconClick: vi.fn(),
    handleEditorTitleIconClick: vi.fn(),
    handleBreadcrumbMore: vi.fn(),
    handleDocTreeMenu: vi.fn(),
    handleBlockRefMenu: vi.fn(),
    runEditSrsDataAction: vi.fn(async () => undefined),
    runRebindDescriptorConceptAction: vi.fn(async () => undefined),
    runCoreEntryAction: vi.fn(async () => undefined),
  };

  const context: any = {
    getI18n: vi.fn(() => plugin.i18n),
    getSettingsService: vi.fn(() => settingsService),
    getReviewQueuePreparationService: vi.fn(() => undefined),
    getUnifiedDataSourceManager: vi.fn(() => ({
      getQueue: vi.fn(() => queueStub),
    })),
    getEventBus: vi.fn(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    getSchedulerRouter: vi.fn(() => ({})),
    getReviewAIWorkbenchRegistry: vi.fn(() => reviewRegistry),
    getDialogManager: vi.fn(() => dialogManager),
    getMenuManager: vi.fn(() => menuManager),
    getDockManager: vi.fn(() => dockManager),
    getBlockMenuHandler: vi.fn(() => blockMenuHandler),
    getCardService: vi.fn(() => ({
      getDueCount: vi.fn(async () => 0),
    })),
    getHybridSyncService: vi.fn(() => undefined),
    dispose: vi.fn(async () => undefined),
  };
  const tabManager = new TabManager(context, plugin, {
    siyuanApi: {
      pushErrMsg: vi.fn(async () => undefined),
    } as never,
  });
  context.getTabManager = vi.fn(() => tabManager);
  return context;
}

describe('FSRSPlugin deferred custom tab bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { require?: unknown }).require;
  });

  it('registers custom tabs before ApplicationContext.create resolves and hydrates restored tabs afterwards', async () => {
    const deferred = createDeferred<any>();
    mocks.applicationContextCreate.mockReturnValueOnce(deferred.promise);

    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const onloadPromise = plugin.onload();

    expect(mocks.addTab).toHaveBeenCalledTimes(3);

    const [browserRegistration, reviewRegistration, reviewAiRegistration] = mocks.addTab.mock.calls.map(([config]) => config);
    const browserRuntime = {
      element: document.createElement('div'),
      data: {
        initialState: {
          queueId: 'neural-roam',
        },
      },
    };
    const reviewRuntime = {
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
    const reviewAiRuntime = {
      id: 'review-runtime-1-ai',
      element: document.createElement('div'),
      data: {
        reviewSessionId: 'review-runtime-1',
        sourceReviewSessionId: 'review-runtime-1',
        title: 'AI Workbench',
      },
      tab: {
        id: 'review-runtime-1-ai',
        headElement: document.createElement('button'),
        parent: {
          switchTab: vi.fn(),
        },
        close: vi.fn(),
      },
    };

    browserRegistration.init.call(browserRuntime);
    reviewRegistration.init.call(reviewRuntime);
    reviewAiRegistration.init.call(reviewAiRuntime);
    await flushMicrotasks();

    expect(mocks.createApp).not.toHaveBeenCalled();
    expect(browserRuntime.element.textContent).toContain('插件初始化中');
    expect(reviewRuntime.element.textContent).toContain('插件初始化中');
    expect(reviewAiRuntime.element.textContent).toContain('插件初始化中');

    deferred.resolve(createContext(plugin));
    await onloadPromise;
    await flushMicrotasks();

    expect(mocks.createApp).toHaveBeenCalledTimes(3);
    expect(mocks.createApp.mock.calls[0][1]).toEqual(expect.objectContaining({
      mode: 'tab',
      initialOpenState: {
        queueId: 'neural-roam',
      },
    }));
    expect(mocks.createApp.mock.calls[1][1]).toEqual(expect.objectContaining({
      mode: 'tab',
      title: 'Review',
      reviewSessionId: 'review-runtime-1',
    }));
    expect(mocks.createApp.mock.calls[2][1]).toEqual(expect.objectContaining({
      i18n: expect.objectContaining({
        aiWorkbench: 'AI Workbench',
      }),
    }));
  });

  it('keeps excerpt and item commands while dropping image occlusion and manual Riff sync commands', async () => {
    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const context = createContext(plugin);
    mocks.applicationContextCreate.mockResolvedValueOnce(context);

    await plugin.onload();

    const registeredLangKeys = mocks.addCommand.mock.calls
      .map(([config]) => config?.langKey)
      .filter((value): value is string => typeof value === 'string');

    expect(registeredLangKeys).toContain('progressiveExcerptSelection');
    expect(registeredLangKeys).toContain('progressiveItemSelection');
    expect(registeredLangKeys).not.toContain('imageOcclusionCardCurrentBlock');
    expect(registeredLangKeys).not.toContain('syncRiffNow');
  });
});
