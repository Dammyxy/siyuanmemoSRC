import { describe, expect, it } from 'vitest';
import { buildSemanticMemoryProjection } from '../SemanticMemoryProjectionBuilder';
import { rankSemanticProjectionCandidates } from '../SemanticProjectionLensRanker';

describe('rankSemanticProjectionCandidates', () => {
  it('uses tension for lens ranking and reasons without increasing relation confidence', () => {
    const projection = buildSemanticMemoryProjection({
      sessionId: 'session-tension',
      rebuiltAt: 1_700_003_000_000,
      events: [
        {
          eventId: 'visit-current',
          sessionId: 'session-tension',
          type: 'node-visited',
          nodeId: 'current',
          lens: 'assimilation',
          occurredAt: 1_700_003_000_001,
        },
        {
          eventId: 'visit-stable',
          sessionId: 'session-tension',
          type: 'node-visited',
          nodeId: 'stable-old',
          lens: 'assimilation',
          occurredAt: 1_700_003_000_002,
        },
        {
          eventId: 'visit-tense',
          sessionId: 'session-tension',
          type: 'node-visited',
          nodeId: 'tense-old',
          lens: 'accommodation',
          occurredAt: 1_700_003_000_003,
        },
      ],
      oldModeManualBoosts: [
        { nodeId: 'stable-old', source: 'orbit-anchor', weight: 0.5 },
      ],
      relations: [
        {
          relationId: 'rejected-current-tense',
          fromNodeId: 'current',
          toNodeId: 'tense-old',
          decision: 'rejected',
          source: 'ai',
          confidence: 0.9,
          decidedAt: 1_700_003_000_004,
        },
      ],
    });

    const columns = rankSemanticProjectionCandidates({
      currentNodeId: 'current',
      rootFocusNodeId: 'root',
      candidateNodeIds: ['stable-old', 'tense-old'],
      projection,
    });

    expect(columns.assimilation[0]?.nodeId).toBe('stable-old');
    expect(columns.accommodation[0]?.nodeId).toBe('tense-old');
    expect(columns.accommodation[0]?.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'tension' }),
    ]));
    const tenseEdge = projection.edgeMemory.find((edge) => edge.fromNodeId === 'current' && edge.toNodeId === 'tense-old');
    expect(tenseEdge?.tension).toBeGreaterThan(0);
    expect(tenseEdge?.relationConfidence).toBe(0);
    expect(projection.nodeMemory.find((node) => node.nodeId === 'tense-old')?.manualBoost).toBe(0);
  });

  it('ranks the same candidate pool through every lens with root gravity and explanation payloads', () => {
    const projection = buildSemanticMemoryProjection({
      sessionId: 'session-ranking',
      rebuiltAt: 1_700_004_100_000,
      events: [
        {
          eventId: 'visit-current',
          sessionId: 'session-ranking',
          type: 'node-visited',
          nodeId: 'current',
          lens: 'assimilation',
          occurredAt: 1_700_004_100_001,
        },
        {
          eventId: 'visit-root',
          sessionId: 'session-ranking',
          type: 'node-visited',
          nodeId: 'root',
          lens: 'assimilation',
          occurredAt: 1_700_004_100_002,
        },
        {
          eventId: 'visit-old',
          sessionId: 'session-ranking',
          type: 'node-visited',
          nodeId: 'old-node',
          lens: 'assimilation',
          occurredAt: 1_700_004_100_003,
        },
        {
          eventId: 'current-edge',
          sessionId: 'session-ranking',
          type: 'edge-traversed',
          fromNodeId: 'current',
          toNodeId: 'current-close',
          lens: 'free',
          occurredAt: 1_700_004_100_004,
        },
        {
          eventId: 'root-edge',
          sessionId: 'session-ranking',
          type: 'edge-traversed',
          fromNodeId: 'root',
          toNodeId: 'root-close',
          lens: 'free',
          occurredAt: 1_700_004_100_005,
        },
      ],
      oldModeManualBoosts: [
        { nodeId: 'old-node', source: 'orbit-anchor', weight: 0.75 },
      ],
    });

    const columns = rankSemanticProjectionCandidates({
      currentNodeId: 'current',
      rootFocusNodeId: 'root',
      candidateNodeIds: ['old-node', 'current-close', 'root-close'],
      projection,
    });

    expect(columns.assimilation.map((candidate) => candidate.nodeId)).toEqual(expect.arrayContaining([
      'old-node',
      'current-close',
      'root-close',
    ]));
    expect(columns.accommodation.map((candidate) => candidate.nodeId)).toEqual(expect.arrayContaining([
      'old-node',
      'current-close',
      'root-close',
    ]));
    expect(columns.free.map((candidate) => candidate.nodeId)).toEqual(expect.arrayContaining([
      'old-node',
      'current-close',
      'root-close',
    ]));
    const currentClose = columns.free.find((candidate) => candidate.nodeId === 'current-close');
    const rootClose = columns.free.find((candidate) => candidate.nodeId === 'root-close');
    expect(currentClose?.score).toBeGreaterThan(rootClose?.score ?? 0);
    expect(rootClose?.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'root-focus-relation' }),
    ]));
    expect(rootClose?.explanation).toMatchObject({
      currentNodeId: 'current',
      rootFocusNodeId: 'root',
      rootFocusRelation: expect.any(Number),
    });
  });
});
