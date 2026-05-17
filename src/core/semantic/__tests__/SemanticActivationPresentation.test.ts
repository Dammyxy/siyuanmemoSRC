import { describe, expect, it } from 'vitest';
import {
  buildSemanticAiInput,
  buildSemanticEdgeExplanation,
  buildSemanticNodePresentation,
  buildSemanticRealNodePresentation,
  canRepresentSemanticPathNode,
  collectSemanticPathStationDraft,
  filterRepresentableSemanticCandidates,
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

  it('presents real Semantic nodes with readable content, source ids, availability, and debug ids', () => {
    const presentation = buildSemanticRealNodePresentation(node('review-2', 'real-review-card'));

    expect(presentation).toEqual(expect.objectContaining({
      displayTitle: 'review-2 title',
      summary: 'review-2 preview',
      nodeKind: 'flashcard',
      breadcrumb: ['Root', 'Leaf'],
      sourceBlockId: 'review-2',
      cardId: 'card-review-2',
      debugId: 'review-2',
      availability: { status: 'available', reason: null, message: null },
    }));
  });

  it('marks virtual Semantic nodes unavailable instead of presenting them as reviewable source nodes', () => {
    const presentation = buildSemanticNodePresentation(node('implicit-2', 'implicit-knowledge'));

    expect(presentation).toMatchObject({
      displayTitle: 'implicit-2 title',
      summary: 'implicit-2 preview',
      nodeKind: 'unknown',
      sourceBlockId: 'implicit-2',
      cardId: null,
      debugId: 'implicit-2',
      availability: {
        status: 'unavailable',
        reason: 'virtual-node',
      },
    });
  });

  it('returns explicit unavailable presentation instead of using a bare block id as the display label', () => {
    const presentation = buildSemanticRealNodePresentation({
      nodeId: '20260517130000-abc1234',
      nodeType: 'real-review-card',
      title: '20260517130000-abc1234',
      preview: '',
      location: {
        blockId: '20260517130000-abc1234',
        cardId: 'card-1',
        breadcrumb: [],
        backlinkBlockIds: [],
      },
    });

    expect(presentation).toMatchObject({
      displayTitle: 'Content unavailable',
      summary: '',
      sourceBlockId: '20260517130000-abc1234',
      availability: {
        status: 'unavailable',
        reason: 'content-missing',
      },
    });
  });

  it('builds edge explanations with lens, reason tags, evidence, created-by identity, and timestamp', () => {
    const explanation = buildSemanticEdgeExplanation({
      fromNodeId: 'root',
      toNodeId: 'next',
      lens: 'accommodation',
      primaryExplanation: 'Links new evidence back to an older note.',
      reasonTags: [' tension ', 'tension', ' accepted-ai-relation '],
      evidence: [{ eventId: 'event-1', relationId: 'relation-1', weight: 0.6 }],
      createdBy: { kind: 'user', id: 'user-1', label: 'manual follow' },
      createdAt: 42,
    });

    expect(explanation).toEqual({
      fromNodeId: 'root',
      toNodeId: 'next',
      lens: 'accommodation',
      primaryExplanation: 'Links new evidence back to an older note.',
      reasonTags: ['tension', 'accepted-ai-relation'],
      evidence: [{ eventId: 'event-1', relationId: 'relation-1', weight: 0.6 }],
      createdBy: { kind: 'user', id: 'user-1', label: 'manual follow' },
      createdAt: 42,
    });
  });

  it('does not allow virtual or inferred knowledge to become a path node before materialization', () => {
    expect(canRepresentSemanticPathNode(node('implicit-3', 'implicit-knowledge'))).toBe(false);
    expect(canRepresentSemanticPathNode(node('review-3', 'real-review-card'))).toBe(true);
  });

  it('filters virtual or inferred knowledge out of main candidate columns before binding or materialization', () => {
    const filtered = filterRepresentableSemanticCandidates({
      assimilation: [
        {
          candidateId: 'implicit',
          node: node('implicit-4', 'implicit-knowledge'),
          score: 0.9,
          lens: 'assimilation',
          reasons: [],
        },
        {
          candidateId: 'real',
          node: node('review-4', 'real-review-card'),
          score: 0.8,
          lens: 'assimilation',
          reasons: [],
        },
      ],
      accommodation: [],
      free: [],
    });

    expect(filtered.assimilation.map((candidate) => candidate.candidateId)).toEqual(['real']);
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
