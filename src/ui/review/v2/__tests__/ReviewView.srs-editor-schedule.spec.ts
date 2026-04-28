// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const { createVueDialogMock, confirmDialogMock } = vi.hoisted(() => ({
  createVueDialogMock: vi.fn(() => ({
    dialog: {} as never,
    destroy: vi.fn(),
  })),
  confirmDialogMock: vi.fn(async () => true),
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: createVueDialogMock,
  confirmDialog: confirmDialogMock,
}));

function buildCard(id: string, priority: number) {
  const now = Date.now();
  return {
    id,
    cardID: id,
    blockId: `block-${id}`,
    blockID: `block-${id}`,
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
    priority,
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

function createQueue(cards: Array<ReturnType<typeof buildCard>>) {
  let index = 0;
  const schedulingContext = {
    memoryStateAsOf: 1_777_777_777_000,
    queueMode: 'filtered-preview' as const,
    commitPolicy: 'preview-only' as const,
    customStudy: true,
  };
  const underlyingQueue = {
    getReviewSchedulingContext: vi.fn(() => schedulingContext),
  };

  return {
    next: vi.fn(async () => cards[index++] ?? null),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: cards.length, label: `${cards.length} due` })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    canGoBack: vi.fn(() => false),
    removeCard: vi.fn(async () => undefined),
    getUnderlyingQueue: vi.fn(() => underlyingQueue),
    underlyingQueue,
    schedulingContext,
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
          total: 2,
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
        showAnswer: Boolean(context.showAnswer),
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
  props: {
    content: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('div', { class: 'review-content-card-id' }, String((props.content as { card?: { id?: string } }).card?.id || ''));
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  emits: ['grade'],
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

describe('ReviewView SRS editor scheduling', () => {
  beforeEach(() => {
    createVueDialogMock.mockClear();
  });

  it('removes the current review card and advances when the SRS editor schedules it', async () => {
    const firstCard = buildCard('card-1', 42);
    const secondCard = buildCard('card-2', 7);
    const queue = createQueue([firstCard, secondCard]);
    const adapter = createAdapter();

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
              getCard: (cardId: string) => (cardId === firstCard.id ? firstCard : secondCard),
              getCardByBlockId: (blockId: string) => (blockId === firstCard.blockId ? firstCard : secondCard),
            }),
            getReviewService: () => ({
              getSiyuanApi: () => ({
                BUILTIN_DECK_ID: 'deck-1',
              }),
            }),
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
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-srs', new MouseEvent('click'));
    await flushPromises();

    expect(createVueDialogMock).toHaveBeenCalledTimes(1);
    const dialogOptions = createVueDialogMock.mock.calls[0]?.[0] as {
      props?: {
        schedulingContext?: unknown;
      };
      events?: {
        scheduled?: (payload: unknown) => Promise<void> | void;
        dismissed?: (payload: unknown) => Promise<void> | void;
      };
    };
    expect(dialogOptions.props?.schedulingContext).toEqual(expect.objectContaining(queue.schedulingContext));

    await dialogOptions.events?.scheduled?.({
      cardId: firstCard.id,
      dueTimestamp: Date.now() + 86_400_000,
    });
    await flushPromises();

    expect(queue.removeCard).toHaveBeenCalledWith(firstCard.id);
    expect(queue.onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: firstCard.id }),
      { action: 'skip' },
    );
    expect(queue.next).toHaveBeenCalledTimes(2);
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('does not build Arena advice on entry and passes rating plus queue context after grading', async () => {
    const firstCard = buildCard('card-1', 42);
    const queue = createQueue([firstCard]);
    const adapter = createAdapter();
    const buildSrsRecommendation = vi.fn(async () => ({
      shouldHighlight: true,
      summary: 'Arena after grade',
    }));

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        plugin: {
          getContext: () => ({
            getArenaKernelService: () => ({ buildSrsRecommendation }),
            getSchedulerRouter: () => ({ getSchedulerType: () => 'fsrs-v6' }),
            getUnifiedDataSourceManager: () => null,
            getStorage: () => ({
              getSettings: () => ({}),
              getCard: () => firstCard,
              getCardByBlockId: () => firstCard,
            }),
            getReviewService: () => ({
              getSiyuanApi: () => ({ BUILTIN_DECK_ID: 'deck-1' }),
            }),
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
    expect(buildSrsRecommendation).not.toHaveBeenCalled();

    wrapper.getComponent(ReviewActionsStub).vm.$emit('grade', 2);
    await flushPromises();

    expect(buildSrsRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ id: firstCard.id }),
      'fsrs-v6',
      expect.any(Number),
      expect.objectContaining({
        ratingBasis: 2,
        schedulingContext: expect.objectContaining(queue.schedulingContext),
      }),
    );

    wrapper.unmount();
  });

  it('removes the current review card and advances when the SRS editor dismisses it', async () => {
    const firstCard = buildCard('card-1', 42);
    const secondCard = buildCard('card-2', 7);
    const queue = createQueue([firstCard, secondCard]);
    const adapter = createAdapter();

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
              getCard: (cardId: string) => (cardId === firstCard.id ? firstCard : secondCard),
              getCardByBlockId: (blockId: string) => (blockId === firstCard.blockId ? firstCard : secondCard),
            }),
            getReviewService: () => ({
              getSiyuanApi: () => ({
                BUILTIN_DECK_ID: 'deck-1',
              }),
            }),
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
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-srs', new MouseEvent('click'));
    await flushPromises();

    const dialogOptions = createVueDialogMock.mock.calls[0]?.[0] as {
      events?: {
        dismissed?: (payload: unknown) => Promise<void> | void;
      };
    };

    await dialogOptions.events?.dismissed?.({
      cardId: firstCard.id,
      blockId: firstCard.blockId,
      dismissed: true,
    });
    await flushPromises();

    expect(queue.removeCard).toHaveBeenCalledWith(firstCard.id);
    expect(queue.onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: firstCard.id }),
      { action: 'skip' },
    );
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });
});
