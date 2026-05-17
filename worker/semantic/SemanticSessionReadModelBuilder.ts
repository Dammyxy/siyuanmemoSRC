import type {
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticBranchEdge,
  BackendSemanticCandidateColumns,
  BackendSemanticNode,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
  BackendSemanticSessionBranchProjection,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
} from '../../packages/contracts/src/backend-rpc';
import type {
  SemanticBranchEdge,
  SemanticBranchState,
  SemanticEvent,
  SemanticIrrelevantFeedback,
  SemanticLaterEntry,
  SemanticLens,
  SemanticMemoryProjection,
  SemanticRelation,
  SemanticSessionBranchProjection,
  SemanticSessionProjection,
  SemanticSessionSnapshot,
  SemanticStation,
  SemanticSuggestion,
} from '@/core/semantic/semanticActivationTypes';
import {
  buildSemanticEdgeExplanation,
  buildSemanticNodePresentation,
} from '@/core/semantic/SemanticActivationPresentation';
import { buildSemanticSessionProjection } from '@/core/semantic/SemanticSessionProjectionBuilder';

export interface SemanticSessionReadModelReader {
  getSession(sessionId: string): SemanticSessionSnapshot | null;
  findActiveSessionByRoot(rootFocusNodeId: string): SemanticSessionSnapshot | null;
  findMostRecentEndedSessionByRoot(rootFocusNodeId: string): SemanticSessionSnapshot | null;
  listEvents(sessionId: string, limit?: number): SemanticEvent[];
  listBranchEdges(sessionId: string): SemanticBranchEdge[];
  listBranchStates(sessionId: string): SemanticBranchState[];
  listLaterEntries(sessionId: string): SemanticLaterEntry[];
  listIrrelevantFeedback(sessionId: string): SemanticIrrelevantFeedback[];
  listSuggestions(sessionId: string): SemanticSuggestion[];
  listStations(sessionId: string): SemanticStation[];
  listStationsByRoot(rootFocusNodeId: string): SemanticStation[];
  getProjection(sessionId: string | null): SemanticMemoryProjection | null;
  listRelations(): SemanticRelation[];
}

export class SemanticSessionReadModelBuilder {
  constructor(private readonly reader: SemanticSessionReadModelReader | null) {}

