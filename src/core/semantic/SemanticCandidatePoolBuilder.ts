import type {
  SemanticCandidateSource,
  SemanticMemoryProjection,
  SemanticRelation,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';

export interface BuildSemanticCandidatePoolInput {
  currentNodeId: string;
  rootFocusNodeId: string;
  graphSources?: SemanticCandidateSource[];
  projection?: SemanticMemoryProjection | null;
  stations?: SemanticStation[];
  relations?: SemanticRelation[];
  defaultNodeIds?: string[];
  includeStructuralRelations?: boolean;
}

export interface SemanticCandidatePool {
  candidateNodeIds: string[];
  sources: SemanticCandidateSource[];
  sourcesByNodeId: Record<string, SemanticCandidateSource[]>;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function sourceKey(source: SemanticCandidateSource): string {
  return [
    source.nodeId,
    source.relatedToNodeId,
    source.scope,
    source.relationType,
    source.structural ? 'structural' : 'semantic',
  ].join('\u001f');
}

function createSource(input: {
  nodeId: string;
  relatedToNodeId: string;
  scope: SemanticCandidateSource['scope'];
  relationType: string;
  weight: number;
  structural?: boolean;
  evidence?: Record<string, unknown>;
}): SemanticCandidateSource {
  return {
    nodeId: normalizeString(input.nodeId),
    relatedToNodeId: normalizeString(input.relatedToNodeId),
    scope: input.scope,
    relationType: normalizeString(input.relationType) || input.scope,
    weight: clamp01(input.weight),
    structural: input.structural === true,
    evidence: input.evidence ?? {},
  };
}

export function buildSemanticCandidatePool(input: BuildSemanticCandidatePoolInput): SemanticCandidatePool {
  const currentNodeId = normalizeString(input.currentNodeId);
  const rootFocusNodeId = normalizeString(input.rootFocusNodeId);
  const blockedNodeIds = new Set([currentNodeId, rootFocusNodeId].filter(Boolean));
  const sourcesByKey = new Map<string, SemanticCandidateSource>();

  const addSource = (source: SemanticCandidateSource): void => {
    const nodeId = normalizeString(source.nodeId);
    const relatedToNodeId = normalizeString(source.relatedToNodeId);
    if (!nodeId || blockedNodeIds.has(nodeId)) {
      return;
    }
    if (source.structural && !input.includeStructuralRelations) {
      return;
    }
    const normalized = {
      ...source,
      nodeId,
      relatedToNodeId,
      weight: clamp01(Number(source.weight)),
      relationType: normalizeString(source.relationType) || source.scope,
      evidence: source.evidence ?? {},
    };
    const key = sourceKey(normalized);
    const previous = sourcesByKey.get(key);
    if (!previous || normalized.weight > previous.weight) {
      sourcesByKey.set(key, normalized);
    }
  };

  for (const source of input.graphSources ?? []) {
    addSource(source);
  }

  for (const node of input.projection?.nodeMemory ?? []) {
    const strength = Math.max(
      clamp01(node.oldKnowledgeScore),
      clamp01(node.semanticFamiliarity),
      clamp01(node.manualBoost),
      clamp01(node.novelty),
      clamp01(node.tension),
    );
    if (strength > 0) {
      addSource(createSource({
        nodeId: node.nodeId,
        relatedToNodeId: currentNodeId || rootFocusNodeId,
        scope: 'memory-projection',
        relationType: 'memory-projection',
        weight: strength,
        evidence: {
          oldKnowledgeScore: node.oldKnowledgeScore,
          semanticFamiliarity: node.semanticFamiliarity,
          manualBoost: node.manualBoost,
          novelty: node.novelty,
          tension: node.tension,
        },
      }));
    }
  }

  for (const station of input.stations ?? []) {
    if (typeof station.archivedAt === 'number') {
      continue;
    }
    if (station.type === 'node') {
      addSource(createSource({
        nodeId: station.nodeId ?? '',
        relatedToNodeId: rootFocusNodeId || currentNodeId,
        scope: 'station',
        relationType: 'node-station',
        weight: 1,
        evidence: { stationId: station.stationId, stationType: station.type },
      }));
      continue;
    }
    for (const entry of station.path ?? []) {
      addSource(createSource({
        nodeId: entry.nodeId,
        relatedToNodeId: rootFocusNodeId || currentNodeId,
        scope: 'station',
        relationType: 'path-station',
        weight: 0.82,
        evidence: { stationId: station.stationId, stationType: station.type, lens: entry.lens },
      }));
    }
  }

  for (const relation of input.relations ?? []) {
    if (relation.decision !== 'accepted' || relation.source !== 'ai') {
      continue;
    }
    const fromNodeId = normalizeString(relation.fromNodeId);
    const toNodeId = normalizeString(relation.toNodeId);
    const relatedToCurrent = fromNodeId === currentNodeId || fromNodeId === rootFocusNodeId;
    const relatedToCandidate = toNodeId === currentNodeId || toNodeId === rootFocusNodeId;
    const nodeId = relatedToCurrent ? toNodeId : relatedToCandidate ? fromNodeId : toNodeId;
    const relatedToNodeId = relatedToCurrent ? fromNodeId : relatedToCandidate ? toNodeId : fromNodeId;
    addSource(createSource({
      nodeId,
      relatedToNodeId,
      scope: 'accepted-ai-relation',
      relationType: 'accepted-ai-relation',
      weight: relation.confidence,
      evidence: { relationId: relation.relationId, source: relation.source },
    }));
  }

  for (const nodeId of input.defaultNodeIds ?? []) {
    addSource(createSource({
      nodeId,
      relatedToNodeId: rootFocusNodeId || currentNodeId,
      scope: 'default-source',
      relationType: 'default-non-structural-source',
      weight: 0.2,
    }));
  }

  const sources = Array.from(sourcesByKey.values()).sort((left, right) => (
    left.nodeId.localeCompare(right.nodeId)
    || left.scope.localeCompare(right.scope)
    || right.weight - left.weight
    || left.relatedToNodeId.localeCompare(right.relatedToNodeId)
  ));
  const sourcesByNodeId: Record<string, SemanticCandidateSource[]> = {};
  for (const source of sources) {
    sourcesByNodeId[source.nodeId] = sourcesByNodeId[source.nodeId] ?? [];
    sourcesByNodeId[source.nodeId].push(source);
  }

  return {
    candidateNodeIds: Object.keys(sourcesByNodeId).sort((left, right) => left.localeCompare(right)),
    sources,
    sourcesByNodeId,
  };
}
