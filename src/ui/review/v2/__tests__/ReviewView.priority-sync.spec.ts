// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

function buildCard(priority: number) {
  return {
    id: 'card-1',
    cardID: 'card-1',
    blockId: 'block-1',
    blockID: 'block-1',
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

function createQueue(initialCard: ReturnType<typeof buildCard>) {
  return {
    next: vi.fn(async () => initialCard),
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
          current: 1,
          total: 1,
          label: '1 due',
          queueName: 'Unified Queue',
        },
        priorityBadge: {
          label: 'P',
          value: item ? String(item.priority) : '-',
          priority: item?.priority ?? null,
          ariaLabel: item ? `Priority ${item.priority}` : 'Priority -',
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
    return () => h('div', { class: 'review-header-priority' }, String((props.header as { priorityBadge?: { value?: string } }).priorityBadge?.value || '-'));
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

describe('ReviewView priority badge sync', () => {
  it('refreshes the header priority badge when the current card is updated externally', async () => {
    const initialCard = buildCard(42);
    const updatedCard = { ...initialCard, priority: 7 };
    const queue = createQueue(initialCard);
    const adapter = createAdapter();
    let observer: { onDataChanged: (event: { type: string; cardIds?: string[]; timestamp: number }) => void } | null = null;

    const manager = {
      registerObserver: vi.fn((nextObserver: typeof observer) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
      getCard: vi.fn(async () => updatedCard),
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
    expect(wrapper.get('.review-header-priority').text()).toBe('42');

    observer?.onDataChanged({
      type: 'card-updated',
      cardIds: ['card-1'],
      timestamp: Date.now(),
    });
    await flushPromises();

    expect(manager.getCard).toHaveBeenCalledWith('card-1');
    expect(wrapper.get('.review-header-priority').text()).toBe('7');

    wrapper.unmount();
  });
});
