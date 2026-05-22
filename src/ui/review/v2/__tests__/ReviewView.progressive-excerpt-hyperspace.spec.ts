// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';
import { PROGRESSIVE_EXCERPT_REQUEST_EVENT } from '@/application/handlers/ProgressiveExcerptHotkeyHandler';

const reviewViewExcerptMocks = vi.hoisted(() => ({
  showMessage: vi.fn(),
  resolveProgressiveExcerptSelectionSnapshot: vi.fn(),
  isProgressiveSelectionInsideNativeProtyle: vi.fn(),
  prepareProgressiveExcerptHighlight: vi.fn(),
  applyProgressiveExcerptHighlight: vi.fn(),
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
  resolveProgressiveExcerptSelectionSnapshot: reviewViewExcerptMocks.resolveProgressiveExcerptSelectionSnapshot,
  isProgressiveSelectionInsideNativeProtyle: reviewViewExcerptMocks.isProgressiveSelectionInsideNativeProtyle,
}));

vi.mock('@/application/entries/ProgressiveExcerptHighlight', () => ({
  prepareProgressiveExcerptHighlight: reviewViewExcerptMocks.prepareProgressiveExcerptHighlight,
  applyProgressiveExcerptHighlight: reviewViewExcerptMocks.applyProgressiveExcerptHighlight,
}));

const REVIEW_CONTENT_DOM = '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Selected <span data-type="a" data-href="https://example.com">excerpt</span> text</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>';

