import type {
  SemanticEdgeMemoryProjection,
  SemanticEvent,
  SemanticMemoryProjection,
  SemanticNodeMemoryProjection,
  SemanticRelation,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';

export interface BuildSemanticMemoryProjectionInput {
  sessionId?: string | null;
  events: SemanticEvent[];
  stations?: SemanticStation[];
  relations?: SemanticRelation[];
  oldModeManualBoosts?: SemanticOldModeManualBoostEvidence[];
  rebuiltAt?: number;
}

export interface SemanticOldModeManualBoostEvidence {
  nodeId: string;
  source: 'orbit-seed' | 'orbit-anchor' | 'hyperspace-source' | 'hyperspace-anchor';
  weight?: number;
}

interface NodeAccumulator {
  nodeId: string;
  visits: number;
  implicitActions: number;
  stations: number;
  pathStations: number;
  oldModeBoost: number;
  acceptedRelations: number;
  rejectedRelations: number;
  irrelevantMarks: number;
  accommodationVisits: number;
  lastProjectedAt: number;
}

interface EdgeAccumulator {
  fromNodeId: string;
  toNodeId: string;
  traversals: number;
  pathStations: number;
  acceptedConfidence: number;
  rejectedRelations: number;
  manualRelations: number;
  lastProjectedAt: number;
}

const SEMANTIC_MEMORY_PROJECTION_VERSION = 1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function edgeKey(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId}\u001f${toNodeId}`;
}

function ensureNode(nodes: Map<string, NodeAccumulator>, nodeId: string, projectedAt: number): NodeAccumulator {
  const normalized = normalizeString(nodeId);
  let node = nodes.get(normalized);
  if (!node) {
    node = {
      nodeId: normalized,
      visits: 0,
      implicitActions: 0,
      stations: 0,
      pathStations: 0,
      oldModeBoost: 0,
      acceptedRelations: 0,
      rejectedRelations: 0,
      irrelevantMarks: 0,
      accommodationVisits: 0,
      lastProjectedAt: projectedAt,
    };
    nodes.set(normalized, node);
  }
  node.lastProjectedAt = Math.max(node.lastProjectedAt, projectedAt);
  return node;
}

function ensureEdge(
  edges: Map<string, EdgeAccumulator>,
  nodes: Map<string, NodeAccumulator>,
  fromNodeId: string,
  toNodeId: string,
  projectedAt: number,
): EdgeAccumulator {
  const from = normalizeString(fromNodeId);
  const to = normalizeString(toNodeId);
  ensureNode(nodes, from, projectedAt);
  ensureNode(nodes, to, projectedAt);
  const key = edgeKey(from, to);
  let edge = edges.get(key);
  if (!edge) {
    edge = {
      fromNodeId: from,
      toNodeId: to,
      traversals: 0,
      pathStations: 0,
      acceptedConfidence: 0,
      rejectedRelations: 0,
      manualRelations: 0,
      lastProjectedAt: projectedAt,
    };
    edges.set(key, edge);
  }
  edge.lastProjectedAt = Math.max(edge.lastProjectedAt, projectedAt);
  return edge;
}

function sortedNodes(nodes: Map<string, NodeAccumulator>, rebuiltAt: number): SemanticNodeMemoryProjection[] {
  return Array.from(nodes.values())
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .map((node) => {
      const semanticFamiliarity = clamp01(
        node.visits * 0.18
        + node.implicitActions * 0.05
        + node.acceptedRelations * 0.16
        + node.stations * 0.24
        + node.pathStations * 0.12,
      );
      const manualBoost = clamp01(node.stations * 0.55 + node.pathStations * 0.22 + node.oldModeBoost);
      const instability = clamp01(node.rejectedRelations * 0.2 + node.irrelevantMarks * 0.35);
      const tension = clamp01(
        node.accommodationVisits * 0.12
        + node.rejectedRelations * 0.22
        + node.irrelevantMarks * 0.28,
      );
      return {
        nodeId: node.nodeId,
        oldKnowledgeScore: clamp01(
          semanticFamiliarity
          + manualBoost * 0.35
          + node.oldModeBoost * 0.45
          - instability * 0.15,
        ),
        semanticFamiliarity,
        manualBoost,
        novelty: clamp01(1 - semanticFamiliarity + instability * 0.15),
        instability,
        tension,
        lastProjectedAt: node.lastProjectedAt || rebuiltAt,
      };
    });
}

function oldModeManualBoostWeight(evidence: SemanticOldModeManualBoostEvidence): number {
  if (Number.isFinite(Number(evidence.weight))) {
    return clamp01(Number(evidence.weight));
  }
  return evidence.source === 'orbit-anchor' || evidence.source === 'hyperspace-anchor'
    ? 0.32
    : 0.24;
}

function sortedEdges(edges: Map<string, EdgeAccumulator>, rebuiltAt: number): SemanticEdgeMemoryProjection[] {
  return Array.from(edges.values())
    .sort((left, right) => (
      left.fromNodeId.localeCompare(right.fromNodeId)
      || left.toNodeId.localeCompare(right.toNodeId)
    ))
    .map((edge) => {
      const relationConfidence = clamp01(
        edge.traversals * 0.16
        + edge.acceptedConfidence
        + edge.pathStations * 0.18
        - edge.rejectedRelations * 0.25,
      );
      const tension = clamp01(edge.rejectedRelations * 0.35 + Math.max(0, edge.traversals - edge.acceptedConfidence) * 0.03);
      return {
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        relationConfidence,
        traversalCount: edge.traversals,
        manualBoost: clamp01(edge.pathStations * 0.3 + edge.manualRelations * 0.25),
        tension,
        lastProjectedAt: edge.lastProjectedAt || rebuiltAt,
      };
    });
}

export function buildSemanticMemoryProjection(
  input: BuildSemanticMemoryProjectionInput,
): SemanticMemoryProjection {
  const rebuiltAt = Number.isFinite(Number(input.rebuiltAt)) ? Number(input.rebuiltAt) : Date.now();
  const nodes = new Map<string, NodeAccumulator>();
  const edges = new Map<string, EdgeAccumulator>();

  for (const event of input.events) {
    const projectedAt = Number.isFinite(Number(event.occurredAt)) ? Number(event.occurredAt) : rebuiltAt;
    const nodeId = normalizeString(event.nodeId);
    if (nodeId) {
      const node = ensureNode(nodes, nodeId, projectedAt);
      if (event.type === 'node-visited' || event.type === 'session-started') {
        node.visits += 1;
        if (event.lens === 'accommodation') {
          node.accommodationVisits += 1;
        }
      } else if (event.type === 'implicit-node-action') {
        node.implicitActions += 1;
      } else if (event.type === 'node-marked-irrelevant') {
        node.irrelevantMarks += 1;
      }
    }
    const fromNodeId = normalizeString(event.fromNodeId);
    const toNodeId = normalizeString(event.toNodeId);
    if (event.type === 'edge-traversed' && fromNodeId && toNodeId) {
      ensureEdge(edges, nodes, fromNodeId, toNodeId, projectedAt).traversals += 1;
    }
  }

  for (const station of input.stations ?? []) {
    if (typeof station.archivedAt === 'number') {
      continue;
    }
    const projectedAt = Number.isFinite(Number(station.createdAt)) ? Number(station.createdAt) : rebuiltAt;
    if (station.type === 'node') {
      const nodeId = normalizeString(station.nodeId);
      if (nodeId) {
        ensureNode(nodes, nodeId, projectedAt).stations += 1;
      }
      continue;
    }
    const path = Array.isArray(station.path) ? station.path : [];
    for (const entry of path) {
      const nodeId = normalizeString(entry.nodeId);
      if (nodeId) {
        ensureNode(nodes, nodeId, projectedAt).pathStations += 1;
      }
    }
    for (let index = 1; index < path.length; index += 1) {
      const fromNodeId = normalizeString(path[index - 1]?.nodeId);
      const toNodeId = normalizeString(path[index]?.nodeId);
      if (fromNodeId && toNodeId) {
        ensureEdge(edges, nodes, fromNodeId, toNodeId, projectedAt).pathStations += 1;
      }
    }
  }

  for (const evidence of input.oldModeManualBoosts ?? []) {
    const nodeId = normalizeString(evidence.nodeId);
    if (!nodeId) {
      continue;
    }
    ensureNode(nodes, nodeId, rebuiltAt).oldModeBoost += oldModeManualBoostWeight(evidence);
  }

  for (const relation of input.relations ?? []) {
    const projectedAt = Number.isFinite(Number(relation.decidedAt)) ? Number(relation.decidedAt) : rebuiltAt;
    const fromNodeId = normalizeString(relation.fromNodeId);
    const toNodeId = normalizeString(relation.toNodeId);
    if (!fromNodeId || !toNodeId) {
      continue;
    }
    const edge = ensureEdge(edges, nodes, fromNodeId, toNodeId, projectedAt);
    const fromNode = ensureNode(nodes, fromNodeId, projectedAt);
    const toNode = ensureNode(nodes, toNodeId, projectedAt);
    if (relation.decision === 'accepted') {
      const confidence = clamp01(Number(relation.confidence));
      edge.acceptedConfidence += confidence;
      if (relation.source === 'manual') {
        edge.manualRelations += 1;
      }
      fromNode.acceptedRelations += 1;
      toNode.acceptedRelations += 1;
    } else if (relation.decision === 'rejected') {
      edge.rejectedRelations += 1;
      fromNode.rejectedRelations += 1;
      toNode.rejectedRelations += 1;
    }
  }

  return {
    version: SEMANTIC_MEMORY_PROJECTION_VERSION,
    sessionId: normalizeString(input.sessionId) || null,
    nodeMemory: sortedNodes(nodes, rebuiltAt),
    edgeMemory: sortedEdges(edges, rebuiltAt),
    rebuiltAt,
  };
}
