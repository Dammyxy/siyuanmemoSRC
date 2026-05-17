import { describe, expect, it, vi } from 'vitest';
import {
  buildSemanticPathAnalysisContext,
  buildSemanticPathAnalysisPrompt,
  buildSemanticSuggestionSummary,
  type SemanticPathAnalysisPayload,
} from '../semanticReviewAIHandoff';

vi.spyOn(Date, 'now').mockReturnValue(10);

function payload(): SemanticPathAnalysisPayload {
  const node = {
    nodeId: 'node-1',
    nodeType: 'real-review-card' as const,
    title: 'Raw node',
    preview: 'Raw preview',
    presentation: {
      displayTitle: 'Readable node',
      summary: 'Readable summary',
      nodeKind: 'card' as const,
      breadcrumb: [],
      availability: { status: 'available' as const, reason: null, message: null },
      sourceBlockId: 'block-1',
      cardId: 'card-1',
      debugId: 'node-1',
    },
    location: { blockId: 'block-1', cardId: 'card-1', deckId: null, breadcrumb: [], backlinkBlockIds: [] },
  };
  return {
    session: {
      sessionId: 'session-1',
      rootFocusNodeId: 'root-1',
      currentNodeId: 'node-1',
      activeLens: 'assimilation',
      narrativePath: [],
      startedAt: 1,
      endedAt: null,
    },
    currentNode: node,
    activePathNodes: [node],
    edgeExplanations: [{
      fromNodeId: 'root-1',
      toNodeId: 'node-1',
      lens: 'assimilation',
      primaryExplanation: 'Root explains node.',
      reasonTags: ['memory'],
      evidence: [],
      createdBy: { kind: 'system' },
      createdAt: 1,
    }],
    later: [{ entryId: 'later-1', sessionId: 'session-1', nodeId: 'later-node', createdAt: 2, removedAt: null }],
  };
}

describe('semanticReviewAIHandoff', () => {
  it('builds bounded AI prompt and attached context without path mutation commands', () => {
    const input = payload();

    const prompt = buildSemanticPathAnalysisPrompt(input);
    const context = buildSemanticPathAnalysisContext(input);

    expect(prompt).toContain('Do not invent path nodes');
    expect(prompt).toContain('Readable node - Readable summary');
    expect(prompt).toContain('Root explains node.');
    expect(context).toMatchObject({
      id: 'semantic-path:session-1:node-1',
      providerKey: 'manual-text',
      title: 'Semantic path Readable node',
      blockIds: ['block-1'],
      createdAt: 10,
    });
    expect(buildSemanticSuggestionSummary(input)).toBe('AI path analysis suggestion for Readable node');
  });
});