  readBrowser(request: BackendSemanticBrowserReadRequest): BackendSemanticBrowserReadResult {
    const requestId = normalizeString(request?.requestId) || 'semantic-browser-read';
    if (!request || request.method !== 'semantic.browser.read') {
      return semanticBrowserReadFailed(requestId, 'invalid-request', 'semantic.browser.read requires request');
    }
    if (!this.reader) {
      return semanticBrowserReadFailed(requestId, 'session-unavailable', 'semantic activation repository is unavailable');
    }
    const rootFocusNodeId = normalizeString(request.rootFocusNodeId);
    const requestedSessionId = normalizeString(request.sessionId);
    if (!rootFocusNodeId && !requestedSessionId) {
      return semanticBrowserReadFailed(requestId, 'focus-unavailable', 'semantic.browser.read requires rootFocusNodeId or sessionId');
    }

    const requestedSession = requestedSessionId ? this.reader.getSession(requestedSessionId) : null;
    const activeSession = rootFocusNodeId ? this.reader.findActiveSessionByRoot(rootFocusNodeId) : null;
    const session = requestedSession ?? activeSession;
    if (!session) {
      return {
        status: 'ok',
        requestId,
        activeSession: activeSession ?? null,
        session: null,
        rootNode: rootFocusNodeId ? semanticNode(rootFocusNodeId, 'concept') : null,
        currentNode: null,
        projection: null,
        nodes: rootFocusNodeId ? [semanticPresentedNode(rootFocusNodeId, 'concept')] : [],
        selectedNode: null,
        edgeExplanations: [],
        later: [],
        suggestions: [],
        archivedBranches: [],
        candidates: emptySemanticCandidateColumns(),
        stations: [],
        stationNodes: [],
        rootScopedStations: rootFocusNodeId ? this.reader.listStationsByRoot(rootFocusNodeId) : [],
        diagnosticEventId: `semantic-browser-read:${requestId}`,
      };
    }

    const effectiveRoot = rootFocusNodeId || session.rootFocusNodeId;
    if (rootFocusNodeId && session.rootFocusNodeId !== rootFocusNodeId) {
      return semanticBrowserReadFailed(requestId, 'session-unavailable', 'semantic session root does not match requested Browser root');
    }
    const stations = this.reader.listStations(session.sessionId)
      .filter((station) => typeof station.archivedAt !== 'number');
    const rootScopedStations = this.reader.listStationsByRoot(effectiveRoot)
      .filter((station) => typeof station.archivedAt !== 'number');
    const stationNodeIds = semanticStationNodeIds(rootScopedStations);
    const projectionMemory = this.reader.getProjection(session.sessionId) ?? this.reader.getProjection(null);
    const candidates = semanticCandidateColumns(
      session,
      rootScopedStations,
      projectionMemory,
      this.reader.listRelations(),
      this.reader.listIrrelevantFeedback(session.sessionId),
    );
    const stationNodes = Array.from(stationNodeIds)
      .filter((nodeId) => nodeId !== session.rootFocusNodeId && nodeId !== session.currentNodeId)
      .map((nodeId) => semanticNode(nodeId, 'implicit-knowledge'));
    const sessionProjection = this.buildProjection(session);
    const nodeIds = semanticProjectionNodeIds(sessionProjection);
    const nodes = Array.from(nodeIds).map((nodeId) => semanticPresentedNode(nodeId, semanticNodeTypeForProjection(session, nodeId)));
    const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
    const selectedNodeId = normalizeString(request.selectedNodeId) || session.currentNodeId;

    return {
      status: 'ok',
      requestId,
      activeSession: activeSession ?? (typeof session.endedAt === 'number' ? null : session),
      session,
      rootNode: semanticNode(session.rootFocusNodeId, semanticNodeTypeForProjection(session, session.rootFocusNodeId)),
      currentNode: semanticNode(session.currentNodeId, session.currentNodeId === session.rootFocusNodeId ? 'concept' : 'implicit-knowledge'),
      projection: backendSemanticSessionProjection(sessionProjection),
      nodes,
      selectedNode: nodesById.get(selectedNodeId) ?? null,
      edgeExplanations: semanticSessionEdgeExplanations(sessionProjection),
      later: sessionProjection.later,
      suggestions: sessionProjection.suggestions,
      archivedBranches: sessionProjection.archivedBranches.map(backendSemanticBranchProjection),
      candidates,
      stations,
      stationNodes,
      rootScopedStations,
      diagnosticEventId: `semantic-browser-read:${requestId}`,
    };
  }

  readSession(request: BackendSemanticSessionReadRequest): BackendSemanticSessionReadResult {
    const requestId = normalizeString(request?.requestId) || 'semantic-session-read';
    if (!request || request.method !== 'semantic.session.read') {
      return semanticSessionReadFailed(requestId, 'invalid-request', 'semantic.session.read requires request');
    }
    if (!this.reader) {
      return semanticSessionReadFailed(requestId, 'session-unavailable', 'semantic activation repository is unavailable');
    }
    const sessionId = normalizeString(request.sessionId);
    if (!sessionId) {
      return semanticSessionReadFailed(requestId, 'session-unavailable', 'semantic.session.read requires sessionId');
    }
    const session = this.reader.getSession(sessionId);
    if (!session) {
      return semanticSessionReadFailed(requestId, 'session-unavailable', `semantic session not found: ${sessionId}`);
    }

    const projection = this.buildProjection(session);
    const nodeIds = semanticProjectionNodeIds(projection);
    const nodes = Array.from(nodeIds).map((nodeId) => semanticPresentedNode(nodeId, semanticNodeTypeForProjection(session, nodeId)));

    return {
      status: 'ok',
      requestId,
      projection: backendSemanticSessionProjection(projection),
      nodes,
      diagnosticEventId: `semantic-session-read:${requestId}`,
    };
  }

