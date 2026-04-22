// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

function buildCard(id: string, blockId: string, options?: { type?: string }) {
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
    meta: {
      frontBlockIDs: ['concept-block'],
      backBlockIDs: [blockId],
      fieldMapping: {
        concept: 'concept-block',
        descriptor: blockId,
      },
    },
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
          queueName: 'Review',
        },
      },
      content: {
        type: 'protyle' as const,
        data: item?.blockId ?? '',
        id: item?.blockId ?? '',
        answerBlockID: 'answer-block',
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
    renderEpoch: {
      type: Number,
      default: 0,
    },
  },
  setup(props, { expose }) {
    expose({
      getDependencyBlockIds: () => ['concept-block', 'descriptor-block-1', 'answer-block'],
    });

    return () => h(
      'div',
      { class: 'review-render-state' },
      `${String((props.content as { card?: { id?: string } }).card?.id || '')}:${String(props.renderEpoch || 0)}`,
    );
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

describe('ReviewView source block refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the current review surface when ws-main transactions touch current dependency blocks', async () => {
    const currentCard = buildCard('descriptor-card-1', 'descriptor-block-1', { type: 'descriptor' });
    const queue = createQueue(currentCard);
    const adapter = createAdapter();
    let wsMainListener: ((payload: unknown) => void) | null = null;

    const eventBus = {
      on: vi.fn((event: string, listener: (payload: unknown) => void) => {
        if (event === 'ws-main') {
          wsMainListener = listener;
        }
      }),
      off: vi.fn(),
    };
    const manager = {
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      getCard: vi.fn(async () => currentCard),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        title: '自定义复习',
        queue: queue as never,
        adapter: adapter as never,
        plugin: {
          eventBus,
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getStorage: () => ({
              getSettings: () => ({
                quickCard: {
                  enabled: false,
                },
                riffIntegration: {
                  incrementalSync: {
                    enabled: false,
                  },
                },
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
          AiWorkbenchPane: true,
          LargeTextEditorDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:0');

    wsMainListener?.({
      detail: {
        cmd: 'transactions',
        data: [{
          doOperations: [{
            action: 'update',
            id: 'concept-block',
          }],
          undoOperations: null,
        }],
      },
    });
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:1');
    expect(manager.getCard).not.toHaveBeenCalled();

    wsMainListener?.({
      detail: {
        cmd: 'transactions',
        data: [{
          doOperations: [{
            action: 'update',
            id: 'unrelated-block',
          }],
          undoOperations: null,
        }],
      },
    });
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:1');

    wrapper.unmount();
  });
});
