import type {
  SemanticCandidate,
  SemanticCandidateColumns,
  SemanticEdgeCreatedBy,
  SemanticEdgeExplanation,
  SemanticEdgeEvidence,
  SemanticLens,
  SemanticNode,
  SemanticNodeAvailability,
  SemanticNodeKind,
  SemanticRealNodePresentation,
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
  displayTitle: string;
  summary: string;
  nodeKind: SemanticNodeKind;
  availability: SemanticNodeAvailability;
  sourceBlockId: string | null;
  debugId: string;
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

function normalizedText(value: unknown): string {
  return String(value ?? '').trim();
}

function inferNodeKind(node: SemanticNode): SemanticNodeKind {
  if (node.nodeType === 'real-review-card') {
    return 'flashcard';
  }
  if (node.nodeType === 'concept') {
    return 'concept';
  }
  return 'unknown';
}

function readableNodeText(value: string, node: SemanticNode, sourceBlockId: string | null): string {
  if (!value || value === node.nodeId || value === sourceBlockId) {
    return '';
  }
  return value;
}

function buildAvailability(node: SemanticNode, sourceBlockId: string | null, displayTitle: string, summary: string): SemanticNodeAvailability {
  if (node.nodeType === 'implicit-knowledge') {
    return {
      status: 'unavailable',
      reason: 'virtual-node',
      message: 'Semantic inferred context is not a reviewable source node.',
    };
  }
  if (!sourceBlockId) {
    return {
      status: 'unavailable',
      reason: 'source-missing',
      message: 'Semantic source block is missing.',
    };
  }
  if (displayTitle === 'Content unavailable' && !summary) {
    return {
      status: 'unavailable',
      reason: 'content-missing',
      message: 'Semantic source content is empty.',
    };
  }
  return {
    status: 'available',
    reason: null,
    message: null,
  };
}

export function buildSemanticRealNodePresentation(node: SemanticNode): SemanticRealNodePresentation {
  const location = node.location ?? { blockId: node.nodeId };
  const sourceBlockId = normalizedText(location.blockId) || null;
  const title = readableNodeText(normalizedText(node.title), node, sourceBlockId);
  const summary = readableNodeText(normalizedText(node.preview), node, sourceBlockId);
  const displayTitle = title || summary || 'Content unavailable';

  return {
    displayTitle,
    summary,
    nodeKind: inferNodeKind(node),
    breadcrumb: unique(location.breadcrumb ?? []),
    availability: buildAvailability(node, sourceBlockId, displayTitle, summary),
    sourceBlockId,
    cardId: normalizedText(location.cardId) || null,
    debugId: node.nodeId,
  };
}

export function buildSemanticNodePresentation(node: SemanticNode): SemanticNodePresentation {
  const nodeType = node.nodeType;
  const isReviewCard = nodeType === 'real-review-card';
  const isImplicitKnowledge = nodeType === 'implicit-knowledge';
  const isConceptNode = nodeType === 'concept';
  const location = node.location ?? { blockId: node.nodeId };
  const realNode = buildSemanticRealNodePresentation(node);
  const baseActions: SemanticPresentationAction[] = ['follow', 'node-station', 'path-station', 'skip', 'mark-irrelevant'];
  const actions = isImplicitKnowledge || isConceptNode
    ? [...baseActions, 'expand']
    : [...baseActions, 'review-reveal', 'review-grade'];

  return {
    nodeId: node.nodeId,
    nodeType,
    displayTitle: realNode.displayTitle,
    summary: realNode.summary,
    nodeKind: realNode.nodeKind,
    availability: realNode.availability,
    sourceBlockId: realNode.sourceBlockId,
    debugId: realNode.debugId,
    title: node.title,
    preview: node.preview,
    breadcrumb: realNode.breadcrumb,
    backlinkBlockIds: unique(location.backlinkBlockIds ?? []),
    blockId: String(location.blockId || node.nodeId),
    cardId: realNode.cardId,
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

export function canRepresentSemanticPathNode(node: SemanticNode): boolean {
  const presentation = buildSemanticRealNodePresentation(node);
  return presentation.availability.status === 'available' && !!presentation.sourceBlockId;
}

export function filterRepresentableSemanticCandidates(columns: SemanticCandidateColumns): SemanticCandidateColumns {
  return {
    assimilation: (columns.assimilation ?? []).filter((candidate) => canRepresentSemanticPathNode(candidate.node)),
    accommodation: (columns.accommodation ?? []).filter((candidate) => canRepresentSemanticPathNode(candidate.node)),
    free: (columns.free ?? []).filter((candidate) => canRepresentSemanticPathNode(candidate.node)),
  };
}

export function buildSemanticEdgeExplanation(input: {
  fromNodeId: string;
  toNodeId: string;
  lens: SemanticLens;
  primaryExplanation: string;
  reasonTags?: string[];
  evidence?: SemanticEdgeEvidence[];
  createdBy?: SemanticEdgeCreatedBy;
  createdAt: number;
}): SemanticEdgeExplanation {
  return {
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    lens: input.lens,
    primaryExplanation: normalizedText(input.primaryExplanation),
    reasonTags: unique(input.reasonTags ?? []),
    evidence: [...(input.evidence ?? [])],
    createdBy: input.createdBy ?? { kind: 'unknown', id: null, label: null },
    createdAt: input.createdAt,
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
