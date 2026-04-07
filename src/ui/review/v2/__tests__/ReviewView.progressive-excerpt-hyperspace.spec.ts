// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewExcerptMocks = vi.hoisted(() => ({
  showMessage: vi.fn(),
  resolveProgressiveSelection: vi.fn(),
  isProgressiveSelectionInsideNativeProtyle: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: reviewViewExcerptMocks.showMessage,
}));

vi.mock('@/application/entries/ProgressiveSelectionResolver', () => ({
  resolveProgressiveSelection: reviewViewExcerptMocks.resolveProgressiveSelection,
  isProgressiveSelectionInsideNativeProtyle: reviewViewExcerptMocks.isProgressiveSelectionInsideNativeProtyle,
}));

function buildCard() {
  const now = Date.now();
  return {
    id: 'card-topic-1',
    cardID: 'card-topic-1',
    blockId: 'topic-root-1',
    blockID: 'topic-root-1',
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
    priority: 10,
    type: 'topic',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {},
  };
}

function createNeuralQueue() {
  const historyEntries: Array<{ eventId: string; nodeId: string }> = [];
  return {
    getEngineMode: vi.fn(() => 'hyperspace'),
    setEngineMode: vi.fn(async () => undefined),
    getSourceSnapshot: vi.fn(() => []),
    setSourceEntry: vi.fn(async () => undefined),
    injectExcerptIntoHyperspace: vi.fn(async () => true),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(async () => undefined),
    getAnchorSnapshot: vi.fn(() => []),
    setAnchorEntry: vi.fn(async () => undefined),
    clearAnchors: vi.fn(async () => undefined),
    getConceptBlocks: vi.fn(() => []),
    getFocusPoolSnapshot: vi.fn(() => []),
    setFocusPoolEntry: vi.fn(async () => undefined),
    clearFocusPool: vi.fn(async () => undefined),
    setCurrentFocus: vi.fn(async () => undefined),
    startRoamingFromFocus: vi.fn(async () => undefined),
    getHistoryCount: vi.fn(() => historyEntries.length),
    getHistoryPage: vi.fn(({ offset, limit }: { offset: number; limit: number }) => ({
      entries: historyEntries.slice().reverse().slice(offset, offset + limit),
      totalCount: historyEntries.length,
      hasMore: offset + limit < historyEntries.length,
    })),
    getHistorySnapshot: vi.fn(() => historyEntries),
    getHistoryEntryByEventId: vi.fn((eventId: string) => historyEntries.find((entry) => entry.eventId === eventId) ?? null),
    getHistoryEntriesByNodeId: vi.fn((nodeId: string) => historyEntries.filter((entry) => entry.nodeId === nodeId)),
    getHistoryHitCount: vi.fn((nodeId: string) => historyEntries.filter((entry) => entry.nodeId === nodeId).length),
    getActivationTrace: vi.fn(() => null),
    getSessionFocusStack: vi.fn(() => []),
    getPinnedFocusBlocks: vi.fn(() => []),
    setPinnedFocusBlock: vi.fn(async () => undefined),
    jumpToHistoryNode: vi.fn(async () => true),
    getPathItemByNodeId: vi.fn(async () => null),
    getNavigationState: vi.fn(() => ({
      engineMode: 'hyperspace' as const,
      engineSessionId: 'engine-session-1',
      navigationMode: 'follow' as const,
      currentPathIndex: 0,
      pathLength: 3,
      hasBookmark: true,
      currentNodeId: 'topic-root-1',
      currentEventId: 'event-1',
      sessionId: 'session-1',
      currentFocus: 'topic-root-1',
    })),
    setNavigationMode: vi.fn(),
    returnToBookmark: vi.fn(() => true),
    clearHistory: vi.fn(),
  };
}

function createQueue(card: ReturnType<typeof buildCard>, neuralQueue: ReturnType<typeof createNeuralQueue>) {
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
    getUnderlyingQueue: vi.fn(() => neuralQueue),
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
          queueName: 'Neural Roam',
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
              type: 'topic',
              cardType: 'topic',
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

function mountReviewView(options: {
  neuralQueue: ReturnType<typeof createNeuralQueue>;
  createFromSelection: ReturnType<typeof vi.fn>;
}) {
  const card = buildCard();
  const queue = createQueue(card, options.neuralQueue);
  const adapter = createAdapter();

  return mount(ReviewView, {
    props: {
      app: {} as never,
      queue: queue as never,
      adapter: adapter as never,
      plugin: {
        getContext: () => ({
          getUnifiedDataSourceManager: () => null,
          getSettingsService: () => ({
            getSettings: () => ({
              progressiveReading: {
                altXExcerptEnabled: true,
              },
            }),
          }),
          getSelectionExcerptService: () => ({
            createFromSelection: options.createFromSelection,
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
}

describe('ReviewView progressive excerpt hyperspace routing', () => {
  beforeEach(() => {
    reviewViewExcerptMocks.showMessage.mockReset();
    reviewViewExcerptMocks.resolveProgressiveSelection.mockReset();
    reviewViewExcerptMocks.isProgressiveSelectionInsideNativeProtyle.mockReset();
    reviewViewExcerptMocks.resolveProgressiveSelection.mockReturnValue({
      blockId: 'source-block-1',
      text: 'Selected excerpt text',
    });
    reviewViewExcerptMocks.isProgressiveSelectionInsideNativeProtyle.mockReturnValue(false);
  });

  it('merges review excerpts into the current hyperspace session without building stations', async () => {
    const neuralQueue = createNeuralQueue();
    const createFromSelection = vi.fn(async () => ({
      excerptDocId: 'excerpt-doc-1',
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      dailyNoteDocId: 'daily-note-1',
    }));
    const wrapper = mountReviewView({
      neuralQueue,
      createFromSelection,
    });

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'progressive-excerpt', new MouseEvent('click'));
    await flushPromises();

    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-1',
      selectedText: 'Selected excerpt text',
      origin: 'review',
      currentCardId: 'card-topic-1',
    });
    expect(neuralQueue.injectExcerptIntoHyperspace).toHaveBeenCalledWith('excerpt-doc-1', {
      currentNodeId: 'topic-root-1',
      currentEventId: 'event-1',
    });
    expect(neuralQueue.setAnchorEntry).not.toHaveBeenCalled();
    expect(neuralQueue.setCurrentFocus).not.toHaveBeenCalled();
    expect(reviewViewExcerptMocks.showMessage).toHaveBeenLastCalledWith(
      '摘抄已创建、制为 Topic，并并入当前超空间神经漫游',
      3000,
      'info',
    );

    wrapper.unmount();
  });
});