  readSidebar(request: BackendSemanticSidebarReadRequest): BackendSemanticSidebarReadResult {
    const requestId = normalizeString(request?.requestId) || 'semantic-sidebar-read';
    if (!request || request.method !== 'semantic.sidebar.read') {
      return semanticSidebarReadFailed(requestId, 'invalid-request', 'semantic.sidebar.read requires request');
    }
    if (!this.reader) {
      return semanticSidebarReadFailed(requestId, 'session-unavailable', 'semantic activation repository is unavailable');
    }
    const requestedSessionId = normalizeString(request.sessionId);
    const rootFocusNodeId = normalizeString(request.rootFocusNodeId || request.currentNodeId);
    const bindingMode = request.bindingMode === 'pinned-session' ? 'pinned-session' : 'follow-current';
    if (bindingMode === 'pinned-session' && !requestedSessionId) {
      return semanticSidebarReadFailed(requestId, 'session-unavailable', 'semantic.sidebar.read pinned-session requires sessionId');
    }
    if (bindingMode === 'follow-current' && !rootFocusNodeId) {
      return {
        status: 'ok',
        requestId,
        model: {
          bindingState: { type: 'current-node-unavailable', reason: 'missing-root' },
          session: null,
          recentEndedSession: null,
          currentNode: null,
          activePath: [],
          activePathNodes: [],
          branches: [],
          candidates: emptySemanticCandidateColumns(),
          edgeExplanations: [],
          later: [],
          suggestions: [],
          nodes: [],
        },
        diagnosticEventId: `semantic-sidebar-read:${requestId}`,
      };
    }

    const session = requestedSessionId
      ? this.reader.getSession(requestedSessionId)
      : this.reader.findActiveSessionByRoot(rootFocusNodeId);
    if (!session) {
      const rootNode = rootFocusNodeId ? semanticPresentedNode(rootFocusNodeId, 'real-review-card') : null;
      const recentEndedSession = !requestedSessionId && rootFocusNodeId
        ? this.reader.findMostRecentEndedSessionByRoot(rootFocusNodeId)
        : null;
      return {
        status: 'ok',
        requestId,
        model: {
          bindingState: requestedSessionId
            ? { type: 'pinned-session', sessionId: requestedSessionId }
            : { type: 'follow-current', rootFocusNodeId },
          session: null,
          recentEndedSession,
          currentNode: rootNode,
          activePath: [],
          activePathNodes: rootNode ? [rootNode] : [],
          branches: [],
          candidates: emptySemanticCandidateColumns(),
          edgeExplanations: [],
          later: [],
          suggestions: [],
          nodes: rootNode ? [rootNode] : [],
        },
        diagnosticEventId: `semantic-sidebar-read:${requestId}`,
      };
    }

    const projection = this.buildProjection(session);
    const stationScope = this.reader.listStationsByRoot(session.rootFocusNodeId)
      .filter((station) => typeof station.archivedAt !== 'number');
    const projectionMemory = this.reader.getProjection(session.sessionId) ?? this.reader.getProjection(null);
    const candidates = semanticCandidateColumns(
      session,
      stationScope,
      projectionMemory,
      this.reader.listRelations(),
      this.reader.listIrrelevantFeedback(session.sessionId),
    );
    const nodeIds = semanticProjectionNodeIds(projection);
    const nodes = Array.from(nodeIds).map((nodeId) => semanticPresentedNode(nodeId, semanticNodeTypeForProjection(session, nodeId)));
    const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
    const activePathNodes = projection.activePath
      .map((entry) => nodesById.get(entry.nodeId) ?? semanticPresentedNode(entry.nodeId, semanticNodeTypeForProjection(session, entry.nodeId)));

    return {
      status: 'ok',
      requestId,
      model: {
        bindingState: requestedSessionId
          ? { type: 'pinned-session', sessionId: session.sessionId }
          : { type: 'follow-current', rootFocusNodeId: session.rootFocusNodeId },
        session,
        recentEndedSession: null,
        currentNode: nodesById.get(session.currentNodeId) ?? semanticPresentedNode(session.currentNodeId, semanticNodeTypeForProjection(session, session.currentNodeId)),
        activePath: projection.activePath,
        activePathNodes,
        branches: projection.branches.map(backendSemanticBranchProjection),
        candidates,
        edgeExplanations: semanticSessionEdgeExplanations(projection),
        later: projection.later,
        suggestions: projection.suggestions,
        nodes,
      },
      diagnosticEventId: `semantic-sidebar-read:${requestId}`,
    };
  }

