// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewNeuralModeMocks = vi.hoisted(() => ({
  showMessage: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: reviewViewNeuralModeMocks.showMessage,
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
    priority: 10,
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

function createNeuralQueue(
  navigationMode: 'follow' | 'explore' = 'follow',
  engineMode: 'orbit' | 'hyperspace' = 'orbit',
) {
  const historyEntries: Array<{ eventId: string; nodeId: string }> = [];
  return {
    getEngineMode: vi.fn(() => engineMode),
    setEngineMode: vi.fn(async () => undefined),
    getSourceSnapshot: vi.fn(() => []),
    setSourceEntry: vi.fn(async () => undefined),
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
      engineMode,
      engineSessionId: 'engine-session-1',
      navigationMode,
      currentPathIndex: 0,
      pathLength: 3,
      hasBookmark: true,
      currentNodeId: 'block-1',
      currentEventId: 'event-1',
      sessionId: 'session-1',
      currentFocus: 'concept-1',
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

function mountReviewView(neuralQueue: ReturnType<typeof createNeuralQueue>) {
  const card = buildCard();
  const queue = createQueue(card, neuralQueue);
  const adapter = createAdapter();

  return mount(ReviewView, {
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

describe('ReviewView neural nav mode', () => {
  beforeEach(() => {
    reviewViewNeuralModeMocks.showMessage.mockReset();
  });

  it('promotes the current node to worldline focus when switching from follow to explore', async () => {
    const neuralQueue = createNeuralQueue('follow');
    const wrapper = mountReviewView(neuralQueue);

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'neural-nav-mode', new MouseEvent('click'));
    await flushPromises();

    expect(neuralQueue.setAnchorEntry).toHaveBeenCalledWith('block-1', true);
    expect(neuralQueue.setCurrentFocus).toHaveBeenCalledWith('block-1', {
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(neuralQueue.setNavigationMode).not.toHaveBeenCalled();
    expect(reviewViewNeuralModeMocks.showMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('自由航行'),
      2000,
      'info',
    );

    wrapper.unmount();
  });

  it('builds a station and switches the orbit center from the review toolbar', async () => {
    const neuralQueue = createNeuralQueue('follow', 'orbit');
    const wrapper = mountReviewView(neuralQueue);

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'lock-focus', new MouseEvent('click'));
    await flushPromises();

    expect(neuralQueue.setAnchorEntry).toHaveBeenCalledWith('block-1', true);
    expect(neuralQueue.setCurrentFocus).toHaveBeenCalledWith('block-1', {
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(reviewViewNeuralModeMocks.showMessage).toHaveBeenLastCalledWith(
      '已建立空间站，并切换为当前轨道中心',
      3000,
      'info',
    );

    wrapper.unmount();
  });

  it('builds a station and switches the primary activation source from the review toolbar', async () => {
    const neuralQueue = createNeuralQueue('follow', 'hyperspace');
    const wrapper = mountReviewView(neuralQueue);

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'lock-focus', new MouseEvent('click'));
    await flushPromises();

    expect(neuralQueue.setAnchorEntry).toHaveBeenCalledWith('block-1', true);
    expect(neuralQueue.setCurrentFocus).toHaveBeenCalledWith('block-1', {
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    expect(reviewViewNeuralModeMocks.showMessage).toHaveBeenLastCalledWith(
      '已建立空间站，并切换为当前主激活源',
      3000,
      'info',
    );

    wrapper.unmount();
  });

  it('uses plain navigation mode switching when leaving explore for follow', async () => {
    const neuralQueue = createNeuralQueue('explore');
    const wrapper = mountReviewView(neuralQueue);

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'neural-nav-mode', new MouseEvent('click'));
    await flushPromises();

    expect(neuralQueue.setNavigationMode).toHaveBeenCalledWith('follow');
    expect(neuralQueue.setCurrentFocus).not.toHaveBeenCalled();
    expect(reviewViewNeuralModeMocks.showMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('沿当前路径'),
      2000,
      'info',
    );

    wrapper.unmount();
  });
});
