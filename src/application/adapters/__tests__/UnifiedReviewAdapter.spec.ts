import { describe, expect, it, vi } from 'vitest';
import { UnifiedReviewAdapter } from '../UnifiedReviewAdapter';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { AdapterContext, ReviewUIState } from '@/ui/review/v2/types';

function createCard(
  id: string,
  type: CardType,
  overrides: Partial<FSRSCard> = {},
): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: `x-${id}`,
    blockId: `block-${id}`,
    due: now + 60_000,
    stability: 5,
    difficulty: 4,
    reps: 2,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 60_000,
    elapsedDays: 1,
    scheduledDays: 2,
    priority: 50,
    type,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now,
    ...overrides,
  };
}

function createXiuyuanMeta(overrides: Record<string, unknown> = {}) {
  return {
    xiuyuanID: 'xy-test-1',
    faceIndex: 0,
    templateID: 'builtin-riff-sync',
    frontBlockIDs: ['front-block-1'],
    backBlockIDs: [],
    ...overrides,
  };
}

function createContext(overrides?: Partial<NonNullable<AdapterContext['session']>>): AdapterContext {
  return {
    showAnswer: false,
    session: {
      startTime: Date.now(),
      resumed: false,
      answeredCount: 0,
      correctCount: 0,
      baselineVersion: 0,
      reviewHistory: [],
      ...overrides,
    },
  };
}

function createNeuralUnderlyingQueue(pathLength = 5, currentPathIndex = 1, historyLength = 0) {
  return {
    getCards: async () => [
      createCard('concept-1', CardType.Concept),
      createCard('concept-2', CardType.Concept),
    ],
    getSeedSnapshot: () => [],
    setSeedEntry: async () => undefined,
    getAnchorSnapshot: () => [],
    setAnchorEntry: async () => undefined,
    clearAnchors: async () => undefined,
    getConceptBlocks: () => [],
    getFocusPoolSnapshot: () => [],
    setFocusPoolEntry: async () => undefined,
    clearFocusPool: async () => undefined,
    setCurrentFocus: async () => undefined,
    startRoamingFromFocus: async () => undefined,
    getHistorySnapshot: () => Array.from({ length: historyLength }, (_, index) => ({
      nodeId: `node-${index}`,
    })),
    getSessionFocusStack: () => [],
    getPinnedFocusBlocks: () => [],
    setPinnedFocusBlock: async () => undefined,
    jumpToHistoryNode: async () => false,
    getPathItemByNodeId: async () => null,
    getNavigationState: () => ({
      currentPathIndex,
      currentNodeId: 'concept-2',
      navigationMode: 'follow' as const,
      hasBookmark: true,
      pathLength,
      sessionId: 'session-1',
    }),
    setNavigationMode: () => undefined,
    returnToBookmark: () => false,
    clearHistory: () => undefined,
  };
}

type QueueSnapshotInput = {
  remaining: number;
  due: number;
  total: number | null;
  buckets: {
    all: number;
    item: number;
    descriptor: number;
    topic: number;
    concept: number;
  };
};

function createQueue(options: {
  queueType: string;
  liveCards: FSRSCard[];
  underlyingQueue?: unknown;
  snapshot?: QueueSnapshotInput;
}) {
  const snapshot = options.snapshot ?? {
    remaining: options.liveCards.length,
    due: options.liveCards.length,
    total: options.liveCards.length,
    buckets: {
      all: options.liveCards.length,
      item: options.liveCards.filter(card => card.type === CardType.Item).length,
      descriptor: options.liveCards.filter(card => card.type === CardType.Descriptor).length,
      topic: options.liveCards.filter(card => card.type === CardType.Topic).length,
      concept: options.liveCards.filter(card => card.type === CardType.Concept).length,
    },
  };

  return {
    getType: () => options.queueType,
    getStats: async () => ({ size: options.liveCards.length, label: `${options.liveCards.length} due`, extra: '' }),
    getCounterSnapshot: async () => ({
      version: 1,
      remaining: snapshot.remaining,
      due: snapshot.due,
      total: snapshot.total,
      buckets: { ...snapshot.buckets },
      source: 'hot' as const,
    }),
    getUIConfig: () => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    }),
    getUnderlyingQueue: () => options.underlyingQueue ?? {
      getCards: async () => options.liveCards,
    },
  };
}

function mergeUiState(base: ReviewUIState, aux: Partial<ReviewUIState> | undefined): ReviewUIState {
  if (!aux) {
    return base;
  }

  return {
    ...base,
    ...aux,
    header: {
      ...base.header,
      ...(aux.header ?? {}),
      stats: {
        ...base.header.stats,
        ...(aux.header?.stats ?? {}),
      },
      breadcrumbs: aux.header?.breadcrumbs ?? base.header.breadcrumbs,
      toolbar: aux.header?.toolbar ?? base.header.toolbar,
    },
    content: {
      ...base.content,
      ...(aux.content ?? {}),
    },
    actions: {
      ...base.actions,
      ...(aux.actions ?? {}),
      grades: aux.actions?.grades ?? base.actions.grades,
      menu: aux.actions?.menu ?? base.actions.menu,
    },
    meta: {
      ...base.meta,
      ...(aux.meta ?? {}),
    },
    overlay: aux.overlay === undefined ? base.overlay : aux.overlay,
  };
}