  private buildProjection(session: SemanticSessionSnapshot): SemanticSessionProjection {
    return buildSemanticSessionProjection({
      session,
      events: this.reader?.listEvents(session.sessionId, 5000) ?? [],
      branchEdges: this.reader?.listBranchEdges(session.sessionId) ?? [],
      branchStates: this.reader?.listBranchStates(session.sessionId) ?? [],
      laterEntries: this.reader?.listLaterEntries(session.sessionId) ?? [],
      irrelevantFeedback: this.reader?.listIrrelevantFeedback(session.sessionId) ?? [],
      suggestions: this.reader?.listSuggestions(session.sessionId) ?? [],
    });
  }
}

function emptySemanticCandidateColumns(): BackendSemanticCandidateColumns {
  return {
    assimilation: [],
    accommodation: [],
    free: [],
  };
}

function semanticNode(nodeId: string, nodeType: BackendSemanticNode['nodeType']): BackendSemanticNode {
  return {
    nodeId,
    nodeType,
    title: nodeId,
    preview: nodeId,
    location: {
      blockId: nodeId,
      breadcrumb: [],
      backlinkBlockIds: [],
    },
  };
}

function semanticPresentedNode(nodeId: string, nodeType: BackendSemanticNode['nodeType']): BackendSemanticNode {
  const node = semanticNode(nodeId, nodeType);
  return {
    ...node,
    presentation: buildSemanticNodePresentation({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      title: node.title,
      preview: node.preview,
      location: node.location,
    }),
  };
}

function normalizeSemanticNodeType(value: unknown): BackendSemanticNode['nodeType'] | null {
  const nodeType = normalizeString(value);
  return nodeType === 'real-review-card' || nodeType === 'implicit-knowledge' || nodeType === 'concept'
    ? nodeType
    : null;
}

function semanticNodeTypeForProjection(session: SemanticSessionSnapshot, nodeId: string): BackendSemanticNode['nodeType'] {
  if (nodeId === session.rootFocusNodeId) {
    return normalizeSemanticNodeType(session.rootFocusNodeType) ?? 'concept';
  }
  return 'real-review-card';
}

function semanticProjectionNodeIds(projection: SemanticSessionProjection): Set<string> {
  const nodeIds = new Set<string>();
  nodeIds.add(projection.session.rootFocusNodeId);
  nodeIds.add(projection.session.currentNodeId);
  for (const entry of projection.activePath) {
    nodeIds.add(entry.nodeId);
  }
  for (const branch of [...projection.branches, ...projection.archivedBranches]) {
    nodeIds.add(branch.rootNodeId);
    nodeIds.add(branch.activeCursorNodeId);
    for (const edge of branch.edges) {
      nodeIds.add(edge.fromNodeId);
      nodeIds.add(edge.toNodeId);
    }
  }
  for (const entry of projection.later) {
    nodeIds.add(entry.nodeId);
  }
  for (const suggestion of projection.suggestions) {
    const boundNodeId = normalizeString(suggestion.boundNodeId);
    const targetNodeId = normalizeString(suggestion.targetNodeId);
    const materializedBlockId = normalizeString(suggestion.materializedBlockId);
    if (boundNodeId) {
      nodeIds.add(boundNodeId);
    }
    if (targetNodeId) {
      nodeIds.add(targetNodeId);
    }
    if (materializedBlockId) {
      nodeIds.add(materializedBlockId);
    }
  }
  return nodeIds;
}

function backendSemanticBranchProjection(branch: SemanticSessionBranchProjection): BackendSemanticSessionBranchProjection {
  return {
    ...branch,
    edges: branch.edges.map(backendSemanticBranchEdge),
  };
}

function backendSemanticBranchEdge(edge: SemanticBranchEdge): BackendSemanticBranchEdge {
  return {
    ...edge,
    lens: edge.lens,
  };
}

