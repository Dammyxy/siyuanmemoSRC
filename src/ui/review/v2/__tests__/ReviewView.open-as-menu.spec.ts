// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

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
  setup() {
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
});
