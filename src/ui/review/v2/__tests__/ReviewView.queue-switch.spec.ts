// @vitest-environment happy-dom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewQueueSwitchMocks = vi.hoisted(() => {
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; addSeparator: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }> = [];

  class MockMenu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return {
    instances,
    MockMenu,
    showMessage: vi.fn(),
  };
});

const reviewViewQueueSwitchLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

const reviewViewDialogMocks = vi.hoisted(() => ({
  createVueDialog: vi.fn(() => ({ dialog: {} as never, destroy: vi.fn() })),
  confirmDialog: vi.fn(async () => true),
  inputDialog: vi.fn(async () => '命名航线'),
  threeChoiceDialog: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: reviewViewQueueSwitchMocks.MockMenu,
  showMessage: reviewViewQueueSwitchMocks.showMessage,
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: reviewViewDialogMocks.createVueDialog,
  confirmDialog: reviewViewDialogMocks.confirmDialog,
  inputDialog: reviewViewDialogMocks.inputDialog,
  threeChoiceDialog: reviewViewDialogMocks.threeChoiceDialog,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewQueueSwitchLoggerMocks,
  logger: reviewViewQueueSwitchLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  props: {
    routeControl: {
      type: Object,
      required: false,
    },
    progress: {
      type: Object,
      required: false,
    },
  },
  emits: ['queue-switch', 'route-menu', 'toolbar-action'],
  setup(props, { emit }) {
    return () => h('div', { class: 'review-header-stub' }, [
      h('button', {
        class: 'review-header-close',
        onClick: () => emit('toolbar-action', 'close-review', new MouseEvent('click')),
      }, 'close'),
      h('button', {
        class: 'review-header-queue-switch',
        onClick: (event: MouseEvent) => emit('queue-switch', event),
      }, 'switch'),
      props.routeControl
        ? h('button', {
            class: 'review-header-route-menu',
            onClick: (event: MouseEvent) => emit('route-menu', event),
          }, String((props.routeControl as { name?: string }).name || ''))
        : null,
    ]);
  },
});

const NeuralRoamJourneyHeaderStub = defineComponent({
  name: 'NeuralRoamJourneyHeader',
  props: {
    routeControl: {
      type: Object,
      required: false,
    },
  },
  emits: ['route-menu', 'toolbar-action', 'engine-mode-select'],
  setup(props, { emit }) {
    return () => h('div', { class: 'neural-roam-journey-header-stub' }, [
      h('button', {
        class: 'review-header-close',
        onClick: () => emit('toolbar-action', 'close-review', new MouseEvent('click')),
      }, 'close'),
      props.routeControl
        ? h('button', {
            class: 'review-header-route-menu',
            onClick: (event: MouseEvent) => emit('route-menu', event),
          }, String((props.routeControl as { name?: string }).name || ''))
        : null,
    ]);
  },
});

function getNeuralRouteControl(wrapper: VueWrapper): { name?: string; detail?: string; temporary?: boolean } {
  return wrapper.getComponent(NeuralRoamJourneyHeaderStub).props('routeControl') as {
    name?: string;
    detail?: string;
    temporary?: boolean;
  };
}

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  props: {
    content: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('div', {
      class: 'review-content-stub',
      'data-content-id': String((props.content as { id?: string }).id || ''),
    });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function createQueue(nextImpl: () => Promise<unknown>, queueType = 'retrieval-practice') {
  return {
    getType: () => queueType,
    next: vi.fn(nextImpl),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: 0, label: '0 due' })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    canGoBack: vi.fn(() => false),
  };
}

