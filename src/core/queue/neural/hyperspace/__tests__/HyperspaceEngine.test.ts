import { describe, expect, it, vi } from 'vitest';
import { HyperspaceEngine } from '../HyperspaceEngine';
import type { HyperspaceSettings } from '@/types/settings';

function createBlockData(id: string, content: string) {
  return {
    id,
    content,
    type: 'p',
    root_id: 'doc-1',
  };
}

function createSettings(overrides: Partial<HyperspaceSettings> = {}): HyperspaceSettings {
  return {
    treeChannels: {
      blockTree: false,
      documentTree: false,
      ...(overrides.treeChannels || {}),
    },
    maxLayersPerRepetition: 2,
    maxTotalDepth: 8,
    conceptLinkGroupPriority: 0.01,
    elementLinkGroupPriority: 0.05,
    treeChildGroupPriority: 0.16,
    treeParentGroupPriority: 0.2,
    treeSiblingBaseGroupPriority: 0.26,
    siblingDistancePenalty: 0.75,
    articleRootParentConductionProbability: 0.35,
    activationCarryDecay: 0.72,
    raceRandomness: 0,
    ...overrides,
  };
}

describe('HyperspaceEngine', () => {
  it('returns the current source-root before deferred expansion runs', async () => {
    vi.useFakeTimers();
    try {
      const fetchHyperspaceEdges = vi.fn(async () => [
        {
          nodeId: 'neighbor-1',
          associationType: 'concept-link' as const,
          weight: 15,
          channel: 'concept-map' as const,
          origin: 'backlink' as const,
          distance: 1,
          sourcePriority: 0.8,
          targetPriority: 0.72,
          rootId: 'doc-1',
        },
      ]);
      const graphProvider = {
        fetchBlockData: vi.fn(async (nodeId: string) => createBlockData(nodeId, nodeId)),
        fetchHyperspaceEdges,
        fetchNodePriority: vi.fn(async () => 0.7),
        isConceptCard: vi.fn(async () => true),
      } as const;

      const engine = new HyperspaceEngine(graphProvider as any, {
        getSettings: () => createSettings(),
        random: () => 0,
      });

      await engine.setCurrentFocus('source-1', {
        includeFocusAsFirst: false,
        resetHistory: true,
      });

      const first = await engine.getNextCard();

      expect(first?.blockId).toBe('source-1');
      expect(fetchHyperspaceEdges).not.toHaveBeenCalled();

      await vi.runOnlyPendingTimersAsync();

      expect(fetchHyperspaceEdges).toHaveBeenCalledWith(
        'source-1',
        expect.objectContaining({
          engineMode: 'hyperspace',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('consumes frontier nodes before re-emitting the same activation source', async () => {
    const graphProvider = {
      fetchBlockData: vi.fn(async (nodeId: string) => {
        if (nodeId === 'source-1') {
          return createBlockData('source-1', 'Source node');
        }
        if (nodeId === 'neighbor-1') {
          return createBlockData('neighbor-1', 'Neighbor node');
        }
        return null;
      }),
      fetchHyperspaceEdges: vi.fn(async (nodeId: string) => {
        if (nodeId === 'source-1') {
          return [
            {
            nodeId: 'neighbor-1',
            associationType: 'concept-link' as const,
            weight: 15,
            channel: 'concept-map' as const,
            origin: 'backlink' as const,
            distance: 1,
            sourcePriority: 0.8,
            targetPriority: 0.72,
              rootId: 'doc-1',
            },
          ];
        }
        return [];
      }),
      fetchNodePriority: vi.fn(async () => 0.7),
      isConceptCard: vi.fn(async () => true),
    } as const;

    const engine = new HyperspaceEngine(graphProvider as any, {
      getSettings: () => createSettings(),
      random: () => 0,
    });

    await engine.setCurrentFocus('source-1', {
      includeFocusAsFirst: false,
      resetHistory: true,
    });

    const first = await engine.getNextCard();
    const second = await engine.getNextCard();

    expect(first?.blockId).toBe('source-1');
    expect(second?.blockId).toBe('neighbor-1');
    expect(engine.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['source-1', 'neighbor-1']);
    expect(engine.getHistorySnapshot().at(-1)?.origin).toBe('backlink');
  });

  it('rebuilds frontier from the current activation after restoring a session with no pending expansion state', async () => {
    vi.useFakeTimers();
    try {
      const graphProvider = {
        fetchBlockData: vi.fn(async (nodeId: string) => createBlockData(nodeId, nodeId)),
        fetchHyperspaceEdges: vi.fn(async (nodeId: string) => {
          if (nodeId === 'source-1') {
            return [
              {
                nodeId: 'neighbor-1',
                associationType: 'concept-link' as const,
                weight: 15,
                channel: 'concept-map' as const,
                origin: 'backlink' as const,
                distance: 1,
                sourcePriority: 0.8,
                targetPriority: 0.72,
                rootId: 'doc-1',
              },
            ];
          }
          return [];
        }),
        fetchNodePriority: vi.fn(async () => 0.7),
        isConceptCard: vi.fn(async () => true),
      } as const;

      const engine = new HyperspaceEngine(graphProvider as any, {
        getSettings: () => createSettings(),
        random: () => 0,
      });

      await engine.setCurrentFocus('source-1', {
        includeFocusAsFirst: false,
        resetHistory: true,
      });

      const first = await engine.getNextCard();
      expect(first?.blockId).toBe('source-1');

      const restored = new HyperspaceEngine(graphProvider as any, {
        getSettings: () => createSettings(),
        random: () => 0,
      });

      restored.restoreSourcePoolState(engine.exportSourcePoolState());
      restored.restoreAnchorPoolState(engine.exportAnchorPoolState());
      restored.restoreSessionState(engine.exportSessionState());

      const next = await restored.getNextCard();
      expect(next?.blockId).toBe('neighbor-1');
      expect(restored.getHistorySnapshot().map((entry) => entry.nodeId)).toEqual(['source-1', 'neighbor-1']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prefers concept links over weaker tree siblings when both are in frontier', async () => {
    const graphProvider = {
      fetchBlockData: vi.fn(async (nodeId: string) => createBlockData(nodeId, nodeId)),
      fetchHyperspaceEdges: vi.fn(async (nodeId: string) => {
        if (nodeId !== 'source-1') {
          return [];
        }
        return [
          {
            nodeId: 'concept-1',
            associationType: 'concept-link' as const,
            weight: 15,
            channel: 'concept-map' as const,
            origin: 'direct-ref' as const,
            distance: 1,
            sourcePriority: 0.8,
            targetPriority: 0.78,
            rootId: 'doc-1',
          },
          {
            nodeId: 'sibling-1',
            associationType: 'tree-sibling' as const,
            weight: 8,
            channel: 'block-tree' as const,
            origin: 'block-tree' as const,
            distance: 2,
            sourcePriority: 0.8,
            targetPriority: 0.52,
            rootId: 'doc-1',
          },
        ];
      }),
      fetchNodePriority: vi.fn(async (nodeId: string) => (nodeId === 'concept-1' ? 0.78 : 0.52)),
      isConceptCard: vi.fn(async (nodeId: string) => nodeId !== 'sibling-1'),
    } as const;

    const engine = new HyperspaceEngine(graphProvider as any, {
      getSettings: () => createSettings(),
      random: () => 0,
    });

    await engine.setCurrentFocus('source-1', { includeFocusAsFirst: false, resetHistory: true });
    await engine.getNextCard();
    const second = await engine.getNextCard();

    expect(second?.blockId).toBe('concept-1');
  });

  it('passes tree-channel settings through to the graph provider and records tree-edge history', async () => {
    const fetchHyperspaceEdges = vi.fn(async (_nodeId: string, options: { includeTreeChannels?: { blockTree: boolean; documentTree: boolean } }) => {
      if (!options.includeTreeChannels?.blockTree) {
        return [];
      }
      return [
        {
          nodeId: 'child-1',
          associationType: 'tree-child' as const,
          weight: 12,
          channel: 'block-tree' as const,
          origin: 'block-tree' as const,
          distance: 1,
          sourcePriority: 0.75,
          targetPriority: 0.66,
          rootId: 'doc-1',
        },
      ];
    });

    const graphProvider = {
      fetchBlockData: vi.fn(async (nodeId: string) => createBlockData(nodeId, nodeId)),
      fetchHyperspaceEdges,
      fetchNodePriority: vi.fn(async () => 0.7),
      isConceptCard: vi.fn(async () => true),
    } as const;

    const engine = new HyperspaceEngine(graphProvider as any, {
      getSettings: () => createSettings({
        treeChannels: {
          blockTree: true,
          documentTree: false,
        },
      }),
      random: () => 0,
    });

    await engine.setCurrentFocus('source-1', { includeFocusAsFirst: false, resetHistory: true });
    await engine.getNextCard();
    const next = await engine.getNextCard();

    expect(fetchHyperspaceEdges).toHaveBeenCalledWith(
      'source-1',
      expect.objectContaining({
        includeTreeChannels: {
          blockTree: true,
          documentTree: false,
        },
      }),
    );
    expect(next?.blockId).toBe('child-1');

    const lastHistory = engine.getHistorySnapshot().at(-1);
    expect(lastHistory?.associationType).toBe('tree-child');
    expect(lastHistory?.activationKind).toBe('tree-edge');
    expect(lastHistory?.origin).toBe('block-tree');
  });
});
