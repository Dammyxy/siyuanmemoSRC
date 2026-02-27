import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamQueue } from '../NeuralRoamQueue';
import type { QueuePersistencePort } from '../ports';

function createPersistence(initial: unknown): QueuePersistencePort {
  const store = new Map<string, unknown>();
  if (initial !== undefined) {
    store.set('neuralRoamQueue', initial);
  }
  return {
    get<T>(key: string): T | null {
      return (store.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
  };
}

describe('NeuralRoamQueue', () => {
  it('loads legacy seeds-only state', async () => {
    const manager = {};
    const queue = new NeuralRoamQueue(
      manager as never,
      createPersistence({
        seeds: ['seed-a', 'seed-b'],
        currentSeed: null,
      })
    );

    await queue.load();
    expect(queue.getSeedBlocks()).toEqual(['seed-a', 'seed-b']);
  });

  it('returns session-visible cards snapshot via getCards()', async () => {
    const manager = {};
    const queue = new NeuralRoamQueue(
      manager as never,
      createPersistence(undefined),
      {
        cardTypeResolver: {
          resolveCardType: vi.fn(async () => 'item'),
        },
      }
    );

    (queue as any).conceptQueue = {
      getSessionVisibleNodeIds: vi.fn(() => ['node-1']),
      getPathItemByNodeId: vi.fn(async () => ({
        id: 'node-1',
        blockId: 'node-1',
        blockData: {
          id: 'node-1',
          content: 'Node 1 content',
          type: 'p',
        },
        associationType: 'seed',
        reason: '种子节点',
      })),
      getSeeds: vi.fn(() => []),
      exportSessionState: vi.fn(() => ({
        displayPath: ['node-1'],
        currentPathIndex: 0,
        navigationMode: 'explore',
        bookmarkPathIndex: null,
        history: [],
        currentSeed: null,
        visitedBlocks: ['node-1'],
        exhaustedSeeds: [],
      })),
      restoreSeeds: vi.fn(),
      restoreSessionState: vi.fn(),
      clearHistory: vi.fn(),
      startRoamingFromSeed: vi.fn(),
      getHistorySnapshot: vi.fn(() => []),
      getNavigationState: vi.fn(() => ({
        currentPathIndex: 0,
        currentNodeId: 'node-1',
        navigationMode: 'explore',
        hasBookmark: false,
        pathLength: 1,
      })),
      setNavigationMode: vi.fn(),
      returnToBookmark: vi.fn(() => false),
      addSeed: vi.fn(),
      removeSeed: vi.fn(),
      getNextCard: vi.fn(),
      size: vi.fn(() => 0),
    };

    const cards = await queue.getCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('node-1');
    expect(cards[0].type).toBe('item');
    expect((cards[0].meta as Record<string, unknown>)?.neuralContext).toBeTruthy();
  });
});

