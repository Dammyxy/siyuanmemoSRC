import { describe, expect, it } from 'vitest';
import {
  buildSemanticAiInput,
  buildSemanticNodePresentation,
  collectSemanticPathStationDraft,
  relationDecisionAltersSemanticMemory,
  validateSemanticAiRelationCandidates,
} from '../SemanticActivationPresentation';
import type {
  SemanticCandidateColumns,
  SemanticNode,
  SemanticSessionSnapshot,
} from '../semanticActivationTypes';

function node(nodeId: string, nodeType: SemanticNode['nodeType']): SemanticNode {
  return {
    nodeId,
    nodeType,
    title: `${nodeId} title`,
    preview: `${nodeId} preview`,
    location: {
      blockId: nodeId,
      cardId: nodeType === 'real-review-card' ? `card-${nodeId}` : null,
      breadcrumb: ['Root', 'Leaf'],
      backlinkBlockIds: ['backlink-1'],
    },
  };
}

function session(): SemanticSessionSnapshot {
  return {
    sessionId: 'semantic-session-1',
    rootFocusNodeId: 'root',
    currentNodeId: 'current',
    activeLens: 'assimilation',
    narrativePath: [
      { nodeId: 'root', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 },
      { nodeId: 'current', lens: 'free', eventId: 'event-current', visitedAt: 2 },
    ],
    startedAt: 1,
    endedAt: null,
  };
}

function candidates(): SemanticCandidateColumns {
  return {
    assimilation: [{
      candidateId: 'candidate-a',
      node: node('candidate-a', 'implicit-knowledge'),
      lens: 'assimilation',
      score: 0.8,
      reasons: [],
    }],
    accommodation: [],
    free: [{
      candidateId: 'candidate-b',
      node: node('candidate-b', 'concept'),
      lens: 'free',
      score: 0.7,
      reasons: [],
    }],
  };
}

describe('SemanticActivationPresentation', () => {
  it('treats implicit knowledge as read-only and blocks reveal, grading, scheduling, and card creation', () => {
    const presentation = buildSemanticNodePresentation(node('implicit-1', 'implicit-knowledge'));

    expect(presentation).toMatchObject({
      isImplicitKnowledge: true,
      readOnly: true,
      canReveal: false,
      canGrade: false,
      canSchedule: false,
      canAutoCreateCard: false,
    });
    expect(presentation.actions).toEqual(expect.arrayContaining([
      'follow',
      'expand',
      'node-station',
      'path-station',
      'skip',
      'mark-irrelevant',
    ]));
    expect(presentation.actions).not.toEqual(expect.arrayContaining(['review-reveal', 'review-grade']));
  });

  it('keeps real review-card nodes eligible for normal Review reveal and grading semantics', () => {
    const presentation = buildSemanticNodePresentation(node('review-1', 'real-review-card'));

    expect(presentation).toMatchObject({
      isReviewCard: true,
      readOnly: false,
      canReveal: true,
      canGrade: true,
      canSchedule: true,
      canAutoCreateCard: false,
      cardId: 'card-review-1',
    });
    expect(presentation.actions).toEqual(expect.arrayContaining(['review-reveal', 'review-grade']));
  });

  it('captures path stations from root-to-current narrative path and lens history', () => {
    const draft = collectSemanticPathStationDraft(session());

    expect(draft).toMatchObject({
      type: 'path',
      sessionId: 'semantic-session-1',
      nodeId: null,
      lensHistory: ['assimilation', 'free'],
    });
    expect(draft.path?.map((entry) => entry.nodeId)).toEqual(['root', 'current']);
  });

  it('builds bounded AI input and rejects relation candidates with unknown endpoints', () => {
    const aiInput = buildSemanticAiInput({
      session: session(),
      candidates: candidates(),
      memoryNodeIds: ['memory-1'],
    });
    const result = validateSemanticAiRelationCandidates(aiInput, [
      { relationId: 'ok', fromNodeId: 'root', toNodeId: 'candidate-a', confidence: 0.4 },
      { relationId: 'bad', fromNodeId: 'root', toNodeId: 'outside', confidence: 0.4 },
    ]);

    expect(aiInput.allowedNodeIds).toEqual(['root', 'current', 'candidate-a', 'candidate-b', 'memory-1']);
    expect(result.valid.map((candidate) => candidate.relationId)).toEqual(['ok']);
    expect(result.rejected).toEqual([expect.objectContaining({
      relationId: 'bad',
      rejectedReason: 'unknown-endpoint',
    })]);
  });

  it('keeps ignored AI relation candidates as no-op memory decisions', () => {
    expect(relationDecisionAltersSemanticMemory('accepted')).toBe(true);
    expect(relationDecisionAltersSemanticMemory('rejected')).toBe(true);
    expect(relationDecisionAltersSemanticMemory('ignored')).toBe(false);
  });
});
