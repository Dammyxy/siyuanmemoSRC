import { describe, expect, it, vi } from 'vitest';
import { UnifiedReviewAdapter } from '../UnifiedReviewAdapter';
import { buildReviewRenderableCommand } from '../reviewRenderableContext';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { AdapterContext, ReviewHeaderVariant, ReviewUIState } from '@/ui/review/v2/types';

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

function createNeuralUnderlyingQueue(
  pathLength = 5,
  currentPathIndex = 1,
  progressValue = 0,
  engineMode: 'orbit' | 'hyperspace' = 'orbit',
) {
  const roundSize = Math.max(progressValue + 5, 5);
  const historyLength = progressValue;
  const historyEntries = Array.from({ length: historyLength }, (_, index) => ({
    eventId: `event-${index}`,
    nodeId: `node-${index}`,
  }));
  const batchSnapshot = {
    kind: engineMode === 'hyperspace' ? 'hyperspace-current-node' as const : 'orbit-round' as const,
    engineMode,
    navigationState: {
      currentPathIndex,
      currentNodeId: 'concept-2',
      currentEventId: historyEntries[0]?.eventId ?? null,
      navigationMode: 'follow' as const,
      engineMode,
      hasBookmark: true,
      pathLength,
      sessionId: 'session-1',
    },
    focusNodeId: 'concept-1',
    focusNodePreview: 'concept-1',
    currentNodeId: 'concept-2',
    roundSize,
    viewedCount: Math.min(progressValue, roundSize),
    remainingCount: Math.max(0, roundSize - Math.min(progressValue, roundSize)),
    roundNodes: [],
    recentPath: [],
    sourceSnapshot: [],
    seedSnapshot: [],
    anchorSnapshot: [],
  };
  return {
    getCards: async () => [
      createCard('concept-1', CardType.Concept),
      createCard('concept-2', CardType.Concept),
    ],
    getEngineMode: () => engineMode,
    setEngineMode: async () => undefined,
    getSourceSnapshot: () => [],
    setSourceEntry: async () => undefined,
    getSeedSnapshot: () => [],
    setSeedEntry: async () => undefined,
    getAnchorSnapshot: () => [],
    setAnchorEntry: async () => undefined,
    clearAnchors: async () => undefined,
    getCurrentBatchSnapshot: () => batchSnapshot,
    getConceptBlocks: () => [],
    getFocusPoolSnapshot: () => [],
    setFocusPoolEntry: async () => undefined,
    clearFocusPool: async () => undefined,
    setCurrentFocus: async () => undefined,
    startRoamingFromFocus: async () => undefined,
    getHistoryCount: () => historyEntries.length,
    getHistoryPage: ({ offset, limit }: { offset: number; limit: number }) => {
      const ordered = historyEntries.slice().reverse();
      const safeOffset = Math.max(0, offset);
      const safeLimit = Math.max(1, limit);
      const entries = ordered.slice(safeOffset, safeOffset + safeLimit);
      return {
        entries,
        totalCount: ordered.length,
        hasMore: safeOffset + entries.length < ordered.length,
      };
    },
    getHistorySnapshot: () => historyEntries,
    getHistoryEntryByEventId: (eventId: string) => historyEntries.find((entry) => entry.eventId === eventId) ?? null,
    getHistoryEntriesByNodeId: (nodeId: string) => historyEntries.filter((entry) => entry.nodeId === nodeId),
    getHistoryHitCount: (nodeId: string) => historyEntries.filter((entry) => entry.nodeId === nodeId).length,
    getActivationTrace: () => null,
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
    clearHistory: async () => undefined,
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
  it('provides render policy for every active review header variant and empty state', async () => {
    const activeVariants: ReviewHeaderVariant[] = [
      'retrieval-practice',
      'incremental-learning',
      'final-drill',
      'filter-group',
      'neural-roam',
      'subset-review',
      'temporary-drill',
      'leech',
    ];
    const card = createCard('active-policy', CardType.Item);

    for (const headerVariant of activeVariants) {
      const adapter = new UnifiedReviewAdapter({ headerVariant });
      const queue = createQueue({
        queueType: headerVariant,
        liveCards: [card],
        underlyingQueue: headerVariant === 'neural-roam'
          ? createNeuralUnderlyingQueue()
          : undefined,
      });

      const ui = await adapter.toUIState(queue as never, card as never, createContext());

      expect(ui.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
        version: 1,
      }));
    }

    const emptyUi = await new UnifiedReviewAdapter({ headerVariant: 'retrieval-practice' }).toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards: [] }) as never,
      null as never,
      createContext(),
    );
    expect(emptyUi.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      version: 1,
      specialRendererKind: null,
    }));
  });

  it('marks null items as a completed empty state', async () => {
    const adapter = new UnifiedReviewAdapter();

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards: [] }) as never,
      null as never,
      createContext(),
    );

    expect(ui.content.type).toBe('empty');
    expect(ui.header.title).toBe('提取练习');
    expect(ui.header.stats.queueName).toBe('提取练习');
    expect(ui.actions.showAnswer).toBe(false);
    expect(ui.actions.grades).toEqual([]);
    expect(ui.meta.emptyStateMode).toBe('completed');
  });

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
    expect(ui.header.title).toBe('提取练习');
    expect(ui.header.stats.queueName).toBe('提取练习');
    expect(ui.header.toolbar).toEqual([
      {
        icon: '#iconMore',
        type: 'more',
        ariaLabel: 'More',
      },
    ]);
  });

  it('keeps progressive helper actions out of the inline toolbar for excerpt topic cards', async () => {
    const excerptCard = createCard('topic-excerpt', CardType.Topic, {
      extractedFrom: 'source-block-1',
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceBlockId: 'source-block-1',
          sourceDocId: 'doc-source-1',
        },
      },
    });
    const adapter = new UnifiedReviewAdapter();

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'retrieval-practice', liveCards: [excerptCard] }),
      excerptCard,
      createContext(),
    );

    expect(ui.header.toolbar).toEqual([
      expect.objectContaining({ type: 'more' }),
    ]);
  });

  it('builds normalized render context for standard cards without mutating card state', async () => {
    const card = createCard('standard-render-context', CardType.Item);
    const before = { due: card.due, stability: card.stability, difficulty: card.difficulty };
    const adapter = new UnifiedReviewAdapter();

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'retrieval-practice', liveCards: [card] }),
      card,
      createContext(),
    );

    expect(ui.meta.renderContext).toEqual(expect.objectContaining({
      version: 1,
      targetKind: 'standard-card',
      targetIdentity: expect.objectContaining({
        cardId: 'standard-render-context',
        blockId: 'block-standard-render-context',
      }),
      schedulerSnapshot: expect.objectContaining({
        cardId: 'standard-render-context',
        blockId: 'block-standard-render-context',
      }),
      sourceLineage: null,
      allowedActions: expect.arrayContaining(['answer', 'edit', 'skip', 'back']),
      diagnostics: [],
    }));
    expect(card).toEqual(expect.objectContaining(before));
  });

  it('builds normalized progressive render context from excerpt lineage and source availability diagnostics', async () => {
    const excerptCard = createCard('topic-excerpt-context', CardType.Topic, {
      extractedFrom: 'source-block-1',
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceLineage: {
            version: 1,
            authority: 'siyuan-block',
            sourceDocId: 'doc-source-1',
            rootDocId: 'doc-source-1',
            rootKind: 'ordinary-doc',
            sourceBlockId: 'source-block-1',
            sourceBlockIds: ['source-block-1'],
            logicalParentId: 'doc-source-1',
            logicalParentType: 'root-doc',
          },
          disclosureState: {
            version: 1,
            state: 'created',
            formalSchedulerMutation: false,
          },
          sourceAvailability: {
            status: 'missing',
            expectedPayloadHash: 'payload-a',
            missingBlockIds: ['source-block-1'],
            detachedBlockIds: [],
            diagnostics: ['missing-source-block:source-block-1'],
          },
        },
      },
    });
    const adapter = new UnifiedReviewAdapter();

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'retrieval-practice', liveCards: [excerptCard] }),
      excerptCard,
      createContext(),
    );

    expect(ui.meta.renderContext).toEqual(expect.objectContaining({
      targetKind: 'progressive-excerpt',
      sourceLineage: expect.objectContaining({
        sourceBlockId: 'source-block-1',
        sourceDocId: 'doc-source-1',
      }),
      progressiveDisclosure: {
        version: 1,
        state: 'created',
        formalSchedulerMutation: false,
      },
      allowedActions: expect.arrayContaining(['advance', 'defer', 'convert']),
      diagnostics: expect.arrayContaining(['source-missing']),
      unavailable: expect.objectContaining({
        reason: 'source-missing',
        source: 'missing',
      }),
    }));
    expect(ui.meta.renderContext?.allowedActions).not.toContain('edit');
    expect(buildReviewRenderableCommand({
      context: ui.meta.renderContext!,
      action: 'advance',
      idempotencyKey: 'advance-1',
      payload: { pieceDocId: 'piece-1' },
    })).toEqual(expect.objectContaining({
      version: 1,
      action: 'advance',
      idempotencyKey: 'advance-1',
      targetIdentity: expect.objectContaining({
        cardId: 'topic-excerpt-context',
      }),
    }));
    expect(() => buildReviewRenderableCommand({
      context: ui.meta.renderContext!,
      action: 'edit',
    })).toThrow(/REVIEW_RENDER_COMMAND_UNAVAILABLE/);
  });

  it('preserves valid progressive render DTO metadata', async () => {
    const excerptCard = createCard('topic-excerpt-valid-dto', CardType.Topic, {
      extractedFrom: 'source-block-valid',
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceLineage: {
            version: 1,
            authority: 'siyuan-block',
            sourceDocId: 'doc-source-valid',
            rootDocId: 'doc-source-valid',
            rootKind: 'ordinary-doc',
            sourceBlockId: 'source-block-valid',
            sourceBlockIds: ['source-block-valid', 'source-block-valid-2'],
            logicalParentId: 'doc-source-valid',
            logicalParentType: 'root-doc',
            mode: 'linear',
          },
          disclosureState: {
            version: 1,
            state: 'active',
            formalSchedulerMutation: false,
          },
          payloadIdentity: {
            version: 1,
            algorithm: 'fnv1a32',
            hash: 'payload-valid',
            sourceBlockIds: ['source-block-valid', 'source-block-valid-2'],
            textLength: 42,
            domLength: 84,
          },
          sourceAvailability: {
            status: 'current',
            expectedPayloadHash: 'payload-valid',
            currentPayloadHash: 'payload-valid',
            missingBlockIds: [],
            detachedBlockIds: [],
            diagnostics: [],
          },
        },
      },
    });
    const adapter = new UnifiedReviewAdapter();

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards: [excerptCard] }) as never,
      excerptCard as never,
      createContext(),
    );

    expect(ui.meta.renderContext).toEqual(expect.objectContaining({
      targetKind: 'progressive-excerpt',
      sourceLineage: expect.objectContaining({
        sourceBlockId: 'source-block-valid',
        sourceBlockIds: ['source-block-valid', 'source-block-valid-2'],
        mode: 'linear',
      }),
      progressiveDisclosure: {
        version: 1,
        state: 'active',
        formalSchedulerMutation: false,
      },
      sourcePayloadIdentity: {
        version: 1,
        algorithm: 'fnv1a32',
        hash: 'payload-valid',
        sourceBlockIds: ['source-block-valid', 'source-block-valid-2'],
        textLength: 42,
        domLength: 84,
      },
      unavailable: expect.objectContaining({
        source: 'current',
      }),
    }));
  });

  it('rejects malformed progressive render DTO fragments and falls back to legacy lineage metadata', async () => {
    const excerptCard = createCard('topic-excerpt-malformed-dto', CardType.Topic, {
      extractedFrom: 'legacy-source-block',
      meta: {
        progressive: {
          kind: 'excerpt',
          sourceBlockId: 'legacy-source-block',
          sourceDocId: 'legacy-doc',
          sourceLineage: {
            version: 99,
            authority: 'bad-authority',
            sourceBlockId: 42,
          },
          disclosureState: {
            version: 1,
            state: 'not-a-state',
            formalSchedulerMutation: true,
          },
          payloadIdentity: {
            version: 1,
            algorithm: 'sha256',
            hash: 42,
            sourceBlockIds: 'legacy-source-block',
            textLength: '42',
            domLength: [],
          },
          sourceAvailability: {
            status: 'ghost',
            expectedPayloadHash: 42,
            missingBlockIds: 'legacy-source-block',
            detachedBlockIds: [],
            diagnostics: [],
          },
        },
      },
    });
    const adapter = new UnifiedReviewAdapter();

    const ui = await adapter.toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards: [excerptCard] }) as never,
      excerptCard as never,
      createContext(),
    );

    expect(ui.meta.renderContext).toEqual(expect.objectContaining({
      targetKind: 'progressive-excerpt',
      sourceLineage: expect.objectContaining({
        version: 1,
        sourceBlockId: 'legacy-source-block',
        sourceDocId: 'legacy-doc',
        rootKind: 'excerpt-doc',
      }),
      progressiveDisclosure: {
        version: 1,
        state: 'created',
        formalSchedulerMutation: false,
      },
      sourcePayloadIdentity: null,
      unavailable: expect.objectContaining({
        source: undefined,
        reason: undefined,
      }),
    }));
    expect(ui.meta.renderContext?.diagnostics).not.toContain('source-ghost');
  });

  it('keeps split-piece helper actions out of the inline toolbar', async () => {
    const pieceCard = createCard('topic-piece', CardType.Topic, {
      meta: {
        progressive: {
          kind: 'piece',
          mode: 'linear',
          sourceDocId: 'doc-source-1',
          pieceDocId: 'piece-1',
        },
      },
    });
    const adapter = new UnifiedReviewAdapter();

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'retrieval-practice', liveCards: [pieceCard] }),
      pieceCard,
      createContext(),
    );

    expect(ui.header.toolbar).toEqual([
      expect.objectContaining({ type: 'more' }),
    ]);
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
    expect(ui.header.title).toBe('筛选复习');
    expect(ui.header.stats.queueName).toBe('筛选复习');
    expect(ui.header.toolbar).toEqual([
      expect.objectContaining({ type: 'more' }),
      expect.objectContaining({ type: 'plan-review-scope' }),
    ]);
  });

  it('builds neural-roam progress summary from current batch state while hiding priority for non-flashcard nodes', async () => {
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
      tooltip: '\u5df2\u770b 40 / \u672c\u8f6e\u603b\u6570 45',
      ariaLabel: '\u5df2\u770b 40 / \u672c\u8f6e\u603b\u6570 45',
      label: '\u5df2\u770b',
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

  it('does not reuse the neural-roam header cache when orbit and hyperspace engine modes swap under the same queue type', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('concept-1', CardType.Concept, {
      meta: {
        neuralContext: {
          blockType: 'h',
          isFlashcard: false,
        },
      },
    });

    const context = createContext();
    const orbitQueue = createQueue({
      queueType: 'neural-roam',
      liveCards: [currentItem],
      underlyingQueue: createNeuralUnderlyingQueue(5, 1, 3, 'orbit'),
    });
    const hyperspaceQueue = createQueue({
      queueType: 'neural-roam',
      liveCards: [currentItem],
      underlyingQueue: createNeuralUnderlyingQueue(5, 1, 9, 'hyperspace'),
    });

    await adapter.fetchAuxiliaryData?.(currentItem as never, orbitQueue as never, context);
    const hyperspaceUi = await adapter.toUIState(hyperspaceQueue as never, currentItem as never, context);

    expect(hyperspaceUi.header.counterSummary).toBeNull();
    expect(hyperspaceUi.meta.queueProgress?.remaining).toBe(0);
    expect(hyperspaceUi.header.stats.current).toBe(0);

    const hydratedHyperspaceUi = await adapter.fetchAuxiliaryData?.(currentItem as never, hyperspaceQueue as never, context);
    expect(hydratedHyperspaceUi?.header?.counterSummary).toMatchObject({
      kind: 'value',
      value: 9,
      label: '\u6df1\u5ea6',
    });
  });

  it('does not reuse the neural-roam header cache when the orbit center and current event change inside the same engine mode', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('concept-1', CardType.Concept, {
      meta: {
        neuralContext: {
          blockType: 'h',
          isFlashcard: false,
        },
      },
    });

    const context = createContext();
    const firstQueue = createQueue({
      queueType: 'neural-roam',
      liveCards: [currentItem],
      underlyingQueue: createNeuralUnderlyingQueue(5, 1, 3, 'orbit'),
    });
    const secondQueue = createQueue({
      queueType: 'neural-roam',
      liveCards: [currentItem],
      underlyingQueue: {
        ...createNeuralUnderlyingQueue(8, 4, 7, 'orbit'),
        getCurrentBatchSnapshot: () => ({
          ...createNeuralUnderlyingQueue(8, 4, 7, 'orbit').getCurrentBatchSnapshot(),
          focusNodeId: 'concept-2',
          focusNodePreview: 'concept-2',
          currentNodeId: 'concept-3',
          currentEventId: 'event-3',
          viewedCount: 7,
          roundSize: 12,
          remainingCount: 5,
          navigationState: {
            ...createNeuralUnderlyingQueue(8, 4, 7, 'orbit').getCurrentBatchSnapshot().navigationState,
            currentNodeId: 'concept-3',
            currentEventId: 'event-3',
            pathLength: 8,
          },
        }),
      },
    });

    await adapter.fetchAuxiliaryData?.(currentItem as never, firstQueue as never, context);
    const secondUi = await adapter.toUIState(secondQueue as never, currentItem as never, context);

    expect(secondUi.header.stats.current).toBe(0);
    expect(secondUi.header.stats.total).toBe(0);
    expect(secondUi.header.counterSummary).toBeNull();

    const hydratedSecondUi = await adapter.fetchAuxiliaryData?.(currentItem as never, secondQueue as never, context);
    expect(hydratedSecondUi?.header?.counterSummary).toMatchObject({
      kind: 'value',
      value: 7,
      label: '已看',
    });
  });

  it('maps neural-roam non-flashcard item nodes to topic actions', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('native-list-node', CardType.Item, {
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        neuralContext: {
          blockType: 'i',
          isFlashcard: false,
          nodeRole: 'virtual',
        },
      },
    });

    const ui = await renderState(
      adapter,
      createQueue({
        queueType: 'neural-roam',
        liveCards: [currentItem],
        underlyingQueue: createNeuralUnderlyingQueue(5, 1, 1),
      }),
      currentItem,
      createContext(),
    );

    expect(ui.actions.cardMeta).toMatchObject({
      type: 'topic',
      cardType: 'topic',
    });
    expect(ui.meta.hasHiddenContent).toBe(false);
    expect(ui.content.answerBlockID).toBe('');
  });

  it('keeps hydrated neural-roam virtual document nodes on the document render path', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('virtual-doc-node', CardType.Topic, {
      meta: {
        content: 'Virtual Document Title',
        blockType: 'd',
        isDocument: true,
        neuralContext: {
          blockType: 'd',
          isFlashcard: false,
          nodeRole: 'virtual',
        },
      },
    });

    const ui = await renderState(
      adapter,
      createQueue({
        queueType: 'neural-roam',
        liveCards: [currentItem],
        underlyingQueue: createNeuralUnderlyingQueue(5, 1, 1),
      }),
      currentItem,
      createContext(),
    );

    expect(ui.actions.cardMeta).toMatchObject({
      type: 'topic',
      cardType: 'topic',
    });
    expect(ui.content.id).toBe('block-virtual-doc-node');
    expect(ui.content.data).toBe('block-virtual-doc-node');
    expect(ui.content.answerBlockID).toBe('');
  });

  it('maps neural-roam non-flashcard concept nodes to topic actions', async () => {
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });
    const currentItem = createCard('concept-node', CardType.Concept, {
      meta: {
        cardTypeMarker: 'concept',
        neuralContext: {
          blockType: 'p',
          isFlashcard: false,
          nodeRole: 'virtual',
        },
      },
    });

    const ui = await renderState(
      adapter,
      createQueue({
        queueType: 'neural-roam',
        liveCards: [currentItem],
        underlyingQueue: createNeuralUnderlyingQueue(5, 1, 1),
      }),
      currentItem,
      createContext(),
    );

    expect(ui.actions.cardMeta).toMatchObject({
      type: 'topic',
      cardType: 'topic',
    });
    expect(ui.meta.hasHiddenContent).toBe(false);
    expect(ui.content.answerBlockID).toBe('');
  });

  it('keeps contextual review variants on their own surface titles instead of the base queue name', async () => {
    const liveCards = [createCard('item-1', CardType.Item)];

    const temporaryUi = await renderState(
      new UnifiedReviewAdapter({ headerVariant: 'temporary-drill' }),
      createQueue({ queueType: 'final-drill', liveCards }),
      liveCards[0],
      createContext(),
    );
    expect(temporaryUi.header.title).toBe('临时练习');
    expect(temporaryUi.header.stats.queueName).toBe('临时练习');

    const leechUi = await renderState(
      new UnifiedReviewAdapter({ headerVariant: 'leech' }),
      createQueue({ queueType: 'leech', liveCards }),
      liveCards[0],
      createContext(),
    );
    expect(leechUi.header.title).toBe('难点攻坚');
    expect(leechUi.header.stats.queueName).toBe('难点攻坚');
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

    expect(ui.header.toolbar?.find(item => item.type === 'ai-sidebar')).toBeUndefined();
    expect(ui.header.toolbar?.find(item => item.type === 'more')).toMatchObject({
      icon: '#iconMore',
      ariaLabel: 'More',
    });
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
    expect(ui.header.title).toBe('子集复习');
    expect(ui.header.stats.queueName).toBe('子集复习');
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
      tooltip: '\u5df2\u770b 7 / \u672c\u8f6e\u603b\u6570 12',
      ariaLabel: '\u5df2\u770b 7 / \u672c\u8f6e\u603b\u6570 12',
      label: '\u5df2\u770b',
      value: 7,
    });
  });

  it('fails closed when live counter snapshot read fails', async () => {
    const currentItem = createCard('item-counter-fail', CardType.Item);
    const queue = {
      ...createQueue({ queueType: 'retrieval-practice', liveCards: [currentItem] }),
      getCounterSnapshot: vi.fn(async () => {
        throw new Error('counter backend down');
      }),
    };
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'retrieval-practice' });

    await expect(adapter.fetchAuxiliaryData?.(currentItem as never, queue as never, createContext()))
      .rejects.toThrow('REVIEW_COUNTER_UNAVAILABLE: failed to read live queue counter snapshot');
  });

  it('fails closed when neural-roam underlying queue lookup throws during header counts', async () => {
    const currentItem = createCard('concept-underlying-fail', CardType.Concept);
    const queue = {
      ...createQueue({ queueType: 'neural-roam', liveCards: [currentItem] }),
      getUnderlyingQueue: vi.fn(() => {
        throw new Error('queue wrapper broken');
      }),
    };
    const adapter = new UnifiedReviewAdapter({ headerVariant: 'neural-roam' });

    await expect(adapter.fetchAuxiliaryData?.(currentItem as never, queue as never, createContext()))
      .rejects.toThrow('REVIEW_QUEUE_UNAVAILABLE: failed to resolve underlying queue for header counts');
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

  it('routes semantic concept-definition cards to the definition block even when card type and typeMarker are unstable', async () => {
    const card = createCard('semantic-cdf-1', CardType.Descriptor, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-concept-definition-reverse',
        frontBlockIDs: ['definition-block'],
        backBlockIDs: ['concept-block'],
        typeMarker: undefined,
        fieldMapping: {
          concept: 'concept-block',
          definition: 'definition-block',
        },
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('definition-block');
    expect(ui.content.data).toBe('definition-block');
    expect(ui.content.answerBlockID).toBe('');
  });

  it('routes descriptor semantic templates to the descriptor block even when card type is item', async () => {
    const card = createCard('semantic-descriptor-1', CardType.Item, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-concept-descriptor-both',
        frontBlockIDs: ['concept-block', 'descriptor-front-block'],
        backBlockIDs: ['concept-block', 'descriptor-back-block'],
        typeMarker: undefined,
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-back-block',
        },
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('descriptor-back-block');
    expect(ui.content.data).toBe('descriptor-back-block');
    expect(ui.content.answerBlockID).toBe('');
  });

  it('routes semantic riff-sync descriptor cards to CDF content instead of native answer panes', async () => {
    const card = createCard('semantic-riff-descriptor-1', CardType.Descriptor, {
      blockId: 'descriptor-block',
      meta: createXiuyuanMeta({
        templateID: 'builtin-riff-sync',
        frontBlockIDs: ['concept-block'],
        backBlockIDs: ['concept-block'],
        typeMarker: 'concept-descriptor',
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
        },
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('descriptor-block');
    expect(ui.content.data).toBe('descriptor-block');
    expect(ui.content.answerBlockID).toBe('');
  });

  it('keeps ordinary multi-cloze item cards off broad native hidden metadata', async () => {
    const card = createCard('ordinary-cloze-1', CardType.Item, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-multi-cloze',
        frontBlockIDs: ['ordinary-cloze-block'],
        clozeRenderMode: 'default',
        renderProfile: 'quick-default',
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('ordinary-cloze-block');
    expect(ui.content.answerBlockID).toBe('');
    expect(ui.meta.hasHiddenContent).toBe(false);
    expect(ui.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: 'multi-cloze',
      semanticKind: 'multi-cloze',
      profile: null,
      legacyProjection: expect.objectContaining({
        templateID: 'builtin-multi-cloze',
        used: expect.arrayContaining(['templateID']),
      }),
    }));
  });

  it('keeps formula multi-cloze cards on the dedicated renderer path without native hide metadata', async () => {
    const card = createCard('formula-cloze-1', CardType.Item, {
      meta: createXiuyuanMeta({
        templateID: 'builtin-multi-cloze',
        frontBlockIDs: ['formula-cloze-block'],
        clozeRenderMode: 'inline-formula-cloze',
        renderProfile: 'quick-inline-formula',
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.meta.hasHiddenContent).toBe(false);
    expect(ui.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: 'multi-cloze',
      semanticKind: 'multi-cloze',
      profile: 'quick-inline-formula',
    }));
  });

  it('exposes descriptor render policy from semantic field mapping even when legacy type marker is stale', async () => {
    const card = createCard('semantic-policy-descriptor-1', CardType.Item, {
      faceKey: { ruleId: 'descriptor-reverse', faceIndex: 2 },
      meta: createXiuyuanMeta({
        templateID: 'builtin-riff-sync',
        typeMarker: 'concept-definition-forward',
        faceIndex: 0,
        frontBlockIDs: ['concept-block', 'descriptor-front-block'],
        backBlockIDs: ['concept-block', 'descriptor-back-block'],
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-back-block',
        },
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('descriptor-back-block');
    expect(ui.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: 'descriptor',
      semanticKind: 'descriptor',
      cacheTokens: expect.objectContaining({
        faceToken: 'rule:descriptor-reverse::face:2',
      }),
      legacyProjection: expect.objectContaining({
        faceIndex: 0,
        typeMarker: 'concept-definition-forward',
        used: expect.arrayContaining(['templateID', 'typeMarker', 'faceIndex']),
      }),
    }));
  });

  it('exposes concept-definition render policy from semantic field mapping', async () => {
    const card = createCard('semantic-policy-cdf-1', CardType.Item, {
      faceKey: { ruleId: 'concept-definition-reverse', faceIndex: 1 },
      meta: createXiuyuanMeta({
        templateID: 'builtin-riff-sync',
        typeMarker: undefined,
        faceIndex: 0,
        frontBlockIDs: ['definition-front-block'],
        backBlockIDs: ['concept-block'],
        fieldMapping: {
          concept: 'concept-block',
          definition: 'definition-front-block',
        },
      }),
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('definition-front-block');
    expect(ui.content.answerBlockID).toBe('');
    expect(ui.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: 'concept-definition',
      semanticKind: 'concept-definition',
      cacheTokens: expect.objectContaining({
        faceToken: 'rule:concept-definition-reverse::face:1',
      }),
      legacyProjection: expect.objectContaining({
        faceIndex: 0,
        used: expect.arrayContaining(['templateID', 'faceIndex']),
      }),
    }));
  });

  it('exposes quick render policy and force flags without treating stale forceProtyle raw meta as authority', async () => {
    const quickCard = createCard('quick-policy-1', CardType.Item, {
      meta: {
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
        quickDetectReason: 'symbol-rule',
      },
    });
    const forcedProtyleCard = createCard('force-protyle-policy-1', CardType.Item, {
      meta: {
        forceProtyleRender: true,
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
      },
    });
    const adapter = new UnifiedReviewAdapter();

    const quickUi = await adapter.toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards: [quickCard] }) as never,
      quickCard as never,
      createContext(),
    );
    const forcedUi = await adapter.toUIState(
      createQueue({ queueType: 'retrieval-practice', liveCards: [forcedProtyleCard] }) as never,
      forcedProtyleCard as never,
      createContext(),
    );

    expect(quickUi.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: 'quick',
      semanticKind: 'quick',
      forceProtyleRender: false,
      forceQuickRender: true,
      quickDetectReason: 'symbol-rule',
    }));
    expect(forcedUi.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: null,
      semanticKind: null,
      forceProtyleRender: true,
      forceQuickRender: false,
    }));
  });

  it('exposes image-occlusion render policy while keeping adapter answer routing unchanged', async () => {
    const card = createCard('image-occlusion-policy-1', CardType.Item, {
      meta: {
        imageOcclusion: true,
        source: 'image-occlusion',
      },
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('block-image-occlusion-policy-1');
    expect(ui.meta.renderContext?.renderPolicy).toEqual(expect.objectContaining({
      specialRendererKind: 'image-occlusion',
      semanticKind: 'image-occlusion',
      forceProtyleRender: false,
      forceQuickRender: false,
    }));
  });

  it('marks topic-derived item cards as native inline hidden candidates', async () => {
    const card = createCard('topic-derived-1', CardType.Item, {
      meta: {
        source: 'topic-derived',
        cardSource: 'topic-derived',
        progressive: {
          kind: 'derived-item',
        },
      },
    });
    const adapter = new UnifiedReviewAdapter();
    const queue = createQueue({
      queueType: 'retrieval-practice',
      liveCards: [card],
    });

    const ui = await adapter.toUIState(queue as never, card as never, createContext());

    expect(ui.content.id).toBe('block-topic-derived-1');
    expect(ui.content.answerBlockID).toBe('');
    expect(ui.meta.hasHiddenContent).toBe(true);
    expect(ui.meta.renderContext).toEqual(expect.objectContaining({
      targetKind: 'topic-derived-item',
      allowedActions: expect.arrayContaining(['advance', 'defer', 'convert']),
      renderPayload: expect.objectContaining({
        contentBlockId: 'block-topic-derived-1',
      }),
    }));
  });

  it('returns explicit render context diagnostics for empty or unsupported review targets', async () => {
    const adapter = new UnifiedReviewAdapter();

    const ui = await renderState(
      adapter,
      createQueue({ queueType: 'retrieval-practice', liveCards: [] }),
      null,
      createContext(),
    );

    expect(ui.meta.renderContext).toEqual(expect.objectContaining({
      targetKind: 'unknown',
      diagnostics: ['empty-review-target'],
      allowedActions: ['skip'],
    }));
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
