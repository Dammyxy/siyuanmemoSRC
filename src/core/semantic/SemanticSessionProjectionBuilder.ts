import type {
  SemanticBranchEdge,
  SemanticBranchState,
  SemanticEvent,
  SemanticIrrelevantFeedback,
  SemanticLaterEntry,
  SemanticSessionBranchProjection,
  SemanticSessionProjection,
  SemanticSessionSnapshot,
  SemanticSessionTreeNode,
  SemanticSuggestion,
} from './semanticActivationTypes';

export interface BuildSemanticSessionProjectionInput {
  session: SemanticSessionSnapshot;
  events?: SemanticEvent[];
  branchEdges?: SemanticBranchEdge[];
  branchStates?: SemanticBranchState[];
  laterEntries?: SemanticLaterEntry[];
  irrelevantFeedback?: SemanticIrrelevantFeedback[];
  suggestions?: SemanticSuggestion[];
}

function unique(values: Iterable<string | null | undefined>): string[] {
  return Array.from(new Set(Array.from(values)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)));
}

function latestTimestamp(values: Array<number | null | undefined>): number {
  return values.reduce((latest, value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
}

function buildTree(session: SemanticSessionSnapshot, edges: SemanticBranchEdge[]): SemanticSessionTreeNode[] {
  const nodes = new Map<string, SemanticSessionTreeNode>();
  const ensure = (nodeId: string): SemanticSessionTreeNode => {
    const existing = nodes.get(nodeId);
    if (existing) {
      return existing;
    }
    const created = { nodeId, childNodeIds: [], edgeIds: [] };
    nodes.set(nodeId, created);
    return created;
  };

  for (const entry of session.narrativePath) {
    ensure(entry.nodeId);
  }
  for (let index = 1; index < session.narrativePath.length; index += 1) {
    const previous = session.narrativePath[index - 1];
    const current = session.narrativePath[index];
    if (!previous || !current) {
      continue;
    }
    const parent = ensure(previous.nodeId);
    ensure(current.nodeId);
    parent.childNodeIds = unique([...parent.childNodeIds, current.nodeId]);
  }
  ensure(session.rootFocusNodeId);
  ensure(session.currentNodeId);

  for (const edge of edges) {
    const parent = ensure(edge.fromNodeId);
    ensure(edge.toNodeId);
    parent.childNodeIds = unique([...parent.childNodeIds, edge.toNodeId]);
    parent.edgeIds = unique([...parent.edgeIds, edge.edgeId]);
  }

  return Array.from(nodes.values()).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function buildBranches(edges: SemanticBranchEdge[], states: SemanticBranchState[]): SemanticSessionBranchProjection[] {
  const statesById = new Map(states.map((state) => [state.branchId, state]));
  const edgeGroups = new Map<string, SemanticBranchEdge[]>();
  for (const edge of edges) {
    edgeGroups.set(edge.branchId, [...(edgeGroups.get(edge.branchId) ?? []), edge]);
  }
  for (const state of states) {
    if (!edgeGroups.has(state.branchId)) {
      edgeGroups.set(state.branchId, []);
    }
  }

  return Array.from(edgeGroups.entries()).map(([branchId, branchEdges]) => {
    const sortedEdges = [...branchEdges].sort((a, b) => a.createdAt - b.createdAt || a.edgeId.localeCompare(b.edgeId));
    const state = statesById.get(branchId);
    const firstEdge = sortedEdges[0] ?? null;
    const lastEdge = sortedEdges[sortedEdges.length - 1] ?? null;
    const rootNodeId = state?.rootNodeId ?? firstEdge?.fromNodeId ?? '';
    const activeCursorNodeId = state?.activeCursorNodeId ?? lastEdge?.toNodeId ?? rootNodeId;
    return {
      branchId,
      rootNodeId,
      activeCursorNodeId,
      edges: sortedEdges,
      archivedAt: state?.archivedAt ?? null,
      restoredAt: state?.restoredAt ?? null,
      recentActivityAt: latestTimestamp([
        state?.updatedAt,
        state?.archivedAt,
        state?.restoredAt,
        ...sortedEdges.map((edge) => edge.createdAt),
      ]),
    };
  }).sort((a, b) => b.recentActivityAt - a.recentActivityAt || a.branchId.localeCompare(b.branchId));
}

function isArchivedBranch(branch: SemanticSessionBranchProjection): boolean {
  if (typeof branch.archivedAt !== 'number') {
    return false;
  }
  return typeof branch.restoredAt !== 'number' || branch.restoredAt < branch.archivedAt;
}

export function buildSemanticSessionProjection(input: BuildSemanticSessionProjectionInput): SemanticSessionProjection {
  const branchEdges = input.branchEdges ?? [];
  const branches = buildBranches(branchEdges, input.branchStates ?? []);
  const activeIrrelevantNodeIds = new Set((input.irrelevantFeedback ?? []).map((feedback) => feedback.nodeId));

  return {
    session: input.session,
    tree: buildTree(input.session, branchEdges),
    activePath: [...input.session.narrativePath],
    branches: branches.filter((branch) => !isArchivedBranch(branch)),
    archivedBranches: branches.filter(isArchivedBranch),
    inheritedContextNodeIds: unique([
      input.session.forkMetadata?.sourceNodeId,
      input.session.rootFocusNodeId,
      ...input.session.narrativePath.map((entry) => entry.nodeId),
    ]),
    later: (input.laterEntries ?? [])
      .filter((entry) => typeof entry.removedAt !== 'number' && !activeIrrelevantNodeIds.has(entry.nodeId))
      .sort((a, b) => b.createdAt - a.createdAt || a.entryId.localeCompare(b.entryId)),
    suggestions: (input.suggestions ?? [])
      .filter((suggestion) => suggestion.status === 'active' || suggestion.status === 'bound' || suggestion.status === 'materialized')
      .sort((a, b) => b.updatedAt - a.updatedAt || a.suggestionId.localeCompare(b.suggestionId)),
    ended: typeof input.session.endedAt === 'number',
    forkMetadata: input.session.forkMetadata ?? null,
  };
}
