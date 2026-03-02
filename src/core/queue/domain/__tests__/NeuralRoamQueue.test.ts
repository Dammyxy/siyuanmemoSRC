import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamQueue } from '../NeuralRoamQueue';
import type { QueuePersistencePort } from '../ports';

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

function mockNeuralEngine(queue: NeuralRoamQueue): void {
  const conceptQueue = (queue as any).conceptQueue;
  const mockQueryEngine = conceptQueue.queryEngine;

  mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
  mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
    id: blockId,
    content: `${blockId} content`,
    type: 'p',
    root_id: 'doc-1',
  }));
  mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([]);
}

describe('NeuralRoamQueue', () => {
  it('migrates v4 state to v5 by splitting seedPool and anchorPool', async () => {
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

    const queue = new NeuralRoamQueue({} as never, persistence);
    await queue.load();

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-a');
    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).not.toContain('virtual-1');
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('virtual-1');

    const saved = store.get('neuralRoamQueue') as any;
    expect(saved?.version).toBe(5);
    expect(Array.isArray(saved?.seedPool)).toBe(true);
    expect(Array.isArray(saved?.anchorPool)).toBe(true);
    expect(saved?.seedPool.map((entry: { nodeId: string }) => entry.nodeId)).toContain('concept-a');
    expect(saved?.anchorPool.map((entry: { nodeId: string }) => entry.nodeId)).toContain('virtual-1');
  });

  it('clearAnchors (and clearFocusPool alias) does not clear roam history', async () => {
    const { persistence } = createPersistence(undefined);
    const queue = new NeuralRoamQueue(
      {} as never,
      persistence,
      {
        cardTypeResolver: {
          resolveCardType: vi.fn(async () => 'item'),
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
    const queue = new NeuralRoamQueue(
      {} as never,
      persistence,
      {
        cardTypeResolver: {
          resolveCardType: vi.fn(async () => 'item'),
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
    const queue = new NeuralRoamQueue({} as never, persistence);

    await queue.load();
    mockNeuralEngine(queue);

    await queue.setSeedEntry('concept-seed-1', true);
    await queue.setAnchorEntry('virtual-anchor-1', true);

    expect(queue.getSeedSnapshot().map((entry) => entry.nodeId)).toContain('concept-seed-1');
    expect(queue.getAnchorSnapshot().map((entry) => entry.nodeId)).toContain('virtual-anchor-1');
  });

  it('forwards bookmarkCurrentPath option in setCurrentFocus to enable returnToBookmark', async () => {
    const { persistence } = createPersistence(undefined);
    const queue = new NeuralRoamQueue({} as never, persistence);

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
});

