import { describe, expect, it } from 'vitest';
import { UnifiedReviewAdapter } from '../UnifiedReviewAdapter';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { AdapterContext } from '@/ui/review/v2/types';

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

function createNeuralUnderlyingQueue(pathLength = 5, currentPathIndex = 1) {
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
    getHistorySnapshot: () => [],
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

function createQueue(options: {
  queueType: string;
  liveCards: FSRSCard[];
  underlyingQueue?: unknown;
}) {
  return {
    getType: () => options.queueType,
    getStats: async () => ({ size: options.liveCards.length, label: `${options.liveCards.length} due`, extra: '' }),
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

describe('UnifiedReviewAdapter', () => {
  it('builds retrieval-practice compact summary and priority badge', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item, { priority: 12 }),
      createCard('item-2', CardType.Item),
      createCard('desc-1', CardType.Descriptor),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'retrieval-practice' });

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards }) as never,
      liveCards[0] as never,
      createContext(),
    );

    expect(ui.header.counterSummary).toEqual({
      text: '(2+1)/3',
      tooltip: 'Item 2/2 · Descriptor 1/1',
      ariaLabel: 'Item 2/2 · Descriptor 1/1',
      parts: [
        { id: 'item', label: 'Item', remaining: 2, total: 2, tone: 'item' },
        { id: 'descriptor', label: 'Descriptor', remaining: 1, total: 1, tone: 'descriptor' },
      ],
      total: 3,
      forceParentheses: false,
    });
    expect(ui.header.counterBadges).toEqual([]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '12',
      priority: 12,
      ariaLabel: 'Priority 12',
    });
  });

  it('builds incremental-learning summary with four fixed slots including zero values', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item),
      createCard('desc-1', CardType.Descriptor),
      createCard('concept-1', CardType.Concept),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'incremental-learning' });

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'incremental-learning', liveCards }) as never,
      liveCards[0] as never,
      createContext(),
    );

    expect(ui.header.counterSummary?.text).toBe('(1+1+0+1)/3');
    expect(ui.header.counterSummary?.tooltip).toBe('Item 1/1 · Descriptor 1/1 · Topic 0/0 · Concept 1/1');
    expect(ui.header.counterSummary?.parts.map(part => part.id)).toEqual([
      'item',
      'descriptor',
      'topic',
      'concept',
    ]);
    expect(ui.header.counterBadges).toEqual([]);
  });

  it('builds final-drill summary with answered and correct badges', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item),
      createCard('desc-1', CardType.Descriptor),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'final-drill' });

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'final-drill', liveCards }) as never,
      liveCards[0] as never,
      createContext({ answeredCount: 3, correctCount: 2 }),
    );

    expect(ui.header.counterSummary?.text).toBe('(1+1)/2');
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'answered',
        label: '已答',
        kind: 'value',
        tone: 'progress',
        text: '3',
        value: 3,
        ariaLabel: '已答 3',
      },
      {
        id: 'correct',
        label: '答对',
        kind: 'value',
        tone: 'success',
        text: '2',
        value: 2,
        ariaLabel: '答对 2',
      },
    ]);
  });

  it('keeps filter-group tooltip complete while compact text hides zero-remaining buckets', async () => {
    const baselineCards = [
      createCard('desc-1', CardType.Descriptor),
      createCard('concept-1', CardType.Concept),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'filter-group' });
    const context = createContext();

    await adapter.toUIState(
      createQueue({ queueType: 'filter-group', liveCards: baselineCards }) as never,
      baselineCards[0] as never,
      context,
    );

    const remainingCards = [
      createCard('concept-1', CardType.Concept),
    ];
    const ui = await adapter.toUIState(
      createQueue({ queueType: 'filter-group', liveCards: remainingCards }) as never,
      remainingCards[0] as never,
      context,
    );

    expect(ui.header.counterSummary?.text).toBe('1/2');
    expect(ui.header.counterSummary?.tooltip).toBe('Descriptor 0/1 · Concept 1/1');
    expect(ui.header.toolbar?.some(item => item.type === 'plan-review-scope')).toBe(true);
  });

  it('builds neural-roam single-type summary and path badge while hiding priority for non-flashcard nodes', async () => {
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

    const ui = await adapter.toUIState(
      createQueue({
        queueType: 'neural-roam',
        liveCards: [currentItem],
        underlyingQueue: createNeuralUnderlyingQueue(5, 1),
      }) as never,
      currentItem as never,
      createContext(),
    );

    expect(ui.header.counterSummary?.text).toBe('2/2');
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'path',
        label: '路径',
        kind: 'ratio',
        tone: 'progress',
        text: '2/5',
        remaining: 2,
        total: 5,
        ariaLabel: '路径 2/5',
      },
    ]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '-',
      priority: null,
      ariaLabel: 'Priority -',
    });
  });

  it('falls back to P - when current item has no finite priority', async () => {
    const liveCards = [
      createCard('item-1', CardType.Item, { priority: Number.NaN as unknown as number }),
    ];
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'subset-review' });

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'final-drill', liveCards }) as never,
      liveCards[0] as never,
      createContext(),
    );

    expect(ui.header.counterSummary).toBeNull();
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'remaining',
        label: '剩余',
        kind: 'ratio',
        tone: 'neutral',
        text: '1/1',
        remaining: 1,
        total: 1,
        ariaLabel: '剩余 1/1',
      },
    ]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '-',
      priority: null,
      ariaLabel: 'Priority -',
    });
  });
});
