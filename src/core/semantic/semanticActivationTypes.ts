export const SEMANTIC_ACTIVATION_QUEUE_TYPE = 'semantic-activation' as const;

export type SemanticActivationQueueType = typeof SEMANTIC_ACTIVATION_QUEUE_TYPE;

export type SemanticLens = 'assimilation' | 'accommodation' | 'free';

export type SemanticNodeType = 'real-review-card' | 'implicit-knowledge' | 'concept';

export type SemanticNodeKind =
  | 'flashcard'
  | 'block'
  | 'document'
  | 'heading'
  | 'list-item'
  | 'paragraph'
  | 'concept'
  | 'unknown';

export type SemanticNodeAvailabilityStatus = 'available' | 'unavailable';

export interface SemanticNodeAvailability {
  status: SemanticNodeAvailabilityStatus;
  reason?: SemanticUnavailableReason | 'source-missing' | 'content-missing' | 'virtual-node' | null;
  message?: string | null;
}

export type SemanticReasonCode =
  | 'current-node-relation'
  | 'root-focus-relation'
  | 'memory-projection'
  | 'station-boost'
  | 'accepted-ai-relation'
  | 'old-mode-manual-boost'
  | 'structural-relation'
  | 'novelty'
  | 'tension'
  | 'free-association';

export type SemanticEventType =
  | 'session-started'
  | 'session-forked'
  | 'node-visited'
  | 'edge-traversed'
  | 'branch-edge-created'
  | 'active-cursor-moved'
  | 'lens-switched'
  | 'implicit-node-action'
  | 'station-created'
  | 'station-archived'
  | 'station-restored'
  | 'branch-archived'
  | 'branch-restored'
  | 'later-added'
  | 'later-removed'
  | 'ai-relation-accepted'
  | 'ai-relation-rejected'
  | 'node-marked-irrelevant'
  | 'suggestion-created'
  | 'suggestion-ignored'
  | 'suggestion-bound'
  | 'suggestion-materialized'
  | 'session-ended';

export type SemanticStationType = 'node' | 'path';

export type SemanticRelationDecision = 'accepted' | 'rejected' | 'ignored';

export type SemanticUnavailableReason =
  | 'writer-unavailable'
  | 'projection-unavailable'
  | 'graph-unavailable'
  | 'session-unavailable'
  | 'focus-unavailable'
  | 'candidate-unavailable'
  | 'station-unavailable'
  | 'inactive-station'
  | 'invalid-request'
  | 'failed';

export interface SemanticNodeLocation {
  blockId: string;
  cardId?: string | null;
  deckId?: string | null;
  breadcrumb?: string[] | null;
  backlinkBlockIds?: string[] | null;
}

export interface SemanticNode {
  nodeId: string;
  nodeType: SemanticNodeType;
  title: string;
  preview: string;
  location: SemanticNodeLocation;
}

export interface SemanticRealNodePresentation {
  displayTitle: string;
  summary: string;
  nodeKind: SemanticNodeKind;
  breadcrumb: string[];
  availability: SemanticNodeAvailability;
  sourceBlockId: string | null;
  cardId: string | null;
  debugId: string;
}

export interface SemanticCandidateReason {
  code: SemanticReasonCode;
  weight: number;
  label?: string | null;
  evidenceEventIds?: string[];
}

export interface SemanticCandidateSource {
  nodeId: string;
  relatedToNodeId: string;
  scope:
    | 'current-node'
    | 'root-focus'
    | 'memory-projection'
    | 'station'
    | 'accepted-ai-relation'
    | 'default-source'
    | 'structural';
  relationType: string;
  weight: number;
  structural: boolean;
  evidence: Record<string, unknown>;
}

export interface SemanticCandidate {
  candidateId: string;
  node: SemanticNode;
  score: number;
  lens: SemanticLens;
  reasons: SemanticCandidateReason[];
  explanation?: Record<string, unknown> | null;
}

export type SemanticCandidateColumns = Record<SemanticLens, SemanticCandidate[]>;

export interface SemanticPathEntry {
  nodeId: string;
  lens: SemanticLens;
  eventId: string;
  visitedAt: number;
}

export interface SemanticEdgeCreatedBy {
  kind: 'user' | 'system' | 'ai' | 'import' | 'unknown';
  id?: string | null;
  label?: string | null;
}

export interface SemanticEdgeEvidence {
  eventId?: string | null;
  relationId?: string | null;
  sourceNodeId?: string | null;
  label?: string | null;
  weight?: number | null;
}

export interface SemanticEdgeExplanation {
  fromNodeId: string;
  toNodeId: string;
  lens: SemanticLens;
  primaryExplanation: string;
  reasonTags: string[];
  evidence: SemanticEdgeEvidence[];
  createdBy: SemanticEdgeCreatedBy;
  createdAt: number;
}

