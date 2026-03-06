import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConceptNeuralQueue } from '../ConceptNeuralQueue';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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

  it('persists virtual anchors and restores after reload', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    await queue.setAnchorEntry('virtual-1', true);
    await queue.setAnchorEntry('concept-1', true);

    const snapshot = queue.getAnchorSnapshot();
    expect(snapshot.map((entry) => entry.nodeId)).toEqual(expect.arrayContaining(['virtual-1', 'concept-1']));
    expect(snapshot.find((entry) => entry.nodeId === 'virtual-1')?.nodeKind).toBe('virtual');

    const restoredQueue = new ConceptNeuralQueue();
    (restoredQueue as any).queryEngine.isConceptCard = vi.fn().mockResolvedValue(false);
    (restoredQueue as any).queryEngine.fetchBlockData = vi.fn().mockResolvedValue(null);
    restoredQueue.restoreAnchorPoolState(queue.exportAnchorPoolState());
    restoredQueue.restoreSessionState(queue.exportSessionState());

    const restored = restoredQueue.getAnchorSnapshot();
    expect(restored.find((entry) => entry.nodeId === 'virtual-1')).toMatchObject({
      nodeId: 'virtual-1',
      nodeKind: 'virtual',
      isVirtual: true,
    });
  });

  it('applies concept-priority boost when selecting next focus', () => {
    const selectFocus = (queue as any).weightedRandomSelectFocus.bind(queue) as
      (focuses: Array<{
        id: string;
        blockId: string;
        nodeKind: 'concept' | 'virtual';
        priority: number;
        neighborsViewed: number;
        addedAt: number;
        preview: string;
      }>) => string;

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const selected = selectFocus([
      {
        id: 'concept-1',
        blockId: 'concept-1',
        nodeKind: 'concept',
        priority: 0.5,
        neighborsViewed: 0,
        addedAt: Date.now(),
        preview: 'concept-1',
      },
      {
        id: 'virtual-1',
        blockId: 'virtual-1',
        nodeKind: 'virtual',
        priority: 0.5,
        neighborsViewed: 0,
        addedAt: Date.now(),
        preview: 'virtual-1',
      },
    ]);
    randomSpy.mockRestore();

    expect(selected).toBe('concept-1');
  });

  it('setCurrentFocus updates focus context and appends focus node to history path', async () => {
    mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(false);
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    await queue.setCurrentFocus('virtual-focus-1', {
      includeFocusAsFirst: true,
      resetHistory: false,
    });

    const history = queue.getHistorySnapshot();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      nodeId: 'virtual-focus-1',
      focusId: 'virtual-focus-1',
      associationType: 'focus',
      isVirtual: true,
    });

    const navState = queue.getNavigationState();
    expect(navState.currentNodeId).toBe('virtual-focus-1');

    const anchors = queue.getAnchorSnapshot();
    expect(anchors.map((entry) => entry.nodeId)).toContain('virtual-focus-1');
  });

  it('restores previous path position by bookmark after branching from setCurrentFocus', async () => {
    mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(false);
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    await queue.startRoamingFromFocus('root-focus', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    await queue.setCurrentFocus('branch-focus', {
      includeFocusAsFirst: true,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });

    expect(queue.getNavigationState().hasBookmark).toBe(true);

    const moved = queue.returnToBookmark();
    expect(moved).toBe(true);
    expect(queue.getNavigationState().currentNodeId).toBe('root-focus');
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

  it('selects next auto focus from seed pool only (anchors are ignored)', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    await queue.setAnchorEntry('virtual-anchor-1', true);
    const noSeedFocus = (queue as any).selectNextFocus();
    expect(noSeedFocus).toBeNull();

    await queue.setSeedEntry('concept-seed-1', true);
    const seededFocus = (queue as any).selectNextFocus();
    expect(seededFocus).toBe('concept-seed-1');
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

  it('jumpToHistoryNode enables follow mode and bookmark-based return', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));
    mockQueryEngine.fetchNeighbors = vi.fn()
      .mockResolvedValueOnce([{ id: 'neighbor-1', type: 'backlink', weight: 10 }])
      .mockResolvedValueOnce([{ id: 'neighbor-2', type: 'outgoing-direct', weight: 10 }]);

    await queue.addConceptBlock('concept-1');
    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.getNextCard();
    await flushAsync();
    await queue.getNextCard();

    const jumped = await queue.jumpToHistoryNode('neighbor-1');
    expect(jumped).toBe(true);
    expect(queue.getNavigationState().navigationMode).toBe('follow');
    expect(queue.getNavigationState().hasBookmark).toBe(true);

    const returned = queue.returnToBookmark();
    expect(returned).toBe(true);
    expect(queue.getNavigationState().currentNodeId).toBe('neighbor-2');
  });

  it('supports injected concept validator for concept-only seed entry checks', async () => {
    const customQueue = new ConceptNeuralQueue({
      isConceptCard: vi.fn(async (blockId: string) => blockId.startsWith('concept-')),
    });
    const customQueryEngine = (customQueue as any).queryEngine;
    customQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    await customQueue.setSeedEntry('concept-seed-1', true);
    await expect(customQueue.setSeedEntry('virtual-seed-1', true)).rejects.toThrow('not a concept card');
    expect(customQueue.getSeedSnapshot().map((entry) => entry.nodeId)).toEqual(['concept-seed-1']);
  });

  it('preserves seed entries on validation errors when normalization policy is keep', async () => {
    const customQueue = new ConceptNeuralQueue({
      isConceptCard: vi.fn(async () => {
        throw new Error('validator unavailable');
      }),
    });
    const customQueryEngine = (customQueue as any).queryEngine;
    customQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    customQueue.restoreSeedPoolState([
      {
        nodeId: 'concept-a',
        nodeKind: 'concept',
        priority: 0.65,
        neighborsViewed: 0,
        addedAt: Date.now(),
        nodePreview: 'concept-a',
      },
      {
        nodeId: 'concept-b',
        nodeKind: 'concept',
        priority: 0.65,
        neighborsViewed: 0,
        addedAt: Date.now(),
        nodePreview: 'concept-b',
      },
    ]);

    const result = await customQueue.normalizeSeedPoolToConceptCards({
      validationErrorPolicy: 'keep',
    });

    expect(result.changed).toBe(false);
    expect(result.removedNodeIds).toEqual([]);
    expect(customQueue.getSeedSnapshot().map((entry) => entry.nodeId).sort()).toEqual(['concept-a', 'concept-b']);
  });

  it('reuses preloaded next card on the second getNextCard call', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));
    mockQueryEngine.fetchNeighbors = vi.fn(async () => [
      { id: 'neighbor-1', type: 'backlink', weight: 10 },
      { id: 'neighbor-2', type: 'outgoing-direct', weight: 9 },
    ]);

    await queue.addConceptBlock('concept-1');
    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const first = await queue.getNextCard();
    expect(first?.blockId).toBe('neighbor-1');

    await flushAsync();

    expect((queue as any).preloadedNext?.item.blockId).toBe('neighbor-2');

    const fetchCountBeforeSecond = mockQueryEngine.fetchNeighbors.mock.calls.length;
    (queue as any).isPreloading = true;
    const second = await queue.getNextCard();
    (queue as any).isPreloading = false;

    expect(second?.blockId).toBe('neighbor-2');
    expect(mockQueryEngine.fetchNeighbors).toHaveBeenCalledTimes(fetchCountBeforeSecond);
    randomSpy.mockRestore();
  });

  it('invalidates preloaded next card when current focus changes', async () => {
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));
    mockQueryEngine.fetchNeighbors = vi.fn(async () => [
      { id: 'neighbor-1', type: 'backlink', weight: 10 },
      { id: 'neighbor-2', type: 'outgoing-direct', weight: 9 },
    ]);

    await queue.addConceptBlock('concept-1');
    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });
    await queue.getNextCard();
    await flushAsync();

    expect((queue as any).preloadedNext).not.toBeNull();

    await queue.setCurrentFocus('virtual-focus-2', {
      includeFocusAsFirst: true,
      resetHistory: false,
    });

    expect((queue as any).preloadedNext).toBeNull();
  });

  it('falls back to synchronous traversal when preload fails', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockQueryEngine.isConceptCard = vi.fn(async (blockId: string) => blockId.startsWith('concept-'));
    mockQueryEngine.fetchBlockData = vi.fn(async (blockId: string) => ({
      id: blockId,
      content: `${blockId} content`,
      type: 'p',
    }));

    let fetchNeighborCall = 0;
    mockQueryEngine.fetchNeighbors = vi.fn(async () => {
      fetchNeighborCall += 1;
      if (fetchNeighborCall === 2) {
        throw new Error('preload failed');
      }
      return [
        { id: 'neighbor-1', type: 'backlink', weight: 10 },
        { id: 'neighbor-2', type: 'outgoing-direct', weight: 9 },
      ];
    });

    await queue.addConceptBlock('concept-1');
    await queue.startRoamingFromFocus('concept-1', {
      includeFocusAsFirst: true,
      resetHistory: true,
    });

    const first = await queue.getNextCard();
    expect(first?.blockId).toBe('neighbor-1');

    await flushAsync();
    expect((queue as any).preloadedNext).toBeNull();

    (queue as any).isPreloading = true;
    const second = await queue.getNextCard();
    (queue as any).isPreloading = false;
    expect(second?.blockId).toBe('neighbor-2');
    expect(mockQueryEngine.fetchNeighbors).toHaveBeenCalledTimes(3);
    randomSpy.mockRestore();
  });
});
