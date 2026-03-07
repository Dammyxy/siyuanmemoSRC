// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewMenuMocks = vi.hoisted(() => {
  const menuOpen = vi.fn();

  class MockMenu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = menuOpen;
  }

  return {
    menuOpen,
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
});
