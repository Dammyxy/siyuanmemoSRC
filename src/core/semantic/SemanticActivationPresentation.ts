import type {
  SemanticCandidate,
  SemanticCandidateColumns,
  SemanticLens,
  SemanticNode,
  SemanticNodeType,
  SemanticPathEntry,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticStation,
} from './semanticActivationTypes';

export type SemanticPresentationAction =
  | 'follow'
  | 'expand'
  | 'node-station'
  | 'path-station'
  | 'skip'
  | 'mark-irrelevant'
  | 'review-reveal'
  | 'review-grade';

export interface SemanticNodePresentation {
  nodeId: string;
  nodeType: SemanticNodeType;
  title: string;
  preview: string;
  breadcrumb: string[];
  backlinkBlockIds: string[];
  blockId: string;
  cardId: string | null;
  isReviewCard: boolean;
  isImplicitKnowledge: boolean;
  isConceptNode: boolean;
  readOnly: boolean;
  canReveal: boolean;
  canGrade: boolean;
  canSchedule: boolean;
  canAutoCreateCard: boolean;
  actions: SemanticPresentationAction[];
}

export interface SemanticSurfaceModel {
  session: SemanticSessionSnapshot;
  currentNode: SemanticNodePresentation;
  candidates: SemanticCandidateColumns;
  lensHistory: SemanticLens[];
}

export interface SemanticAiRelationCandidate {
  relationId: string;
  fromNodeId: string;
  toNodeId: string;
  confidence?: number;
  reason?: string | null;
}

export interface SemanticAiInput {
  rootFocusNodeId: string;
  activeLens: SemanticLens;
  narrativePathNodeIds: string[];
  candidateNodeIds: string[];
  memoryNodeIds: string[];
  allowedNodeIds: string[];
}

export interface SemanticAiValidationResult {
  valid: SemanticAiRelationCandidate[];
  rejected: Array<SemanticAiRelationCandidate & { rejectedReason: 'unknown-endpoint' }>;
}

function unique(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values)
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0)));
}

function flattenCandidates(columns: SemanticCandidateColumns): SemanticCandidate[] {
  return [
    ...(columns.assimilation ?? []),
    ...(columns.accommodation ?? []),
    ...(columns.free ?? []),
  ];
}

export function buildSemanticNodePresentation(node: SemanticNode): SemanticNodePresentation {
  const nodeType = node.nodeType;
  const isReviewCard = nodeType === 'real-review-card';
  const isImplicitKnowledge = nodeType === 'implicit-knowledge';
  const isConceptNode = nodeType === 'concept';
  const location = node.location ?? { blockId: node.nodeId };
  const baseActions: SemanticPresentationAction[] = ['follow', 'node-station', 'path-station', 'skip', 'mark-irrelevant'];
  const actions = isImplicitKnowledge || isConceptNode
    ? [...baseActions, 'expand']
    : [...baseActions, 'review-reveal', 'review-grade'];

  return {
    nodeId: node.nodeId,
    nodeType,
    title: node.title,
    preview: node.preview,
    breadcrumb: unique(location.breadcrumb ?? []),
    backlinkBlockIds: unique(location.backlinkBlockIds ?? []),
    blockId: String(location.blockId || node.nodeId),
    cardId: location.cardId ? String(location.cardId) : null,
    isReviewCard,
    isImplicitKnowledge,
    isConceptNode,
    readOnly: !isReviewCard,
    canReveal: isReviewCard,
    canGrade: isReviewCard,
    canSchedule: isReviewCard,
    canAutoCreateCard: false,
    actions,
  };
}

export function buildSemanticSurfaceModel(input: {
  session: SemanticSessionSnapshot;
  currentNode: SemanticNode;
  candidates: SemanticCandidateColumns;
}): SemanticSurfaceModel {
  return {
    session: input.session,
    currentNode: buildSemanticNodePresentation(input.currentNode),
    candidates: input.candidates,
    lensHistory: input.session.narrativePath.map((entry) => entry.lens),
  };
}

export function collectSemanticPathStationDraft(session: SemanticSessionSnapshot): Pick<SemanticStation, 'type' | 'sessionId' | 'nodeId' | 'path' | 'lensHistory'> {
  return {
    type: 'path',
    sessionId: session.sessionId,
    nodeId: null,
    path: session.narrativePath.map((entry: SemanticPathEntry) => ({ ...entry })),
    lensHistory: session.narrativePath.map((entry) => entry.lens),
  };
}

export function buildSemanticAiInput(input: {
  session: SemanticSessionSnapshot;
  candidates: SemanticCandidateColumns;
  memoryNodeIds?: string[];
  maxMemoryNodes?: number;
}): SemanticAiInput {
  const narrativePathNodeIds = unique(input.session.narrativePath.map((entry) => entry.nodeId));
  const candidateNodeIds = unique(flattenCandidates(input.candidates).map((candidate) => candidate.node.nodeId));
  const memoryNodeIds = unique(input.memoryNodeIds ?? []).slice(0, Math.max(0, input.maxMemoryNodes ?? 12));
  const allowedNodeIds = unique([
    input.session.rootFocusNodeId,
    input.session.currentNodeId,
    ...narrativePathNodeIds,
    ...candidateNodeIds,
    ...memoryNodeIds,
  ]);

  return {
    rootFocusNodeId: input.session.rootFocusNodeId,
    activeLens: input.session.activeLens,
    narrativePathNodeIds,
    candidateNodeIds,
    memoryNodeIds,
    allowedNodeIds,
  };
}

export function validateSemanticAiRelationCandidates(
  aiInput: SemanticAiInput,
  candidates: SemanticAiRelationCandidate[],
): SemanticAiValidationResult {
  const allowed = new Set(aiInput.allowedNodeIds);
  const valid: SemanticAiRelationCandidate[] = [];
  const rejected: SemanticAiValidationResult['rejected'] = [];

  for (const candidate of candidates) {
    if (allowed.has(candidate.fromNodeId) && allowed.has(candidate.toNodeId)) {
      valid.push(candidate);
    } else {
      rejected.push({ ...candidate, rejectedReason: 'unknown-endpoint' });
    }
  }

  return { valid, rejected };
}

export function relationDecisionAltersSemanticMemory(decision: SemanticRelation['decision'] | 'ignored'): boolean {
  return decision === 'accepted' || decision === 'rejected';
}
