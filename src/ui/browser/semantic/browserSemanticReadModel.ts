import { buildSemanticNodePresentation } from '@/core/semantic/SemanticActivationPresentation';
import type {
  SemanticCandidateColumns,
  SemanticNode,
  SemanticSessionSnapshot,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';
import type {
  BrowserSemanticReadModel,
  BrowserSemanticReadModelResult,
  BrowserSemanticStationSummary,
} from './types';

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function samePath(left: SemanticSessionSnapshot['narrativePath'], right: SemanticStation['path']): boolean {
  const stationPath = Array.isArray(right) ? right : [];
  if (left.length !== stationPath.length) {
    return false;
  }
  return left.every((entry, index) => {
    const other = stationPath[index];
    return entry.nodeId === other?.nodeId && entry.lens === other?.lens;
  });
}

function stationTitle(station: SemanticStation, nodesById: Map<string, SemanticNode>): string {
  if (station.type === 'node') {
    const nodeId = normalizeString(station.nodeId);
    return nodesById.get(nodeId)?.title || nodeId || station.stationId;
  }
  const path = Array.isArray(station.path) ? station.path : [];
  const labels = path.map((entry) => nodesById.get(entry.nodeId)?.title || entry.nodeId).filter(Boolean);
  return labels.length > 0 ? labels.join(' -> ') : station.stationId;
}

function stationPathSummary(station: SemanticStation, nodesById: Map<string, SemanticNode>): string {
  if (station.type === 'node') {
    const nodeId = normalizeString(station.nodeId);
    return nodesById.get(nodeId)?.preview || nodeId;
  }
  const path = Array.isArray(station.path) ? station.path : [];
  return path.map((entry) => nodesById.get(entry.nodeId)?.title || entry.nodeId).filter(Boolean).join(' -> ');
}

export function buildBrowserSemanticStationSummaries(input: {
  session: SemanticSessionSnapshot;
  stations: SemanticStation[];
  nodes: SemanticNode[];
}): {
  nodeStations: BrowserSemanticStationSummary[];
  pathStations: BrowserSemanticStationSummary[];
} {
  const nodesById = new Map(input.nodes.map((node) => [node.nodeId, node]));
  const activeStations = input.stations.filter((station) => (
    station.sessionId === input.session.sessionId
    && typeof station.archivedAt !== 'number'
  ));
  const summaries = activeStations.map((station) => ({
    station,
    title: stationTitle(station, nodesById),
    pathSummary: stationPathSummary(station, nodesById),
    isCurrentNode: station.type === 'node' && normalizeString(station.nodeId) === input.session.currentNodeId,
    isCurrentPath: station.type === 'path' && samePath(input.session.narrativePath, station.path),
  }));
  return {
    nodeStations: summaries.filter((summary) => summary.station.type === 'node'),
    pathStations: summaries.filter((summary) => summary.station.type === 'path'),
  };
}

export function buildBrowserSemanticReadModel(input: {
  session: SemanticSessionSnapshot;
  rootNode: SemanticNode;
  currentNode: SemanticNode;
  candidates: SemanticCandidateColumns;
  stations: SemanticStation[];
  stationNodes?: SemanticNode[];
  emptyReason?: string | null;
}): BrowserSemanticReadModelResult {
  if (!input.session || !input.rootNode || !input.currentNode) {
    return {
      status: 'unavailable',
      reason: 'session-unavailable',
      message: 'Semantic session read model is unavailable',
    };
  }
  const candidateCount = Object.values(input.candidates).reduce((total, column) => total + column.length, 0);
  const stationSummaries = buildBrowserSemanticStationSummaries({
    session: input.session,
    stations: input.stations,
    nodes: [input.rootNode, input.currentNode, ...(input.stationNodes ?? [])],
  });
  return {
    status: 'ready',
    session: input.session,
    rootNode: buildSemanticNodePresentation(input.rootNode),
    currentNode: buildSemanticNodePresentation(input.currentNode),
    path: input.session.narrativePath,
    candidates: input.candidates,
    candidateState: candidateCount > 0 ? 'ready' : 'empty',
    emptyReason: candidateCount > 0 ? null : input.emptyReason ?? 'No Semantic candidates for the current root/current node',
    ...stationSummaries,
  };
}
