import { describe, expect, it, vi } from 'vitest';
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';
import type { QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type {
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamItem,
} from '../../../packages/contracts/src/backend-rpc';

function createSyntheticNeuralCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: '20230209054609-tu5wnpo',
    xiuyuanID: '20230209054609-tu5wnpo',
    blockId: '20230209054609-tu5wnpo',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Topic,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createQueueStub(): IReviewQueue {
  const queue = {
    name: 'NeuralRoamQueue',
    type: QueueType.NeuralRoam,
    getType: () => QueueType.NeuralRoam,
    getCards: vi.fn(async () => []),
    getAllCards: vi.fn(async () => []),
    getNextCard: vi.fn(async () => null),
    addCard: vi.fn(async () => {}),
    removeCard: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    handleReview: vi.fn(async () => ({
      updatedCard: null,
      removedFromQueue: false,
      remainsInQueue: true,
      queueChanged: false,
      requiresCurrentViewReorder: false,
      counterSnapshot: {
        version: 1,
        remaining: 0,
        due: 0,
        total: 0,
        buckets: {
          all: 0,
          item: 0,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
        source: 'hot' as const,
      },
      version: 1,
    })),
    skip: vi.fn(async () => {}),
    getStats: vi.fn(async () => ({ size: 0, label: '0 due', extra: '0 total' })),
    getCounterSnapshot: vi.fn(async () => ({
      version: 1,
      remaining: 0,
      due: 0,
      total: 0,
      buckets: {
        all: 0,
        item: 0,
        descriptor: 0,
        topic: 0,
        concept: 0,
      },
      source: 'hot' as const,
    })),
    getUIConfig: vi.fn(() => ({ displayName: 'Neural Roam', buttons: [], showSkipButton: true, showProgressBar: true })),
    isDynamic: vi.fn(() => false),
    refresh: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    getSize: vi.fn(async () => 0),
    switchRoute: vi.fn(async () => ({})),
    syncFromBackendState: vi.fn(async () => {}),
    sort: vi.fn(async () => {}),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    reorder: vi.fn(async () => true),
    clearCustomOrder: vi.fn(),
    insertAt: vi.fn(async () => {}),
    getRemainingSize: vi.fn(async () => 0),
  } as unknown as IReviewQueue;

  return queue;
}

function createAdvanceItem(card: FSRSCard): BackendNeuralRoamItem {
  const meta = card.meta as { neuralContext?: { isFlashcard?: boolean } } | undefined;
  return {
    id: card.id,
    cardId: card.id,
    blockId: card.blockId,
    deckId: 'neural-roam',
    due: card.due,
    type: card.type,
    meta: card.meta as Record<string, unknown> | undefined,
    sourceKind: meta?.neuralContext?.isFlashcard === true ? 'associated-review' : 'virtual',
    payload: card as unknown as Record<string, unknown>,
  };
}

function createAdvanceResult(
  nextItem: BackendNeuralRoamItem | null,
  status: BackendNeuralRoamAdvanceResult['status'] = nextItem ? 'advanced' : 'exhausted',
): BackendNeuralRoamAdvanceResult {
  return {
    queueType: 'neural-roam',
    sessionId: null,
    status,
    nextItem,
    counters: {
      remaining: nextItem ? 1 : 0,
      due: nextItem ? 1 : 0,
      total: nextItem ? 1 : 0,
      pendingAssociatedReview: nextItem?.sourceKind === 'associated-review' ? 1 : 0,
      sourceNodes: nextItem ? 1 : 0,
    },
    sessionState: {
      sessionId: null,
      engineMode: 'hyperspace',
      currentNodeId: nextItem?.blockId ?? null,
      currentEventId: null,
      pathLength: nextItem ? 1 : 0,
      historyCount: nextItem ? 1 : 0,
      exhausted: !nextItem,
      projectionGeneration: null,
      policyHash: null,
    },
    queueState: {
      version: 8,
      engineMode: 'hyperspace',
    },
    projectionImpact: null,
    unavailableReason: null,
    message: null,
  };
}

function createStrategyWithQueue(
  queue: IReviewQueue,
  schedulerRouter: { preview: ReturnType<typeof vi.fn> } | null = null,
): {
  strategy: UnifiedQueueStrategy;
  manager: {
    getQueue: ReturnType<typeof vi.fn>;
    getCard: ReturnType<typeof vi.fn>;
    getCards: ReturnType<typeof vi.fn>;
    updateCard: ReturnType<typeof vi.fn>;
    neuralRoamAdvance: ReturnType<typeof vi.fn>;
    getBlockContentsWithType: ReturnType<typeof vi.fn>;
  };
} {
  const manager = {
    getQueue: vi.fn(() => queue),
    getCard: vi.fn(async () => {
      throw new Error('Card not found');
    }),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
    neuralRoamAdvance: vi.fn(async () => createAdvanceResult(null)),
    getBlockContentsWithType: vi.fn(async () => new Map()),
  };

  const eventBus = {
    subscribe: vi.fn(),
  };

  const strategy = new UnifiedQueueStrategy(
    QueueType.NeuralRoam,
    manager as never,
    eventBus as never,
    schedulerRouter as never
  );

  return { strategy, manager };
}

describe('UnifiedQueueStrategy neural-roam snapshot', () => {
  it('sends one-shot focus start intent on the first neural-roam advance', async () => {
    const queue = createQueueStub();
    const focusCard = createSyntheticNeuralCard({
      id: 'concept-focus',
      blockId: 'concept-focus',
      type: CardType.Concept,
    });
    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(createAdvanceItem(focusCard)));

    strategy.startNeuralRoamFromFocusOnNextAdvance({
      blockId: 'concept-focus',
      includeFocusAsFirst: true,
      startNewSession: true,
    });

    const next = await strategy.next();

    expect(next?.blockId).toBe('concept-focus');
    expect(manager.neuralRoamAdvance).toHaveBeenCalledWith(expect.objectContaining({
      queueType: 'neural-roam',
      currentItem: null,
      feedback: null,
      startFromFocus: expect.objectContaining({
        blockId: 'concept-focus',
        includeFocusAsFirst: true,
        resetHistory: false,
        startNewSession: true,
      }),
    }));
  });

  it('does not query card storage snapshot for synthetic neural cards', async () => {
    const queue = createQueueStub();
    const { strategy, manager } = createStrategyWithQueue(queue);

    const currentItem = createSyntheticNeuralCard();
    await strategy.onFeedback(currentItem, { action: 'rate', rating: 3 });

    expect(manager.getCard).not.toHaveBeenCalled();
    expect(manager.getCards).not.toHaveBeenCalled();
    expect((queue.handleReview as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(manager.neuralRoamAdvance).toHaveBeenCalledWith(expect.objectContaining({
      queueType: 'neural-roam',
      currentItem: expect.objectContaining({
        id: currentItem.id,
        blockId: currentItem.blockId,
      }),
      feedback: expect.objectContaining({
        action: 'rate',
        rating: 3,
      }),
    }));
  });

  it('sends neural-roam advance current item as a structured-clone-safe DTO', async () => {
    const queue = createQueueStub();
    const { strategy, manager } = createStrategyWithQueue(queue);
    const currentItem = createSyntheticNeuralCard({
      meta: {
        neuralContext: {
          isFlashcard: true,
        },
        nonCloneable: () => 'must not cross worker boundary',
      } as unknown as Record<string, unknown>,
    });
    manager.neuralRoamAdvance.mockImplementationOnce(async (request) => {
      expect(() => structuredClone(request)).not.toThrow();
      expect(request.currentItem).toMatchObject({
        id: currentItem.id,
        blockId: currentItem.blockId,
      });
      expect((request.currentItem as BackendNeuralRoamItem).meta).not.toHaveProperty('nonCloneable');
      expect((request.currentItem as BackendNeuralRoamItem).payload).not.toHaveProperty('meta.nonCloneable');
      return createAdvanceResult(null);
    });

    await strategy.onFeedback(currentItem, { action: 'rate', rating: 3 });
  });

  it('uses queue.getSize fast-path for neural stats', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getCards: ReturnType<typeof vi.fn>;
      getSize: ReturnType<typeof vi.fn>;
    };
    queue.getSize.mockResolvedValue(42);

    const { strategy } = createStrategyWithQueue(queue);
    const stats = await strategy.getStats();

    expect(stats).toEqual({
      size: 42,
      label: '42 due',
      extra: '42 total',
    });
    expect(queue.getSize).toHaveBeenCalledTimes(1);
    expect(queue.getCards).not.toHaveBeenCalled();
  });

  it('uses backend neural-roam exhausted counters instead of stale local source pool stats', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getSize: ReturnType<typeof vi.fn>;
    };
    queue.getSize.mockResolvedValue(3);
    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(null, 'exhausted'));

    await expect(strategy.next()).resolves.toBeNull();

    const stats = await strategy.getStats();
    expect(stats).toEqual({
      size: 0,
      label: '0 due',
      extra: '0 total',
    });
    expect(queue.getSize).not.toHaveBeenCalled();
  });

  it('uses queue.getSize fast-path for neural remaining size', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getCards: ReturnType<typeof vi.fn>;
      getSize: ReturnType<typeof vi.fn>;
    };
    queue.getSize.mockResolvedValue(17);

    const { strategy } = createStrategyWithQueue(queue);
    const remaining = await strategy.getRemainingSize();

    expect(remaining).toBe(17);
    expect(queue.getSize).toHaveBeenCalledTimes(1);
    expect(queue.getCards).not.toHaveBeenCalled();
  });

  it('skips nextDues preview for non-flashcard neural nodes in next and goBack paths', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getNextCard: ReturnType<typeof vi.fn>;
    };
    const preview = vi.fn(() => new Map());
    const topicNode = createSyntheticNeuralCard({
      meta: {
        neuralContext: {
          isFlashcard: false,
        },
      },
    });
    const { strategy, manager } = createStrategyWithQueue(queue, { preview });
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(createAdvanceItem(topicNode)));

    const nextCard = await strategy.next();
    expect(nextCard).toMatchObject({
      id: topicNode.id,
      blockId: topicNode.blockId,
    });
    expect(queue.getNextCard).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();

    await strategy.onFeedback(nextCard, {
      action: 'custom',
      customActionId: 'noop',
    } as QueueFeedback);

    const previous = await strategy.goBack(null);
    expect(previous?.id).toBe(topicNode.id);
    expect(preview).not.toHaveBeenCalled();
    expect(previous && 'nextDues' in previous).toBe(false);
  });

  it('switches neural-roam route through queue contract and clears pending review advance state', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      switchRoute: ReturnType<typeof vi.fn>;
    };
    const active = createSyntheticNeuralCard({ id: 'active-node', blockId: 'active-node' });
    const pending = createSyntheticNeuralCard({ id: 'old-route-pending', blockId: 'old-route-pending' });
    const newRouteNext = createSyntheticNeuralCard({ id: 'new-route-node', blockId: 'new-route-node' });
    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(createAdvanceItem(pending)));

    await strategy.onFeedback(active, { action: 'skip' });
    await strategy.switchNeuralRoamRoute('route-new');
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(createAdvanceItem(newRouteNext)));

    const next = await strategy.next();

    expect(queue.switchRoute).toHaveBeenCalledWith('route-new');
    expect(next?.id).toBe('new-route-node');
    expect(manager.neuralRoamAdvance).toHaveBeenLastCalledWith(expect.objectContaining({
      currentItem: null,
      feedback: null,
      startFromFocus: null,
    }));
  });

  it('syncs the local neural queue after backend next advances the track state', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      syncFromBackendState: ReturnType<typeof vi.fn>;
      getNavigationState: ReturnType<typeof vi.fn>;
    };
    const topicNode = createSyntheticNeuralCard({
      id: '20230209054609-track01',
      blockId: '20230209054609-track01',
      meta: {
        neuralContext: {
          isFlashcard: false,
        },
      },
    });
    let historyCount = 0;
    queue.syncFromBackendState.mockImplementationOnce(async () => {
      historyCount = 1;
    });
    queue.getNavigationState = vi.fn(() => ({
      sessionId: null,
      engineSessionId: null,
      engineMode: 'hyperspace',
      mode: 'default',
      currentNodeId: historyCount > 0 ? topicNode.blockId : null,
      currentEventId: historyCount > 0 ? 'event-track01' : null,
      pathLength: historyCount,
      historyCount,
      hasPrevious: historyCount > 1,
      hasNext: false,
      canGoBack: historyCount > 1,
      canGoForward: false,
      isAtStart: historyCount === 0,
      isExhausted: false,
    }));

    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(createAdvanceItem(topicNode)));

    const nextCard = await strategy.next();

    expect(nextCard?.blockId).toBe(topicNode.blockId);
    expect(queue.syncFromBackendState).toHaveBeenCalledTimes(1);
    expect(queue.syncFromBackendState).toHaveBeenCalledWith(expect.objectContaining({
      version: 8,
      engineMode: 'hyperspace',
    }));
    expect(queue.getNavigationState().historyCount).toBe(1);
  });

  it('fails explicitly when backend advance omits queue state for local track sync', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      syncFromBackendState: ReturnType<typeof vi.fn>;
    };
    const topicNode = createSyntheticNeuralCard({
      meta: {
        neuralContext: {
          isFlashcard: false,
        },
      },
    });
    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.neuralRoamAdvance.mockResolvedValueOnce({
      ...createAdvanceResult(createAdvanceItem(topicNode)),
      queueState: null,
    });

    await expect(strategy.next()).rejects.toThrow('NEURAL_ROAM_QUEUE_SYNC_UNAVAILABLE');
    expect(queue.syncFromBackendState).not.toHaveBeenCalled();
  });

  it('does not fall back to local queue advance when backend advance is unavailable', async () => {
    const queue = createQueueStub() as IReviewQueue & {
      getNextCard: ReturnType<typeof vi.fn>;
    };
    queue.getNextCard.mockResolvedValue(createSyntheticNeuralCard());
    const { strategy, manager } = createStrategyWithQueue(queue);
    (manager as unknown as { neuralRoamAdvance?: unknown }).neuralRoamAdvance = undefined;

    await expect(strategy.next()).rejects.toThrow('NEURAL_ROAM_ADVANCE_UNAVAILABLE');
    expect(queue.getNextCard).not.toHaveBeenCalled();
  });

  it('skips display hydration preview for non-flashcard neural nodes', async () => {
    const queue = createQueueStub();
    const preview = vi.fn(() => new Map());
    const topicNode = createSyntheticNeuralCard({
      meta: {
        neuralContext: {
          isFlashcard: false,
        },
      },
    });

    const { strategy } = createStrategyWithQueue(queue, { preview });
    const hydrated = await strategy.hydrateCurrentItem(topicNode);

    expect(hydrated).toBe(topicNode);
    expect(preview).not.toHaveBeenCalled();
    expect(hydrated && 'nextDues' in hydrated).toBe(false);
  });

  it('hydrates neural-roam virtual document nodes with the same document title payload as real document cards', async () => {
    const queue = createQueueStub();
    const virtualDocNode = createSyntheticNeuralCard({
      id: '20260518120000-docnode',
      blockId: '20260518120000-docnode',
      type: CardType.Topic,
      meta: {
        neuralContext: {
          isFlashcard: false,
          nodeRole: 'virtual',
        },
      },
    });
    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.getBlockContentsWithType.mockResolvedValueOnce(new Map([
      [virtualDocNode.blockId, {
        id: virtualDocNode.blockId,
        content: 'Document Node Title',
        type: 'd',
        isDocument: true,
      }],
    ]));

    const hydrated = await strategy.hydrateCurrentItem(virtualDocNode);

    expect(hydrated).toMatchObject({
      id: virtualDocNode.id,
      blockId: virtualDocNode.blockId,
      meta: expect.objectContaining({
        content: 'Document Node Title',
        blockType: 'd',
        isDocument: true,
        neuralContext: expect.objectContaining({
          isFlashcard: false,
          nodeRole: 'virtual',
        }),
      }),
    });
    expect(manager.getBlockContentsWithType).toHaveBeenCalledWith([virtualDocNode.blockId]);
  });

  it('hydrates backend-advanced neural-roam virtual document nodes before returning the next card', async () => {
    const queue = createQueueStub();
    const virtualDocNode = createSyntheticNeuralCard({
      id: '20260518120000-nextdoc',
      blockId: '20260518120000-nextdoc',
      type: CardType.Topic,
      meta: {
        neuralContext: {
          isFlashcard: false,
          nodeRole: 'virtual',
        },
      },
    });
    const { strategy, manager } = createStrategyWithQueue(queue);
    manager.neuralRoamAdvance.mockResolvedValueOnce(createAdvanceResult(createAdvanceItem(virtualDocNode)));
    manager.getBlockContentsWithType.mockResolvedValueOnce(new Map([
      [virtualDocNode.blockId, {
        id: virtualDocNode.blockId,
        content: 'Advanced Document Title',
        type: 'd',
        isDocument: true,
      }],
    ]));

    const next = await strategy.next();

    expect(next).toMatchObject({
      id: virtualDocNode.id,
      blockId: virtualDocNode.blockId,
      meta: expect.objectContaining({
        content: 'Advanced Document Title',
        blockType: 'd',
        isDocument: true,
      }),
    });
    expect(manager.getBlockContentsWithType).toHaveBeenCalledWith([virtualDocNode.blockId]);
  });
});
