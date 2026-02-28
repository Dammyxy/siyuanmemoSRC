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

describe('NeuralRoamQueue', () => {
  it('silently resets legacy/v2 state to v3 schema', async () => {
    const { persistence, store } = createPersistence({
      version: 2,
      seeds: ['seed-a', 'seed-b'],
      currentSeed: 'seed-a',
    });

    const queue = new NeuralRoamQueue({} as never, persistence);
    await queue.load();

    expect(queue.getConceptBlocks()).toEqual([]);

    const saved = store.get('neuralRoamQueue') as any;
    expect(saved?.version).toBe(3);
    expect(saved?.conceptBlocks).toEqual([]);
    expect(saved?.session).toBeTruthy();
  });

  it('supports focus API and persistent pinned focus pool', async () => {
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

    await queue.addCard('concept-1');
    await queue.lockCurrentAsFocus('concept-1');

    const sessionFocusAfterLock = queue.getSessionFocusStack();
    expect(sessionFocusAfterLock.map((entry) => entry.nodeId)).toContain('concept-1');

    const pinned = queue.getPinnedFocusBlocks();
    expect(pinned.map((entry) => entry.nodeId)).toContain('concept-1');

    await queue.lockCurrentAsFocus('virtual-1');
    const sessionFocusWithVirtual = queue.getSessionFocusStack();
    expect(sessionFocusWithVirtual.map((entry) => entry.nodeId)).toContain('virtual-1');

    await queue.setPinnedFocusBlock('virtual-1', true);
    expect(queue.getPinnedFocusBlocks().map((entry) => entry.nodeId)).not.toContain('virtual-1');

    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const history = queue.getHistorySnapshot();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      nodeId: 'concept-1',
      focusId: 'concept-1',
      isVirtual: false,
    });

    const jumped = await queue.jumpToHistoryNode('concept-1');
    expect(jumped).toBe(true);
    expect(queue.getNavigationState().navigationMode).toBe('follow');

    queue.clearHistory('all');
    expect(queue.getHistorySnapshot()).toEqual([]);
  });
});
