export const SEMANTIC_ACTIVATION_QUEUE_TYPE = 'semantic-activation' as const;

export type SemanticActivationQueueType = typeof SEMANTIC_ACTIVATION_QUEUE_TYPE;

export type SemanticLens = 'assimilation' | 'accommodation' | 'free';

export type SemanticNodeType = 'real-review-card' | 'implicit-knowledge' | 'concept';

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
  | 'node-visited'
  | 'edge-traversed'
  | 'lens-switched'
  | 'implicit-node-action'
  | 'station-created'
  | 'ai-relation-accepted'
  | 'ai-relation-rejected'
  | 'node-marked-irrelevant'
  | 'session-ended';

export type SemanticStationType = 'node' | 'path';

export type SemanticRelationDecision = 'accepted' | 'rejected' | 'ignored';

export type SemanticUnavailableReason =
  | 'writer-unavailable'
  | 'projection-unavailable'
  | 'graph-unavailable'
  | 'session-unavailable'
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

export interface SemanticSessionSnapshot {
  sessionId: string;
  rootFocusNodeId: string;
  currentNodeId: string;
  activeLens: SemanticLens;
  narrativePath: SemanticPathEntry[];
  startedAt: number;
  endedAt?: number | null;
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
  | { type: 'start-session'; rootFocusNodeId: string; idempotencyKey: string }
  | { type: 'follow-candidate'; sessionId: string; candidateId: string; lens: SemanticLens; idempotencyKey: string }
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
  | { type: 'mark-irrelevant'; sessionId: string; nodeId: string; idempotencyKey: string }
  | { type: 'end-session'; sessionId: string; idempotencyKey: string };

export type SemanticCommandResult =
  | {
      status: 'ok';
      session?: SemanticSessionSnapshot | null;
      event?: SemanticEvent | null;
      events?: SemanticEvent[] | null;
      station?: SemanticStation | null;
      relation?: SemanticRelation | null;
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