function createNeuralQueue() {
  return {
    getEngineMode: vi.fn(() => 'orbit'),
    setEngineMode: vi.fn(async () => undefined),
    getSourceSnapshot: vi.fn(() => []),
    setSourceEntry: vi.fn(async () => undefined),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(async () => undefined),
    getAnchorSnapshot: vi.fn(() => []),
    setAnchorEntry: vi.fn(async () => undefined),
    clearAnchors: vi.fn(async () => undefined),
    getCurrentBatchSnapshot: vi.fn(() => null),
    getConceptBlocks: vi.fn(() => []),
    getFocusPoolSnapshot: vi.fn(() => []),
    setFocusPoolEntry: vi.fn(async () => undefined),
    clearFocusPool: vi.fn(async () => undefined),
    setCurrentFocus: vi.fn(async () => undefined),
    startRoamingFromFocus: vi.fn(async () => undefined),
    getHistoryCount: vi.fn(() => 0),
    getHistoryPage: vi.fn(() => ({ entries: [], totalCount: 0, hasMore: false })),
    getHistorySnapshot: vi.fn(() => []),
    getHistoryEntryByEventId: vi.fn(() => null),
    getHistoryEntriesByNodeId: vi.fn(() => []),
    getHistoryHitCount: vi.fn(() => 0),
    getActivationTrace: vi.fn(() => null),
    getSessionFocusStack: vi.fn(() => []),
    getPinnedFocusBlocks: vi.fn(() => []),
    setPinnedFocusBlock: vi.fn(async () => undefined),
    jumpToHistoryNode: vi.fn(async () => true),
    getPathItemByNodeId: vi.fn(async () => null),
    getNavigationState: vi.fn(() => ({
      engineMode: 'orbit',
      engineSessionId: 'engine-session',
      navigationMode: 'explore',
      currentPathIndex: -1,
      pathLength: 0,
      hasBookmark: false,
      currentNodeId: null,
      currentEventId: null,
      sessionId: 'session',
    })),
    setNavigationMode: vi.fn(),
    returnToBookmark: vi.fn(() => false),
    clearHistory: vi.fn(async () => undefined),
    syncFromBackendState: vi.fn(async () => undefined),
    setBackendViewState: vi.fn(),
    createRoute: vi.fn(async ({ name }: { name?: string } = {}) => ({
      metadata: {
        id: 'route-created',
        name: name || '命名航线',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 3,
        updatedAt: 3,
        lastUsedAt: 3,
      },
      seedPool: [],
      anchorPool: [],
      stats: {
        routeId: 'route-created',
        seedCount: 0,
        anchorCount: 0,
        historyCount: 0,
        totalPoolEntries: 0,
      },
    })),
    renameRoute: vi.fn(async (routeId: string, name: string) => ({
      metadata: {
        id: routeId,
        name,
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 1,
        updatedAt: 4,
        lastUsedAt: 4,
      },
      seedPool: [],
      anchorPool: [],
      stats: {
        routeId,
        seedCount: 0,
        anchorCount: 0,
        historyCount: 0,
        totalPoolEntries: 0,
      },
    })),
    deleteRoute: vi.fn(async () => undefined),
    saveTemporaryRoute: vi.fn(async () => undefined),
    listRoutes: vi.fn(async () => [
      {
        id: 'route-alpha',
        name: '天体物理',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 1,
        updatedAt: 2,
        lastUsedAt: 3,
        isActive: true,
        stats: {
          routeId: 'route-alpha',
          seedCount: 3,
          anchorCount: 2,
          historyCount: 7,
          totalPoolEntries: 5,
        },
      },
      {
        id: 'route-beta',
        name: '数学',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 1,
        updatedAt: 2,
        lastUsedAt: 2,
        isActive: false,
        stats: {
          routeId: 'route-beta',
          seedCount: 1,
          anchorCount: 0,
          historyCount: 4,
          totalPoolEntries: 1,
        },
      },
    ]),
  };
}

function createNeuralStrategy(neuralQueue: ReturnType<typeof createNeuralQueue>) {
  return {
    ...createQueue(async () => null, 'neural-roam'),
    getUnderlyingQueue: vi.fn(() => neuralQueue),
    switchNeuralRoamRoute: vi.fn(async (routeId: string) => {
      await neuralQueue.switchRoute?.(routeId);
    }),
    reload: vi.fn(async () => undefined),
  };
}

