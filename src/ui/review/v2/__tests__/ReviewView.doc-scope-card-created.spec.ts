// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

function buildCard(id: string, blockId: string, options?: { rootId?: string; type?: string }) {
  return {
    id,
    cardID: id,
    blockId,
    blockID: blockId,
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
    priority: 50,
    type: options?.type || 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: options?.rootId ? { rootId: options.rootId } : {},
  };
}

function createQueue(initialCard: ReturnType<typeof buildCard>, filterQueue: {
  getFilter: () => { blockIds?: string[]; scopeDocIds?: string[]; cardType?: string };
  getSize: ReturnType<typeof vi.fn>;
}) {
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
    getUnderlyingQueue: () => filterQueue,
    appendCardsToTail: vi.fn(() => 1),
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
          queueName: 'Doc Scope Review',
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
              type: item.type,
              cardType: item.type,
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
    title: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    return () => h('div', { class: 'review-header-title' }, props.title || '');
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
      String((props.content as { card?: { id?: string } }).card?.id || ''),
    );
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

describe('ReviewView doc-scope card-created sync', () => {
  it('appends matching created cards to the tail without replacing the current card', async () => {
    const currentCard = buildCard('topic-card-1', 'topic-block-1', { rootId: 'doc-1', type: 'topic' });
    const createdItemCard = buildCard('item-card-2', 'item-block-2', { rootId: 'doc-1', type: 'item' });
    const currentFilter = {
      blockIds: ['topic-block-1'],
      scopeDocIds: ['doc-1'],
    };
    const filterQueue = {
      getFilter: vi.fn(() => currentFilter),
      getSize: vi.fn(async () => 2),
    };
    const setFilterGroupFilter = vi.fn(async (nextFilter) => {
      currentFilter.blockIds = nextFilter.blockIds;
      return true;
    });
    const queue = createQueue(currentCard, filterQueue);
    const adapter = createAdapter();
    let observer: { onDataChanged: (event: { type: string; cardIds?: string[]; timestamp: number }) => void } | null = null;

    const manager = {
      registerObserver: vi.fn((nextObserver: typeof observer) => {
        observer = nextObserver;
      }),
      unregisterObserver: vi.fn(),
      getCard: vi.fn(async () => createdItemCard),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        title: '文档范围复习',
        queue: queue as never,
        adapter: adapter as never,
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getBrowserService: () => ({
              setFilterGroupFilter,
            }),
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
    expect(wrapper.get('.review-current-card').text()).toBe('topic-card-1');

    observer?.onDataChanged({
      type: 'card-created',
      cardIds: ['item-card-2'],
      timestamp: Date.now(),
    });
    await flushPromises();

    expect(manager.getCard).toHaveBeenCalledWith('item-card-2', { silent: true });
    expect(setFilterGroupFilter).toHaveBeenCalledWith({
      blockIds: ['topic-block-1', 'item-block-2'],
      scopeDocIds: ['doc-1'],
    });
    expect(queue.appendCardsToTail).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'item-card-2',
        blockId: 'item-block-2',
      }),
    ]);
    expect(wrapper.get('.review-current-card').text()).toBe('topic-card-1');

    wrapper.unmount();
  });
});