export interface SemanticForkMetadata {
  sourceSessionId: string;
  sourceNodeId: string;
  forkedAt: number;
  reason?: 'continue-ended-session' | 'branch-from-node' | 'manual' | null;
}

export interface SemanticBranchEdge {
  edgeId: string;
  sessionId: string;
  branchId: string;
  fromNodeId: string;
  toNodeId: string;
  lens: SemanticLens;
  explanation?: SemanticEdgeExplanation | null;
  createdBy: SemanticEdgeCreatedBy;
  createdAt: number;
  forkMetadata?: SemanticForkMetadata | null;
}

export interface SemanticBranchState {
  branchId: string;
  sessionId: string;
  rootNodeId: string;
  activeCursorNodeId: string;
  archivedAt?: number | null;
  restoredAt?: number | null;
  updatedAt: number;
}

export interface SemanticLaterEntry {
  entryId: string;
  sessionId: string;
  nodeId: string;
  reason?: string | null;
  createdAt: number;
  removedAt?: number | null;
}

export interface SemanticIrrelevantFeedback {
  feedbackId: string;
  sessionId: string;
  nodeId: string;
  scope: 'session' | 'root';
  rootFocusNodeId?: string | null;
  createdAt: number;
}

export type SemanticSuggestionStatus = 'active' | 'ignored' | 'bound' | 'materialized';

