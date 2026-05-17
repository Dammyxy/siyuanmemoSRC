import { describe, expect, it } from 'vitest';
import { buildSemanticSessionProjection } from '../SemanticSessionProjectionBuilder';
import type {
  SemanticBranchEdge,
  SemanticBranchState,
  SemanticLaterEntry,
  SemanticSessionSnapshot,
  SemanticSuggestion,
} from '../semanticActivationTypes';

function session(overrides: Partial<SemanticSessionSnapshot> = {}): SemanticSessionSnapshot {
  return {
    sessionId: 'session-1',
    rootFocusNodeId: 'root',
    currentNodeId: 'current',
    activeLens: 'assimilation',
    narrativePath: [
      { nodeId: 'root', lens: 'assimilation', eventId: 'event-root', visitedAt: 10 },
      { nodeId: 'current', lens: 'free', eventId: 'event-current', visitedAt: 20 },
    ],
    startedAt: 1,
    endedAt: null,
    ...overrides,
  };
}

function edge(overrides: Partial<SemanticBranchEdge>): SemanticBranchEdge {
  return {
    edgeId: 'edge-1',
    sessionId: 'session-1',
    branchId: 'branch-main',
    fromNodeId: 'root',
    toNodeId: 'current',
    lens: 'free',
    explanation: null,
    createdBy: { kind: 'user', id: 'user-1', label: 'manual follow' },
    createdAt: 30,
    ...overrides,
  };
}

function branchState(overrides: Partial<SemanticBranchState>): SemanticBranchState {
  return {
    branchId: 'branch-main',
    sessionId: 'session-1',
    rootNodeId: 'root',
    activeCursorNodeId: 'current',
    archivedAt: null,
    restoredAt: null,
    updatedAt: 40,
    ...overrides,
  };
}

