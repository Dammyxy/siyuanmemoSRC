import { describe, expect, it } from 'vitest';
import type {
  SemanticCandidateSource,
  SemanticMemoryProjection,
  SemanticRelation,
  SemanticStation,
} from '../semanticActivationTypes';
import { buildSemanticCandidatePool } from '../SemanticCandidatePoolBuilder';

const projection: SemanticMemoryProjection = {
  version: 1,
  sessionId: 'session-1',
  rebuiltAt: 1_700_004_000_000,
  nodeMemory: [
    {
      nodeId: 'memory-node',
      oldKnowledgeScore: 0.7,
      semanticFamiliarity: 0.5,
      manualBoost: 0,
      novelty: 0.3,
      instability: 0,
      tension: 0.1,
      lastProjectedAt: 1_700_004_000_000,
    },
    {
      nodeId: 'current',
      oldKnowledgeScore: 0.9,
      semanticFamiliarity: 0.9,
      manualBoost: 0,
      novelty: 0,
      instability: 0,
      tension: 0,
      lastProjectedAt: 1_700_004_000_000,
    },
  ],
  edgeMemory: [],
};

describe('buildSemanticCandidatePool', () => {
  it('collects one non-structural pool from graph, projection, stations, accepted AI relations, and defaults', () => {
    const graphSources: SemanticCandidateSource[] = [
      {
        nodeId: 'graph-current',
        relatedToNodeId: 'current',
        scope: 'current-node',
        relationType: 'concept-link',
        weight: 0.8,
        structural: false,
        evidence: { channel: 'concept-map' },
      },
      {
        nodeId: 'graph-root',
        relatedToNodeId: 'root',
        scope: 'root-focus',
        relationType: 'concept-link',
        weight: 0.3,
        structural: false,
        evidence: { channel: 'concept-map' },
      },
      {
        nodeId: 'structural-node',
        relatedToNodeId: 'current',
        scope: 'structural',
        relationType: 'tree-child',
        weight: 0.2,
        structural: true,
        evidence: { channel: 'block-tree' },
      },
    ];
    const stations: SemanticStation[] = [
      {
        stationId: 'station-1',
        type: 'node',
        sessionId: 'session-1',
        nodeId: 'station-node',
        createdAt: 1_700_004_000_001,
      },
      {
        stationId: 'station-path',
        type: 'path',
        sessionId: 'session-1',
        path: [
          { nodeId: 'root', lens: 'assimilation', eventId: 'e1', visitedAt: 1 },
          { nodeId: 'path-node', lens: 'free', eventId: 'e2', visitedAt: 2 },
        ],
        lensHistory: ['assimilation', 'free'],
        createdAt: 1_700_004_000_002,
      },
    ];
    const relations: SemanticRelation[] = [
      {
        relationId: 'accepted-ai',
        fromNodeId: 'current',
        toNodeId: 'ai-node',
        decision: 'accepted',
        source: 'ai',
        confidence: 0.6,
        decidedAt: 1_700_004_000_003,
      },
      {
        relationId: 'rejected-ai',
        fromNodeId: 'current',
        toNodeId: 'rejected-node',
        decision: 'rejected',
        source: 'ai',
        confidence: 0.8,
        decidedAt: 1_700_004_000_004,
      },
    ];

    const pool = buildSemanticCandidatePool({
      currentNodeId: 'current',
      rootFocusNodeId: 'root',
      graphSources,
      projection,
      stations,
      relations,
      defaultNodeIds: ['default-node', 'graph-current'],
    });

    expect(pool.candidateNodeIds).toEqual([
      'ai-node',
      'default-node',
      'graph-current',
      'graph-root',
      'memory-node',
      'path-node',
      'station-node',
    ]);
    expect(pool.candidateNodeIds).not.toContain('current');
    expect(pool.candidateNodeIds).not.toContain('root');
    expect(pool.candidateNodeIds).not.toContain('structural-node');
    expect(pool.candidateNodeIds).not.toContain('rejected-node');
    expect(pool.sourcesByNodeId['graph-current']).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'current-node', weight: 0.8 }),
      expect.objectContaining({ scope: 'default-source' }),
    ]));
    expect(pool.sourcesByNodeId['memory-node']).toEqual([
      expect.objectContaining({ scope: 'memory-projection' }),
    ]);
    expect(pool.sourcesByNodeId['ai-node']).toEqual([
      expect.objectContaining({ scope: 'accepted-ai-relation' }),
    ]);
  });
});