export interface SemanticSuggestion {
  suggestionId: string;
  sessionId: string;
  source: 'ai' | 'system';
  summary: string;
  status: SemanticSuggestionStatus;
  targetNodeId?: string | null;
  boundNodeId?: string | null;
  materializedBlockId?: string | null;
  materializedCardId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SemanticSessionTreeNode {
  nodeId: string;
  childNodeIds: string[];
  edgeIds: string[];
}

export interface SemanticSessionBranchProjection {
  branchId: string;
  rootNodeId: string;
  activeCursorNodeId: string;
  edges: SemanticBranchEdge[];
  archivedAt?: number | null;
  restoredAt?: number | null;
  recentActivityAt: number;
}

export interface SemanticSessionProjection {
  session: SemanticSessionSnapshot;
  tree: SemanticSessionTreeNode[];
  activePath: SemanticPathEntry[];
  branches: SemanticSessionBranchProjection[];
  archivedBranches: SemanticSessionBranchProjection[];
  inheritedContextNodeIds: string[];
  later: SemanticLaterEntry[];
  suggestions: SemanticSuggestion[];
  ended: boolean;
  forkMetadata?: SemanticForkMetadata | null;
}

export interface SemanticSessionSnapshot {
  sessionId: string;
  rootFocusNodeId: string;
  rootFocusNodeType?: SemanticNodeType | null;
  currentNodeId: string;
  activeLens: SemanticLens;
  narrativePath: SemanticPathEntry[];
  startedAt: number;
  endedAt?: number | null;
  forkMetadata?: SemanticForkMetadata | null;
}

export interface SemanticEvent {
  eventId: string;
  sessionId: string;
  type: SemanticEventType;
  nodeId?: string | null;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  lens?: SemanticLens | null;
  occurredAt: number;
  payload?: Record<string, unknown> | null;
}

export interface SemanticStation {
  stationId: string;
  type: SemanticStationType;
  sessionId: string;
  nodeId?: string | null;
  path?: SemanticPathEntry[] | null;
  lensHistory?: SemanticLens[] | null;
  createdAt: number;
  archivedAt?: number | null;
}

export interface SemanticRelation {
  relationId: string;
  fromNodeId: string;
  toNodeId: string;
  decision: SemanticRelationDecision;
  source: 'manual' | 'ai';
  confidence: number;
  reason?: string | null;
  decidedAt: number;
}

export interface SemanticNodeMemoryProjection {
  nodeId: string;
  oldKnowledgeScore: number;
  semanticFamiliarity: number;
  manualBoost: number;
  novelty: number;
  instability: number;
  tension: number;
  lastProjectedAt: number;
}

export interface SemanticEdgeMemoryProjection {
  fromNodeId: string;
  toNodeId: string;
  relationConfidence: number;
  traversalCount: number;
  manualBoost: number;
  tension: number;
  lastProjectedAt: number;
}

export interface SemanticMemoryProjection {
  version: number;
  sessionId?: string | null;
  nodeMemory: SemanticNodeMemoryProjection[];
  edgeMemory: SemanticEdgeMemoryProjection[];
  rebuiltAt: number;
}

export type SemanticCommand =
  | { type: 'start-session'; rootFocusNodeId: string; rootFocusNodeType?: SemanticNodeType | null; idempotencyKey: string }
  | {
      type: 'fork-session';
      sourceSessionId: string;
      sourceNodeId: string;
      rootFocusNodeId: string;
      forkMetadata?: Omit<SemanticForkMetadata, 'forkedAt'> | null;
      idempotencyKey: string;
    }
  | { type: 'follow-candidate'; sessionId: string; candidateId: string; lens: SemanticLens; idempotencyKey: string }
  | {
      type: 'create-branch-edge';
      sessionId: string;
      fromNodeId: string;
      toNodeId: string;
      lens: SemanticLens;
      explanation?: SemanticEdgeExplanation | null;
      idempotencyKey: string;
    }
  | { type: 'move-active-cursor'; sessionId: string; nodeId: string; idempotencyKey: string }
  | { type: 'archive-branch'; sessionId: string; branchId: string; idempotencyKey: string }
  | { type: 'restore-branch'; sessionId: string; branchId: string; idempotencyKey: string }
  | { type: 'add-later'; sessionId: string; nodeId: string; reason?: string | null; idempotencyKey: string }
  | { type: 'remove-later'; sessionId: string; nodeId: string; idempotencyKey: string }
  | {
      type: 'create-suggestion';
      sessionId: string;
      suggestionId: string;
      source: 'ai' | 'system';
      summary: string;
      targetNodeId?: string | null;
      idempotencyKey: string;
    }
  | { type: 'ignore-suggestion'; sessionId: string; suggestionId: string; idempotencyKey: string }
  | { type: 'bind-suggestion'; sessionId: string; suggestionId: string; nodeId: string; idempotencyKey: string }
  | { type: 'materialize-suggestion'; sessionId: string; suggestionId: string; blockId: string; cardId?: string | null; idempotencyKey: string }
  | { type: 'switch-lens'; sessionId: string; lens: SemanticLens; idempotencyKey: string }
  | { type: 'create-station'; sessionId: string; stationType: SemanticStationType; idempotencyKey: string }
  | {
      type: 'record-implicit-node-action';
      sessionId: string;
      nodeId: string;
      action: 'follow' | 'expand' | 'node-station' | 'path-station' | 'skip' | 'mark-irrelevant';
      lens?: SemanticLens;
      idempotencyKey: string;
    }
  | {
      type: 'accept-relation';
      sessionId: string;
      relationId: string;
      fromNodeId?: string;
      toNodeId?: string;
      confidence?: number;
      reason?: string | null;
      idempotencyKey: string;
    }
  | {
      type: 'reject-relation';
      sessionId: string;
      relationId: string;
      fromNodeId?: string;
      toNodeId?: string;
      confidence?: number;
      reason?: string | null;
      idempotencyKey: string;
    }
  | { type: 'mark-irrelevant'; sessionId: string; nodeId: string; scope?: 'session' | 'root'; idempotencyKey: string }
  | { type: 'archive-station'; sessionId: string; stationId: string; idempotencyKey: string }
  | { type: 'restore-path-station'; sessionId: string; stationId: string; idempotencyKey: string }
  | { type: 'end-session'; sessionId: string; idempotencyKey: string }
  | { type: 'restore-session'; sessionId: string; idempotencyKey: string };

export type SemanticCommandResult =
  | {
      status: 'ok';
      session?: SemanticSessionSnapshot | null;
      event?: SemanticEvent | null;
      events?: SemanticEvent[] | null;
      station?: SemanticStation | null;
      relation?: SemanticRelation | null;
      archivedStationId?: string | null;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason: SemanticUnavailableReason;
      message: string;
    };

export interface SemanticActivationRuntimeQueue {
  semanticRuntimeKind: 'semantic-activation';
  queueType: SemanticActivationQueueType;
  getSessionSnapshot(): SemanticSessionSnapshot | null;
  getCandidateColumns(): SemanticCandidateColumns;
  dispatchSemanticCommand(command: SemanticCommand): Promise<SemanticCommandResult>;
}

export interface SemanticActivationController {
  startSession(rootFocusNodeId: string): Promise<SemanticCommandResult>;
  followCandidate(candidateId: string, lens: SemanticLens): Promise<SemanticCommandResult>;
  switchLens(lens: SemanticLens): Promise<SemanticCommandResult>;
  createStation(type: SemanticStationType): Promise<SemanticCommandResult>;
  acceptRelation(relationId: string): Promise<SemanticCommandResult>;
  rejectRelation(relationId: string): Promise<SemanticCommandResult>;
  markIrrelevant(nodeId: string): Promise<SemanticCommandResult>;
  endSession(): Promise<SemanticCommandResult>;
  restoreSession(sessionId: string): Promise<SemanticCommandResult>;
}

export function isSemanticActivationRuntimeQueue(
  value: unknown,
): value is SemanticActivationRuntimeQueue {
  const candidate = value as Partial<SemanticActivationRuntimeQueue> | null;
  return !!candidate
    && candidate.semanticRuntimeKind === 'semantic-activation'
    && candidate.queueType === SEMANTIC_ACTIVATION_QUEUE_TYPE
    && typeof candidate.getSessionSnapshot === 'function'
    && typeof candidate.getCandidateColumns === 'function'
    && typeof candidate.dispatchSemanticCommand === 'function';
}
