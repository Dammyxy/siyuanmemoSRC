import type {
  SemanticCandidateReason,
  SemanticLens,
  SemanticMemoryProjection,
} from '@/core/semantic/semanticActivationTypes';

export interface SemanticProjectionRankingInput {
  currentNodeId: string;
  rootFocusNodeId: string;
  candidateNodeIds: string[];
  projection: SemanticMemoryProjection;
}

export interface SemanticProjectionRankedCandidate {
  nodeId: string;
  lens: SemanticLens;
  score: number;
  reasons: SemanticCandidateReason[];
  explanation: {
    currentNodeId: string;
    rootFocusNodeId: string;
    currentRelation: number;
    rootFocusRelation: number;
    oldKnowledgeScore: number;
    semanticFamiliarity: number;
    manualBoost: number;
    novelty: number;
    tension: number;
  };
}

type RankedColumns = Record<SemanticLens, SemanticProjectionRankedCandidate[]>;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function relationStrength(input: {
  currentToCandidate: number;
  rootToCandidate: number;
  manualBoost: number;
}): number {
  return clamp01(input.currentToCandidate + input.rootToCandidate * 0.35 + input.manualBoost);
}

function reason(code: SemanticCandidateReason['code'], weight: number): SemanticCandidateReason | null {
  const normalized = clamp01(weight);
  return normalized > 0
    ? { code, weight: normalized }
    : null;
}

function compactReasons(reasons: Array<SemanticCandidateReason | null>): SemanticCandidateReason[] {
  return reasons.filter((item): item is SemanticCandidateReason => !!item);
}

export function rankSemanticProjectionCandidates(input: SemanticProjectionRankingInput): RankedColumns {
  const currentNodeId = normalizeString(input.currentNodeId);
  const rootFocusNodeId = normalizeString(input.rootFocusNodeId);
  const nodeMemory = new Map(input.projection.nodeMemory.map((node) => [node.nodeId, node]));
  const edgeMemory = new Map(input.projection.edgeMemory.map((edge) => [`${edge.fromNodeId}\u001f${edge.toNodeId}`, edge]));
  const columns: RankedColumns = {
    assimilation: [],
    accommodation: [],
    free: [],
  };

  for (const rawNodeId of input.candidateNodeIds) {
    const nodeId = normalizeString(rawNodeId);
    if (!nodeId || nodeId === currentNodeId) {
      continue;
    }
    const node = nodeMemory.get(nodeId);
    const currentEdge = edgeMemory.get(`${currentNodeId}\u001f${nodeId}`);
    const rootEdge = edgeMemory.get(`${rootFocusNodeId}\u001f${nodeId}`);
    const currentRelation = clamp01(currentEdge?.relationConfidence ?? 0);
    const rootRelation = clamp01(rootEdge?.relationConfidence ?? 0);
    const edgeManualBoost = clamp01((currentEdge?.manualBoost ?? 0) + (rootEdge?.manualBoost ?? 0) * 0.35);
    const relation = relationStrength({
      currentToCandidate: currentRelation,
      rootToCandidate: rootRelation,
      manualBoost: edgeManualBoost,
    });
    const oldKnowledge = clamp01(node?.oldKnowledgeScore ?? 0);
    const familiarity = clamp01(node?.semanticFamiliarity ?? 0);
    const manualBoost = clamp01(node?.manualBoost ?? 0);
    const novelty = clamp01(node?.novelty ?? 0);
    const tension = clamp01((node?.tension ?? 0) + (currentEdge?.tension ?? 0) + (rootEdge?.tension ?? 0) * 0.35);
    const explanation = {
      currentNodeId,
      rootFocusNodeId,
      currentRelation,
      rootFocusRelation: rootRelation,
      oldKnowledgeScore: oldKnowledge,
      semanticFamiliarity: familiarity,
      manualBoost,
      novelty,
      tension,
    };

    columns.assimilation.push({
      nodeId,
      lens: 'assimilation',
      score: clamp01(oldKnowledge * 0.45 + relation * 0.25 + manualBoost * 0.2 + familiarity * 0.1 - tension * 0.08),
      reasons: compactReasons([
        reason('memory-projection', oldKnowledge),
        reason('current-node-relation', currentRelation),
        reason('root-focus-relation', rootRelation * 0.35),
        reason('station-boost', manualBoost),
      ]),
      explanation,
    });
    columns.accommodation.push({
      nodeId,
      lens: 'accommodation',
      score: clamp01(tension * 0.42 + novelty * 0.24 + relation * 0.18 + oldKnowledge * 0.1 + manualBoost * 0.06),
      reasons: compactReasons([
        reason('tension', tension),
        reason('novelty', novelty),
        reason('current-node-relation', currentRelation),
        reason('root-focus-relation', rootRelation * 0.35),
      ]),
      explanation,
    });
    columns.free.push({
      nodeId,
      lens: 'free',
      score: clamp01(relation * 0.36 + novelty * 0.22 + tension * 0.18 + manualBoost * 0.14 + familiarity * 0.1),
      reasons: compactReasons([
        reason('free-association', relation || novelty),
        reason('current-node-relation', currentRelation),
        reason('root-focus-relation', rootRelation * 0.35),
        reason('tension', tension * 0.6),
        reason('station-boost', manualBoost),
      ]),
      explanation,
    });
  }

  for (const lens of Object.keys(columns) as SemanticLens[]) {
    columns[lens].sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId));
  }
  return columns;
}
