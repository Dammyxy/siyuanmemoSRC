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
  addAgentAction: vi.fn(() => 'plugin__test-plugin__memo_ui'),
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
  isSiyuanMenuInjectionError: vi.fn(() => false),
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
    public addAgentAction = mocks.addAgentAction;
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
  isSiyuanMenuInjectionError: mocks.isSiyuanMenuInjectionError,
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
    openRetrievalPracticeWithFilter: vi.fn(async () => undefined),
    openTemporaryDrill: vi.fn(async () => undefined),
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
    getDialogManager: vi.fn(() => dialogManager),
    getMenuManager: vi.fn(() => menuManager),
    getDockManager: vi.fn(() => dockManager),
    getBlockMenuHandler: vi.fn(() => blockMenuHandler),
    getCardService: vi.fn(() => ({
      getDueCount: vi.fn(async () => 0),
    })),
    getReviewService: vi.fn(() => ({
      refreshCdfLiveRelationOnOpen: vi.fn(async () => ({
        attempted: true,
        card: null,
        updatedCard: null,
        actions: [],
        derivedRelationCount: 0,
        currentReviewDuplicateOutcome: null,
        reason: 'unchanged',
      })),
    })),
    getAgentToolService: vi.fn(() => ({
      execute: vi.fn(async (request: unknown) => ({
        ok: true,
        status: 'success',
        data: request,
      })),
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
    mocks.isSiyuanMenuInjectionError.mockReturnValue(false);
    delete (window as Window & { require?: unknown }).require;
  });

  it('registers custom tabs before ApplicationContext.create resolves and hydrates restored tabs afterwards', async () => {
    const deferred = createDeferred<any>();
    mocks.applicationContextCreate.mockReturnValueOnce(deferred.promise);

    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const onloadPromise = plugin.onload();

    expect(mocks.addTab).toHaveBeenCalledTimes(2);

    const [browserRegistration, reviewRegistration] = mocks.addTab.mock.calls.map(([config]) => config);
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
    browserRegistration.init.call(browserRuntime);
    reviewRegistration.init.call(reviewRuntime);
    await flushMicrotasks();

    expect(mocks.createApp).not.toHaveBeenCalled();
    expect(browserRuntime.element.textContent).toContain('插件初始化中');
    expect(reviewRuntime.element.textContent).toContain('插件初始化中');

    deferred.resolve(createContext(plugin));
    await onloadPromise;
    await flushMicrotasks();

    expect(mocks.createApp).toHaveBeenCalledTimes(2);
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

  it('registers review command hotkeys with scoped document commands left user-configurable', async () => {
    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const context = createContext(plugin);
    mocks.applicationContextCreate.mockResolvedValueOnce(context);

    await plugin.onload();

    const commands = mocks.addCommand.mock.calls.map(([config]) => config);
    expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        langKey: 'startReview',
        hotkey: 'Alt+R',
      }),
      expect.objectContaining({
        langKey: 'reviewCurrentDocTreeDueCommand',
        hotkey: '',
      }),
      expect.objectContaining({
        langKey: 'temporaryDrillCurrentDocTreeAllCommand',
        hotkey: '',
      }),
      expect.objectContaining({
        langKey: 'locateCurrentReviewSourceCommand',
        hotkey: '',
      }),
    ]));
  });

  it('standard review command delegates globally without document context', async () => {
    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const context = createContext(plugin);
    mocks.applicationContextCreate.mockResolvedValueOnce(context);

    await plugin.onload();

    const startReviewCommand = mocks.addCommand.mock.calls
      .map(([config]) => config)
      .find((config) => config?.langKey === 'startReview');

    startReviewCommand?.callback?.();

    expect(context.getDialogManager().openReviewDialog).toHaveBeenCalledTimes(1);
  });

  it('registers memo_ui frontend Agent action after ApplicationContext is ready', async () => {
    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const context = createContext(plugin);
    const agentToolService = {
      execute: vi.fn(async (request: unknown) => ({
        ok: true,
        status: 'success',
        data: request,
      })),
    };
    context.getAgentToolService = vi.fn(() => agentToolService);
    mocks.applicationContextCreate.mockResolvedValueOnce(context);

    await plugin.onload();

    expect(mocks.addAgentAction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'memo_ui',
      description: expect.stringContaining('SiYuanMemo'),
    }));
    const registration = mocks.addAgentAction.mock.calls[0][0];
    expect(registration.description).toContain('Browser');
    expect(registration.description).toContain('Review');
    expect(registration.description).not.toMatch(/AI workbench/i);
    const response = await registration.handler({
      action: 'status',
      focusedBlockID: 'block-focused',
      selectedBlockIDs: ['block-a', 'block-b'],
    }, {});

    expect(agentToolService.execute).toHaveBeenCalledWith({
      tool: 'memo_ui',
      source: 'frontend',
      args: expect.objectContaining({
        action: 'status',
        editorContext: {
          focusedBlockID: 'block-focused',
          selectedBlockIDs: ['block-a', 'block-b'],
        },
      }),
    });
    expect(response).toEqual({
      result: expect.stringContaining('"status":"success"'),
    });
  });

  it('keeps frontend Agent action unavailable explicit when addAgentAction is missing', async () => {
    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    delete (plugin as unknown as { addAgentAction?: unknown }).addAgentAction;
    const context = createContext(plugin);
    mocks.applicationContextCreate.mockResolvedValueOnce(context);

    await plugin.onload();

    expect(mocks.addAgentAction).not.toHaveBeenCalled();
  });

  it('guards known SiYuan menu injection errors and removes the guard on unload', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { default: FSRSPlugin } = await import('./index');
    const plugin = new FSRSPlugin();
    const context = createContext(plugin);
    mocks.applicationContextCreate.mockResolvedValueOnce(context);

    await plugin.onload();

    const errorHandler = addEventListenerSpy.mock.calls.find(
      ([type]) => type === 'error',
    )?.[1] as EventListener | undefined;
    const rejectionHandler = addEventListenerSpy.mock.calls.find(
      ([type]) => type === 'unhandledrejection',
    )?.[1] as EventListener | undefined;

    expect(errorHandler).toBeDefined();
    expect(rejectionHandler).toBeDefined();

    mocks.isSiyuanMenuInjectionError.mockReturnValue(true);

    const errorEvent = new ErrorEvent('error', {
      message: 'Failed to execute insertBefore',
      error: new Error('InsertMenuItem failed'),
      cancelable: true,
    });
    const stopImmediatePropagation = vi.fn();
    Object.defineProperty(errorEvent, 'stopImmediatePropagation', {
      value: stopImmediatePropagation,
    });
    errorHandler?.(errorEvent);

    expect(errorEvent.defaultPrevented).toBe(true);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);

    const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.reject(new Error('MenuShow failed')).catch(() => undefined),
      reason: new Error('MenuShow failed'),
      cancelable: true,
    });
    rejectionHandler?.(rejectionEvent);

    expect(rejectionEvent.defaultPrevented).toBe(true);

    plugin.onunload();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('error', errorHandler, true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', rejectionHandler);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});
