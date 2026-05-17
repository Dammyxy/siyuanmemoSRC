import { describe, expect, it } from 'vitest';
import {
  SemanticSessionReadModelBuilder,
  type SemanticSessionReadModelReader,
} from '../SemanticSessionReadModelBuilder';
import type {
  SemanticBranchEdge,
  SemanticBranchState,
  SemanticEvent,
  SemanticIrrelevantFeedback,
  SemanticLaterEntry,
  SemanticMemoryProjection,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticStation,
  SemanticSuggestion,
} from '@/core/semantic/semanticActivationTypes';

function session(overrides: Partial<SemanticSessionSnapshot> = {}): SemanticSessionSnapshot {
  return {
    sessionId: 'session-1',
    rootFocusNodeId: 'root-1',
    rootFocusNodeType: 'concept',
    currentNodeId: 'node-2',
    activeLens: 'assimilation',
    narrativePath: [
      { nodeId: 'root-1', lens: 'assimilation', eventId: 'event-root', visitedAt: 1 },
      { nodeId: 'node-2', lens: 'assimilation', eventId: 'event-node-2', visitedAt: 2 },
    ],
    startedAt: 1,
    endedAt: null,
    ...overrides,
  };
}

function reader(input: {
  sessions?: SemanticSessionSnapshot[];
  activeByRoot?: Record<string, string>;
  endedByRoot?: Record<string, SemanticSessionSnapshot>;
  events?: SemanticEvent[];
  branchEdges?: SemanticBranchEdge[];
  branchStates?: SemanticBranchState[];
  laterEntries?: SemanticLaterEntry[];
  irrelevantFeedback?: SemanticIrrelevantFeedback[];
  suggestions?: SemanticSuggestion[];
  stations?: SemanticStation[];
  rootStations?: SemanticStation[];
  projection?: SemanticMemoryProjection | null;
  relations?: SemanticRelation[];
} = {}): SemanticSessionReadModelReader {
  const sessions = new Map((input.sessions ?? []).map((item) => [item.sessionId, item]));
  return {
    getSession: (sessionId) => sessions.get(sessionId) ?? null,
    findActiveSessionByRoot: (rootFocusNodeId) => {
      const sessionId = input.activeByRoot?.[rootFocusNodeId];
      return sessionId ? sessions.get(sessionId) ?? null : null;
    },
    findMostRecentEndedSessionByRoot: (rootFocusNodeId) => input.endedByRoot?.[rootFocusNodeId] ?? null,
    listEvents: () => input.events ?? [],
    listBranchEdges: () => input.branchEdges ?? [],
    listBranchStates: () => input.branchStates ?? [],
    listLaterEntries: () => input.laterEntries ?? [],
    listIrrelevantFeedback: () => input.irrelevantFeedback ?? [],
    listSuggestions: () => input.suggestions ?? [],
    listStations: () => input.stations ?? [],
    listStationsByRoot: () => input.rootStations ?? [],
    getProjection: () => input.projection ?? null,
    listRelations: () => input.relations ?? [],
  };
}

