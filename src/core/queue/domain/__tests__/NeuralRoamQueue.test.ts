import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamQueue } from '../NeuralRoamQueue';
import type { QueuePersistencePort } from '../ports';
import type { NeuralRoamHistoryEntry, QueueCounterSnapshot } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

function createPersistence(initial: unknown): {
  persistence: QueuePersistencePort;
  store: Map<string, unknown>;
} {
  const store = new Map<string, unknown>();
  if (initial !== undefined) {
    store.set('neuralRoamQueue', initial);
  }

  const persistence: QueuePersistencePort = {
    get<T>(key: string): T | null {
      return (store.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
  };

  return { persistence, store };
}

type LocalCardSeed = {
  id?: string;
  blockId: string;
  type: 'concept' | 'item' | 'topic' | 'descriptor';
  cardTypeMarker?: 'concept' | 'descriptor';
  meta?: { cardTypeMarker?: 'concept' | 'descriptor' };
  due?: number;
  reps?: number;
  lapses?: number;
  state?: number;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  lastReview?: number;
  createdAt?: number;
  updatedAt?: number;
};

function toStoredCard(seed: LocalCardSeed): FSRSCard {
  const now = Date.now();
  return {
    id: seed.id ?? `card-${seed.blockId}`,
    xiuyuanID: seed.id ?? `card-${seed.blockId}`,
    blockId: seed.blockId,
    due: seed.due ?? (now + 86_400_000),
    stability: seed.stability ?? 3,
    difficulty: seed.difficulty ?? 5,
    reps: seed.reps ?? 2,
    lapses: seed.lapses ?? 0,
    state: (seed.state ?? 2) as FSRSCard['state'],
    lastReview: seed.lastReview ?? (now - 86_400_000),
    elapsedDays: seed.elapsedDays ?? 1,
    scheduledDays: seed.scheduledDays ?? 1,
    priority: 50,
    type: seed.type as FSRSCard['type'],
    tags: [],
    cardTypeMarker: seed.cardTypeMarker,
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: seed.createdAt ?? (now - 172_800_000),
    updatedAt: seed.updatedAt ?? (now - 60_000),
    meta: seed.meta ? { ...seed.meta } : undefined,
  };
}

function createManager(options: {
  cards?: LocalCardSeed[];
  throwOnLookup?: boolean;
  schedulerRoute?: (card: FSRSCard, rating: number) => Promise<FSRSCard>;
} = {}) {
  const cardByBlockId = new Map<string, FSRSCard>();
  const cardById = new Map<string, FSRSCard>();
  for (const seed of options.cards ?? []) {
    const card = toStoredCard(seed);
    cardByBlockId.set(card.blockId, card);
    cardById.set(card.id, card);
  }

  const getCards = vi.fn(async (filter?: { blockIds?: string[] }) => {
    if (options.throwOnLookup) {
      throw new Error('local card lookup failed');
    }
    const blockIds = Array.isArray(filter?.blockIds) ? filter?.blockIds : [];
    if (blockIds.length === 0) {
      return Array.from(cardByBlockId.values()).map((card) => JSON.parse(JSON.stringify(card))) as any[];
    }
    return blockIds
      .map((blockId) => cardByBlockId.get(blockId))
      .filter((card): card is FSRSCard => Boolean(card))
      .map((card) => JSON.parse(JSON.stringify(card))) as any[];
  });

  const getCard = vi.fn(async (cardId: string) => {
    const card = cardById.get(cardId);
    if (!card) {
      throw new Error(`missing card ${cardId}`);
    }
    return JSON.parse(JSON.stringify(card)) as FSRSCard;
  });

  const route = vi.fn(async (card: FSRSCard, rating: number) => {
    if (options.schedulerRoute) {
      const updated = await options.schedulerRoute(card, rating);
      cardByBlockId.set(updated.blockId, JSON.parse(JSON.stringify(updated)));
      cardById.set(updated.id, JSON.parse(JSON.stringify(updated)));
      return JSON.parse(JSON.stringify(updated));
    }

    const updated: FSRSCard = {
      ...card,
      due: Date.now() + 2 * 86_400_000,
      scheduledDays: Math.max(1, Number(card.scheduledDays || 0) + 1),
      reps: Number(card.reps || 0) + 1,
      updatedAt: Date.now(),
      lastReview: Date.now(),
    };
    cardByBlockId.set(updated.blockId, JSON.parse(JSON.stringify(updated)));
    cardById.set(updated.id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  });

  const onCardUpdatedFromScheduler = vi.fn(async (card: FSRSCard) => {
    cardByBlockId.set(card.blockId, JSON.parse(JSON.stringify(card)));
    cardById.set(card.id, JSON.parse(JSON.stringify(card)));
  });

  return {
    manager: {
      getCard,
      getCards,
      getSchedulerRouter: vi.fn(() => ({
        route,
      })),
      onCardUpdatedFromScheduler,
    } as never,
    getCard,
    getCards,
    route,
    onCardUpdatedFromScheduler,
  };
}

function conceptCard(blockId: string): LocalCardSeed {
  return {
    blockId,
    type: 'concept',
    cardTypeMarker: 'concept',
    meta: { cardTypeMarker: 'concept' },
  };
}

function itemCard(blockId: string): LocalCardSeed {
  return {
    blockId,
    type: 'item',
  };
}

function descriptorCard(blockId: string): LocalCardSeed {
  return {
    blockId,
    type: 'descriptor',
    cardTypeMarker: 'descriptor',
    meta: { cardTypeMarker: 'descriptor' },
  };
}

function createHistoryEntry(
  index: number,
  options: {
    nodeId?: string;
    sessionId?: string;
    engineMode?: 'orbit' | 'hyperspace';
  } = {},
): NeuralRoamHistoryEntry {
  const engineMode = options.engineMode ?? 'orbit';
  return {
    eventId: `event-${engineMode}-${index}`,
    nodeId: options.nodeId ?? `node-${index}`,
    focusId: `focus-${engineMode}`,
    sessionId: options.sessionId ?? `${engineMode}-session-1`,
    associationType: engineMode === 'hyperspace' ? 'source' : 'focus',
    reason: engineMode === 'hyperspace' ? 'source' : 'focus',
    visitedAt: index + 1,
    isVirtual: false,
    nodePreview: `${engineMode}-${index}`,
    traceQuality: 'exact',
    engineMode,
    sourceRole: engineMode === 'hyperspace' ? 'activation-source' : 'orbit-center',
    origin: engineMode === 'hyperspace' ? 'source' : null,
    sourceNodeId: null,
    sourceEventId: null,
    branchRootNodeId: `focus-${engineMode}`,
    activationKind: engineMode === 'hyperspace' ? 'source-root' : 'focus-root',
    depth: null,
    conductionScore: null,
  };
}

function mockNeuralEngine(queue: NeuralRoamQueue): void {
  const conceptQueue = (queue as any).conceptQueue;
  const mockQueryEngine = conceptQueue.queryEngine;

  mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
    id: blockId,
    content: `${blockId} content`,
    type: 'p',
    root_id: 'doc-1',
  }));
  mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([]);

  const hyperspaceEngine = (queue as any).hyperspaceEngine;
  const graphProvider = hyperspaceEngine.graphProvider;
  graphProvider.fetchBlockData = vi.fn(async (blockId: string) => ({
    id: blockId,
    content: `${blockId} content`,
    type: 'p',
    root_id: 'doc-1',
  }));
  graphProvider.fetchHyperspaceEdges = vi.fn().mockResolvedValue([]);
  graphProvider.fetchNodePriority = vi.fn(async () => 0.7);
  graphProvider.isConceptCard = vi.fn(async (nodeId: string) => nodeId.startsWith('concept'));
}