function backendSemanticSessionProjection(projection: SemanticSessionProjection): NonNullable<Extract<BackendSemanticSessionReadResult, { status: 'ok' }>['projection']> {
  return {
    ...projection,
    branches: projection.branches.map(backendSemanticBranchProjection),
    archivedBranches: projection.archivedBranches.map(backendSemanticBranchProjection),
  };
}

function semanticSessionEdgeExplanations(projection: SemanticSessionProjection): ReturnType<typeof buildSemanticEdgeExplanation>[] {
  const explanations = new Map<string, ReturnType<typeof buildSemanticEdgeExplanation>>();
  for (const branch of [...projection.branches, ...projection.archivedBranches]) {
    for (const edge of branch.edges) {
      const explanation = edge.explanation ?? buildSemanticEdgeExplanation({
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        lens: edge.lens,
        primaryExplanation: 'Semantic traversal',
        reasonTags: [edge.lens],
        evidence: [{ eventId: edge.edgeId, label: 'branch-edge' }],
        createdBy: edge.createdBy,
        createdAt: edge.createdAt,
      });
      explanations.set(`${edge.fromNodeId}->${edge.toNodeId}:${edge.lens}:${edge.createdAt}`, explanation);
    }
  }
  for (let index = 1; index < projection.activePath.length; index += 1) {
    const previous = projection.activePath[index - 1];
    const current = projection.activePath[index];
    if (!previous || !current) {
      continue;
    }
    const key = `${previous.nodeId}->${current.nodeId}:${current.lens}:${current.visitedAt}`;
    if (explanations.has(key)) {
      continue;
    }
    explanations.set(key, buildSemanticEdgeExplanation({
      fromNodeId: previous.nodeId,
      toNodeId: current.nodeId,
      lens: current.lens,
      primaryExplanation: 'Semantic path step',
      reasonTags: [current.lens],
      evidence: [{ eventId: current.eventId, label: 'path-event' }],
      createdBy: { kind: 'system', id: 'semantic-session', label: 'session path' },
      createdAt: current.visitedAt,
    }));
  }
  return Array.from(explanations.values()).sort((left, right) => left.createdAt - right.createdAt);
}

function semanticStationNodeIds(stations: SemanticStation[]): Set<string> {
  const nodeIds = new Set<string>();
  for (const station of stations) {
    const nodeId = normalizeString(station.nodeId);
    if (nodeId) {
      nodeIds.add(nodeId);
    }
    for (const entry of station.path ?? []) {
      const pathNodeId = normalizeString(entry.nodeId);
      if (pathNodeId) {
        nodeIds.add(pathNodeId);
      }
    }
  }
  return nodeIds;
}

