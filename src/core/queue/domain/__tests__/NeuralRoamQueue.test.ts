import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamQueue } from '../NeuralRoamQueue';
import type { QueuePersistencePort } from '../ports';
import type { QueueCounterSnapshot } from '@/types/unified-data-source';

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
  blockId: string;
  type: 'concept' | 'item' | 'topic';
  cardTypeMarker?: 'concept' | 'descriptor';
  meta?: { cardTypeMarker?: 'concept' | 'descriptor' };
};

function createManager(options: {
  cards?: LocalCardSeed[];
  throwOnLookup?: boolean;
} = {}) {
  const cardByBlockId = new Map<string, LocalCardSeed>();
  for (const card of options.cards ?? []) {
    cardByBlockId.set(card.blockId, card);
  }

  const getCards = vi.fn(async (filter?: { blockIds?: string[] }) => {
    if (options.throwOnLookup) {
      throw new Error('local card lookup failed');
    }
    const blockIds = Array.isArray(filter?.blockIds) ? filter?.blockIds : [];
    if (blockIds.length === 0) {
      return Array.from(cardByBlockId.values()) as any[];
    }
    return blockIds
      .map((blockId) => cardByBlockId.get(blockId))
      .filter((card): card is LocalCardSeed => Boolean(card)) as any[];
  });

  return {
    manager: {
      getCards,
    } as never,
    getCards,
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
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['virtual-1', 'virtual-2']);

    queue.clearHistory('current');
    expect(queue.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['virtual-1']);

    queue.clearHistory('all');
    expect(queue.getHistorySnapshot()).toEqual([]);
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
});
