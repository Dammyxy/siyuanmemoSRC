// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import { QueueType } from '@/types/unified-data-source';

let reviewContentEditableSource:
  | {
      blockId: string;
      title: string;
      sourceKind: 'block-markdown';
      rendererKind: string;
    }
  | null = null;

const reviewViewMenuMocks = vi.hoisted(() => {
  const menuOpen = vi.fn();
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; addSeparator: ReturnType<typeof vi.fn> }> = [];

  class MockMenu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = menuOpen;

    constructor() {
      instances.push(this);
    }
  }

  return {
    menuOpen,
    instances,
    MockMenu,
  };
});

const reviewViewLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: reviewViewMenuMocks.MockMenu,
  showMessage: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewLoggerMocks,
  logger: reviewViewLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

function buildCard() {
  const now = Date.now();
  return {
    id: 'card-1',
    cardID: 'card-1',
    blockId: 'block-1',
    blockID: 'block-1',
    deckId: 'deck-1',
    due: now,
    stability: 1,
    difficulty: 1,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    priority: 42,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {},
  };
}

function createQueue(card: ReturnType<typeof buildCard>) {
  return {
    next: vi.fn(async () => card),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: 1, label: '1 due' })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    canGoBack: vi.fn(() => false),
  };
}

function createAdapter() {
  return {
    toUIState: vi.fn(async (_queue: unknown, item: ReturnType<typeof buildCard> | null, context: { showAnswer?: boolean }) => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        stats: {
          current: item ? 1 : 0,
          total: 1,
          label: item ? '1 due' : '0 due',
          queueName: 'Unified Queue',
        },
      },
      content: {
        type: 'protyle' as const,
        data: item?.blockId ?? '',
        id: item?.blockId ?? 'empty',
        card: item as never,
      },
      actions: {
        ...createEmptyReviewUIState().actions,
        showAnswer: !context.showAnswer,
        cardMeta: item
          ? {
              cardID: item.id,
              blockID: item.blockId,
              deckID: item.deckId,
              type: 'item',
              cardType: 'item',
            }
          : undefined,
      },
    })),
    cleanup: vi.fn(),
  };
}

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  emits: ['toolbar-action', 'action', 'context', 'breadcrumb-click'],
  setup() {
    return () => h('div', { class: 'review-header-stub' });
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  setup(_props, { expose }) {
    expose({
      getEditableSource: () => reviewContentEditableSource,
    });
    return () => h('div', { class: 'review-content-stub' });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

describe('ReviewView open-as menu', () => {
  beforeEach(() => {
    reviewViewMenuMocks.menuOpen.mockReset();
    reviewViewMenuMocks.instances.length = 0;
    reviewViewLoggerMocks.error.mockReset();
    reviewViewLoggerMocks.warn.mockReset();
    reviewViewLoggerMocks.debug.mockReset();
    reviewViewLoggerMocks.info.mockReset();
    reviewViewLoggerMocks.log.mockReset();
    reviewViewLoggerMocks.trace.mockReset();
    reviewContentEditableSource = null;
    vi.mocked(openReviewBlockAtSource).mockReset();
  });

  it('does not throw when sticktab receives a toolbar event without currentTarget', async () => {
    const card = buildCard();
    const queue = createQueue(card);
    const adapter = createAdapter();
    const tabManager = {
      openReviewTab: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    expect(() => {
      wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', new MouseEvent('click'));
    }).not.toThrow();
    await flushPromises();

    expect(reviewViewMenuMocks.menuOpen).not.toHaveBeenCalled();
    expect(reviewViewLoggerMocks.error).toHaveBeenCalledWith(
      '[SiYuanMemo][ReviewView] Cannot open menu: target element is null',
    );

    wrapper.unmount();
  });

  it('passes transferred filter-group session state to open-as tab actions', async () => {
    const card = buildCard();
    const filterSnapshot = {
      filter: {
        blockIds: ['block-1'],
        scopeDocIds: ['doc-1'],
        cardType: 'item',
        dueDate: {
          lte: new Date('2026-04-06T00:00:00.000Z'),
        },
      },
      rollbackSnapshot: {
        temporaryBlacklist: ['blocked-card'],
        customOrder: ['card-1', 'card-2'],
        manualCards: ['manual-1'],
      },
      visibleCardIds: ['card-1', 'card-2'],
    };
    const filterQueue = {
      setFilter: vi.fn(),
      getFilter: vi.fn(() => filterSnapshot.filter),
      rebuild: vi.fn(),
      getSize: vi.fn(async () => 2),
      serializeSessionSnapshot: vi.fn(() => filterSnapshot),
    };
    const queue = {
      ...createQueue(card),
      getUnderlyingQueue: vi.fn(() => filterQueue),
    };
    const adapter = createAdapter();
    const tabManager = {
      openReviewTab: vi.fn(),
      openReviewTabInNewTab: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        initialSessionState: {
          initialTotal: 8,
          answeredCount: 3,
          correctCount: 2,
        },
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    expect(reviewViewMenuMocks.menuOpen).toHaveBeenCalledTimes(1);
    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    expect(latestMenu).toBeDefined();
    const openByTabItem = latestMenu?.addItem.mock.calls
      .map(([item]) => item)
      .find((item) => item.id === 'openByTab');
    expect(openByTabItem).toBeDefined();

    openByTabItem?.click();

    expect(tabManager.openReviewTabInNewTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      transferState: expect.objectContaining({
        kind: 'filter-group-session',
        filterSession: expect.objectContaining({
          filter: expect.objectContaining({
            blockIds: ['block-1'],
            scopeDocIds: ['doc-1'],
            cardType: 'item',
            dueDate: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
          rollbackSnapshot: expect.objectContaining({
            temporaryBlacklist: ['blocked-card'],
            customOrder: ['card-1', 'card-2'],
            manualCards: ['manual-1'],
          }),
          visibleCardIds: ['card-1', 'card-2'],
        }),
        session: {
          initialTotal: 8,
          answeredCount: 3,
          correctCount: 2,
        },
      }),
    }));

    wrapper.unmount();
  });

  it('prefers provided static subset transfer state for open-as tab actions', async () => {
    const card = buildCard();
    const filterQueue = {
      serializeSessionSnapshot: vi.fn(() => {
        throw new Error('old filter session should not be serialized');
      }),
    };
    const queue = {
      ...createQueue(card),
      getUnderlyingQueue: vi.fn(() => filterQueue),
    };
    const adapter = createAdapter();
    const tabManager = {
      openReviewTab: vi.fn(),
      openReviewTabInNewTab: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        title: '子集复习',
        headerVariant: 'subset-review',
        initialSessionState: {
          initialTotal: 4,
          answeredCount: 1,
          correctCount: 1,
        },
        transferState: {
          kind: 'static-subset-session',
          queueType: QueueType.FilterGroup,
          blockIds: ['block-1'],
          cardIds: ['card-1'],
          preferredCardId: 'card-1',
        },
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    const openByTabItem = latestMenu?.addItem.mock.calls
      .map(([item]) => item)
      .find((item) => item.id === 'openByTab');
    expect(openByTabItem).toBeDefined();

    openByTabItem?.click();

    expect(filterQueue.serializeSessionSnapshot).not.toHaveBeenCalled();
    expect(tabManager.openReviewTabInNewTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '子集复习',
      headerVariant: 'subset-review',
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-1'],
        cardIds: ['card-1'],
        preferredCardId: 'card-1',
        session: {
          initialTotal: 4,
          answeredCount: 1,
          correctCount: 1,
        },
      },
    }));

    wrapper.unmount();
  });

  it('locates the rendered content block instead of the card reference block for special-render cards', async () => {
    const card = buildCard();
    const queue = createQueue(card);
    const adapter = {
      toUIState: vi.fn(async (_queue: unknown, item: ReturnType<typeof buildCard> | null, context: { showAnswer?: boolean }) => ({
        ...createEmptyReviewUIState(),
        header: {
          ...createEmptyReviewUIState().header,
          stats: {
            current: item ? 1 : 0,
            total: 1,
            label: item ? '1 due' : '0 due',
            queueName: 'Unified Queue',
          },
        },
        content: {
          type: 'protyle' as const,
          data: item ? 'render-block-1' : '',
          id: item ? 'render-block-1' : 'empty',
          card: item as never,
        },
        actions: {
          ...createEmptyReviewUIState().actions,
          showAnswer: !context.showAnswer,
          cardMeta: item
            ? {
                cardID: item.id,
                blockID: item.blockId,
                deckID: item.deckId,
                type: 'item',
                cardType: 'item',
              }
            : undefined,
        },
      })),
      cleanup: vi.fn(),
    };
    const tabManager = {
      openReviewTab: vi.fn(),
      openReviewTabInNewTab: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    const menuItems = latestMenu?.addItem.mock.calls.map(([item]) => item) || [];
    const locateAndOpenItem = menuItems.find((item) => item.id === 'openRightReviewAndLocateSource');

    await locateAndOpenItem?.click?.();

    expect(openReviewBlockAtSource).toHaveBeenCalledWith({
      app: {},
      blockId: 'render-block-1',
    });
    expect(tabManager.openReviewTab).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('uses the editable source block for list-template review cards when locating source', async () => {
    reviewContentEditableSource = {
      blockId: 'list-child-2',
      title: '编辑当前列表项',
      sourceKind: 'block-markdown',
      rendererKind: 'list-template',
    };

    const card = buildCard();
    const queue = createQueue(card);
    const adapter = {
      toUIState: vi.fn(async (_queue: unknown, item: ReturnType<typeof buildCard> | null, context: { showAnswer?: boolean }) => ({
        ...createEmptyReviewUIState(),
        header: {
          ...createEmptyReviewUIState().header,
          stats: {
            current: item ? 1 : 0,
            total: 1,
            label: item ? '1 due' : '0 due',
            queueName: 'Unified Queue',
          },
        },
        content: {
          type: 'protyle' as const,
          data: item ? 'list-question-block' : '',
          id: item ? 'list-question-block' : 'empty',
          card: item as never,
          isXiuyuanListTemplate: Boolean(item),
          xiuyuanMeta: item
            ? {
                currentIndex: 1,
                allChildren: [
                  { id: 'list-child-1' },
                  { id: 'list-child-2' },
                ],
              }
            : null,
        },
        actions: {
          ...createEmptyReviewUIState().actions,
          showAnswer: !context.showAnswer,
          cardMeta: item
            ? {
                cardID: item.id,
                blockID: item.blockId,
                deckID: item.deckId,
                type: 'item',
                cardType: 'item',
              }
            : undefined,
        },
      })),
      cleanup: vi.fn(),
    };
    const tabManager = {
      openReviewTab: vi.fn(),
      openReviewTabInNewTab: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    const menuItems = latestMenu?.addItem.mock.calls.map(([item]) => item) || [];
    const locateItem = menuItems.find((item) => item.id === 'locateSourceBlock');

    await locateItem?.click?.();

    expect(openReviewBlockAtSource).toHaveBeenCalledWith({
      app: {},
      blockId: 'list-child-2',
    });

    wrapper.unmount();
  });

  it('adds an open-in-dialog action for standard tab reviews and closes the current tab after conversion', async () => {
    const card = buildCard();
    const underlyingQueue = {
      getType: vi.fn(() => 'retrieval-practice'),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const queue = {
      ...createQueue(card),
      queueType: 'retrieval-practice',
      getUnderlyingQueue: vi.fn(() => underlyingQueue),
    };
    const adapter = createAdapter();
    const tabManager = {
      openReviewTab: vi.fn(),
      closeReviewTab: vi.fn(),
    };
    const dialogManager = {
      openStandardReviewDialog: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        mode: 'tab',
        reviewSessionId: 'review-tab-1',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        initialSessionState: {
          initialTotal: 6,
          answeredCount: 2,
          correctCount: 1,
        },
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
            getDialogManager: () => dialogManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    expect(reviewViewMenuMocks.menuOpen).toHaveBeenCalledTimes(1);
    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    expect(latestMenu).toBeDefined();
    const menuItems = latestMenu?.addItem.mock.calls.map(([item]) => item) || [];
    expect(menuItems.some((item) => item.id === 'openByTab')).toBe(false);

    const openInDialogItem = menuItems.find((item) => item.id === 'openInDialog');
    expect(openInDialogItem).toBeDefined();

    openInDialogItem?.click();

    expect(dialogManager.openStandardReviewDialog).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      queueInstance: underlyingQueue,
      initialSessionState: {
        initialTotal: 6,
        answeredCount: 2,
        correctCount: 1,
      },
    });
    expect(tabManager.closeReviewTab).toHaveBeenCalledWith('review-tab-1');

    wrapper.unmount();
  });

  it('opens plugin-managed shared review splits from tab mode without closing the current surface', async () => {
    const card = buildCard();
    const queue = createQueue(card);
    const adapter = createAdapter();
    const tabManager = {
      openReviewTab: vi.fn(),
      closeReviewTab: vi.fn(),
    };
    const sharedSessions = new Map<string, unknown>();
    const sharedRegistry = {
      getSession: vi.fn((sessionId: string) => sharedSessions.get(sessionId) ?? null),
      registerSession: vi.fn((sessionId: string, session: unknown) => {
        sharedSessions.set(sessionId, session);
        return session;
      }),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        mode: 'tab',
        reviewSessionId: 'review-tab-shared',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
            getSharedReviewSessionRegistry: () => sharedRegistry,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    expect(latestMenu).toBeDefined();
    const menuItems = latestMenu?.addItem.mock.calls.map(([item]) => item) || [];
    const splitRightItem = menuItems.find((item) => item.id === 'managedSplitRight');
    const splitBottomItem = menuItems.find((item) => item.id === 'managedSplitBottom');

    expect(splitRightItem).toBeDefined();
    expect(splitBottomItem).toBeDefined();

    splitRightItem?.click?.();
    await flushPromises();

    const firstSplitOptions = tabManager.openReviewTab.mock.calls[0]?.[0];
    expect(firstSplitOptions.position).toBe('right');
    expect(firstSplitOptions.sharedReviewSessionId).toMatch(/^shared-review-/);
    expect(firstSplitOptions.reviewState).toEqual(expect.objectContaining({
      sharedReviewSessionId: firstSplitOptions.sharedReviewSessionId,
      currentCardId: 'card-1',
      currentBlockId: 'block-1',
    }));
    expect(sharedRegistry.registerSession).toHaveBeenCalledTimes(1);
    expect(tabManager.closeReviewTab).not.toHaveBeenCalled();

    splitBottomItem?.click?.();
    await flushPromises();

    const secondSplitOptions = tabManager.openReviewTab.mock.calls[1]?.[0];
    expect(secondSplitOptions.position).toBe('bottom');
    expect(secondSplitOptions.sharedReviewSessionId).toBe(firstSplitOptions.sharedReviewSessionId);
    expect(sharedRegistry.registerSession).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('keeps non-standard tab review sessions from exposing open-in-dialog conversion', async () => {
    const card = buildCard();
    const queue = {
      ...createQueue(card),
      queueType: 'filter-group',
      getUnderlyingQueue: vi.fn(() => ({
        getType: vi.fn(() => 'filter-group'),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      })),
    };
    const adapter = createAdapter();
    const tabManager = {
      openReviewTab: vi.fn(),
      closeReviewTab: vi.fn(),
    };
    const dialogManager = {
      openStandardReviewDialog: vi.fn(),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        mode: 'tab',
        reviewSessionId: 'review-tab-filter',
        title: '筛选提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
            }),
            getTabManager: () => tabManager,
            getDialogManager: () => dialogManager,
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          FilterDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();

    const target = document.createElement('button');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 20 }),
    });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', {
      value: target,
    });

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'sticktab', event);
    await flushPromises();

    const latestMenu = reviewViewMenuMocks.instances.at(-1);
    expect(latestMenu).toBeDefined();
    const menuItems = latestMenu?.addItem.mock.calls.map(([item]) => item) || [];
    expect(menuItems.some((item) => item.id === 'openInDialog')).toBe(false);

    wrapper.unmount();
  });
});