function createExcerptSelectionSnapshot(root: HTMLElement | null, overrides: Record<string, unknown> = {}) {
  const range = document.createRange();
  const commonElement = root || document.body;
  return {
    blockId: 'source-block-1',
    sourceBlockId: 'source-block-1',
    sourceBlockIds: ['source-block-1'],
    text: 'Selected excerpt text',
    contentDom: REVIEW_CONTENT_DOM,
    range,
    blockSelections: [{
      blockId: 'source-block-1',
      mode: 'range',
      excerptHtml: REVIEW_CONTENT_DOM,
      range: range.cloneRange(),
    }],
    commonElement,
    root,
    protyle: {
      wysiwyg: {
        element: commonElement,
      },
    },
    ...overrides,
  };
}

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
    clearHistory: vi.fn(async () => undefined),
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
  materializeExcerptSource?: ReturnType<typeof vi.fn>;
  tabApplicationService?: {
    openDocumentTab: ReturnType<typeof vi.fn>;
    openBlockTab: ReturnType<typeof vi.fn>;
  };
}) {
  const card = buildCard();
  const queue = createQueue(card, options.neuralQueue);
  const adapter = createAdapter();
  const tabApplicationService = options.tabApplicationService || {
    openDocumentTab: vi.fn(async () => undefined),
    openBlockTab: vi.fn(async () => undefined),
  };
  const materializeExcerptSource = options.materializeExcerptSource || vi.fn(async (selection: ReturnType<typeof createExcerptSelectionSnapshot>) => ({
    sourceBlockId: selection.sourceBlockId,
    sourceBlockIds: selection.sourceBlockIds,
    contentDom: selection.contentDom,
    highlightSnapshot: selection,
    reused: false,
  }));

  return mount(ReviewView, {
    attachTo: document.body,
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
            materializeExcerptSource,
            createFromSelection: options.createFromSelection,
            updateSourceBlockDom: vi.fn(async () => undefined),
          }),
          getTabApplicationService: () => tabApplicationService,
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
    document.body.innerHTML = '';
    reviewViewExcerptMocks.showMessage.mockReset();
    reviewViewExcerptMocks.resolveProgressiveExcerptSelectionSnapshot.mockReset();
    reviewViewExcerptMocks.isProgressiveSelectionInsideNativeProtyle.mockReset();
    reviewViewExcerptMocks.prepareProgressiveExcerptHighlight.mockReset();
    reviewViewExcerptMocks.prepareProgressiveExcerptHighlight.mockReturnValue({
      blockId: 'source-block-1',
      previousBlockHtml: '<div data-node-id="source-block-1">Selected excerpt text</div>',
      nextBlockHtml: '<div data-node-id="source-block-1"><span data-type="text" style="background-color: var(--b3-font-background4);">Selected excerpt text</span></div>',
      root: document.body,
      protyle: { getInstance: () => ({ reload: vi.fn() }) },
      alreadyApplied: false,
    });
    reviewViewExcerptMocks.applyProgressiveExcerptHighlight.mockReset();
    reviewViewExcerptMocks.applyProgressiveExcerptHighlight.mockResolvedValue(true);
    reviewViewExcerptMocks.resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(
      createExcerptSelectionSnapshot(document.body),
    );
    reviewViewExcerptMocks.isProgressiveSelectionInsideNativeProtyle.mockReturnValue(false);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('merges review excerpts into the current hyperspace session without building stations', async () => {
    const neuralQueue = createNeuralQueue();
    const createFromSelection = vi.fn(async () => ({
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc',
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      containerDocId: 'daily-note-1',
      recordId: 'record-1',
      colorApplied: false,
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
      sourceBlockIds: ['source-block-1'],
      selectedText: 'Selected excerpt text',
      contentDom: REVIEW_CONTENT_DOM,
      origin: 'review',
      currentCardId: 'card-topic-1',
    });
    expect(reviewViewExcerptMocks.prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(reviewViewExcerptMocks.applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(neuralQueue.injectExcerptIntoHyperspace).toHaveBeenCalledWith('excerpt-doc-1', {
      currentNodeId: 'topic-root-1',
      currentEventId: 'event-1',
    });
    expect(neuralQueue.setAnchorEntry).not.toHaveBeenCalled();
    expect(neuralQueue.setCurrentFocus).not.toHaveBeenCalled();
    expect(reviewViewExcerptMocks.showMessage).toHaveBeenLastCalledWith(
      '已创建 Topic，并并入当前超空间神经漫游',
      3000,
      'info',
    );

    wrapper.unmount();
  });

  it('uses the new Alt+Shift+X hotkey inside review and no longer reacts to Alt+X', async () => {
    const createFromSelection = vi.fn(async () => ({
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc',
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      containerDocId: 'daily-note-1',
      recordId: 'record-1',
      colorApplied: false,
    }));
    const wrapper = mountReviewView({
      neuralQueue: createNeuralQueue(),
      createFromSelection,
    });

    await flushPromises();

    const legacyEvent = new KeyboardEvent('keydown', {
      key: 'x',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    wrapper.element.dispatchEvent(legacyEvent);
    await flushPromises();

    expect(createFromSelection).not.toHaveBeenCalled();

    const nextHotkeyEvent = new KeyboardEvent('keydown', {
      key: 'x',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    wrapper.element.dispatchEvent(nextHotkeyEvent);
    await flushPromises();

    expect(createFromSelection).toHaveBeenCalledTimes(1);
    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      selectedText: 'Selected excerpt text',
      contentDom: REVIEW_CONTENT_DOM,
      origin: 'review',
      currentCardId: 'card-topic-1',
    });
    expect(reviewViewExcerptMocks.prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(reviewViewExcerptMocks.applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('claims the window-level command request when review owns the current excerpt context', async () => {
    const createFromSelection = vi.fn(async () => ({
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc',
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      containerDocId: 'daily-note-1',
      recordId: 'record-1',
      colorApplied: false,
    }));
    const wrapper = mountReviewView({
      neuralQueue: createNeuralQueue(),
      createFromSelection,
    });

    await flushPromises();
    (wrapper.element as HTMLElement).setAttribute('tabindex', '-1');
    (wrapper.element as HTMLElement).focus();

    const requestEvent = new CustomEvent(PROGRESSIVE_EXCERPT_REQUEST_EVENT, {
      cancelable: true,
      detail: { source: 'command' },
    });
    const dispatchResult = window.dispatchEvent(requestEvent);
    await flushPromises();

    expect(dispatchResult).toBe(false);
    expect(requestEvent.defaultPrevented).toBe(true);
    expect(createFromSelection).toHaveBeenCalledTimes(1);
    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      selectedText: 'Selected excerpt text',
      contentDom: REVIEW_CONTENT_DOM,
      origin: 'review',
      currentCardId: 'card-topic-1',
    });
    expect(reviewViewExcerptMocks.prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(reviewViewExcerptMocks.applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('keeps review excerpt creation successful when highlight replay throws', async () => {
    reviewViewExcerptMocks.applyProgressiveExcerptHighlight.mockImplementation(async () => {
      throw new Error('highlight failed');
    });
    const createFromSelection = vi.fn(async () => ({
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc',
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      containerDocId: 'daily-note-1',
      recordId: 'record-1',
      colorApplied: false,
    }));
    const wrapper = mountReviewView({
      neuralQueue: createNeuralQueue(),
      createFromSelection,
    });

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'progressive-excerpt', new MouseEvent('click'));
    await flushPromises();

    expect(createFromSelection).toHaveBeenCalledTimes(1);
    expect(reviewViewExcerptMocks.prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(reviewViewExcerptMocks.showMessage).toHaveBeenLastCalledWith(
      '已创建 Topic，并并入当前超空间神经漫游',
      3000,
      'info',
    );

    wrapper.unmount();
  });

  it('opens the existing excerpt instead of reinserting it when review excerpting hits a duplicate', async () => {
    const tabApplicationService = {
      openDocumentTab: vi.fn(async () => undefined),
      openBlockTab: vi.fn(async () => undefined),
    };
    const createFromSelection = vi.fn(async () => ({
      kind: 'duplicate' as const,
      record: {
        recordId: 'record-1',
        excerptEntityId: 'excerpt-doc-1',
        excerptEntityType: 'doc' as const,
        sourceDocId: 'doc-1',
        sourceBlockId: 'source-block-1',
        sourceBlockIds: ['source-block-1'],
        selectedText: 'Selected excerpt text',
        normalizedFingerprint: 'Selected excerpt text',
        colorToken: 'var(--b3-font-background4)',
        origin: 'review' as const,
        createdAt: Date.now(),
        status: 'active' as const,
      },
    }));
    const wrapper = mountReviewView({
      neuralQueue: createNeuralQueue(),
      createFromSelection,
      tabApplicationService,
    });

    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'progressive-excerpt', new MouseEvent('click'));
    await flushPromises();

    expect(reviewViewExcerptMocks.applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(reviewViewExcerptMocks.prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(tabApplicationService.openDocumentTab).toHaveBeenCalledWith({ docId: 'excerpt-doc-1' });
    expect(reviewViewExcerptMocks.showMessage).toHaveBeenLastCalledWith(
      '这段原文已摘录过，已跳到现有摘录',
      3000,
      'info',
    );
    wrapper.unmount();
  });
});