async function renderState(
  adapter: UnifiedReviewAdapter,
  queue: ReturnType<typeof createQueue>,
  item: FSRSCard | null,
  context: AdapterContext,
): Promise<ReviewUIState> {
  const main = await adapter.toUIState(queue as never, item as never, context);
  const aux = await adapter.fetchAuxiliaryData?.(item as never, queue as never, context);
  return mergeUiState(main, aux);
}

describe('UnifiedReviewAdapter', () => {
  it('builds retrieval-practice live value summary and priority badge', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item, { priority: 12 }),
      createCard('item-2', CardType.Item),
      createCard('desc-1', CardType.Descriptor),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'retrieval-practice' });

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'retrieval-practice', liveCards }),
      liveCards[0],
      createContext(),
    );

    expect(ui.header.counterSummary).toEqual({
      kind: 'value',
      text: '3',
      tooltip: '3 remaining · 3 due',
      ariaLabel: '3 remaining · 3 due',
      value: 3,
    });
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'item',
        label: 'Item',
        kind: 'value',
        tone: 'item',
        text: '2',
        value: 2,
        ariaLabel: 'Item 2',
      },
      {
        id: 'descriptor',
        label: 'Descriptor',
        kind: 'value',
        tone: 'descriptor',
        text: '1',
        value: 1,
        ariaLabel: 'Descriptor 1',
      },
    ]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '12',
      priority: 12,
      ariaLabel: 'Priority 12',
    });
  });

  it('builds incremental-learning live value summary with live badges', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item),
      createCard('desc-1', CardType.Descriptor),
      createCard('concept-1', CardType.Concept),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'incremental-learning' });

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'incremental-learning', liveCards }),
      liveCards[0],
      createContext(),
    );

    expect(ui.header.counterSummary).toEqual({
      kind: 'value',
      text: '3',
      tooltip: '3 remaining · 3 due',
      ariaLabel: '3 remaining · 3 due',
      value: 3,
    });
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'item',
        label: 'Item',
        kind: 'value',
        tone: 'item',
        text: '1',
        value: 1,
        ariaLabel: 'Item 1',
      },
      {
        id: 'descriptor',
        label: 'Descriptor',
        kind: 'value',
        tone: 'descriptor',
        text: '1',
        value: 1,
        ariaLabel: 'Descriptor 1',
      },
      {
        id: 'concept',
        label: 'Concept',
        kind: 'value',
        tone: 'concept',
        text: '1',
        value: 1,
        ariaLabel: 'Concept 1',
      },
    ]);
  });

  it('builds final-drill summary with live remaining plus answered and correct badges', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item),
      createCard('desc-1', CardType.Descriptor),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'final-drill' });

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'final-drill', liveCards }),
      liveCards[0],
      createContext({ answeredCount: 3, correctCount: 2 }),
    );

    expect(ui.header.counterSummary).toEqual({
      kind: 'value',
      text: '2',
      tooltip: '2 remaining',
      ariaLabel: '2 remaining',
      value: 2,
    });
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'answered',
        label: '\u5df2\u7b54',
        kind: 'value',
        tone: 'progress',
        text: '3',
        value: 3,
        ariaLabel: '\u5df2\u7b54 3',
      },
      {
        id: 'correct',
        label: '\u7b54\u5bf9',
        kind: 'value',
        tone: 'success',
        text: '2',
        value: 2,
        ariaLabel: '\u7b54\u5bf9 2',
      },
    ]);
  });

  it('keeps filter-group header live and scope control visible', async () => {
    const liveCards = [
      createCard('concept-1', CardType.Concept),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'filter-group' });

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'filter-group', liveCards }),
      liveCards[0],
      createContext(),
    );

    expect(ui.header.counterSummary).toEqual({
      kind: 'value',
      text: '1',
      tooltip: '1 remaining · 1 due',
      ariaLabel: '1 remaining · 1 due',
      value: 1,
    });
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'concept',
        label: 'Concept',
        kind: 'value',
        tone: 'concept',
        text: '1',
        value: 1,
        ariaLabel: 'Concept 1',
      },
    ]);
    expect(ui.header.toolbar?.some(item => item.type === 'plan-review-scope')).toBe(true);
  });

  it('builds neural-roam value summary from history count while hiding priority for non-flashcard nodes', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('concept-1', CardType.Concept, {
      priority: 4,
      meta: {
        neuralContext: {
          blockType: 'h',
          isFlashcard: false,
        },
      },
    });

    const queue = createQueue({
      queueType: 'neural-roam',
      liveCards: [currentItem],
      underlyingQueue: createNeuralUnderlyingQueue(5, 1, 40),
    });

    const ui = await renderState(
      adapter,
      queue,
      currentItem,
      createContext(),
    );

    expect(ui.header.counterSummary).toEqual({
      kind: 'value',
      text: '40',
      tooltip: '\u5df2\u6f2b\u6e38 40 \u5f20\u5361',
      ariaLabel: '\u5df2\u6f2b\u6e38 40 \u5f20\u5361',
      value: 40,
    });
    expect(ui.header.counterBadges).toEqual([]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '-',
      priority: null,
      ariaLabel: 'Priority -',
    });
  });

  it('uses build-station and source-list fallbacks for neural roam review toolbar buttons', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('concept-toolbar', CardType.Concept);

    const ui = await renderState(
      adapter,
      createQueue({
        queueType: 'neural-roam',
        liveCards: [currentItem],
        underlyingQueue: createNeuralUnderlyingQueue(5, 1, 0),
      }),
      currentItem,
      createContext(),
    );

    expect(ui.header.toolbar?.find(item => item.type === 'lock-focus')).toMatchObject({
      icon: '#iconPin',
      ariaLabel: 'Build Station',
    });
    expect(ui.header.toolbar?.find(item => item.type === 'neural-focuses')).toMatchObject({
      icon: '#iconList',
      ariaLabel: 'View Source List',
    });
  });

  it('falls back to P - when current item has no finite priority while keeping live subset counters', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item, { priority: Number.NaN as unknown as number }),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'subset-review' });

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'final-drill', liveCards }),
      liveCards[0],
      createContext(),
    );

    expect(ui.header.counterSummary).toEqual({
      kind: 'value',
      text: '1',
      tooltip: '1 remaining',
      ariaLabel: '1 remaining',
      value: 1,
    });
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'due',
        label: 'Due',
        kind: 'value',
        tone: 'neutral',
        text: '1',
        value: 1,
        ariaLabel: 'Due 1',
      },
    ]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '-',
      priority: null,
      ariaLabel: 'Priority -',
    });
  });

  it('keeps neural-roam main path off getCards and computes auxiliary header from stats plus history only', async () => {
    const currentItem = createCard('concept-1', CardType.Concept);
    const getCards = vi.fn(async () => [currentItem]);
    const trackedUnderlyingQueue = {
      ...createNeuralUnderlyingQueue(5, 1, 7),
      getCards,
    };
    const queue = createQueue({
      queueType: 'neural-roam',
      liveCards: [currentItem],
      underlyingQueue: trackedUnderlyingQueue,
    });
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const context = createContext({ initialTotal: 9 });

    const main = await adapter.toUIState(queue as never, currentItem as never, context);
    expect(main.header.counterSummary).toBeNull();
    expect(getCards).not.toHaveBeenCalled();

    const aux = await adapter.fetchAuxiliaryData?.(currentItem as never, queue as never, context);
    expect(getCards).not.toHaveBeenCalled();
    expect(aux?.header?.counterSummary).toEqual({
      kind: 'value',
      text: '7',
      tooltip: '\u5df2\u6f2b\u6e38 7 \u5f20\u5361',
      ariaLabel: '\u5df2\u6f2b\u6e38 7 \u5f20\u5361',
      value: 7,
    });
  });

  it('maps native builtin-riff-sync cards to a same-block answer pane while keeping inline hidden reveal metadata', async () => {
    const card = createCard('riff-native-1', CardType.Item, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-riff-sync',
        frontBlockIDs: ['native-front-child'],
        backBlockIDs: ['native-back-child'],
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const hiddenUi = await adapter.toUIState(queue as never, card as never, createContext());
    const revealedUi = await adapter.toUIState(
      queue as never,
      card as never,
      {
        ...createContext(),
        showAnswer: true,
      },
    );

    expect(hiddenUi.content.id).toBe('block-riff-native-1');
    expect(hiddenUi.content.answerBlockID).toBe('block-riff-native-1');
    expect(hiddenUi.meta.hasHiddenContent).toBe(true);
    expect(revealedUi.content.id).toBe('block-riff-native-1');
    expect(revealedUi.content.answerBlockID).toBe('block-riff-native-1');
    expect(revealedUi.meta.hasHiddenContent).toBe(true);
  });

  it('keeps topic document cards on the document render path even when Xiuyuan answer blocks exist', async () => {
    const card = createCard('topic-doc-1', CardType.Topic, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-bidirectional',
        frontBlockIDs: ['topic-front-child'],
        backBlockIDs: ['topic-answer-child'],
        isDocument: true,
        blockType: 'd',
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('block-topic-doc-1');
    expect(ui.content.data).toBe('block-topic-doc-1');
    expect(ui.content.answerBlockID).toBe('');
  });

  it('keeps answerBlockID for template-backed cards that render a separate answer pane', async () => {
    const card = createCard('template-1', CardType.Item, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-list-item',
        frontBlockIDs: ['question-block'],
        backBlockIDs: ['answer-block'],
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.answerBlockID).toBe('answer-block');
    expect(ui.meta.hasHiddenContent).toBe(false);
  });
});