function semanticCandidateColumns(
  session: SemanticSessionSnapshot,
  stations: SemanticStation[],
  projection: SemanticMemoryProjection | null,
  relations: SemanticRelation[],
  irrelevantFeedback: Array<{ nodeId: string; rootFocusNodeId?: string | null; scope?: string | null }> = [],
): BackendSemanticCandidateColumns {
  const columns = emptySemanticCandidateColumns();
  const blocked = new Set([
    session.rootFocusNodeId,
    session.currentNodeId,
    ...irrelevantFeedback
      .filter((feedback) => feedback.scope !== 'root' || !feedback.rootFocusNodeId || feedback.rootFocusNodeId === session.rootFocusNodeId)
      .map((feedback) => feedback.nodeId),
  ].filter(Boolean));
  const pushCandidate = (
    lens: SemanticLens,
    nodeId: string,
    score: number,
    code: BackendSemanticCandidateColumns[SemanticLens][number]['reasons'][number]['code'],
    explanation: Record<string, unknown>,
  ): void => {
    const normalized = normalizeString(nodeId);
    if (!normalized || blocked.has(normalized) || columns[lens].some((candidate) => candidate.candidateId === normalized)) {
      return;
    }
    const node = semanticNode(normalized, 'real-review-card');
    const presentation = buildSemanticNodePresentation({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      title: node.title,
      preview: node.preview,
      location: node.location,
    });
    if (presentation.availability.status !== 'available') {
      return;
    }
    columns[lens].push({
      candidateId: normalized,
      node: {
        ...node,
        presentation,
      },
      score: Math.max(0, Math.min(1, Number(score) || 0)),
      lens,
      reasons: [{ code, weight: Math.max(0, Math.min(1, Number(score) || 0)) }],
      explanation,
    });
  };

  for (const memory of projection?.nodeMemory ?? []) {
    pushCandidate('assimilation', memory.nodeId, Math.max(memory.oldKnowledgeScore, memory.semanticFamiliarity), 'memory-projection', {
      source: 'memory-projection',
    });
    pushCandidate('accommodation', memory.nodeId, Math.max(memory.novelty, memory.tension), memory.tension >= memory.novelty ? 'tension' : 'novelty', {
      source: 'memory-projection',
    });
    pushCandidate('free', memory.nodeId, Math.max(memory.manualBoost, memory.semanticFamiliarity, memory.novelty), 'free-association', {
      source: 'memory-projection',
    });
  }

  for (const station of stations) {
    if (typeof station.archivedAt === 'number') {
      continue;
    }
    if (station.type === 'node') {
      pushCandidate('assimilation', station.nodeId ?? '', 1, 'station-boost', {
        stationId: station.stationId,
        stationType: station.type,
      });
      pushCandidate('free', station.nodeId ?? '', 0.82, 'station-boost', {
        stationId: station.stationId,
        stationType: station.type,
      });
      continue;
    }
    for (const entry of station.path ?? []) {
      pushCandidate(entry.lens, entry.nodeId, 0.82, 'station-boost', {
        stationId: station.stationId,
        stationType: station.type,
      });
    }
  }

  for (const relation of relations) {
    if (relation.decision !== 'accepted') {
      continue;
    }
    const fromNodeId = normalizeString(relation.fromNodeId);
    const toNodeId = normalizeString(relation.toNodeId);
    const relatedFrom = fromNodeId === session.currentNodeId || fromNodeId === session.rootFocusNodeId;
    const relatedTo = toNodeId === session.currentNodeId || toNodeId === session.rootFocusNodeId;
    if (!relatedFrom && !relatedTo) {
      continue;
    }
    const candidateNodeId = relatedFrom ? toNodeId : fromNodeId;
    pushCandidate('accommodation', candidateNodeId, relation.confidence, 'accepted-ai-relation', {
      relationId: relation.relationId,
      source: relation.source,
    });
    pushCandidate('free', candidateNodeId, relation.confidence, 'accepted-ai-relation', {
      relationId: relation.relationId,
      source: relation.source,
    });
  }

  for (const lens of ['assimilation', 'accommodation', 'free'] as const) {
    columns[lens].sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
  }
  return columns;
}

function semanticBrowserReadFailed(
  requestId: string,
  unavailableReason: Extract<BackendSemanticBrowserReadResult, { status: 'unavailable' | 'failed' }>['unavailableReason'],
  message: string,
): BackendSemanticBrowserReadResult {
  return {
    status: unavailableReason === 'failed' ? 'failed' : 'unavailable',
    unavailableReason,
    message,
    diagnosticEventId: `semantic-browser-read-failed:${requestId}`,
  };
}

function semanticSessionReadFailed(
  requestId: string,
  unavailableReason: Extract<BackendSemanticSessionReadResult, { status: 'unavailable' | 'failed' }>['unavailableReason'],
  message: string,
): BackendSemanticSessionReadResult {
  return {
    status: unavailableReason === 'failed' ? 'failed' : 'unavailable',
    unavailableReason,
    message,
    diagnosticEventId: `semantic-session-read-failed:${requestId}`,
  };
}

function semanticSidebarReadFailed(
  requestId: string,
  unavailableReason: Extract<BackendSemanticSidebarReadResult, { status: 'unavailable' | 'failed' }>['unavailableReason'],
  message: string,
): BackendSemanticSidebarReadResult {
  return {
    status: unavailableReason === 'failed' ? 'failed' : 'unavailable',
    unavailableReason,
    message,
    diagnosticEventId: `semantic-sidebar-read-failed:${requestId}`,
  };
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}
