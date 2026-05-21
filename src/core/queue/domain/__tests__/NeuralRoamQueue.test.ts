import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamQueue } from '../NeuralRoamQueue';
import type { QueuePersistencePort } from '../ports';
import type { NeuralRoamHistoryEntry, QueueCounterSnapshot } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import {
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  InMemoryNeuralRoamRouteRepository,
  NeuralRoamRouteCatalog,
  type NeuralRoamRouteState,
} from '../../neural/routes';

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
  meta?: Record<string, unknown>;
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
  const cardsByBlockId = new Map<string, FSRSCard[]>();
  const cardById = new Map<string, FSRSCard>();
  for (const seed of options.cards ?? []) {
    const card = toStoredCard(seed);
    const cardsForBlock = cardsByBlockId.get(card.blockId) ?? [];
    cardsForBlock.push(card);
    cardsByBlockId.set(card.blockId, cardsForBlock);
    cardById.set(card.id, card);
  }

  const getCards = vi.fn(async (filter?: { blockIds?: string[] }) => {
    if (options.throwOnLookup) {
      throw new Error('local card lookup failed');
    }
    const blockIds = Array.isArray(filter?.blockIds) ? filter?.blockIds : [];
    if (blockIds.length === 0) {
      return Array.from(cardsByBlockId.values()).flat().map((card) => JSON.parse(JSON.stringify(card))) as any[];
    }
    return blockIds
      .flatMap((blockId) => cardsByBlockId.get(blockId) ?? [])
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
      const cardsForBlock = cardsByBlockId.get(updated.blockId) ?? [];
      const nextCardsForBlock = cardsForBlock.filter((existing) => existing.id !== updated.id);
      nextCardsForBlock.push(JSON.parse(JSON.stringify(updated)));
      cardsByBlockId.set(updated.blockId, nextCardsForBlock);
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
    const cardsForBlock = cardsByBlockId.get(updated.blockId) ?? [];
    const nextCardsForBlock = cardsForBlock.filter((existing) => existing.id !== updated.id);
    nextCardsForBlock.push(JSON.parse(JSON.stringify(updated)));
    cardsByBlockId.set(updated.blockId, nextCardsForBlock);
    cardById.set(updated.id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  });

  const onCardUpdatedFromScheduler = vi.fn(async (card: FSRSCard) => {
    const cardsForBlock = cardsByBlockId.get(card.blockId) ?? [];
    const nextCardsForBlock = cardsForBlock.filter((existing) => existing.id !== card.id);
    nextCardsForBlock.push(JSON.parse(JSON.stringify(card)));
    cardsByBlockId.set(card.blockId, nextCardsForBlock);
    cardById.set(card.id, JSON.parse(JSON.stringify(card)));
  });
  const commitReview = vi.fn(async (command: { cardId: string; rating: number }) => {
    const card = cardById.get(command.cardId);
    if (!card) {
      throw new Error(`missing card ${command.cardId}`);
    }
    const updated = await route(JSON.parse(JSON.stringify(card)) as FSRSCard, command.rating);
    return {
      card: JSON.parse(JSON.stringify(card)) as FSRSCard,
      updatedCard: updated,
      committed: true,
    };
  });

  return {
    manager: {
      getCard,
      getCards,
      commitReview,
      getSchedulerRouter: vi.fn(() => ({
        route,
      })),
      onCardUpdatedFromScheduler,
    } as never,
    getCard,
    getCards,
    route,
    commitReview,
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

function itemCardWithId(id: string, blockId: string, due: number): LocalCardSeed {
  return {
    id,
    blockId,
    type: 'item',
    due,
  };
}

function topicCard(blockId: string): LocalCardSeed {
  return {
    blockId,
    type: 'topic',
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

function nativeRiffSyncCard(blockId: string, blockType: 'i' | 'h'): LocalCardSeed {
  return {
    blockId,
    type: 'item',
    meta: {
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
      blockType,
      frontBlockIDs: [blockId],
      backBlockIDs: [blockId],
    },
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
  mockQueryEngine.fetchSubtreeBlockIds = vi.fn(async () => []);

  const queueQueryEngine = (queue as any).queryEngine;
  if (queueQueryEngine) {
    queueQueryEngine.fetchSubtreeBlockIds = vi.fn(async () => []);
  }

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

function createRouteCatalog(initialState?: NeuralRoamRouteState | null) {
  let nextId = 1;
  const repository = new InMemoryNeuralRoamRouteRepository(initialState);
  const catalog = new NeuralRoamRouteCatalog({
    repository,
    idFactory: {
      createRouteId: () => `route-${nextId++}`,
    },
  });
  return { catalog, repository };
}

describe('NeuralRoamQueue', () => {
  it('applies backend state snapshots to local history and trace readers', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(manager.manager, persistence);
    const historyEntry = createHistoryEntry(1, {
      nodeId: 'backend-node-1',
      sessionId: 'backend-session-1',
      engineMode: 'hyperspace',
    });

    await queue.load();
    expect(queue.getHistoryPage({ offset: 0, limit: 10 }).entries).toHaveLength(0);

    await queue.syncFromBackendState({
      version: 8,
      engineMode: 'hyperspace',
      orbit: {
        seedPool: [],
        anchorPool: [],
        session: {
          displayPath: [],
          displayPathEventIds: [],
          currentPathIndex: -1,
          navigationMode: 'explore',
          bookmarkPathIndex: null,
          history: [],
          currentFocus: null,
          currentFocusEventId: null,
          branchRootNodeId: null,
          currentSessionId: null,
          visitedBlocks: [],
          exhaustedFocuses: [],
          currentRoundStartedAt: null,
        },
      },
      hyperspace: {
        sourcePool: [],
        anchorPool: [],
        session: {
          displayPath: ['backend-node-1'],
          displayPathEventIds: [historyEntry.eventId],
          currentPathIndex: 0,
          navigationMode: 'follow',
          bookmarkPathIndex: null,
          history: [historyEntry],
          currentLeadSource: 'backend-node-1',
          currentLeadSourceEventId: historyEntry.eventId,
          branchRootNodeId: 'backend-node-1',
          currentSessionId: 'backend-session-1',
          visitedBlocks: ['backend-node-1'],
          frontier: [],
          exhaustedSources: [],
        },
      },
      pendingAssociatedReviewCardIds: [],
      seenAssociatedReviewCardIds: [],
    });

    const navState = queue.getNavigationState();
    expect(navState.engineMode).toBe('hyperspace');
    expect(navState.currentNodeId).toBe('backend-node-1');
    expect(navState.currentEventId).toBe(historyEntry.eventId);
    expect(queue.getHistoryPage({ offset: 0, limit: 10 }).entries).toEqual([
      expect.objectContaining({
        eventId: historyEntry.eventId,
        nodeId: 'backend-node-1',
      }),
    ]);
    expect(queue.getActivationTrace(historyEntry.eventId)).toEqual(expect.objectContaining({
      targetEventId: historyEntry.eventId,
      targetNodeId: 'backend-node-1',
    }));
  });

  it('does not revive cleared history from an older backend queue snapshot', async () => {
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
    const staleBackendState = queue.exportPersistedState();
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);

    queue.clearHistory('all');
    expect(queue.getHistorySnapshot()).toEqual([]);

    await queue.syncFromBackendState(staleBackendState);

    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(queue.getNavigationState().currentNodeId).toBeNull();
  });

  it('reuses a cached counter snapshot during review instead of force-refreshing cards', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();

    const snapshot: QueueCounterSnapshot = {
      version: 8,
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

  it('migrates v4 state to v8 by splitting seedPool and anchorPool', async () => {
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
    expect(saved?.version).toBe(8);
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
    expect(saved?.version).toBe(8);
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
      persistence
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

  it('injects excerpt topics into the current hyperspace session without building stations', async () => {
    const { persistence, store } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a'), topicCard('excerpt-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);
    await queue.setEngineMode('hyperspace', { carryCurrentNode: false });
    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const current = queue.getNavigationState();
    const injected = await queue.injectExcerptIntoHyperspace('excerpt-1', {
      currentNodeId: current.currentNodeId,
      currentEventId: current.currentEventId,
    });

    expect(injected).toBe(true);
    expect(queue.getNavigationState().currentNodeId).toBe('concept-a');
    expect(queue.getSourceSnapshot().map((entry) => entry.nodeId)).toEqual(expect.arrayContaining(['concept-a', 'excerpt-1']));
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);

    const next = await queue.getNextCard();
    expect(next?.blockId).toBe('excerpt-1');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a', 'excerpt-1']);

    const saved = store.get('neuralRoamQueue') as { hyperspace?: { sourcePool?: Array<{ nodeId: string }> } } | undefined;
    expect(saved?.hyperspace?.sourcePool?.map((entry) => entry.nodeId)).toEqual(expect.arrayContaining(['excerpt-1']));
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
      persistence
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

  it('clears all history from both orbit and hyperspace engines', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-orbit'), conceptCard('concept-hyperspace')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-orbit', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-orbit']);

    await queue.setEngineMode('hyperspace', { carryCurrentNode: false });
    await queue.setCurrentFocus('concept-hyperspace', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-hyperspace']);

    queue.clearHistory('all');

    expect(queue.getHistorySnapshot()).toEqual([]);
    await queue.setEngineMode('orbit', { carryCurrentNode: false });
    expect(queue.getHistorySnapshot()).toEqual([]);
  });

  it('records only new history after clearing all history and continuing roam', async () => {
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
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['concept-a']);

    queue.clearHistory('all');
    expect(queue.getHistorySnapshot()).toEqual([]);

    const conceptQueue = (queue as any).conceptQueue;
    conceptQueue.queryEngine.fetchNeighbors = vi.fn(async () => [
      { id: 'neighbor-1', type: 'backlink', weight: 1 },
    ]);

    const next = await queue.getNextCard();

    expect(next?.blockId).toBe('neighbor-1');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['neighbor-1']);
    expect(queue.getHistorySnapshot().some((entry) => entry.nodeId === 'concept-a')).toBe(false);
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

  it('keeps syntax-like neural roam main-path nodes as virtual topic cards', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const queue = new NeuralRoamQueue(
      manager.manager,
      persistence
    );

    await queue.load();
    mockNeuralEngine(queue);

    const card = await queue.getPathItemByNodeId('virtual-1');

    expect(card).not.toBeNull();
    expect(card?.id).toBe('virtual-1');
    expect(card?.type).toBe('topic');
    expect(card?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        isFlashcard: false,
        nodeRole: 'virtual',
      }),
    }));
  });

  it('keeps exact local review cards virtual on the main path and emits them as associated review cards next', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [descriptorCard('descriptor-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);
    const conceptQueue = (queue as any).conceptQueue;
    conceptQueue.getNextCard = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'descriptor-1',
        blockId: 'descriptor-1',
        deckId: 'neural-roam',
        blockData: {
          id: 'descriptor-1',
          content: 'descriptor-1 content',
          type: 'p',
          root_id: 'doc-1',
        },
        associationType: 'backlink',
        reason: '反向链接',
      })
      .mockResolvedValueOnce(null);
    const queryEngine = (queue as any).queryEngine;
    queryEngine.fetchSubtreeBlockIds = vi.fn(async () => ['descriptor-1']);

    const virtualCard = await queue.getNextCard();
    const associatedCard = await queue.getNextCard();

    expect(virtualCard).not.toBeNull();
    expect(virtualCard?.id).toBe('descriptor-1');
    expect(virtualCard?.type).toBe('topic');
    expect(virtualCard?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        isFlashcard: false,
        nodeRole: 'virtual',
      }),
    }));

    expect(associatedCard).not.toBeNull();
    expect(associatedCard?.id).toBe('card-descriptor-1');
    expect(associatedCard?.type).toBe('descriptor');
    expect(associatedCard?.meta).toEqual(expect.objectContaining({
      cardTypeMarker: 'descriptor',
      neuralContext: expect.objectContaining({
        isFlashcard: true,
        nodeRole: 'associated-review',
        sourceVirtualNodeId: 'descriptor-1',
        sourceVirtualReason: '反向链接',
      }),
    }));

    await queue.save();
    const persisted = persistence.get<any>('neuralRoamQueue');
    expect(persisted?.version).toBe(8);
    expect(persisted?.seenAssociatedReviewCardIds).toContain('card-descriptor-1');
  });

  it('records associated review cards in neural history when they are surfaced from the pending buffer', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-a'), descriptorCard('descriptor-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);
    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const focusEventId = queue.getNavigationState().currentEventId;
    const conceptQueue = (queue as any).conceptQueue;
    await conceptQueue.activateNode('descriptor-1', {
      associationType: 'backlink',
      reason: '反向链接',
      focusId: 'concept-a',
      isVirtual: true,
      activationKind: 'graph-edge',
      sourceNodeId: 'concept-a',
      sourceEventId: focusEventId,
      branchRootNodeId: 'concept-a',
    });

    const queryEngine = (queue as any).queryEngine;
    queryEngine.fetchSubtreeBlockIds = vi.fn(async () => ['descriptor-1']);
    await (queue as any).enqueueAssociatedReviewCards('descriptor-1', '反向链接');
    const associatedCard = await queue.getNextCard();

    expect(associatedCard?.id).toBe('card-descriptor-1');
    expect(associatedCard?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        isFlashcard: true,
        nodeRole: 'associated-review',
        sourceVirtualNodeId: 'descriptor-1',
      }),
    }));

    const descriptorHistory = queue.getHistoryEntriesByNodeId('descriptor-1');
    expect(descriptorHistory).toHaveLength(2);
    expect(descriptorHistory[1]).toEqual(expect.objectContaining({
      nodeId: 'descriptor-1',
      associationType: 'associated-review',
      activationKind: 'follow-path',
      origin: 'follow-path',
      sourceNodeId: 'descriptor-1',
      sourceEventId: descriptorHistory[0].eventId,
    }));
    expect(queue.getHistoryHitCount('descriptor-1')).toBe(2);
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual([
      'concept-a',
      'descriptor-1',
      'descriptor-1',
    ]);
  });

  it.each([
    { label: 'list item', blockId: 'native-list-1', blockType: 'i' as const },
    { label: 'heading', blockId: 'native-heading-1', blockType: 'h' as const },
  ])('keeps native riff-sync $label blocks as topic-only neural roam nodes', async ({ blockId, blockType }) => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [nativeRiffSyncCard(blockId, blockType)],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);
    const conceptQueue = (queue as any).conceptQueue;
    conceptQueue.getNextCard = vi
      .fn()
      .mockResolvedValueOnce({
        id: blockId,
        blockId,
        deckId: 'neural-roam',
        blockData: {
          id: blockId,
          content: `${blockId} content`,
          type: blockType,
          root_id: 'doc-1',
        },
        associationType: 'backlink',
        reason: '反向链接',
      })
      .mockResolvedValueOnce(null);
    const queryEngine = (queue as any).queryEngine;
    queryEngine.fetchSubtreeBlockIds = vi.fn(async () => [blockId]);

    const virtualCard = await queue.getNextCard();
    const associatedCard = await queue.getNextCard();

    expect(virtualCard).not.toBeNull();
    expect(virtualCard?.id).toBe(blockId);
    expect(virtualCard?.type).toBe('topic');
    expect(virtualCard?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        isFlashcard: false,
        nodeRole: 'virtual',
        blockType,
      }),
    }));
    expect(associatedCard).toBeNull();
  });

  it('deduplicates associated review cards across multiple virtual nodes within one session', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [descriptorCard('descriptor-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);
    const conceptQueue = (queue as any).conceptQueue;
    conceptQueue.getNextCard = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'virtual-1',
        blockId: 'virtual-1',
        deckId: 'neural-roam',
        blockData: { id: 'virtual-1', content: 'virtual-1 content', type: 'p', root_id: 'doc-1' },
        associationType: 'backlink',
        reason: '反向链接',
      })
      .mockResolvedValueOnce({
        id: 'virtual-2',
        blockId: 'virtual-2',
        deckId: 'neural-roam',
        blockData: { id: 'virtual-2', content: 'virtual-2 content', type: 'p', root_id: 'doc-1' },
        associationType: 'outgoing-direct',
        reason: '直接引用',
      })
      .mockResolvedValueOnce(null);
    const queryEngine = (queue as any).queryEngine;
    queryEngine.fetchSubtreeBlockIds = vi.fn(async (blockId: string) => {
      if (blockId === 'virtual-1') return ['virtual-1', 'descriptor-1'];
      if (blockId === 'virtual-2') return ['virtual-2', 'descriptor-1'];
      return [blockId];
    });

    const sequence = [
      await queue.getNextCard(),
      await queue.getNextCard(),
      await queue.getNextCard(),
      await queue.getNextCard(),
    ].map((card) => card?.id ?? null);

    expect(sequence).toEqual([
      'virtual-1',
      'card-descriptor-1',
      'virtual-2',
      null,
    ]);
  });

  it('surfaces one due-first same-block sibling above graph neighbors while keeping block/card identity split', async () => {
    const now = Date.now();
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-a'),
        itemCardWithId('entry-card', 'shared-block', now - 60_000),
        itemCardWithId('future-sibling', 'shared-block', now + 86_400_000),
        itemCardWithId('due-sibling', 'shared-block', now - 10_000),
        itemCardWithId('next-graph-card', 'next-graph-block', now - 10_000),
      ],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);
    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const conceptQueue = (queue as any).conceptQueue;
    conceptQueue.getNextCard = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'shared-block',
        blockId: 'shared-block',
        deckId: 'neural-roam',
        blockData: {
          id: 'shared-block',
          content: 'shared-block content',
          type: 'p',
          root_id: 'doc-1',
        },
        associationType: 'backlink',
        reason: '反向链接',
      })
      .mockResolvedValueOnce({
        id: 'next-graph-block',
        blockId: 'next-graph-block',
        deckId: 'neural-roam',
        blockData: {
          id: 'next-graph-block',
          content: 'next-graph-block content',
          type: 'p',
          root_id: 'doc-1',
        },
        associationType: 'outgoing-direct',
        reason: '直接引用',
      });
    const queryEngine = (queue as any).queryEngine;
    queryEngine.fetchSubtreeBlockIds = vi.fn(async (blockId: string) => [blockId]);

    await queue.handleReview('entry-card', 3);
    const virtualSharedBlock = await queue.getNextCard();
    const sameBlockSibling = await queue.getNextCard();
    const graphNeighbor = await queue.getNextCard();

    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['shared-block'] });
    expect(virtualSharedBlock?.id).toBe('shared-block');
    expect(sameBlockSibling?.id).toBe('due-sibling');
    expect(sameBlockSibling?.blockId).toBe('shared-block');
    expect(sameBlockSibling?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        associationType: 'same-block-card',
        isFlashcard: true,
        nodeRole: 'associated-review',
        sourceVirtualNodeId: 'shared-block',
      }),
    }));
    expect(graphNeighbor?.id).toBe('next-graph-block');

    const sharedBlockHistory = queue.getHistoryEntriesByNodeId('shared-block');
    expect(sharedBlockHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'shared-block',
        cardId: 'due-sibling',
        associationType: 'same-block-card',
        reason: '同块卡片',
      }),
    ]));
    expect(queue.getActivationTrace(sharedBlockHistory.at(-1)!.eventId)?.steps.at(-1)).toEqual(expect.objectContaining({
      nodeId: 'shared-block',
      cardId: 'due-sibling',
      associationType: 'same-block-card',
      reason: '同块卡片',
    }));
  });

  it('keeps local topic blocks on the main path as virtual practice nodes without formal SRS writeback', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [topicCard('topic-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    const card = await queue.getPathItemByNodeId('topic-1');

    expect(card).not.toBeNull();
    expect(card?.id).toBe('topic-1');
    expect(card?.type).toBe('topic');
    expect(card?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        isFlashcard: false,
        nodeRole: 'virtual',
        blockType: 'p',
      }),
    }));

    const result = await queue.handleReview('topic-1', 3);
    expect(manager.route).not.toHaveBeenCalled();
    expect(manager.onCardUpdatedFromScheduler).not.toHaveBeenCalled();
    expect(result.updatedCard).toBeNull();
    expect(result.removedFromQueue).toBe(false);
    expect(result.remainsInQueue).toBe(true);
  });

  it('keeps local concept blocks on the main path as virtual topic practice nodes without formal SRS writeback', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [conceptCard('concept-1')],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    const card = await queue.getPathItemByNodeId('concept-1');

    expect(card).not.toBeNull();
    expect(card?.id).toBe('concept-1');
    expect(card?.type).toBe('topic');
    expect(card?.cardTypeMarker).toBeUndefined();
    expect(card?.meta).toEqual(expect.objectContaining({
      neuralContext: expect.objectContaining({
        isFlashcard: false,
        nodeRole: 'virtual',
        blockType: 'p',
      }),
    }));

    const result = await queue.handleReview('concept-1', 3);
    expect(manager.commitReview).not.toHaveBeenCalled();
    expect(manager.route).not.toHaveBeenCalled();
    expect(manager.onCardUpdatedFromScheduler).not.toHaveBeenCalled();
    expect(result.updatedCard).toBeNull();
    expect(result.removedFromQueue).toBe(false);
    expect(result.remainsInQueue).toBe(true);
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
    expect(manager.commitReview).toHaveBeenCalledTimes(1);
    expect(manager.onCardUpdatedFromScheduler).not.toHaveBeenCalled();
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

  it('writes orbit seeds and stations to the active route after an external route switch without leaking old route assets', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-default'),
        conceptCard('concept-second'),
      ],
    });
    const { catalog, repository } = createRouteCatalog();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      routeCatalog: catalog,
    });

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setSeedEntry('concept-default', true);
    await queue.setAnchorEntry('station-default', true);
    await queue.setCurrentFocus('concept-default', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    const secondRoute = await catalog.createRoute({ name: '天体物理' });

    expect(await queue.getNextCard()).toBeNull();

    await queue.setSeedEntry('concept-second', true);
    await queue.setAnchorEntry('station-second', true);
    await queue.setCurrentFocus('concept-second', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const state = await repository.loadState();
    const defaultRoute = state?.routes.find((route) => route.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID);
    const activeRoute = state?.routes.find((route) => route.metadata.id === secondRoute.metadata.id);
    const defaultAnchors = defaultRoute?.anchorPool.map((entry) => entry.nodeId) ?? [];
    const activeAnchors = activeRoute?.anchorPool.map((entry) => entry.nodeId) ?? [];

    expect(defaultRoute?.seedPool.map((entry) => entry.nodeId)).toEqual(['concept-default']);
    expect(defaultAnchors).toContain('station-default');
    expect(defaultAnchors).not.toContain('station-second');
    expect(defaultRoute?.sessions.orbit?.currentFocus).toBe('concept-default');
    expect(activeRoute?.seedPool.map((entry) => entry.nodeId)).toEqual(['concept-second']);
    expect(activeAnchors).toContain('station-second');
    expect(activeAnchors).not.toContain('station-default');
    expect(activeRoute?.sessions.orbit?.currentFocus).toBe('concept-second');
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toEqual(['concept-second']);
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toEqual(expect.arrayContaining(['station-second']));
    expect(await queue.getSize()).toBe(1);
  });

  it('switchRoute applies the selected route and clears route-local pending review state', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-default'),
        conceptCard('concept-second'),
      ],
    });
    const { catalog, repository } = createRouteCatalog();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      routeCatalog: catalog,
    });

    await queue.load();
    mockNeuralEngine(queue);
    await queue.setSeedEntry('concept-default', true);
    await queue.setCurrentFocus('concept-default', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    const secondRoute = await catalog.createRoute({ name: '第二航线' });
    await queue.setSeedEntry('concept-second', true);
    await queue.setCurrentFocus('concept-second', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    await queue.switchRoute(DEFAULT_NEURAL_ROAM_ROUTE_ID);

    const state = await repository.loadState();
    expect(state?.activeRouteId).toBe(DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toEqual(['concept-default']);
    expect(queue.getNavigationState().currentNodeId).toBe('concept-default');
    expect(state?.routes.find((route) => route.metadata.id === secondRoute.metadata.id)?.seedPool.map((entry) => entry.nodeId))
      .toEqual(['concept-second']);
  });

  it('keeps Hyperspace on the active route shared pool while preserving private Orbit session state', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-default'),
        conceptCard('concept-second'),
      ],
    });
    const { catalog, repository } = createRouteCatalog();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      routeCatalog: catalog,
    });

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setSeedEntry('concept-default', true);
    await queue.setAnchorEntry('station-default', true);
    await queue.setCurrentFocus('concept-default', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const secondRoute = await catalog.createRoute({ name: '第二航线' });
    await queue.setSeedEntry('concept-second', true);
    await queue.setAnchorEntry('station-second', true);
    await queue.setCurrentFocus('concept-second', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    await queue.setEngineMode('hyperspace', { carryCurrentNode: false });
    await queue.setCurrentFocus('concept-second', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    let state = await repository.loadState();
    expect(state?.activeRouteId).toBe(secondRoute.metadata.id);
    expect(state?.engineMode).toBe('hyperspace');
    const activeRoute = state?.routes.find((route) => route.metadata.id === secondRoute.metadata.id);
    expect(queue.getSourceSnapshot().map((entry) => entry.nodeId)).toEqual(['concept-second']);
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toEqual(expect.arrayContaining([
      'concept-second',
      'station-second',
    ]));
    expect(activeRoute?.seedPool.map((entry) => entry.nodeId)).toEqual(['concept-second']);
    expect(activeRoute?.anchorPool.map((entry) => entry.nodeId)).toEqual(expect.arrayContaining([
      'concept-second',
      'station-second',
    ]));
    expect(activeRoute?.sessions.orbit?.currentFocus).toBe('concept-second');
    expect(activeRoute?.sessions.hyperspace?.currentLeadSource).toBe('concept-second');
    expect(activeRoute?.sessions.hyperspace?.history.map((entry) => entry.nodeId)).toEqual(['concept-second']);

    await queue.setEngineMode('orbit', { carryCurrentNode: false });
    state = await repository.loadState();
    expect(state?.activeRouteId).toBe(secondRoute.metadata.id);
    expect(queue.getNavigationState().currentNodeId).toBe('concept-second');
    expect(state?.routes.find((route) => route.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID)?.seedPool.map((entry) => entry.nodeId))
      .toEqual(['concept-default']);
    expect(state?.routes.find((route) => route.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID)?.sessions.orbit?.currentFocus)
      .toBe('concept-default');
  });

  it('persists chronological route history events from Orbit and Hyperspace without using engine history as the route log', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-a'),
        conceptCard('concept-b'),
      ],
    });
    const { catalog, repository } = createRouteCatalog();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      routeCatalog: catalog,
    });

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setCurrentFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.setEngineMode('hyperspace', { carryCurrentNode: false });
    await queue.setCurrentFocus('concept-b', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.setCurrentFocus('concept-b', {
      includeFocusAsFirst: true,
      resetHistory: false,
    });

    let state = await repository.loadState();
    const route = state?.routes.find((entry) => entry.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(route?.history.map((entry) => [entry.engineMode, entry.nodeId])).toEqual([
      ['orbit', 'concept-a'],
      ['hyperspace', 'concept-b'],
      ['hyperspace', 'concept-b'],
    ]);
    expect(new Set(route?.history.map((entry) => entry.eventId))).toHaveProperty('size', 3);

    queue.clearHistory('all');

    state = await repository.loadState();
    const routeAfterEngineClear = state?.routes.find((entry) => entry.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(queue.getHistorySnapshot()).toEqual([]);
    expect(routeAfterEngineClear?.history.map((entry) => [entry.engineMode, entry.nodeId])).toEqual([
      ['orbit', 'concept-a'],
      ['hyperspace', 'concept-b'],
      ['hyperspace', 'concept-b'],
    ]);
  });

  it('handles temporary route lifecycle by clean discard, dirty prompt requirement, save-in-place, and clean replacement', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-temp'),
        conceptCard('concept-replacement'),
        conceptCard('concept-extra'),
      ],
    });
    const { catalog, repository } = createRouteCatalog();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      routeCatalog: catalog,
    });

    await queue.load();
    mockNeuralEngine(queue);

    const cleanRoute = await queue.createTemporaryRoute({
      name: '临时：干净',
      seedBlockId: 'concept-temp',
      previousRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    });
    await queue.setCurrentFocus('concept-temp', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    expect(await queue.resolveTemporaryRouteCloseAction()).toMatchObject({
      kind: 'discard-clean',
      routeId: cleanRoute.metadata.id,
      previousRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    });

    await queue.closeTemporaryRoute({ action: 'discard' });
    let state = await repository.loadState();
    expect(state?.activeRouteId).toBe(DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(state?.routes.some((route) => route.metadata.id === cleanRoute.metadata.id)).toBe(false);

    const dirtyRoute = await queue.createTemporaryRoute({
      name: '临时：脏',
      seedBlockId: 'concept-temp',
      previousRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    });
    await queue.setCurrentFocus('concept-temp', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.setSeedEntry('concept-extra', true);

    expect(await queue.resolveTemporaryRouteCloseAction()).toMatchObject({
      kind: 'prompt',
      routeId: dirtyRoute.metadata.id,
      previousRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    });

    const saved = await queue.closeTemporaryRoute({ action: 'save', name: '保存航线' });
    state = await repository.loadState();
    const savedRoute = state?.routes.find((route) => route.metadata.id === dirtyRoute.metadata.id);
    expect(saved?.metadata).toMatchObject({
      id: dirtyRoute.metadata.id,
      name: '保存航线',
      temporary: false,
      previousRouteId: null,
    });
    expect(state?.activeRouteId).toBe(dirtyRoute.metadata.id);
    expect(savedRoute?.seedPool.map((entry) => entry.nodeId)).toEqual(expect.arrayContaining([
      'concept-temp',
      'concept-extra',
    ]));
    expect(savedRoute?.history.map((event) => event.nodeId)).toEqual(['concept-temp']);

    const oldCleanRoute = await queue.createTemporaryRoute({
      name: '临时：替换前',
      seedBlockId: 'concept-temp',
      previousRouteId: dirtyRoute.metadata.id,
    });
    const replaced = await queue.replaceActiveTemporaryRoute({
      name: '临时：替换后',
      seedBlockId: 'concept-replacement',
    });
    state = await repository.loadState();
    expect(state?.routes.some((route) => route.metadata.id === oldCleanRoute.metadata.id)).toBe(false);
    expect(state?.activeRouteId).toBe(replaced.metadata.id);
    expect(replaced.metadata.previousRouteId).toBe(dirtyRoute.metadata.id);
    expect(replaced.metadata.initialSeedNodeIds).toEqual(['concept-replacement']);
  });

  it('requires caller choice before replacing a dirty active temporary route', async () => {
    const { persistence } = createPersistence(undefined);
    const manager = createManager({
      cards: [
        conceptCard('concept-temp'),
        conceptCard('concept-replacement'),
        conceptCard('concept-extra'),
      ],
    });
    const { catalog, repository } = createRouteCatalog();
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      routeCatalog: catalog,
    });

    await queue.load();
    mockNeuralEngine(queue);

    const dirtyRoute = await queue.createTemporaryRoute({
      name: '临时：脏',
      seedBlockId: 'concept-temp',
      previousRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
    });
    await queue.setSeedEntry('concept-extra', true);

    await expect(queue.replaceActiveTemporaryRoute({
      name: '临时：替换后',
      seedBlockId: 'concept-replacement',
    })).rejects.toMatchObject({
      code: 'temporary-route-dirty',
    });

    const state = await repository.loadState();
    expect(state?.activeRouteId).toBe(dirtyRoute.metadata.id);
    expect(state?.routes.some((route) => route.metadata.name === '临时：替换后')).toBe(false);
  });

  it('enforces the configured history limit on the active route log when saving route snapshots', async () => {
    const orbitHistory = Array.from({ length: 205 }, (_, index) => createHistoryEntry(index, {
      engineMode: 'orbit',
      nodeId: `orbit-node-${index}`,
      sessionId: 'orbit-session-1',
    }));
    const hyperspaceHistory = Array.from({ length: 205 }, (_, index) => createHistoryEntry(index + 300, {
      engineMode: 'hyperspace',
      nodeId: `hyperspace-node-${index}`,
      sessionId: 'hyperspace-session-1',
    }));
    const { persistence } = createPersistence(undefined);
    const manager = createManager();
    const { catalog, repository } = createRouteCatalog({
      activeRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      engineMode: 'orbit',
      routes: [{
        metadata: {
          id: DEFAULT_NEURAL_ROAM_ROUTE_ID,
          name: '默认航线',
          temporary: false,
          previousRouteId: null,
          initialSeedNodeIds: [],
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: 1,
        },
        seedPool: [],
        anchorPool: [],
        sessions: {
          orbit: {
            displayPath: [],
            displayPathEventIds: [],
            currentPathIndex: -1,
            navigationMode: 'explore',
            bookmarkPathIndex: null,
            history: orbitHistory,
            currentFocus: null,
            currentFocusEventId: null,
            branchRootNodeId: null,
            currentSessionId: 'orbit-session-1',
            visitedBlocks: orbitHistory.map((entry) => entry.nodeId),
            exhaustedFocuses: [],
            currentRoundStartedAt: null,
          },
          hyperspace: {
            displayPath: [],
            displayPathEventIds: [],
            currentPathIndex: -1,
            navigationMode: 'explore',
            bookmarkPathIndex: null,
            history: hyperspaceHistory,
            currentLeadSource: null,
            currentLeadSourceEventId: null,
            branchRootNodeId: null,
            currentSessionId: 'hyperspace-session-1',
            visitedBlocks: hyperspaceHistory.map((entry) => entry.nodeId),
            frontier: [],
            exhaustedSources: [],
          },
        },
        history: [],
      }],
    });
    const queue = new NeuralRoamQueue(manager.manager, persistence, {
      getHistoryLimit: () => 200,
      routeCatalog: catalog,
    });

    await queue.load();
    await queue.save();

    const state = await repository.loadState();
    const routeHistory = state?.routes[0].history ?? [];
    expect(routeHistory).toHaveLength(200);
    expect(routeHistory[0].nodeId).toBe('hyperspace-node-5');
    expect(routeHistory.at(-1)?.nodeId).toBe('hyperspace-node-204');
  });
});