describe('SemanticSessionProjectionBuilder', () => {
  it('derives tree, active path, branch ordering, inherited context, later, and suggestions from persisted Semantic state', () => {
    const laterEntries: SemanticLaterEntry[] = [
      { entryId: 'later-removed', sessionId: 'session-1', nodeId: 'old', createdAt: 50, removedAt: 60 },
      { entryId: 'later-active', sessionId: 'session-1', nodeId: 'next', createdAt: 70, removedAt: null },
    ];
    const suggestions: SemanticSuggestion[] = [
      {
        suggestionId: 'ignored',
        sessionId: 'session-1',
        source: 'ai',
        summary: 'ignored',
        status: 'ignored',
        createdAt: 80,
        updatedAt: 80,
      },
      {
        suggestionId: 'active',
        sessionId: 'session-1',
        source: 'ai',
        summary: 'bind to block',
        status: 'active',
        createdAt: 90,
        updatedAt: 90,
      },
    ];

    const projection = buildSemanticSessionProjection({
      session: session({
        forkMetadata: {
          sourceSessionId: 'session-old',
          sourceNodeId: 'old-current',
          forkedAt: 5,
          reason: 'continue-ended-session',
        },
      }),
      branchEdges: [
        edge({ edgeId: 'edge-main', branchId: 'branch-main', fromNodeId: 'root', toNodeId: 'current', createdAt: 30 }),
        edge({ edgeId: 'edge-side', branchId: 'branch-side', fromNodeId: 'root', toNodeId: 'side', createdAt: 20 }),
      ],
      branchStates: [
        branchState({ branchId: 'branch-main', activeCursorNodeId: 'current', updatedAt: 100 }),
        branchState({ branchId: 'branch-side', activeCursorNodeId: 'side', updatedAt: 40, archivedAt: 45 }),
      ],
      laterEntries,
      irrelevantFeedback: [{ feedbackId: 'nope', sessionId: 'session-1', nodeId: 'irrelevant', scope: 'session', createdAt: 100 }],
      suggestions,
    });

    expect(projection.tree).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'root', childNodeIds: ['current', 'side'] }),
    ]));
    expect(projection.activePath.map((entry) => entry.nodeId)).toEqual(['root', 'current']);
    expect(projection.branches.map((branch) => branch.branchId)).toEqual(['branch-main']);
    expect(projection.archivedBranches.map((branch) => branch.branchId)).toEqual(['branch-side']);
    expect(projection.inheritedContextNodeIds).toEqual(['old-current', 'root', 'current']);
    expect(projection.later.map((entry) => entry.entryId)).toEqual(['later-active']);
    expect(projection.suggestions.map((suggestion) => suggestion.suggestionId)).toEqual(['active']);
    expect(projection.ended).toBe(false);
  });

  it('keeps restored branches active and archived branches separate', () => {
    const projection = buildSemanticSessionProjection({
      session: session(),
      branchEdges: [
        edge({ edgeId: 'edge-restored', branchId: 'branch-restored', toNodeId: 'restored', createdAt: 10 }),
        edge({ edgeId: 'edge-archived', branchId: 'branch-archived', toNodeId: 'archived', createdAt: 20 }),
      ],
      branchStates: [
        branchState({
          branchId: 'branch-restored',
          activeCursorNodeId: 'restored',
          archivedAt: 30,
          restoredAt: 40,
          updatedAt: 40,
        }),
        branchState({
          branchId: 'branch-archived',
          activeCursorNodeId: 'archived',
          archivedAt: 50,
          restoredAt: null,
          updatedAt: 50,
        }),
      ],
    });

    expect(projection.branches.map((branch) => branch.branchId)).toEqual(['branch-restored']);
    expect(projection.archivedBranches.map((branch) => branch.branchId)).toEqual(['branch-archived']);
  });

  it('projects active cursor moves and new paths from branch state while retaining traversal edges', () => {
    const projection = buildSemanticSessionProjection({
      session: session(),
      branchEdges: [
        edge({ edgeId: 'edge-a', branchId: 'branch-a', fromNodeId: 'root', toNodeId: 'a', createdAt: 10 }),
        edge({ edgeId: 'edge-b', branchId: 'branch-a', fromNodeId: 'a', toNodeId: 'b', createdAt: 20 }),
      ],
      branchStates: [
        branchState({ branchId: 'branch-a', rootNodeId: 'root', activeCursorNodeId: 'a', updatedAt: 30 }),
      ],
    });

    expect(projection.branches[0]).toEqual(expect.objectContaining({
      branchId: 'branch-a',
      activeCursorNodeId: 'a',
    }));
    expect(projection.branches[0]?.edges.map((item) => item.edgeId)).toEqual(['edge-a', 'edge-b']);
  });

  it('preserves ended-session fork metadata as inherited context', () => {
    const projection = buildSemanticSessionProjection({
      session: session({
        endedAt: 100,
        forkMetadata: {
          sourceSessionId: 'ended-session',
          sourceNodeId: 'resume-node',
          forkedAt: 110,
          reason: 'continue-ended-session',
        },
      }),
    });

    expect(projection.ended).toBe(true);
    expect(projection.forkMetadata).toEqual(expect.objectContaining({ sourceSessionId: 'ended-session' }));
    expect(projection.inheritedContextNodeIds[0]).toBe('resume-node');
  });

  it('projects suggestion lifecycle by keeping active, bound, and materialized suggestions and excluding ignored ones', () => {
    const projection = buildSemanticSessionProjection({
      session: session(),
      suggestions: [
        { suggestionId: 'ignored', sessionId: 'session-1', source: 'ai', summary: 'ignored', status: 'ignored', createdAt: 1, updatedAt: 40 },
        { suggestionId: 'active', sessionId: 'session-1', source: 'ai', summary: 'active', status: 'active', createdAt: 2, updatedAt: 20 },
        { suggestionId: 'bound', sessionId: 'session-1', source: 'system', summary: 'bound', status: 'bound', boundNodeId: 'node-bound', createdAt: 3, updatedAt: 30 },
        { suggestionId: 'materialized', sessionId: 'session-1', source: 'ai', summary: 'materialized', status: 'materialized', materializedBlockId: 'block-1', createdAt: 4, updatedAt: 10 },
      ],
    });

    expect(projection.suggestions.map((suggestion) => suggestion.suggestionId)).toEqual(['bound', 'active', 'materialized']);
  });
});