function createBackendRouteCommandResult(route: {
  id: string;
  name: string;
  temporary?: boolean;
  previousRouteId?: string | null;
}) {
  return {
    queueType: 'neural-roam',
    status: 'ok',
    viewState: {
      version: 1,
      queueType: 'neural-roam',
      route: {
        id: route.id,
        name: route.name,
        temporary: route.temporary === true,
        previousRouteId: route.previousRouteId ?? null,
      },
      routes: [
        {
          id: route.id,
          name: route.name,
          temporary: route.temporary === true,
          previousRouteId: route.previousRouteId ?? null,
          initialSeedNodeIds: [],
          createdAt: 10,
          updatedAt: 11,
          lastUsedAt: 12,
          isActive: true,
          stats: {
            routeId: route.id,
            seedCount: 0,
            anchorCount: 0,
            historyCount: 0,
            totalPoolEntries: 0,
          },
        },
      ],
      engineMode: 'orbit',
      currentNodeId: null,
      currentEventId: null,
      navigationState: null,
      counters: {
        routeId: route.id,
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
      sources: [],
      anchors: [],
      engineHistory: [],
      routeHistory: [],
      batchProgress: {
        kind: 'none',
        viewedCount: 0,
        totalCount: 0,
        remainingCount: 0,
        label: '',
      },
      updatedAt: 12,
    },
    queueState: {
      version: 8,
      engineMode: 'orbit',
    },
    unavailableReason: null,
    message: null,
  };
}

function createCompletedEmptyAdapter(title = '提取练习') {
  return {
    toUIState: vi.fn(async () => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        title,
      },
      meta: {
        ...createEmptyReviewUIState().meta,
        emptyStateMode: 'completed' as const,
      },
      actions: {
        ...createEmptyReviewUIState().actions,
        showAnswer: false,
        grades: [],
      },
    })),
    cleanup: vi.fn(),
    resetSessionState: vi.fn(),
  };
}

const mountedWrappers: VueWrapper[] = [];

function trackWrapper<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function flushTitlebarQueueSwitchSync(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await nextTick();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
  }
  await nextTick();
}

function mountReviewView(options: {
  mode: 'dialog' | 'tab';
  title: string;
  headerVariant: 'retrieval-practice' | 'incremental-learning' | 'final-drill' | 'filter-group' | 'neural-roam';
  plugin?: unknown;
  nativeDialogTitlebar?: boolean;
}) {
  return trackWrapper(mount(ReviewView, {
    attachTo: document.body,
    props: {
      app: {} as never,
      queue: createQueue(async () => null, options.headerVariant) as never,
      adapter: createCompletedEmptyAdapter(options.title) as never,
      mode: options.mode,
      title: options.title,
      headerVariant: options.headerVariant,
      nativeDialogTitlebar: options.nativeDialogTitlebar,
      plugin: options.plugin,
    },
    global: {
      stubs: {
        ReviewHeader: ReviewHeaderStub,
        ReviewContent: ReviewContentStub,
        ReviewActions: ReviewActionsStub,
        FilterDialog: true,
        AiWorkbenchPane: true,
        teleport: true,
      },
    },
  }));
}

