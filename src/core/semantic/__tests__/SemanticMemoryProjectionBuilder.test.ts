import { describe, expect, it } from 'vitest';
import { buildSemanticMemoryProjection } from '../SemanticMemoryProjectionBuilder';

describe('buildSemanticMemoryProjection', () => {
  it('derives node and edge memory from append-only Semantic evidence', () => {
    const projection = buildSemanticMemoryProjection({
      sessionId: 'session-1',
      rebuiltAt: 1_700_001_000_500,
      events: [
        {
          eventId: 'event-start',
          sessionId: 'session-1',
          type: 'session-started',
          nodeId: 'root',
          lens: 'assimilation',
          occurredAt: 1_700_001_000_000,
        },
        {
          eventId: 'event-root-visit',
          sessionId: 'session-1',
          type: 'node-visited',
          nodeId: 'root',
          lens: 'assimilation',
          occurredAt: 1_700_001_000_001,
        },
        {
          eventId: 'event-edge',
          sessionId: 'session-1',
          type: 'edge-traversed',
          fromNodeId: 'root',
          toNodeId: 'implicit-1',
          nodeId: 'implicit-1',
          lens: 'accommodation',
          occurredAt: 1_700_001_000_002,
        },
        {
          eventId: 'event-implicit-visit',
          sessionId: 'session-1',
          type: 'node-visited',
          nodeId: 'implicit-1',
          lens: 'accommodation',
          occurredAt: 1_700_001_000_003,
        },
        {
          eventId: 'event-implicit-action',
          sessionId: 'session-1',
          type: 'implicit-node-action',
          nodeId: 'implicit-1',
          lens: 'accommodation',
          occurredAt: 1_700_001_000_004,
          payload: { action: 'expand' },
        },
        {
          eventId: 'event-irrelevant',
          sessionId: 'session-1',
          type: 'node-marked-irrelevant',
          nodeId: 'distractor',
          lens: 'free',
          occurredAt: 1_700_001_000_005,
        },
      ],
      stations: [
        {
          stationId: 'station-root',
          sessionId: 'session-1',
          type: 'node',
          nodeId: 'root',
          lensHistory: ['assimilation'],
          createdAt: 1_700_001_000_100,
        },
        {
          stationId: 'station-path',
          sessionId: 'session-1',
          type: 'path',
          path: [
            { nodeId: 'root', lens: 'assimilation', eventId: 'event-root-visit', visitedAt: 1_700_001_000_001 },
            { nodeId: 'implicit-1', lens: 'accommodation', eventId: 'event-implicit-visit', visitedAt: 1_700_001_000_003 },
          ],
          lensHistory: ['assimilation', 'accommodation'],
          createdAt: 1_700_001_000_200,
        },
      ],
      relations: [
        {
          relationId: 'relation-accepted',
          fromNodeId: 'root',
          toNodeId: 'implicit-1',
          decision: 'accepted',
          source: 'ai',
          confidence: 0.35,
          decidedAt: 1_700_001_000_300,
        },
        {
          relationId: 'relation-rejected',
          fromNodeId: 'root',
          toNodeId: 'distractor',
          decision: 'rejected',
          source: 'ai',
          confidence: 0.2,
          decidedAt: 1_700_001_000_400,
        },
      ],
    });

    const root = projection.nodeMemory.find((node) => node.nodeId === 'root');
    const implicit = projection.nodeMemory.find((node) => node.nodeId === 'implicit-1');
    const distractor = projection.nodeMemory.find((node) => node.nodeId === 'distractor');
    const edge = projection.edgeMemory.find((item) => item.fromNodeId === 'root' && item.toNodeId === 'implicit-1');
    const rejectedEdge = projection.edgeMemory.find((item) => item.fromNodeId === 'root' && item.toNodeId === 'distractor');

    expect(projection).toMatchObject({
      version: 1,
      sessionId: 'session-1',
      rebuiltAt: 1_700_001_000_500,
    });
    expect(root?.manualBoost).toBeGreaterThan(0);
    expect(root?.oldKnowledgeScore).toBeGreaterThan(implicit?.oldKnowledgeScore ?? 1);
    expect(implicit?.semanticFamiliarity).toBeGreaterThan(0);
    expect(implicit?.tension).toBeGreaterThan(0);
    expect(distractor?.instability).toBeGreaterThan(0);
    expect(distractor?.novelty).toBeGreaterThan(0);
    expect(edge).toMatchObject({
      fromNodeId: 'root',
      toNodeId: 'implicit-1',
      traversalCount: 1,
    });
    expect(edge?.relationConfidence).toBeGreaterThan(0.35);
    expect(edge?.manualBoost).toBeGreaterThan(0);
    expect(rejectedEdge?.tension).toBeGreaterThan(0);
  });

  it('uses old Orbit and Hyperspace pools as read-only manual boost evidence', () => {
    const projection = buildSemanticMemoryProjection({
      sessionId: 'session-old-mode',
      rebuiltAt: 1_700_002_000_000,
      events: [],
      oldModeManualBoosts: [
        { nodeId: 'orbit-seed-node', source: 'orbit-seed', weight: 0.2 },
        { nodeId: 'orbit-anchor-node', source: 'orbit-anchor', weight: 0.4 },
        { nodeId: 'hyperspace-source-node', source: 'hyperspace-source', weight: 0.25 },
        { nodeId: 'hyperspace-anchor-node', source: 'hyperspace-anchor', weight: 0.45 },
      ],
    });

    expect(projection.edgeMemory).toEqual([]);
    expect(projection.nodeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'orbit-seed-node',
        manualBoost: 0.2,
      }),
      expect.objectContaining({
        nodeId: 'orbit-anchor-node',
        manualBoost: 0.4,
      }),
      expect.objectContaining({
        nodeId: 'hyperspace-source-node',
        manualBoost: 0.25,
      }),
      expect.objectContaining({
        nodeId: 'hyperspace-anchor-node',
        manualBoost: 0.45,
      }),
    ]));
    const oldNode = projection.nodeMemory.find((node) => node.nodeId === 'hyperspace-anchor-node');
    expect(oldNode?.oldKnowledgeScore).toBeGreaterThan(oldNode?.semanticFamiliarity ?? 1);
  });
});
