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
      templateID: 'builtin-concept-descriptor-both',
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

const reviewContentRefreshVisibleContent = vi.fn(async () => true);

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  setup() {
    return () => h('div', { class: 'review-header-stub' });
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  emits: ['editor-state-change'],
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
      getDependencyBlockIds: () => [
        'concept-block',
        'descriptor-block-1',
        'descriptor-group-block',
        'descriptor-group-paragraph',
        'answer-block',
      ],
      refreshVisibleContent: reviewContentRefreshVisibleContent,
    });

    return () => h(
      'div',
      { class: 'review-render-state' },
      [
        String((props.content as { card?: { id?: string; meta?: { templateID?: string } } }).card?.id || ''),
        String((props.content as { id?: string }).id || ''),
        String((props.content as { card?: { meta?: { templateID?: string } } }).card?.meta?.templateID || ''),
        String(props.renderEpoch || 0),
      ].join(':'),
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
    }, 'Grade');
  },
});

describe('ReviewView source block refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reviewContentRefreshVisibleContent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not register ws-main source refresh by default', async () => {
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
          AiWorkbenchPane: true,
          LargeTextEditorDialog: true,
          teleport: true,
        },
      },
    });

    await flushPromises();
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(eventBus.on).not.toHaveBeenCalledWith('ws-main', expect.any(Function));
    expect(wsMainListener).toBeNull();
    expect(reviewContentRefreshVisibleContent).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('refreshes the current review surface when enabled ws-main transactions touch current dependency blocks', async () => {
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
                ui: {
                  reviewSourceBlockRefreshEnabled: true,
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
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(eventBus.on).toHaveBeenCalledWith('ws-main', expect.any(Function));

    wsMainListener?.({
      detail: {
        cmd: 'transactions',
        data: [{
          doOperations: [{
            action: 'update',
            id: 'descriptor-group-paragraph',
          }],
          undoOperations: null,
        }],
      },
    });
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(1);
    expect(reviewContentRefreshVisibleContent).toHaveBeenLastCalledWith('source-transaction');
    expect(manager.getCard).not.toHaveBeenCalled();

    wsMainListener?.({
      detail: {
        cmd: 'transactions',
        data: [{
          doOperations: [{
            action: 'update',
            id: 'descriptor-block-1',
          }],
          undoOperations: null,
        }],
      },
    });
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(2);

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

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(2);

    wrapper.getComponent(ReviewContentStub).vm.$emit('editor-state-change', {
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: true,
    });
    await flushPromises();

    wsMainListener?.({
      detail: {
        cmd: 'transactions',
        data: [{
          doOperations: [{
            action: 'update',
            id: 'descriptor-block-1',
          }],
          undoOperations: null,
        }],
      },
    });
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it('drops pending source refresh while local advance is pending', async () => {
    const initialCard = buildCard('descriptor-card-1', 'descriptor-block-1', { type: 'descriptor' });
    const nextCard = buildCard('descriptor-card-2', 'descriptor-block-2', { type: 'descriptor' });
    let wsMainListener: ((payload: unknown) => void) | null = null;

    const queue = {
      next: vi.fn()
        .mockResolvedValueOnce(initialCard)
        .mockResolvedValueOnce(nextCard),
      onFeedback: vi.fn(async () => {
        wsMainListener?.({
          detail: {
            cmd: 'transactions',
            data: [{
              doOperations: [{
                action: 'update',
                id: 'descriptor-block-1',
              }],
              undoOperations: null,
            }],
          },
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
          item: 0,
          descriptor: 2,
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
      getCard: vi.fn(async () => initialCard),
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
                ui: {
                  reviewSourceBlockRefreshEnabled: true,
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
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');

    await wrapper.get('.review-grade-button').trigger('click');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toContain('descriptor-card-2:descriptor-block-2');
    expect(reviewContentRefreshVisibleContent).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
