import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConceptNeuralQueue } from '../ConceptNeuralQueue';

describe('ConceptNeuralQueue', () => {
  let queue: ConceptNeuralQueue;
  let mockQueryEngine: any;

  beforeEach(() => {
    queue = new ConceptNeuralQueue();
    mockQueryEngine = (queue as any).queryEngine;
  });

  it('adds concept blocks via focus-first API', async () => {
    mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
    mockQueryEngine.fetchBlockData = vi.fn().mockResolvedValue({
      id: 'concept-1',
      content: 'Concept 1 content',
      type: 'p',
    });

    await queue.addConceptBlock('concept-1');

    expect(queue.getConceptBlocks()).toEqual(['concept-1']);
  });

  it('rejects non-concept blocks from persistent concept pool', async () => {
    mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(false);

    await expect(queue.addConceptBlock('virtual-1')).rejects.toThrow();
    expect(queue.getConceptBlocks()).toEqual([]);
  });

  it('supports roaming from virtual focus and continues spreading activation', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));
    mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([
      { id: 'virtual-neighbor-1', type: 'backlink', weight: 10 },
    ]);

    await queue.startRoamingFromFocus('virtual-focus-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const firstHistory = queue.getHistorySnapshot();
    expect(firstHistory).toHaveLength(1);
    expect(firstHistory[0]).toMatchObject({
      nodeId: 'virtual-focus-1',
      focusId: 'virtual-focus-1',
      associationType: 'focus',
      isVirtual: true,
    });
    expect(queue.getConceptBlocks()).not.toContain('virtual-focus-1');

    const nextCard = await queue.getNextCard();
    expect(nextCard?.blockId).toBe('virtual-neighbor-1');
    expect(nextCard?.associationType).toBe('backlink');

    const history = queue.getHistorySnapshot();
    expect(history).toHaveLength(2);
    expect(history[1].nodeId).toBe('virtual-neighbor-1');
  });

  it('enforces sessionId boundary after clearing current session history', async () => {
    mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    await queue.startRoamingFromFocus('concept-a', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const firstSessionId = queue.getNavigationState().sessionId;
    expect(firstSessionId).toBeTruthy();
    expect(queue.getHistorySnapshot()).toHaveLength(1);

    queue.clearHistory('current');
    expect(queue.getHistorySnapshot()).toHaveLength(0);

    await queue.startRoamingFromFocus('concept-b', {
      includeFocusAsFirst: true,
    });

    const secondSessionId = queue.getNavigationState().sessionId;
    expect(secondSessionId).toBeTruthy();
    expect(secondSessionId).not.toBe(firstSessionId);

    const history = queue.getHistorySnapshot();
    expect(history).toHaveLength(1);
    expect(history[0].sessionId).toBe(secondSessionId);
    expect(history[0].nodeId).toBe('concept-b');
  });

  it('builds session focus stack from focus nodes instead of full roam nodes', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));
    mockQueryEngine.fetchNeighbors = vi.fn(async (focusId: string) => {
      if (focusId === 'concept-1') {
        return [{ id: 'neighbor-1', type: 'backlink', weight: 10 }];
      }
      return [];
    });

    await queue.addConceptBlock('concept-1');
    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    await queue.getNextCard();

    const focusStack = queue.getSessionFocusStack();
    expect(focusStack.map((entry) => entry.nodeId)).toEqual(['concept-1']);
    expect(focusStack[0]).toMatchObject({
      associationType: 'focus',
      focusId: 'concept-1',
    });
  });

  it('serves jumped history node as the first follow card once', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    let neighborCall = 0;
    mockQueryEngine.fetchNeighbors = vi.fn(async () => {
      neighborCall += 1;
      if (neighborCall === 1) {
        return [{ id: 'neighbor-1', type: 'backlink', weight: 10 }];
      }
      return [{ id: 'neighbor-2', type: 'outgoing-direct', weight: 10 }];
    });

    await queue.addConceptBlock('concept-1');
    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    await queue.getNextCard(); // neighbor-1
    await queue.getNextCard(); // neighbor-2

    const jumped = await queue.jumpToHistoryNode('neighbor-1');
    expect(jumped).toBe(true);
    expect(queue.getNavigationState().navigationMode).toBe('follow');

    const firstFollow = await queue.getNextCard();
    expect(firstFollow?.blockId).toBe('neighbor-1');

    const secondFollow = await queue.getNextCard();
    expect(secondFollow?.blockId).toBe('neighbor-2');
  });
});