describe('NeuralRoamQueue', () => {
  it('reuses a cached counter snapshot during review instead of force-refreshing cards', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();

    const snapshot: QueueCounterSnapshot = {
      version: 7,
      remaining: 2,
      due: 2,
      total: 2,
      buckets: {
        all: 2,
        item: 1,
        descriptor: 0,
        topic: 1,
        concept: 0,
      },
      source: 'reconciled',
    };

    (queue as any).counterSnapshot = snapshot;
    (queue as any).counterSnapshotDirty = false;
    const getCardsSpy = vi.spyOn(queue, 'getCards').mockResolvedValue([]);

    const result = await queue.handleReview('card-1', 3);

    expect(getCardsSpy).not.toHaveBeenCalled();
    expect(result.counterSnapshot).toEqual(snapshot);
    expect(result.queueChanged).toBe(false);
    expect(result.requiresCurrentViewReorder).toBe(false);
  });

  it('migrates v4 state to v7 by splitting seedPool and anchorPool', async () => {
    const { persistence, store } = createPersistence({
      version: 4,
      focusPool: [
        {
          nodeId: 'concept-a',
          nodeKind: 'concept',
          priority: 0.8,
          neighborsViewed: 0,
          addedAt: 1000,
          nodePreview: 'concept-a',
        },
        {
          nodeId: 'virtual-1',
          nodeKind: 'virtual',
          priority: 0.5,
          neighborsViewed: 0,
          addedAt: 1001,
          nodePreview: 'virtual-1',
        },
      ],
      session: {
        displayPath: ['concept-a'],
        currentPathIndex: 0,
        navigationMode: 'explore',
        bookmarkPathIndex: null,
        history: [],
        currentFocus: 'concept-a',
        currentSessionId: 'session-1',
        visitedBlocks: ['concept-a'],
        exhaustedFocuses: [],
      },
    });
    const manager = createManager({
      cards: [conceptCard('concept-a'), itemCard('virtual-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).not.toContain('virtual-1');
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('virtual-1');

    const saved = store.get('neuralRoamQueue') as any;
    expect(saved?.version).toBe(7);
    expect(saved?.engineMode).toBe('orbit');
    expect(Array.isArray(saved?.orbit?.seedPool)).toBe(true);
    expect(Array.isArray(saved?.orbit?.anchorPool)).toBe(true);
    expect(saved?.orbit?.seedPool.map((entry: { nodeId: string }) => entry.nodeId)).toContain('concept-a');
    expect(saved?.orbit?.anchorPool.map((entry: { nodeId: string }) => entry.nodeId)).toContain('virtual-1');
  });

  it('normalizes seed pool on load and removes non-concept entries', async () => {
    const { persistence, store } = createPersistence({
      version: 5,
      seedPool: [
        {
          nodeId: 'concept-a',
          nodeKind: 'concept',
          priority: 0.8,
          neighborsViewed: 0,
          addedAt: 1000,
          nodePreview: 'concept-a',
        },
        {
          nodeId: 'virtual-1',
          nodeKind: 'virtual',
          priority: 0.5,
          neighborsViewed: 0,
          addedAt: 1001,
          nodePreview: 'virtual-1',
        },
      ],
      anchorPool: [],
      session: {
        displayPath: [],
        currentPathIndex: -1,
        navigationMode: 'explore',
        bookmarkPathIndex: null,
        history: [],
        currentFocus: 'virtual-1',
        currentSessionId: 'session-1',
        visitedBlocks: [],
        exhaustedFocuses: [],
      },
    });
    const manager = createManager({
      cards: [conceptCard('concept-a'), itemCard('virtual-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);
    const conceptQueue = (queue as any).conceptQueue;
    expect(conceptQueue.currentFocus).toBeNull();

    const saved = store.get('neuralRoamQueue') as any;
    expect(saved?.version).toBe(7);
    expect(saved?.engineMode).toBe('orbit');
    expect(saved?.orbit?.seedPool.map((entry: { nodeId: string }) => entry.nodeId)).toEqual(['concept-a']);
    expect(saved?.orbit?.anchorPool).toEqual([]);
  });

  it('keeps seed pool unchanged when local concept lookup fails during load normalization', async () => {
    const { persistence } = createPersistence({
      version: 5,
      seedPool: [
        {
          nodeId: 'concept-a',
          nodeKind: 'concept',
          priority: 0.8,
          neighborsViewed: 0,
          addedAt: 1000,
          nodePreview: 'concept-a',
        },
        {
          nodeId: 'virtual-1',
          nodeKind: 'virtual',
          priority: 0.5,
          neighborsViewed: 0,
          addedAt: 1001,
          nodePreview: 'virtual-1',
        },
      ],
      anchorPool: [],
      session: {
        displayPath: [],
        currentPathIndex: -1,
        navigationMode: 'explore',
        bookmarkPathIndex: null,
        history: [],
        currentFocus: null,
        currentSessionId: 'session-1',
        visitedBlocks: [],
        exhaustedFocuses: [],
      },
    });
    const manager = createManager({ throwOnLookup: true });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId).sort()).toEqual(['concept-a', 'virtual-1']);
  });

  it('accepts trusted concept add payload when local card type is concept', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    const conceptQueue = (queue as any).conceptQueue;
    const mockQueryEngine = conceptQueue.queryEngine;
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
      root_id: 'doc-1',
    }));

    await queue.addCard({
      id: 'card-concept-1',
      blockId: 'block-concept-1',
      type: 'concept',
      cardTypeMarker: 'concept',
      meta: { cardTypeMarker: 'concept' },
    } as any);

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('block-concept-1');
    expect(manager.getCards).not.toHaveBeenCalled();
  });

  it('clearAnchors (and clearFocusPool alias) does not clear roam history', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(
      manager.manager,
      persistence,
      {
        cardTypeResolver: {
          resolveCardType: vi.fn(async (): Promise<'item' | 'topic'> => 'item'),
        },
      }
    );

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('virtual-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('virtual-1');
    expect(queue.getHistorySnapshot()).toHaveLength(1);

    await queue.clearAnchors();
    expect(queue.getAnchorSnapshot()).toEqual([]);
    expect(queue.getHistorySnapshot()).toHaveLength(1);

    await queue.setAnchorEntry('virtual-1', true);
    await queue.clearFocusPool();
    expect(queue.getAnchorSnapshot()).toEqual([]);
    expect(queue.getHistorySnapshot()).toHaveLength(1);
  });

  it('does not append orbit history when setting the current focus without including it as the first path node', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: false,
      resetHistory: true,
      bookmarkCurrentPath: true,
    });

    expect(queue.getEngineMode()).toBe('orbit');
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(queue.getNavigationState().currentNodeId).toBeNull();
  });

  it('does not append hyperspace history when setting the current focus without including it as the first path node', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    await queue.setEngineMode('hyperspace', { carryCurrentNode: false });
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: false,
      resetHistory: true,
      bookmarkCurrentPath: true,
    });

    expect(queue.getEngineMode()).toBe('hyperspace');
    expect(queue.getSourceSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(queue.getNavigationState().currentNodeId).toBeNull();
  });

  it('does not append hyperspace history when switching from an orbit center that was selected but not roamed', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: false,
      resetHistory: true,
      bookmarkCurrentPath: true,
    });
    await queue.setEngineMode('hyperspace', { carryCurrentNode: true });

    expect(queue.getEngineMode()).toBe('hyperspace');
    expect(queue.getSourceSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(queue.getNavigationState().currentNodeId).toBeNull();
  });

  it('does not append orbit history when switching from an activation source that was selected but not roamed', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setEngineMode('hyperspace', { carryCurrentNode: false });
    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: false,
      resetHistory: true,
      bookmarkCurrentPath: true,
    });
    await queue.setEngineMode('orbit', { carryCurrentNode: true });

    expect(queue.getEngineMode()).toBe('orbit');
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(queue.getNavigationState().currentNodeId).toBeNull();
  });

  it('does not duplicate the carried activation source when switching back into hyperspace', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.setEngineMode('hyperspace', { carryCurrentNode: true });

    expect(queue.getEngineMode()).toBe('hyperspace');
    expect(queue.getSourceSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);

    await queue.setEngineMode('orbit', { carryCurrentNode: true });
    await queue.setEngineMode('hyperspace', { carryCurrentNode: true });

    expect(queue.getEngineMode()).toBe('hyperspace');
    expect(queue.getNavigationState().currentNodeId).toBe('concept-a');
    expect(queue.getSourceSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);
    expect(queue.getHistorySnapshot().filter((entry) => entry.activationKind === 'source-root')).toHaveLength(1);
  });

  it('does not duplicate the carried orbit focus when switching back into orbit', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    expect(queue.getEngineMode()).toBe('orbit');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);
    expect(queue.getHistorySnapshot().filter((entry) => entry.activationKind === 'focus-root')).toHaveLength(1);

    await queue.setEngineMode('hyperspace', { carryCurrentNode: true });
    await queue.setEngineMode('orbit', { carryCurrentNode: true });

    expect(queue.getEngineMode()).toBe('orbit');
    expect(queue.getNavigationState().currentNodeId).toBe('concept-a');
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);
    expect(queue.getHistorySnapshot().filter((entry) => entry.activationKind === 'focus-root')).toHaveLength(1);
  });

  it('clears history by current/all scope', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(
      manager.manager,
      persistence,
      {
        cardTypeResolver: {
          resolveCardType: vi.fn(async (): Promise<'item' | 'topic'> => 'item'),
        },
      }
    );

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('virtual-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    const firstSessionId = queue.getNavigationState().sessionId;

    (queue as any).conceptQueue.currentSessionId = null;

    await queue.setCurrentFocus('virtual-2', {
      includeFocusAsFirst: true,
      resetHistory: false,
    });
    const secondSessionId = queue.getNavigationState().sessionId;

    expect(firstSessionId).toBeTruthy();
    expect(secondSessionId).toBeTruthy();
    expect(secondSessionId).not.toBe(firstSessionId);
    const historyBeforeClear = queue.getHistorySnapshot();
    expect(historyBeforeClear.map((entry) => entry.nodeId)).toEqual(['virtual-1', 'virtual-2']);

    queue.clearHistory('current');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['virtual-1']);
    expect(queue.getHistoryCount()).toBe(1);
    expect(queue.getHistoryEntryByEventId(historyBeforeClear[1].eventId)).toBeNull();
    expect(queue.getHistoryPage({ offset: 0, limit: 5 }).entries.map((entry) => entry.nodeId)).toEqual(['virtual-1']);

    queue.clearHistory('all');
    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(queue.getHistoryCount()).toBe(0);
    expect(queue.getHistoryEntriesByNodeId('virtual-1')).toEqual([]);
    expect(queue.getHistoryHitCount('virtual-1')).toBe(0);
  });

  it('forwards seed/anchor wrapper calls', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-seed-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setSeedEntry('concept-seed-1', true);
    await queue.setAnchorEntry('virtual-anchor-1', true);

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-seed-1');
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('virtual-anchor-1');
  });

  it('forwards bookmarkCurrentPath option in setCurrentFocus to enable returnToBookmark', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('virtual-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    await queue.setCurrentFocus('virtual-2', {
      includeFocusAsFirst: true,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });

    expect(queue.getNavigationState().hasBookmark).toBe(true);
    expect(queue.returnToBookmark()).toBe(true);
    expect(queue.getNavigationState().currentNodeId).toBe('virtual-1');
  });

  it('caches resolved card type across repeated neural card conversions', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const resolveCardType = vi.fn(async () => 'item' as const);
    const queue = new NeuralRoamQueue(
      manager.manager,
      persistence,
      {
        cardTypeResolver: {
          resolveCardType,
        },
      }
    );

    await queue.load();
    mockNeuralEngine(queue);

    await queue.getPathItemByNodeId('virtual-1');
    await queue.getPathItemByNodeId('virtual-1');

    expect(resolveCardType).toHaveBeenCalledTimes(1);
  });

  it('hydrates backed flashcards with their persisted local card data', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [descriptorCard('descriptor-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    const card = await queue.getPathItemByNodeId('descriptor-1');

    expect(card).not.toBeNull();
    expect(card?.id).toBe('card-descriptor-1');
    expect(card?.type).toBe('descriptor');
    expect(card?.meta).toEqual(expect.objectContaining({
      cardTypeMarker: 'descriptor',
      neuralContext: expect.objectContaining({
        isFlashcard: true,
        blockType: 'p',
      }),
    }));
  });

  it('writes back formal SRS reviews for real neural-roam flashcards without removing them from the roam queue', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        {
          ...descriptorCard('descriptor-1'),
          id: 'review-card-1',
          due: Date.now() - 60_000,
          scheduledDays: 0,
        },
      ],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();

    const result = await queue.handleReview('review-card-1', 3);

    expect(manager.route).toHaveBeenCalledTimes(1);
    expect(manager.onCardUpdatedFromScheduler).toHaveBeenCalledTimes(1);
    expect(result.updatedCard).not.toBeNull();
    expect(result.removedFromQueue).toBe(false);
    expect(result.remainsInQueue).toBe(true);
    expect(result.queueChanged).toBe(false);
  });

  it('forwards activation trace lookup from concept queue', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const history = queue.getHistorySnapshot();
    const trace = queue.getActivationTrace(history[0].eventId);

    expect(trace).not.toBeNull();
    expect(trace?.targetNodeId).toBe('concept-a');
    expect(trace?.steps[0]?.nodeId).toBe('concept-a');
  });

  it('exposes paged history lookups without requiring a full history snapshot', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a'), conceptCard('concept-b')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.setCurrentFocus('concept-b', {
      includeFocusAsFirst: true,
      resetHistory: false,
    });
    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: false,
    });

    const history = queue.getHistorySnapshot();
    const latestPage = queue.getHistoryPage({ offset: 0, limit: 2 });

    expect(queue.getHistoryCount()).toBe(3);
    expect(latestPage.entries.map((entry) => entry.nodeId)).toEqual(['concept-a', 'concept-b']);
    expect(latestPage.totalCount).toBe(3);
    expect(latestPage.hasMore).toBe(true);
    expect(queue.getHistoryEntryByEventId(history[0].eventId)?.nodeId).toBe('concept-a');
    expect(queue.getHistoryEntriesByNodeId('concept-a').map((entry) => entry.eventId)).toEqual([
      history[0].eventId,
      history[2].eventId,
    ]);
    expect(queue.getHistoryHitCount('concept-a')).toBe(2);
  });

  it('applies one shared configured history limit to both orbit and hyperspace on restore', async () => {
    const orbitHistory = Array.from({ length: 205 }, (_, index) => createHistoryEntry(index, {
      engineMode: 'orbit',
      nodeId: `orbit-node-${index}`,
      sessionId: 'orbit-session-1',
    }));
    const hyperspaceHistory = Array.from({ length: 205 }, (_, index) => createHistoryEntry(index, {
      engineMode: 'hyperspace',
      nodeId: `hyperspace-node-${index}`,
      sessionId: 'hyperspace-session-1',
    }));
    const { persistence } = createPersistence({
      version: 7,
      engineMode: 'orbit',
      orbit: {
        seedPool: [],
        anchorPool: [],
        session: {
          displayPath: ['orbit-node-204'],
          displayPathEventIds: ['event-orbit-204'],
          currentPathIndex: 0,
          navigationMode: 'follow',
          bookmarkPathIndex: null,
          history: orbitHistory,
          currentFocus: 'orbit-node-204',
          currentFocusEventId: 'event-orbit-204',
          branchRootNodeId: 'focus-orbit',
          currentSessionId: 'orbit-session-1',
          visitedBlocks: orbitHistory.map((entry) => entry.nodeId),
          exhaustedFocuses: [],
        },
      },
      hyperspace: {
        sourcePool: [],
        anchorPool: [],
        session: {
          displayPath: ['hyperspace-node-204'],
          displayPathEventIds: ['event-hyperspace-204'],
          currentPathIndex: 0,
          navigationMode: 'follow',
          bookmarkPathIndex: null,
          history: hyperspaceHistory,
          currentLeadSource: 'hyperspace-node-204',
          currentLeadSourceEventId: 'event-hyperspace-204',
          branchRootNodeId: 'focus-hyperspace',
          currentSessionId: 'hyperspace-session-1',
          visitedBlocks: hyperspaceHistory.map((entry) => entry.nodeId),
          frontier: [],
          exhaustedSources: [],
        },
      },
    });
    const manager = createManager();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      getHistoryLimit: () => 200,
    });

    await queue.load();

    const conceptQueue = (queue as any).conceptQueue;
    const hyperspaceEngine = (queue as any).hyperspaceEngine;

    expect(conceptQueue.getHistoryCount()).toBe(200);
    expect(conceptQueue.getHistorySnapshot()[0]?.nodeId).toBe('orbit-node-5');
    expect(hyperspaceEngine.getHistoryCount()).toBe(200);
    expect(hyperspaceEngine.getHistorySnapshot()[0]?.nodeId).toBe('hyperspace-node-5');
  });
});
