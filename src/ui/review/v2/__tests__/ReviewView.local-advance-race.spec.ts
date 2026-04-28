// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

function buildCard(id: string, priority: number) {
  return {
    id,
    cardID: id,
    blockId: `block-${id}`,
    blockID: `block-${id}`,
    deckId: 'deck-1',
    due: Date.now(),
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {},
  };
}

function createAdapter() {
  return {
    toUIState: vi.fn(async (_queue: unknown, item: ReturnType<typeof buildCard> | null, context: { showAnswer?: boolean }) => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        priorityBadge: {
          label: 'P',
          value: item ? String(item.priority) : '-',
          priority: item?.priority ?? null,
          ariaLabel: item ? `Priority ${item.priority}` : 'Priority -',
        },
        stats: {
          current: 2,
          total: 2,
          label: '2 due',
          queueName: 'Unified Queue',
        },
      },
      content: {
        type: 'protyle' as const,
        data: item?.blockId ?? '',
        id: item?.blockId ?? '',
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
  props: {
    header: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h(
      'div',
      { class: 'review-header-priority' },
      String((props.header as { priorityBadge?: { value?: string } }).priorityBadge?.value || '-'),
    );
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
    return () => h(
      'div',
      { class: 'review-current-card' },
      String((props.content as { card?: { id?: string } }).card?.id || 'empty'),
    );
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  emits: ['grade'],
  setup(_props, { emit }) {
    return () => h('button', {
      class: 'review-grade-button',
      onClick: () => emit('grade', 3),
    }, 'Next');
  },
});

describe('ReviewView local advance race guard', () => {
  it('keeps the newly advanced card when a card-updated refresh for the previous card lands mid-grade', async () => {
    const initialCard = buildCard('card-1', 42);
    const updatedCurrentCard = { ...initialCard, priority: 7 };
    const nextCard = buildCard('card-2', 5);

    let observer: { onDataChanged: (event: { type: string; cardIds?: string[]; timestamp: number }) => void } | null = null;

    const queue = {
      next: vi.fn()
        .mockResolvedValueOnce(initialCard)
        .mockResolvedValueOnce(nextCard),
      onFeedback: vi.fn(async () => {
        queueMicrotask(() => {
          observer?.onDataChanged({
            type: 'card-updated',
            cardIds: [initialCard.id],
            timestamp: Date.now(),
          });
        });
        await Promise.resolve();
      }),
      getStats: vi.fn(async () => ({ size: 2, label: '2 due' })),
      getCounterSnapshot: vi.fn(async () => ({
        version: 1,
        remaining: 2,
        due: 2,
        total: 2,
        buckets: {
          all: 2,
          item: 2,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
        source: 'hot' as const,
      })),
      getUIConfig: vi.fn(() => ({
        statsType: 'queue-size' as const,
        showRatingButtons: true,
        allowSkip: true,
      })),
      canGoBack: vi.fn(() => false),
    };

    const adapter = createAdapter();
    const manager = {
      registerObserver: vi.fn((nextObserver: typeof observer) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
      getCard: vi.fn(async () => updatedCurrentCard),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getStorage: () => ({
              getSettings: () => ({}),
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
    expect(wrapper.get('.review-current-card').text()).toBe('card-1');

    await wrapper.get('.review-grade-button').trigger('click');
    await flushPromises();
    await flushPromises();

    expect(manager.getCard).not.toHaveBeenCalled();
    expect(wrapper.get('.review-current-card').text()).toBe('card-2');
    expect(wrapper.get('.review-header-priority').text()).toBe('5');

    wrapper.unmount();
  });
});
