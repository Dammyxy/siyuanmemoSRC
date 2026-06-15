// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewSourceBlockRefreshMocks = vi.hoisted(() => ({
  showMessage: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock('siyuan', () => ({
  Menu: class MockMenu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = vi.fn();
  },
  showMessage: reviewSourceBlockRefreshMocks.showMessage,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewSourceBlockRefreshMocks.logger,
  logger: reviewSourceBlockRefreshMocks.logger,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

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

function createCleanDomainSyncDiagnostics() {
  return {
    ok: true,
    sanity: {
      status: 'clean',
      repairableDivergenceCount: 0,
      unrepairableDivergenceCount: 0,
      divergentLedgerCount: 0,
      skippedSourceCount: 0,
      pendingImportCount: 0,
      divergentCardCount: 0,
      reasonCounts: {},
      affectedCardIds: [],
      truncated: false,
    },
  };
}

function createReviewSourceRefreshService() {
  return {
    executeReviewSourceRefresh: vi.fn(async (request: {
      commandId: string;
      idempotencyKey: string;
      changedBlockIds: string[];
      dependencyBlockIds: string[];
      deadlineAt?: number | null;
    }) => {
      const dependencyBlockIds = new Set(request.dependencyBlockIds);
      const matchedBlockIds = request.changedBlockIds.filter((blockId) => dependencyBlockIds.has(blockId));
      return {
        status: matchedBlockIds.length > 0 ? 'refresh-required' : 'no-op',
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        matchedBlockIds,
        impact: {
          refreshVisibleContent: matchedBlockIds.length > 0,
          cleanupMissingSource: false,
        },
        diagnostics: {
          diagnosticEventId: `test:${request.commandId}`,
          family: 'review.source-refresh',
          commandId: request.commandId,
          timing: {
            submittedAt: 0,
            deadlineAt: request.deadlineAt ?? null,
            completedAt: 0,
          },
        },
      };
    }),
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
        String((props.content as { id?: string }).id || ''),
        String((props.content as { card?: { blockId?: string } }).card?.blockId || ''),
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

type ReviewTransactionHandler = {
  handle(transactions: Array<{ doOperations?: Array<{ action?: string; id?: string }> | null }>): void;
};

function createTransactionService() {
  let registeredHandler: ReviewTransactionHandler | null = null;
  const service = {
    registerHandler: vi.fn((handler: ReviewTransactionHandler) => {
      registeredHandler = handler;
    }),
    unregisterHandler: vi.fn((handler: ReviewTransactionHandler) => {
      if (registeredHandler === handler) {
        registeredHandler = null;
      }
    }),
  };

  return {
    service,
    emitBlockUpdate(blockId: string) {
      registeredHandler?.handle([{
        doOperations: [{
          action: 'update',
          id: blockId,
        }],
      }]);
    },
    getRegisteredHandler: () => registeredHandler,
  };
}

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
    const transactionService = createTransactionService();

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
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getTransactionWebSocketService: () => transactionService.service,
            getReviewService: () => createReviewSourceRefreshService(),
            readDomainSyncDiagnostics: vi.fn(async () => createCleanDomainSyncDiagnostics()),
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
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(transactionService.service.registerHandler).not.toHaveBeenCalled();
    expect(transactionService.getRegisteredHandler()).toBeNull();
    expect(reviewContentRefreshVisibleContent).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('refreshes the current review surface when enabled ws-main transactions touch current dependency blocks', async () => {
    const currentCard = buildCard('descriptor-card-1', 'descriptor-block-1', { type: 'descriptor' });
    const queue = createQueue(currentCard);
    const adapter = createAdapter();
    const transactionService = createTransactionService();

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
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getTransactionWebSocketService: () => transactionService.service,
            getReviewService: () => createReviewSourceRefreshService(),
            readDomainSyncDiagnostics: vi.fn(async () => createCleanDomainSyncDiagnostics()),
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
          teleport: true,
        },
      },
    });

    await flushPromises();
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(transactionService.service.registerHandler).toHaveBeenCalledTimes(1);

    transactionService.emitBlockUpdate('descriptor-group-paragraph');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(1);
    expect(reviewContentRefreshVisibleContent).toHaveBeenLastCalledWith('source-transaction');
    expect(manager.getCard).not.toHaveBeenCalled();

    transactionService.emitBlockUpdate('descriptor-block-1');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(2);

    transactionService.emitBlockUpdate('unrelated-block');
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

    transactionService.emitBlockUpdate('descriptor-block-1');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    expect(transactionService.service.unregisterHandler).toHaveBeenCalledTimes(1);
  });

  it('drops pending source refresh while local advance is pending', async () => {
    const initialCard = buildCard('descriptor-card-1', 'descriptor-block-1', { type: 'descriptor' });
    const nextCard = buildCard('descriptor-card-2', 'descriptor-block-2', { type: 'descriptor' });
    const transactionService = createTransactionService();

    const queue = {
      next: vi.fn()
        .mockResolvedValueOnce(initialCard)
        .mockResolvedValueOnce(nextCard),
      onFeedback: vi.fn(async () => {
        transactionService.emitBlockUpdate('descriptor-block-1');
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
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getTransactionWebSocketService: () => transactionService.service,
            getReviewService: () => createReviewSourceRefreshService(),
            readDomainSyncDiagnostics: vi.fn(async () => createCleanDomainSyncDiagnostics()),
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
          teleport: true,
        },
      },
    });

    await flushPromises();
    expect(transactionService.service.registerHandler).toHaveBeenCalledTimes(1);
    expect(wrapper.get('.review-render-state').text()).toBe('descriptor-card-1:descriptor-block-1:builtin-concept-descriptor-both:0');

    await wrapper.get('.review-grade-button').trigger('click');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toContain('descriptor-card-2:descriptor-block-2');
    expect(reviewContentRefreshVisibleContent).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(transactionService.service.unregisterHandler).toHaveBeenCalledTimes(1);
  });

  it('refreshes source subscription when visible content id changes without card id changing', async () => {
    const initialCard = buildCard('stable-card-id', 'old-visible-block', { type: 'descriptor' });
    const nextCard = buildCard('stable-card-id', 'new-visible-block', { type: 'descriptor' });
    const transactionService = createTransactionService();

    const queue = {
      next: vi.fn()
        .mockResolvedValueOnce(initialCard)
        .mockResolvedValueOnce(nextCard),
      onFeedback: vi.fn(async () => undefined),
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
    const manager = {
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
      getCard: vi.fn(async () => nextCard),
    };

    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        title: '自定义复习',
        queue: queue as never,
        adapter: adapter as never,
        plugin: {
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getTransactionWebSocketService: () => transactionService.service,
            getReviewService: () => createReviewSourceRefreshService(),
            readDomainSyncDiagnostics: vi.fn(async () => createCleanDomainSyncDiagnostics()),
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
          teleport: true,
        },
      },
    });

    await flushPromises();
    expect(wrapper.get('.review-render-state').text()).toBe('stable-card-id:old-visible-block:builtin-concept-descriptor-both:0');

    await wrapper.get('.review-grade-button').trigger('click');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('.review-render-state').text()).toContain('stable-card-id:new-visible-block');

    transactionService.emitBlockUpdate('new-visible-block');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(1);

    transactionService.emitBlockUpdate('old-visible-block');
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('renders main Review actions and dispatches grade through the Review session', async () => {
    const currentCard = buildCard('descriptor-card-1', 'descriptor-block-1', { type: 'descriptor' });
    const queue = createQueue(currentCard);
    const adapter = createAdapter();
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
          getContext: () => ({
            getUnifiedDataSourceManager: () => manager,
            getReviewService: () => createReviewSourceRefreshService(),
            readDomainSyncDiagnostics: vi.fn(async () => createCleanDomainSyncDiagnostics()),
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

    expect(wrapper.find('.review-grade-button').exists()).toBe(true);

    await wrapper.get('.review-grade-button').trigger('click');
    await flushPromises();

    expect(queue.onFeedback).toHaveBeenCalledWith(currentCard, expect.objectContaining({
      action: 'rate',
      rating: 3,
    }));

    wrapper.unmount();
  });
});