describe('ReviewView queue switch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reviewViewQueueSwitchMocks.instances.length = 0;
    reviewViewDialogMocks.createVueDialog.mockClear();
    reviewViewDialogMocks.confirmDialog.mockReset();
    reviewViewDialogMocks.confirmDialog.mockResolvedValue(true);
    reviewViewDialogMocks.inputDialog.mockReset();
    reviewViewDialogMocks.inputDialog.mockResolvedValue('命名航线');
    reviewViewDialogMocks.threeChoiceDialog.mockClear();
    document.body.innerHTML = `
      <div class="b3-dialog__container siyuanmemo-review-dialog-container">
        <div class="b3-dialog__header resize__move">提取练习</div>
      </div>
    `;
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('replaces the native dialog titlebar title with a queue switch trigger and keeps switching in dialog surface', async () => {
    const dialogManager = {
      switchStandardReviewDialogQueue: vi.fn(),
    };

    mountReviewView({
      mode: 'dialog',
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      nativeDialogTitlebar: true,
      plugin: {
        getContext: () => ({
          getDialogManager: () => dialogManager,
        }),
      },
    });

    await flushPromises();
    await vi.runAllTimersAsync();
    await nextTick();

    const trigger = document.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toBe('提取练习');

    const pointerDownEvent = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    const pointerDownStop = vi.fn();
    Object.defineProperty(pointerDownEvent, 'stopPropagation', {
      value: pointerDownStop,
    });
    trigger?.dispatchEvent(pointerDownEvent);
    expect(pointerDownEvent.defaultPrevented).toBe(true);
    expect(pointerDownStop).toHaveBeenCalledTimes(1);

    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const mouseDownStop = vi.fn();
    Object.defineProperty(mouseDownEvent, 'stopPropagation', {
      value: mouseDownStop,
    });
    trigger?.dispatchEvent(mouseDownEvent);
    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(mouseDownStop).toHaveBeenCalledTimes(1);

    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 24, clientY: 16 }));
    await nextTick();

    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    expect(menu?.addItem).toHaveBeenCalledTimes(5);
    expect(menu?.addItem.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      label: '提取练习',
      disabled: true,
      icon: 'iconCheck',
    }));

    const incrementalItem = menu?.addItem.mock.calls.find(([item]) => item.label === '渐进学习')?.[0];
    expect(incrementalItem).toBeTruthy();
    await incrementalItem.click();

    expect(dialogManager.switchStandardReviewDialogQueue).toHaveBeenCalledWith('incremental-learning');
  });

  it('rebinds the native titlebar queue-switch trigger when SiYuan restores raw header text', async () => {
    mountReviewView({
      mode: 'dialog',
      title: '渐进学习',
      headerVariant: 'incremental-learning',
      nativeDialogTitlebar: true,
      plugin: {
        getContext: () => ({
          getDialogManager: () => ({
            switchStandardReviewDialogQueue: vi.fn(),
          }),
        }),
      },
    });

    await flushPromises();
    await vi.runAllTimersAsync();
    await nextTick();

    const header = document.querySelector('.b3-dialog__header') as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header?.querySelector('.siyuanmemo-review-titlebar__queue-switch')).not.toBeNull();

    header!.replaceChildren();
    header!.textContent = '渐进学习';

    await flushTitlebarQueueSwitchSync();

    const reboundTrigger = header?.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
    expect(reboundTrigger).not.toBeNull();
    expect(reboundTrigger?.textContent).toBe('渐进学习');
  });

  it('opens the same queue-switch menu from tab headers and replaces the current review tab', async () => {
    const tabManager = {
      replaceCurrentReviewTabWithStandardQueue: vi.fn(),
    };

    const wrapper = mountReviewView({
      mode: 'tab',
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      plugin: {
        getContext: () => ({
          getTabManager: () => tabManager,
        }),
      },
    });

    await flushPromises();
    await wrapper.get('.review-header-queue-switch').trigger('click', {
      clientX: 48,
      clientY: 18,
    });

    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    expect(menu?.addItem).toHaveBeenCalledTimes(5);

    const filterGroupItem = menu?.addItem.mock.calls.find(([item]) => item.label === '分组队列')?.[0];
    expect(filterGroupItem).toBeTruthy();
    await filterGroupItem.click();

    expect(tabManager.replaceCurrentReviewTabWithStandardQueue).toHaveBeenCalledWith('filter-group');
  });

  it('shows active NeuralRoam route and switches routes through the review strategy boundary', async () => {
    const neuralQueue = createNeuralQueue();
    const strategy = createNeuralStrategy(neuralQueue);
    const neuralRoamCommand = vi.fn(async (request) => createBackendRouteCommandResult({
      id: request.command.type === 'switch-route' ? String(request.command.routeId) : 'route-created-backend',
      name: request.command.type === 'switch-route' ? '数学' : '命名航线',
      previousRouteId: null,
      temporary: false,
    }));
    const wrapper = trackWrapper(mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: strategy as never,
        adapter: createCompletedEmptyAdapter('神经漫游') as never,
        mode: 'dialog',
        title: '神经漫游',
        headerVariant: 'neural-roam',
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => ({
              neuralRoamCommand,
              registerObserver: vi.fn(),
              unregisterObserver: vi.fn(),
            }),
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          NeuralRoamJourneyHeader: NeuralRoamJourneyHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          AiWorkbenchPane: true,
          teleport: true,
        },
      },
    }));

    await flushPromises();

    const routeControl = getNeuralRouteControl(wrapper);
    expect(routeControl).toMatchObject({
      name: '天体物理',
      detail: '概念 3 · 空间站 2 · 日志 7',
    });

    wrapper.getComponent(NeuralRoamJourneyHeaderStub).vm.$emit('engine-mode-select', 'hyperspace');
    await flushPromises();
    expect(neuralQueue.setEngineMode).toHaveBeenCalledWith('hyperspace', { carryCurrentNode: true });

    await wrapper.get('.review-header-route-menu').trigger('click', {
      clientX: 64,
      clientY: 20,
    });

    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    const betaItem = menu?.addItem.mock.calls.find(([item]) => item.label === '数学')?.[0];
    expect(betaItem).toBeTruthy();

    await betaItem.click();
    await flushPromises();

    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'switch-route', routeId: 'route-beta' },
    });
    expect(strategy.next).toHaveBeenCalledTimes(2);
  });

  it('exposes NeuralRoam route selector management actions through queue and browser boundaries', async () => {
    const neuralQueue = createNeuralQueue();
    neuralQueue.listRoutes.mockResolvedValue([
      {
        id: 'route-temp',
        name: '临时：星云',
        temporary: true,
        previousRouteId: 'default',
        initialSeedNodeIds: ['seed-1'],
        createdAt: 4,
        updatedAt: 5,
        lastUsedAt: 6,
        isActive: true,
        stats: {
          routeId: 'route-temp',
          seedCount: 2,
          anchorCount: 1,
          historyCount: 3,
          totalPoolEntries: 3,
        },
      },
      {
        id: 'default',
        name: '默认航线',
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: 1,
        updatedAt: 2,
        lastUsedAt: 3,
        isActive: false,
        stats: {
          routeId: 'default',
          seedCount: 1,
          anchorCount: 0,
          historyCount: 1,
          totalPoolEntries: 1,
        },
      },
    ]);
    const strategy = createNeuralStrategy(neuralQueue);
    const neuralRoamCommand = vi.fn(async (request) => createBackendRouteCommandResult({
      id: request.command.type === 'create-route' ? 'route-created-backend' : 'route-temp',
      name: request.command.name ?? '命名航线',
      temporary: request.command.type !== 'save-temporary-route',
      previousRouteId: request.command.type === 'save-temporary-route' ? null : 'default',
    }));
    const openBrowserDialog = vi.fn();
    const wrapper = trackWrapper(mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: strategy as never,
        adapter: createCompletedEmptyAdapter('神经漫游') as never,
        mode: 'dialog',
        title: '神经漫游',
        headerVariant: 'neural-roam',
        plugin: {
          getContext: () => ({
            getDialogManager: () => ({ openBrowserDialog }),
            getUnifiedDataSourceManager: () => ({
              neuralRoamCommand,
              registerObserver: vi.fn(),
              unregisterObserver: vi.fn(),
            }),
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          NeuralRoamJourneyHeader: NeuralRoamJourneyHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          AiWorkbenchPane: true,
          teleport: true,
        },
      },
    }));

    await flushPromises();

    const routeControl = getNeuralRouteControl(wrapper);
    expect(routeControl).toMatchObject({
      name: '临时：星云',
      detail: '概念 2 · 空间站 1 · 日志 3',
      temporary: true,
    });

    await wrapper.get('.review-header-route-menu').trigger('click', {
      clientX: 64,
      clientY: 20,
    });

    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    const labels = menu?.addItem.mock.calls.map(([item]) => item.label);
    expect(labels).toEqual(expect.arrayContaining([
      '临时：星云',
      '默认航线',
      '新建航线',
      '重命名航线',
      '保存为航线',
      '删除航线',
      '航线日志',
      '打开浏览器神经漫游面板',
    ]));
    expect(menu?.addItem.mock.calls.find(([item]) => item.label === '临时：星云')?.[0]).toEqual(expect.objectContaining({
      disabled: true,
      accelerator: '概念 2 · 空间站 1 · 日志 3',
    }));

    const createItem = menu?.addItem.mock.calls.find(([item]) => item.label === '新建航线')?.[0];
    await createItem.click();
    await flushPromises();
    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'create-route', name: '命名航线' },
    });
    expect(neuralQueue.createRoute).not.toHaveBeenCalled();
    expect(strategy.switchNeuralRoamRoute).not.toHaveBeenCalledWith('route-created');
    expect(neuralQueue.syncFromBackendState).toHaveBeenCalledWith(expect.objectContaining({ version: 8 }));
    expect(neuralQueue.setBackendViewState).toHaveBeenCalledWith(expect.objectContaining({
      route: expect.objectContaining({ id: 'route-created-backend' }),
    }));

    const renameItem = menu?.addItem.mock.calls.find(([item]) => item.label === '重命名航线')?.[0];
    reviewViewDialogMocks.inputDialog.mockResolvedValueOnce('重命名后');
    await renameItem.click();
    await flushPromises();
    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'rename-route', routeId: 'route-temp', name: '重命名后' },
    });
    expect(neuralQueue.renameRoute).not.toHaveBeenCalled();

    const saveItem = menu?.addItem.mock.calls.find(([item]) => item.label === '保存为航线')?.[0];
    await saveItem.click();
    await flushPromises();
    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'save-temporary-route', routeId: 'route-temp' },
    });
    expect(neuralQueue.saveTemporaryRoute).not.toHaveBeenCalled();

    const deleteItem = menu?.addItem.mock.calls.find(([item]) => item.label === '删除航线')?.[0];
    await deleteItem.click();
    await flushPromises();
    expect(reviewViewDialogMocks.confirmDialog).toHaveBeenCalled();
    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'delete-route', routeId: 'route-temp' },
    });
    expect(neuralQueue.deleteRoute).not.toHaveBeenCalled();

    menu?.addItem.mock.calls.find(([item]) => item.label === '航线日志')?.[0].click();
    menu?.addItem.mock.calls.find(([item]) => item.label === '打开浏览器神经漫游面板')?.[0].click();
    expect(openBrowserDialog).toHaveBeenCalledWith({
      initialQueueId: 'neural-roam',
      initialNeuralSubview: 'roam-history',
    });
    expect(openBrowserDialog).toHaveBeenCalledWith({
      initialQueueId: 'neural-roam',
      initialNeuralSubview: 'concept-cards',
    });
  });

  it('keeps Review route state unchanged when backend route creation fails', async () => {
    const neuralQueue = createNeuralQueue();
    const strategy = createNeuralStrategy(neuralQueue);
    const neuralRoamCommand = vi.fn(async () => ({
      queueType: 'neural-roam',
      status: 'failed',
      viewState: null,
      queueState: null,
      unavailableReason: 'failed',
      message: 'NeuralRoam route not found',
    }));
    const wrapper = trackWrapper(mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: strategy as never,
        adapter: createCompletedEmptyAdapter('神经漫游') as never,
        mode: 'dialog',
        title: '神经漫游',
        headerVariant: 'neural-roam',
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => ({
              neuralRoamCommand,
              registerObserver: vi.fn(),
              unregisterObserver: vi.fn(),
            }),
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          NeuralRoamJourneyHeader: NeuralRoamJourneyHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          AiWorkbenchPane: true,
          teleport: true,
        },
      },
    }));

    await flushPromises();
    await wrapper.get('.review-header-route-menu').trigger('click', {
      clientX: 64,
      clientY: 20,
    });
    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    const createItem = menu?.addItem.mock.calls.find(([item]) => item.label === '新建航线')?.[0];
    await createItem.click();
    await flushPromises();

    expect(neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: { type: 'create-route', name: '命名航线' },
    });
    expect(neuralQueue.createRoute).not.toHaveBeenCalled();
    expect(neuralQueue.syncFromBackendState).not.toHaveBeenCalled();
    expect(strategy.next).toHaveBeenCalledTimes(1);
    expect(reviewViewQueueSwitchMocks.showMessage).toHaveBeenCalledWith('NeuralRoam route not found', 3000, 'error');
  });

  it('keeps NeuralRoam Review open when dirty temporary route close prompt is cancelled', async () => {
    const neuralQueue = createNeuralQueue();
    neuralQueue.resolveTemporaryRouteCloseAction = vi.fn(async () => ({
      kind: 'prompt' as const,
      routeId: 'route-temp',
      previousRouteId: 'default',
    }));
    neuralQueue.closeTemporaryRoute = vi.fn(async () => null);
    reviewViewDialogMocks.threeChoiceDialog.mockResolvedValueOnce('cancel');
    const strategy = createNeuralStrategy(neuralQueue);
    const wrapper = trackWrapper(mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: strategy as never,
        adapter: createCompletedEmptyAdapter('神经漫游') as never,
        mode: 'dialog',
        title: '神经漫游',
        headerVariant: 'neural-roam',
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          NeuralRoamJourneyHeader: NeuralRoamJourneyHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          AiWorkbenchPane: true,
          teleport: true,
        },
      },
    }));

    await flushPromises();
    await wrapper.get('.review-header-close').trigger('click');
    await flushPromises();

    expect(reviewViewDialogMocks.threeChoiceDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '临时航线有改动',
    }));
    expect(neuralQueue.closeTemporaryRoute).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