describe('SemanticSessionReadModelBuilder', () => {
  it('returns a Browser empty read model without bare id primary labels when no session exists', () => {
    const builder = new SemanticSessionReadModelBuilder(reader());

    const result = builder.readBrowser({
      method: 'semantic.browser.read',
      requestId: 'browser-empty',
      callerIntent: 'test',
      rootFocusNodeId: 'root-1',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.session).toBeNull();
    expect(result.rootNode?.nodeId).toBe('root-1');
    expect(result.nodes[0]?.presentation?.displayTitle).toBe('Content unavailable');
    expect(result.candidates.assimilation).toEqual([]);
  });

  it('keeps Browser selected node local to the read request', () => {
    const active = session();
    const builder = new SemanticSessionReadModelBuilder(reader({
      sessions: [active],
      activeByRoot: { 'root-1': active.sessionId },
      branchEdges: [{
        edgeId: 'edge-1',
        sessionId: active.sessionId,
        branchId: 'branch-1',
        fromNodeId: 'node-2',
        toNodeId: 'node-3',
        lens: 'free',
        explanation: null,
        createdBy: { kind: 'user' },
        createdAt: 3,
        forkMetadata: null,
      }],
    }));

    const result = builder.readBrowser({
      method: 'semantic.browser.read',
      requestId: 'browser-selected',
      callerIntent: 'test',
      rootFocusNodeId: 'root-1',
      selectedNodeId: 'node-3',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.session?.currentNodeId).toBe('node-2');
    expect(result.selectedNode?.nodeId).toBe('node-3');
    expect(result.edgeExplanations.some((edge) => edge.toNodeId === 'node-3')).toBe(true);
  });

  it('returns current-node-unavailable for Sidebar follow-current reads without a root', () => {
    const builder = new SemanticSessionReadModelBuilder(reader());

    const result = builder.readSidebar({
      method: 'semantic.sidebar.read',
      requestId: 'sidebar-missing-root',
      callerIntent: 'test',
      bindingMode: 'follow-current',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.model.bindingState).toEqual({ type: 'current-node-unavailable', reason: 'missing-root' });
    expect(result.model.session).toBeNull();
  });

  it('returns an empty pinned Sidebar model when a requested session is absent', () => {
    const builder = new SemanticSessionReadModelBuilder(reader());

    const result = builder.readSidebar({
      method: 'semantic.sidebar.read',
      requestId: 'sidebar-pinned-missing',
      callerIntent: 'test',
      bindingMode: 'pinned-session',
      sessionId: 'missing-session',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.model.bindingState).toEqual({ type: 'pinned-session', sessionId: 'missing-session' });
    expect(result.model.session).toBeNull();
    expect(result.model.candidates.free).toEqual([]);
  });

  it('builds Sidebar active path, filters unreadable candidates, and returns later, suggestions, and edge explanations from owner state', () => {
    const active = session();
    const builder = new SemanticSessionReadModelBuilder(reader({
      sessions: [active],
      activeByRoot: { 'root-1': active.sessionId },
      projection: {
        version: 1,
        sessionId: active.sessionId,
        nodeMemory: [{
          nodeId: 'candidate-1',
          oldKnowledgeScore: 0.8,
          semanticFamiliarity: 0.2,
          manualBoost: 0.1,
          novelty: 0.3,
          instability: 0,
          tension: 0.4,
          lastProjectedAt: 4,
        }],
        edgeMemory: [],
        rebuiltAt: 4,
      },
      laterEntries: [{
        entryId: 'later-1',
        sessionId: active.sessionId,
        nodeId: 'later-node',
        createdAt: 5,
        removedAt: null,
      }],
      suggestions: [{
        suggestionId: 'suggestion-1',
        sessionId: active.sessionId,
        source: 'ai',
        summary: 'Add related note',
        status: 'active',
        targetNodeId: 'candidate-1',
        createdAt: 6,
        updatedAt: 6,
      }],
    }));

    const result = builder.readSidebar({
      method: 'semantic.sidebar.read',
      requestId: 'sidebar-active',
      callerIntent: 'test',
      bindingMode: 'follow-current',
      currentNodeId: 'root-1',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.model.activePathNodes.map((node) => node.nodeId)).toEqual(['root-1', 'node-2']);
    expect(result.model.candidates.assimilation).toEqual([]);
    expect(result.model.edgeExplanations[0]).toMatchObject({ fromNodeId: 'root-1', toNodeId: 'node-2' });
    expect(result.model.later[0]?.nodeId).toBe('later-node');
    expect(result.model.suggestions[0]?.suggestionId).toBe('suggestion-1');
  });

  it('surfaces recent ended sessions without auto-creating a Sidebar session', () => {
    const ended = session({ sessionId: 'ended-session', endedAt: 10 });
    const builder = new SemanticSessionReadModelBuilder(reader({
      endedByRoot: { 'root-1': ended },
    }));

    const result = builder.readSidebar({
      method: 'semantic.sidebar.read',
      requestId: 'sidebar-ended',
      callerIntent: 'test',
      bindingMode: 'follow-current',
      currentNodeId: 'root-1',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    expect(result.model.session).toBeNull();
    expect(result.model.recentEndedSession?.sessionId).toBe('ended-session');
  });
});
