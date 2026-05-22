// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import type { ReviewViewTabBridge } from '../types';
import { createEmptyReviewUIState } from '../types';

vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: vi.fn(),
}));

const reviewContentRefreshVisibleContent = vi.fn(async () => true);

function buildCard(blockId: string) {
  const now = Date.now();
  return {
    id: `card:${blockId}`,
    cardID: `card:${blockId}`,
    blockId,
    blockID: blockId,
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

function buildAssociatedReviewCard(blockId: string, sourceVirtualNodeId: string) {
  return {
    ...buildCard(blockId),
    meta: {
      neuralContext: {
        isFlashcard: true,
        nodeRole: 'associated-review',
        sourceVirtualNodeId,
      },
    },
  };
}

function createNeuralQueue(currentNodeId: string | null, resolver?: (nodeId: string) => unknown) {
  const historyEntries: Array<{ eventId: string; nodeId: string }> = [];
  return {
    getEngineMode: vi.fn(() => 'orbit'),
    setEngineMode: vi.fn(async () => undefined),
    getSourceSnapshot: vi.fn(() => []),
    setSourceEntry: vi.fn(async () => undefined),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(async () => undefined),
    getAnchorSnapshot: vi.fn(() => []),
    setAnchorEntry: vi.fn(async () => undefined),
    clearAnchors: vi.fn(async () => undefined),
    getCurrentBatchSnapshot: vi.fn(() => []),
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
    getPathItemByNodeId: vi.fn(async (nodeId: string) => (
      typeof resolver === 'function' ? resolver(nodeId) : buildCard(nodeId)
    )),
    getNavigationState: vi.fn(() => ({
      engineMode: 'orbit' as const,
      engineSessionId: 'engine-session-1',
      navigationMode: 'follow' as const,
      currentPathIndex: 0,
      pathLength: 3,
      hasBookmark: true,
      currentNodeId,
      currentEventId: currentNodeId ? `event:${currentNodeId}` : null,
      sessionId: 'session-1',
      currentFocus: 'focus-1',
    })),
    setNavigationMode: vi.fn(),
    returnToBookmark: vi.fn(() => true),
    clearHistory: vi.fn(async () => undefined),
  };
}

function createQueue(initialCard: ReturnType<typeof buildCard>, underlyingQueue: unknown) {
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
    getUnderlyingQueue: vi.fn(() => underlyingQueue),
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
  props: {
    navigationState: {
      type: Object,
      default: null,
    },
  },
  setup() {
    return () => h('div', { class: 'review-header-stub' });
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  setup(_props, { expose }) {
    expose({
      refreshVisibleContent: reviewContentRefreshVisibleContent,
    });
    return () => h('div', { class: 'review-content-stub' });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  props: {
    currentCard: {
      type: Object,
      default: null,
    },
  },
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function mountReviewView(queue: unknown) {
  return mount(ReviewView, {
    props: {
      app: {} as never,
      queue: queue as never,
      adapter: createAdapter() as never,
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

describe('ReviewView neural tab bridge', () => {
  beforeEach(() => {
    reviewContentRefreshVisibleContent.mockClear();
    reviewContentRefreshVisibleContent.mockResolvedValue(true);
  });

  it('soft-refreshes the tab surface when the explicit card id already matches the current card', async () => {
    const initialCard = buildCard('block-initial');
    const manager = {
      getCard: vi.fn(),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };
    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        mode: 'tab',
        queue: createQueue(initialCard, {}) as never,
        adapter: createAdapter() as never,
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

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.refreshTabSurface(initialCard.id)).resolves.toBe(true);
    await flushPromises();

    expect(manager.getCard).not.toHaveBeenCalled();
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledWith('tab-surface');
    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      id: initialCard.id,
    });

    wrapper.unmount();
  });

  it('hydrates the tab surface when an explicit non-current card id is requested', async () => {
    const initialCard = buildCard('block-initial');
    const refreshedCard = {
      ...buildCard('block-refreshed'),
      meta: {
        forceQuickRender: true,
        renderProfile: 'quick-default',
      },
    };
    const manager = {
      getCard: vi.fn(async () => refreshedCard),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };
    const wrapper = mount(ReviewView, {
      props: {
        app: {} as never,
        mode: 'tab',
        queue: createQueue(initialCard, {}) as never,
        adapter: createAdapter() as never,
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

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.refreshTabSurface(refreshedCard.id)).resolves.toBe(true);
    await flushPromises();

    expect(manager.getCard).toHaveBeenCalledWith(refreshedCard.id, { silent: true });
    expect(reviewContentRefreshVisibleContent).not.toHaveBeenCalled();
    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      id: refreshedCard.id,
      meta: {
        forceQuickRender: true,
        renderProfile: 'quick-default',
      },
    });

    wrapper.unmount();
  });

  it('loads the current neural navigation node into the review tab', async () => {
    const neuralQueue = createNeuralQueue('node-target');
    const wrapper = mountReviewView(createQueue(buildCard('block-initial'), neuralQueue));

    await flushPromises();

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.syncToNeuralQueueCurrentNode()).resolves.toBe(true);
    await flushPromises();

    expect(neuralQueue.getPathItemByNodeId).toHaveBeenCalledWith('node-target');
    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      blockId: 'node-target',
    });

    wrapper.unmount();
  });

  it('falls back to the provided node id when navigation state has no current node', async () => {
    const neuralQueue = createNeuralQueue(null);
    const wrapper = mountReviewView(createQueue(buildCard('block-initial'), neuralQueue));

    await flushPromises();

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.syncToNeuralQueueCurrentNode('node-fallback')).resolves.toBe(true);
    await flushPromises();

    expect(neuralQueue.getPathItemByNodeId).toHaveBeenCalledWith('node-fallback');
    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      blockId: 'node-fallback',
    });

    wrapper.unmount();
  });

  it('accepts associated-review cards whose real block id differs from the neural current node id', async () => {
    const requestedNodeId = 'virtual-node-1';
    const associatedCard = buildAssociatedReviewCard('special-block-1', requestedNodeId);
    const neuralQueue = createNeuralQueue(requestedNodeId, () => associatedCard);
    const wrapper = mountReviewView(createQueue(buildCard('block-initial'), neuralQueue));

    await flushPromises();

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.syncToNeuralQueueCurrentNode()).resolves.toBe(true);
    await flushPromises();

    expect(neuralQueue.getPathItemByNodeId).toHaveBeenCalledWith(requestedNodeId);
    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      blockId: 'special-block-1',
      meta: {
        neuralContext: {
          sourceVirtualNodeId: requestedNodeId,
        },
      },
    });

    wrapper.unmount();
  });

  it('returns false when neither navigation state nor fallback provide a node id', async () => {
    const neuralQueue = createNeuralQueue(null);
    const wrapper = mountReviewView(createQueue(buildCard('block-initial'), neuralQueue));

    await flushPromises();

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.syncToNeuralQueueCurrentNode()).resolves.toBe(false);

    expect(neuralQueue.getPathItemByNodeId).not.toHaveBeenCalled();
    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      blockId: 'block-initial',
    });

    wrapper.unmount();
  });

  it('returns false when the review queue is not a neural roam queue', async () => {
    const nonNeuralQueue = createQueue(buildCard('block-initial'), {});
    const wrapper = mountReviewView(nonNeuralQueue);

    await flushPromises();

    const bridge = wrapper.vm as unknown as ReviewViewTabBridge;
    await expect(bridge.syncToNeuralQueueCurrentNode('node-fallback')).resolves.toBe(false);

    expect(wrapper.getComponent(ReviewActionsStub).props('currentCard')).toMatchObject({
      blockId: 'block-initial',
    });

    wrapper.unmount();
  });
});
