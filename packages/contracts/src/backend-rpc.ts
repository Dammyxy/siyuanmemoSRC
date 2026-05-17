export const BACKEND_RPC_VERSION = '2.0';

export type BackendRpcMethod =
  | 'system.health'
  | 'db.load'
  | 'db.persist'
  | 'diagnostics.status'
  | 'browser.deck.page'
  | 'browser.deck.matchedIds'
  | 'browser.deck.rowsByIds'
  | 'browser.stats'
  | 'browser.count'
  | 'browser.sourceExistence.refreshCandidates'
  | 'browser.sourceExistence.update'
  | 'browser.sourceExistence.byBlockIds'
  | 'browser.sourceExistence.summary'
  | 'browser.sourceExistence.applySweep'
  | 'browser.sourceExistence.applySweepHost'
  | 'queue.projection.snapshot'
  | 'queue.projection.rowsByIds'
  | 'queue.projection.replace'
  | 'neural-roam.advance'
  | 'kernel.transaction.ingest'
  | 'kernel.transaction.dequeue'
  | 'kernel.transaction.requeue'
  | 'autocard.decision.resolve'
  | 'autocard.execute'
  | 'review.feedback'
  | 'ai.session.create'
  | 'ai.session.get'
  | 'ai.session.update'
  | 'ai.session.cancel'
  | 'ai.prompt.execute'
  | 'ai.stream.start'
  | 'ai.stream.cancel'
  | 'job.get'
  | 'job.cancel'
  | 'private.health'
  | 'private.diagnostics.status'
  | 'private.audit.query'
  | 'private.read.cards'
  | 'private.read.queues'
  | 'private.read.sessions'
  | 'private.command.execute'
  | 'semantic.command.execute'
  | 'semantic.session.read'
  | 'semantic.sidebar.read'
  | 'semantic.browser.read'
  | 'p6.ownership.query'
  | 'p6.ownership.command';

export type BackendRpcId = number | string;

export interface BackendRpcRequest<TParams = unknown> {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  method: BackendRpcMethod;
  params?: TParams;
}

export type BackendRpcErrorCode =
  | 'WRITER_UNAVAILABLE'
  | 'LEASE_UNAVAILABLE'
  | 'RELAY_QUEUE_UNAVAILABLE'
  | 'KERNEL_SIDECAR_UNAVAILABLE'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'BACKEND_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'FAILED';

export interface BackendRpcError {
  code: BackendRpcErrorCode;
  message: string;
}

export interface BackendRpcSuccess<TResult = unknown> {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  result: TResult;
}

export interface BackendRpcFailure {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  error: BackendRpcError;
}

export type BackendRpcResponse<TResult = unknown> =
  | BackendRpcSuccess<TResult>
  | BackendRpcFailure;

export interface MutationChangedSet {
  cardIds?: string[];
  blockIds?: string[];
  queueIds?: string[];
  reviewSessionIds?: string[];
  aiSessionIds?: string[];
  semanticSessionIds?: string[];
}

export interface MutationResult<TResult> {
  ok: true;
  revision: number;
  changed: MutationChangedSet;
  result: TResult;
}

export interface BackendHealthResult {
  ok: true;
  runtime: 'srs-backend-worker';
  initialized: boolean;
}

export interface BackendDbLoadResult {
  ok: true;
  initialized: boolean;
  dbFile: string;
}

export interface BackendDbPersistResult {
  ok: true;
  persisted: true;
  dbFile: string;
}

export interface BackendDiagnosticsStatusResult {
  runtime: 'srs-backend-worker';
  initialized: boolean;
  dbFile: string;
  ingest?: {
    queueLength: number;
    queuedTransactions: number;
    maxQueueLength: number;
    acceptedTotal: number;
    deduplicatedTotal: number;
    rejectedTotal: number;
    drainedTotal: number;
    actionQueueLength: number;
    actionEnqueuedTotal: number;
    actionDequeuedTotal: number;
    actionRequeuedTotal: number;
    actionRejectedTotal: number;
    removeActionQueuedTotal: number;
    upsertActionQueuedTotal: number;
    autoCardActionQueuedTotal: number;
    maxActionQueueLength: number;
    lastAcceptedAt: number | null;
    lastDrainAt: number | null;
  };
  autoCard?: {
    decisionTotal: number;
    decisionSelectedTotal: number;
    decisionSkippedTotal: number;
    decisionNoOpTotal: number;
    decisionUnavailableTotal: number;
    decisionFailedTotal: number;
    executeTotal: number;
    executeCreatedTotal: number;
    executeSkippedTotal: number;
    executeUnavailableTotal: number;
    executeFailedTotal: number;
  };
  review?: {
    feedbackTotal: number;
    feedbackCommittedTotal: number;
    feedbackPreviewTotal: number;
    feedbackUnavailableTotal: number;
  };
  ai?: {
    sessionCreateTotal: number;
    sessionUpdateTotal: number;
    sessionCancelTotal: number;
    streamStartTotal: number;
    streamCancelTotal: number;
    jobCreatedTotal: number;
    jobCompletedTotal: number;
    jobCanceledTotal: number;
    jobTimeoutTotal: number;
    jobFailedTotal: number;
  };
}

export type BackendUnavailableClass =
  | 'WRITER_UNAVAILABLE'
  | 'LEASE_UNAVAILABLE'
  | 'RELAY_QUEUE_UNAVAILABLE'
  | 'BACKEND_UNAVAILABLE'
  | 'KERNEL_SIDECAR_UNAVAILABLE'
  | 'UPSTREAM_SIYUAN_UNAVAILABLE'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'INVALID_REQUEST'
  | 'FAILED';

export type BackendAiSessionState =
  | 'active'
  | 'streaming'
  | 'completed'
  | 'canceled'
  | 'expired'
  | 'unavailable'
  | 'failed';

export type BackendAiJobState =
  | 'queued'
  | 'running'
  | 'progress'
  | 'completed'
  | 'canceled'
  | 'timeout'
  | 'unavailable'
  | 'failed';

export interface BackendAiSessionRecord {
  sessionId: string;
  surfaceId: string;
  reviewSessionId: string | null;
  owner: 'application' | 'backend';
  skillId: string | null;
  providerId: string | null;
  modelId: string | null;
  state: BackendAiSessionState;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  lastError: string | null;
  diagnosticEventId: string;
}

export interface BackendAiSessionCreateRequest {
  sessionId: string;
  surfaceId: string;
  reviewSessionId?: string | null;
  owner?: 'application' | 'backend';
  skillId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  idempotencyKey?: string;
}

export interface BackendAiSessionGetRequest {
  sessionId: string;
}

export interface BackendAiSessionUpdateRequest {
  sessionId: string;
  state?: BackendAiSessionState;
  skillId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  expiresAt?: number | null;
  lastError?: string | null;
}

export interface BackendAiSessionCancelRequest {
  sessionId: string;
  reason?: string;
}

export interface BackendAiSessionResult {
  ok: true;
  session: BackendAiSessionRecord;
}

export interface BackendAiStreamStartRequest {
  streamId: string;
  sessionId: string;
  jobId: string;
  providerId?: string | null;
  modelId?: string | null;
  inputFingerprint?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface BackendAiPromptNetworkRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  redactionKeys?: string[];
  stream?: boolean;
}

export interface BackendAiPromptExecuteRequest {
  sessionId: string;
  streamId: string;
  jobId: string;
  providerId?: string | null;
  modelId?: string | null;
  timeoutMs?: number;
  idempotencyKey?: string;
  request: BackendAiPromptNetworkRequest;
}

export interface BackendAiPromptNetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface BackendAiPromptExecuteResult {
  ok: true;
  sessionId: string;
  streamId: string;
  jobId: string;
  state: 'completed' | 'timeout' | 'canceled' | 'unavailable' | 'failed';
  unavailableClass?: BackendUnavailableClass | null;
  diagnosticEventId: string;
  response?: BackendAiPromptNetworkResponse;
}

export interface BackendAiStreamCancelRequest {
  streamId: string;
  sessionId: string;
  jobId: string;
  reason?: string;
}

export interface BackendAiStreamResult {
  ok: true;
  streamId: string;
  sessionId: string;
  jobId: string;
  state: 'started' | 'canceled' | 'timeout' | 'unavailable' | 'failed' | 'completed';
  diagnosticEventId: string;
}

export interface BackendAiJobRecord {
  jobId: string;
  kind: 'ai-stream';
  owner: 'application' | 'backend';
  idempotencyKey: string;
  state: BackendAiJobState;
  progress: number;
  startedAt: number;
  updatedAt: number;
  deadlineAt: number | null;
  retryPolicy: 'none' | 'safe-retry';
  result: unknown;
  error: string | null;
}

export interface BackendAiJobGetRequest {
  jobId: string;
}

export interface BackendAiJobCancelRequest {
  jobId: string;
  reason?: string;
}

export interface BackendAiJobResult {
  ok: true;
  job: BackendAiJobRecord;
}

export interface PrivateApiCapabilityResult {
  available: boolean;
  reason: string | null;
  kernelSidecarAvailable: boolean;
  backendWorkerAvailable: boolean;
  writerAvailable: boolean;
  methodAllowed: boolean;
}

export interface PrivateApiReadRequest {
  requestId: string;
  method: 'private.read.cards' | 'private.read.queues' | 'private.read.sessions';
  callerIntent: string;
  capabilityResult?: PrivateApiCapabilityResult;
  limit?: number;
  filter?: Record<string, unknown>;
}

export interface PrivateApiReadResult {
  ok: true;
  data: unknown;
  diagnosticEventId: string;
  auditStatus: 'recorded' | 'skipped';
}

export interface PrivateApiMutationRequest {
  requestId: string;
  method: 'private.command.execute';
  callerIntent: string;
  capabilityResult?: PrivateApiCapabilityResult;
  idempotencyKey: string;
  params?: Record<string, unknown>;
  auditContext?: Record<string, unknown>;
}

export interface PrivateApiMutationResult {
  ok: true;
  commandId: string;
  writerInstanceId: string;
  changed: MutationChangedSet;
  result: unknown;
  auditStatus: 'recorded' | 'skipped';
  diagnosticEventId: string;
}

export type BackendSemanticLens = 'assimilation' | 'accommodation' | 'free';

export type BackendSemanticStationType = 'node' | 'path';

export type BackendSemanticNodeType = 'real-review-card' | 'implicit-knowledge' | 'concept';

export type BackendSemanticNodeKind =
  | 'flashcard'
  | 'block'
  | 'document'
  | 'heading'
  | 'list-item'
  | 'paragraph'
  | 'concept'
  | 'unknown';

export interface BackendSemanticNodeAvailability {
  status: 'available' | 'unavailable';
  reason?:
    | 'writer-unavailable'
    | 'projection-unavailable'
    | 'graph-unavailable'
    | 'session-unavailable'
    | 'focus-unavailable'
    | 'candidate-unavailable'
    | 'station-unavailable'
    | 'inactive-station'
    | 'invalid-request'
    | 'failed'
    | 'source-missing'
    | 'content-missing'
    | 'virtual-node'
    | null;
  message?: string | null;
}

export interface BackendSemanticPathEntry {
  nodeId: string;
  lens: BackendSemanticLens;
  eventId: string;
  visitedAt: number;
}

export interface BackendSemanticSessionSnapshot {
  sessionId: string;
  rootFocusNodeId: string;
  rootFocusNodeType?: BackendSemanticNodeType | null;
  currentNodeId: string;
  activeLens: BackendSemanticLens;
  narrativePath: BackendSemanticPathEntry[];
  startedAt: number;
  endedAt?: number | null;
  forkMetadata?: BackendSemanticForkMetadata | null;
}

export interface BackendSemanticNode {
  nodeId: string;
  nodeType: BackendSemanticNodeType;
  presentation?: BackendSemanticRealNodePresentation;
  title: string;
  preview: string;
  location: {
    blockId: string;
    cardId?: string | null;
    deckId?: string | null;
    breadcrumb?: string[] | null;
    backlinkBlockIds?: string[] | null;
  };
}

export interface BackendSemanticRealNodePresentation {
  displayTitle: string;
  summary: string;
  nodeKind: BackendSemanticNodeKind;
  breadcrumb: string[];
  availability: BackendSemanticNodeAvailability;
  sourceBlockId: string | null;
  cardId: string | null;
  debugId: string;
}

export interface BackendSemanticEdgeCreatedBy {
  kind: 'user' | 'system' | 'ai' | 'import' | 'unknown';
  id?: string | null;
  label?: string | null;
}

export interface BackendSemanticEdgeEvidence {
  eventId?: string | null;
  relationId?: string | null;
  sourceNodeId?: string | null;
  label?: string | null;
  weight?: number | null;
}

export interface BackendSemanticEdgeExplanation {
  fromNodeId: string;
  toNodeId: string;
  lens: BackendSemanticLens;
  primaryExplanation: string;
  reasonTags: string[];
  evidence: BackendSemanticEdgeEvidence[];
  createdBy: BackendSemanticEdgeCreatedBy;
  createdAt: number;
}

export interface BackendSemanticSessionTreeNode {
  nodeId: string;
  childNodeIds: string[];
  edgeIds: string[];
}

export interface BackendSemanticBranchEdge {
  edgeId: string;
  sessionId: string;
  branchId: string;
  fromNodeId: string;
  toNodeId: string;
  lens: BackendSemanticLens;
  explanation?: BackendSemanticEdgeExplanation | null;
  createdBy: BackendSemanticEdgeCreatedBy;
  createdAt: number;
  forkMetadata?: BackendSemanticForkMetadata | null;
}

export interface BackendSemanticSessionBranchProjection {
  branchId: string;
  rootNodeId: string;
  activeCursorNodeId: string;
  edges: BackendSemanticBranchEdge[];
  archivedAt?: number | null;
  restoredAt?: number | null;
  recentActivityAt: number;
}

export interface BackendSemanticLaterEntry {
  entryId: string;
  sessionId: string;
  nodeId: string;
  reason?: string | null;
  createdAt: number;
  removedAt?: number | null;
}

export interface BackendSemanticSuggestion {
  suggestionId: string;
  sessionId: string;
  source: 'ai' | 'system';
  summary: string;
  status: 'active' | 'ignored' | 'bound' | 'materialized';
  targetNodeId?: string | null;
  boundNodeId?: string | null;
  materializedBlockId?: string | null;
  materializedCardId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BackendSemanticSessionProjection {
  session: BackendSemanticSessionSnapshot;
  tree: BackendSemanticSessionTreeNode[];
  activePath: BackendSemanticPathEntry[];
  branches: BackendSemanticSessionBranchProjection[];
  archivedBranches: BackendSemanticSessionBranchProjection[];
  inheritedContextNodeIds: string[];
  later: BackendSemanticLaterEntry[];
  suggestions: BackendSemanticSuggestion[];
  ended: boolean;
  forkMetadata?: BackendSemanticForkMetadata | null;
}

export interface BackendSemanticForkMetadata {
  sourceSessionId: string;
  sourceNodeId: string;
  forkedAt: number;
  reason?: 'continue-ended-session' | 'branch-from-node' | 'manual' | null;
}

export interface BackendSemanticCandidateReason {
  code:
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
  weight: number;
  label?: string | null;
  evidenceEventIds?: string[];
}

export interface BackendSemanticCandidate {
  candidateId: string;
  node: BackendSemanticNode;
  score: number;
  lens: BackendSemanticLens;
  reasons: BackendSemanticCandidateReason[];
  explanation?: Record<string, unknown> | null;
}

export type BackendSemanticCandidateColumns = Record<BackendSemanticLens, BackendSemanticCandidate[]>;

export interface BackendSemanticStation {
  stationId: string;
  type: BackendSemanticStationType;
  sessionId: string;
  nodeId?: string | null;
  path?: BackendSemanticPathEntry[] | null;
  lensHistory?: BackendSemanticLens[] | null;
  createdAt: number;
  archivedAt?: number | null;
}

export interface BackendSemanticBrowserReadRequest {
  requestId: string;
  method: 'semantic.browser.read';
  callerIntent: string;
  rootFocusNodeId?: string | null;
  sessionId?: string | null;
  selectedNodeId?: string | null;
}

export interface BackendSemanticSessionReadRequest {
  requestId: string;
  method: 'semantic.session.read';
  callerIntent: string;
  sessionId: string;
}

export type BackendSemanticSessionReadResult =
  | {
      status: 'ok';
      requestId: string;
      projection: BackendSemanticSessionProjection;
      nodes: BackendSemanticNode[];
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export interface BackendSemanticSidebarReadRequest {
  requestId: string;
  method: 'semantic.sidebar.read';
  callerIntent: string;
  sessionId?: string | null;
  rootFocusNodeId?: string | null;
  currentNodeId?: string | null;
  bindingMode?: 'follow-current' | 'pinned-session';
}

export type BackendSemanticSidebarBindingState =
  | { type: 'pinned-session'; sessionId: string }
  | { type: 'follow-current'; rootFocusNodeId: string }
  | { type: 'current-node-unavailable'; reason: string };

export interface BackendSemanticSidebarReadModel {
  bindingState: BackendSemanticSidebarBindingState;
  session: BackendSemanticSessionSnapshot | null;
  currentNode: BackendSemanticNode | null;
  activePath: BackendSemanticPathEntry[];
  activePathNodes: BackendSemanticNode[];
  branches: BackendSemanticSessionBranchProjection[];
  candidates: BackendSemanticCandidateColumns;
  later: BackendSemanticLaterEntry[];
  suggestions: BackendSemanticSuggestion[];
  nodes: BackendSemanticNode[];
}

export type BackendSemanticSidebarReadResult =
  | {
      status: 'ok';
      requestId: string;
      model: BackendSemanticSidebarReadModel;
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export type BackendSemanticBrowserReadResult =
  | {
      status: 'ok';
      requestId: string;
      activeSession: BackendSemanticSessionSnapshot | null;
      session: BackendSemanticSessionSnapshot | null;
      rootNode: BackendSemanticNode | null;
      currentNode: BackendSemanticNode | null;
      projection?: BackendSemanticSessionProjection | null;
      nodes?: BackendSemanticNode[];
      selectedNode?: BackendSemanticNode | null;
      edgeExplanations?: BackendSemanticEdgeExplanation[];
      later?: BackendSemanticLaterEntry[];
      suggestions?: BackendSemanticSuggestion[];
      archivedBranches?: BackendSemanticSessionBranchProjection[];
      candidates: BackendSemanticCandidateColumns;
      stations: BackendSemanticStation[];
      stationNodes: BackendSemanticNode[];
      rootScopedStations: BackendSemanticStation[];
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
        | 'projection-unavailable'
        | 'graph-unavailable'
        | 'session-unavailable'
        | 'focus-unavailable'
        | 'candidate-unavailable'
        | 'station-unavailable'
        | 'invalid-request'
        | 'failed';
      message: string;
      diagnosticEventId: string;
    };

export type BackendSemanticCommand =
  | { type: 'start-session'; rootFocusNodeId: string; rootFocusNodeType?: BackendSemanticNodeType | null; sessionId?: string; idempotencyKey?: string }
  | {
      type: 'fork-session';
      sourceSessionId: string;
      sourceNodeId: string;
      rootFocusNodeId: string;
      forkMetadata?: Omit<BackendSemanticForkMetadata, 'forkedAt'> | null;
      idempotencyKey?: string;
    }
  | { type: 'follow-candidate'; sessionId: string; candidateId: string; lens: BackendSemanticLens; idempotencyKey?: string }
  | {
      type: 'create-branch-edge';
      sessionId: string;
      fromNodeId: string;
      toNodeId: string;
      lens: BackendSemanticLens;
      explanation?: BackendSemanticEdgeExplanation | null;
      idempotencyKey?: string;
    }
  | { type: 'move-active-cursor'; sessionId: string; nodeId: string; idempotencyKey?: string }
  | { type: 'archive-branch'; sessionId: string; branchId: string; idempotencyKey?: string }
  | { type: 'restore-branch'; sessionId: string; branchId: string; idempotencyKey?: string }
  | { type: 'add-later'; sessionId: string; nodeId: string; reason?: string | null; idempotencyKey?: string }
  | { type: 'remove-later'; sessionId: string; nodeId: string; idempotencyKey?: string }
  | {
      type: 'create-suggestion';
      sessionId: string;
      suggestionId: string;
      source: 'ai' | 'system';
      summary: string;
      targetNodeId?: string | null;
      idempotencyKey?: string;
    }
  | { type: 'ignore-suggestion'; sessionId: string; suggestionId: string; idempotencyKey?: string }
  | { type: 'bind-suggestion'; sessionId: string; suggestionId: string; nodeId: string; idempotencyKey?: string }
  | { type: 'materialize-suggestion'; sessionId: string; suggestionId: string; blockId: string; cardId?: string | null; idempotencyKey?: string }
  | { type: 'switch-lens'; sessionId: string; lens: BackendSemanticLens; idempotencyKey?: string }
  | { type: 'create-station'; sessionId: string; stationType: BackendSemanticStationType; idempotencyKey?: string }
  | {
      type: 'record-implicit-node-action';
      sessionId: string;
      nodeId: string;
      action: 'follow' | 'expand' | 'node-station' | 'path-station' | 'skip' | 'mark-irrelevant';
      lens?: BackendSemanticLens;
      idempotencyKey?: string;
    }
  | {
      type: 'accept-relation' | 'reject-relation';
      sessionId: string;
      relationId: string;
      fromNodeId: string;
      toNodeId: string;
      confidence?: number;
      reason?: string | null;
      source?: 'manual' | 'ai';
      idempotencyKey?: string;
    }
  | { type: 'mark-irrelevant'; sessionId: string; nodeId: string; scope?: 'session' | 'root'; idempotencyKey?: string }
  | { type: 'archive-station'; sessionId: string; stationId: string; idempotencyKey?: string }
  | { type: 'restore-path-station'; sessionId: string; stationId: string; idempotencyKey?: string }
  | { type: 'end-session'; sessionId: string; idempotencyKey?: string }
  | { type: 'restore-session'; sessionId: string; idempotencyKey?: string };

export interface BackendSemanticCommandRequest {
  requestId: string;
  method: 'semantic.command.execute';
  callerIntent: string;
  idempotencyKey: string;
  command: BackendSemanticCommand;
}

export type BackendSemanticCommandResult =
  | {
      status: 'ok';
      commandId: string;
      writerInstanceId: string;
      changed: MutationChangedSet;
      session?: unknown | null;
      event?: unknown | null;
      events?: unknown[] | null;
      station?: unknown | null;
      relation?: unknown | null;
      archivedStationId?: string | null;
      diagnosticEventId: string;
    }
  | {
      status: 'unavailable' | 'failed';
      unavailableReason:
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
      message: string;
      diagnosticEventId: string;
    };

export interface PrivateApiAuditQueryRequest {
  requestId: string;
  method: 'private.audit.query';
  callerIntent: string;
  limit?: number;
}

export type P6OwnershipSurface =
  | 'xiuyuan'
  | 'progressive'
  | 'topic-derived'
  | 'autocard-scanner'
  | 'block-menu'
  | 'dialog-manager'
  | 'data-access-facade';

export type P6OwnershipOperation =
  | 'scan-candidates'
  | 'resolve-list-children'
  | 'resolve-concept'
  | 'read-block-meta'
  | 'read-block-content'
  | 'read-card-context'
  | 'execute-side-effect';

export interface P6OwnershipQueryRequest {
  requestId?: string;
  surface: P6OwnershipSurface;
  operation: Exclude<P6OwnershipOperation, 'execute-side-effect'>;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface P6OwnershipCommandRequest {
  requestId?: string;
  surface: P6OwnershipSurface;
  operation: 'execute-side-effect';
  payload?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface P6OwnershipResult {
  ok: true;
  surface: P6OwnershipSurface;
  operation: P6OwnershipOperation;
  owner: 'application-command' | 'backend-worker' | 'writer-relay' | 'compatibility-read';
  status: 'completed' | 'unavailable' | 'failed';
  unavailableClass?: BackendUnavailableClass | null;
  diagnosticEventId: string;
  data?: unknown;
}

export interface BackendBrowserDeckSnapshotQuery {
  preset?: string;
  searchText?: string;
  docId?: string;
  scopeDocIds?: string[] | null;
  states?: number[];
  cardTypes?: string[];
  deckIds?: string[];
  tags?: string[];
  sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
}

export interface BackendBrowserDeckPageRequest {
  startRow?: number;
  endRow?: number;
}

export interface BackendBrowserDeckPageResult {
  total: number;
  cards: unknown[];
}

export interface BackendSourceExistenceRefreshRequest {
  blockIds?: string[];
  limit?: number;
  staleBefore?: number;
  includeKnownMissing?: boolean;
}

export interface BackendSourceExistenceRefreshCandidate {
  cardId: string;
  blockId: string;
  sourceExists: boolean | null;
  sourceCheckedAt: number | null;
}

export interface BackendSourceExistenceUpdate {
  cardId?: string;
  blockId: string;
  exists: boolean;
}

export interface BackendSourceExistenceSummary {
  unknown: number;
  stale: number;
  missing: number;
}

export interface BackendSourceExistenceSweepApplyRequest {
  request?: BackendSourceExistenceRefreshRequest;
  existingBlockIds: string[];
  checkedAt?: number;
}

export interface BackendSourceExistenceSweepApplyResult {
  checked: number;
  updated: number;
  changed: boolean;
  changedToMissing: boolean;
  changedBlockIds?: string[];
}

export interface BackendQueueProjectionSnapshotRequest {
  queueType: string;
  policyHash?: string | null;
  generation?: number | null;
  limit?: number | null;
  offset?: number | null;
}

export type QueueProjectionReadinessCause =
  | 'projection_stale'
  | 'materialization_in_progress'
  | 'backend_busy'
  | 'backend_unavailable'
  | 'writer_unavailable'
  | 'contract_mismatch'
  | 'invalid_queue'
  | 'projection_unavailable'
  | 'materialization_failed';

export interface QueueProjectionReadinessRequest {
  queueType: string;
  preset?: string | null;
  searchText?: string | null;
  docId?: string | null;
  scopeDocIds?: string[] | null;
  cardType?: string | null;
  source?: string | null;
}

export interface QueueProjectionReady {
  status: 'ready';
  queueId: string;
  policyId: string;
  generation: number;
  stale?: boolean;
}

export interface QueueProjectionRefreshing {
  status: 'refreshing';
  queueId: string;
  policyId: string;
  cause: QueueProjectionReadinessCause;
  retryAfterMs?: number;
}

export interface QueueProjectionUnavailable {
  status: 'unavailable';
  queueId: string;
  policyId: string;
  cause: QueueProjectionReadinessCause;
  reason: string;
  recoverable: boolean;
  retryAfterMs?: number;
}

export type QueueProjectionReadiness =
  | QueueProjectionReady
  | QueueProjectionRefreshing
  | QueueProjectionUnavailable;

export interface BackendQueueProjectionRowsByIdsRequest {
  queueType: string;
  ids: string[];
  policyHash?: string | null;
  generation?: number | null;
}

export interface BackendQueueProjectionSnapshotRow {
  id: string;
  fsrsCardId: string;
  blockId: string;
  deckId: string;
  rootId: string;
  content: string;
  fullContent: string;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: number | null;
  interval: number;
  firstReview: number | null;
  priority: number;
  suspended: boolean;
  cardType?: string;
  aFactor?: number;
  queueIndex?: number;
  tags: string[];
  blockType?: string | null;
}

export interface BackendQueueProjectionSnapshotResult {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  status: 'ready' | 'invalidated' | 'rebuilding' | 'repairing' | 'unavailable' | string;
  rows: BackendQueueProjectionSnapshotRow[];
  counters: BackendReviewFeedbackQueueImpactCounters | null;
}

export interface BackendQueueProjectionRowsByIdsResult {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  status: BackendQueueProjectionSnapshotResult['status'];
  rows: BackendQueueProjectionSnapshotRow[];
  cards: unknown[];
}

export interface BackendQueueProjectionReplaceRequest {
  queueType: string;
  policyHash: string;
  generation?: number | null;
  reason?: string | null;
  rows: BackendReviewFeedbackQueueImpactRow[];
  metadata?: Record<string, unknown> | null;
}

export interface BackendQueueProjectionReplaceResult {
  queueType: string;
  policyHash: string;
  generation: number;
  status: 'ready';
  rows: number;
  counters: BackendReviewFeedbackQueueImpactCounters;
}

export interface BackendReviewFeedbackRequest {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  queueType?: string;
  queueMode?: string;
  commitPolicy?: string;
  sessionId?: string;
  reviewedAt?: number;
  projectionGeneration?: number;
  projectionPolicyHash?: string;
  scheduler?: BackendReviewSchedulerConfig;
}

export interface BackendReviewSchedulerConfig {
  defaultScheduler?: 'fsrs-v6' | 'a-factor-v2';
  fsrsParams?: unknown;
}

export interface BackendReviewFeedbackQueueImpactRow {
  queueType: string;
  rowId: string;
  cardId: string;
  blockId: string | null;
  deckId: string | null;
  membershipReason: string;
  dueAt: number | null;
  dueBucket: string;
  priorityScore: number;
  sortKey: string;
  queueIndexHint: number | null;
  policyHash: string;
  sourceGeneration: number;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface BackendReviewFeedbackQueueImpactCounters {
  queueType: string;
  policyHash: string;
  generation: number;
  version: number;
  remaining: number;
  due: number;
  total: number;
  currentLearningDue?: number;
  todayReviewDue?: number;
  allowedNew?: number;
  learnAheadAvailable?: number;
  scheduledTotal?: number;
  buckets: Record<string, number>;
  updatedAt: number;
}

export interface BackendReviewFeedbackQueueImpactReorderHint {
  rowId: string;
  cardId: string;
  sortKey: string | null;
  queueIndexHint: number | null;
  previousSortKey?: string | null;
  previousQueueIndexHint?: number | null;
  reason: 'inserted' | 'updated' | 'removed' | 'refresh-required' | string;
}

export interface BackendReviewFeedbackQueueImpactEntry {
  queueType: string;
  policyHash: string | null;
  generation: number | null;
  requestedGeneration?: number | null;
  currentGeneration?: number | null;
  hotPatchable: boolean;
  refreshRequired: boolean;
  reason: 'review-feedback' | 'projection-unavailable' | 'generation-mismatch' | 'projection-invalidated' | string;
  removedRowIds: string[];
  insertedRows: BackendReviewFeedbackQueueImpactRow[];
  updatedRows: BackendReviewFeedbackQueueImpactRow[];
  reorderHints: BackendReviewFeedbackQueueImpactReorderHint[];
  counterGeneration: number | null;
  counters: BackendReviewFeedbackQueueImpactCounters | null;
}

export interface BackendReviewFeedbackQueueImpact {
  hotPatchable: boolean;
  refreshRequired: boolean;
  affectedQueues: BackendReviewFeedbackQueueImpactEntry[];
}

export interface BackendReviewFeedbackResult {
  cardId: string;
  committed: boolean;
  reviewedAt: number;
  queueType: string;
  updatedCard: unknown | null;
  queueImpact?: BackendReviewFeedbackQueueImpact | null;
}

export type BackendNeuralRoamFeedbackAction = 'rate' | 'skip' | 'custom';

export interface BackendNeuralRoamFeedback {
  action: BackendNeuralRoamFeedbackAction;
  rating?: 1 | 2 | 3 | 4;
  customActionId?: string | null;
}

export interface BackendNeuralRoamStartFromFocusRequest {
  blockId: string;
  includeFocusAsFirst?: boolean;
  resetHistory?: boolean;
  startNewSession?: boolean;
}

export interface BackendNeuralRoamItem {
  id: string;
  cardId: string;
  blockId: string;
  deckId?: string | null;
  due?: number | null;
  type?: string | null;
  meta?: Record<string, unknown> | null;
  sourceKind?: 'virtual' | 'associated-review' | 'unknown';
  payload?: Record<string, unknown> | null;
}

export interface BackendNeuralRoamAdvanceRequest {
  queueType: 'neural-roam';
  sessionId?: string | null;
  currentItem?: BackendNeuralRoamItem | Record<string, unknown> | null;
  feedback?: BackendNeuralRoamFeedback | null;
  projectionGeneration?: number | null;
  policyHash?: string | null;
  reviewedAt?: number | null;
  idempotencyKey?: string | null;
  scheduler?: BackendReviewSchedulerConfig;
  startFromFocus?: BackendNeuralRoamStartFromFocusRequest | null;
}

export type BackendNeuralRoamAdvanceUnavailableReason =
  | 'advance-contract-unavailable'
  | 'graph-query-unavailable'
  | 'writer-unavailable'
  | 'current-item-missing'
  | 'source-block-missing'
  | 'generation-mismatch'
  | 'policy-mismatch'
  | 'invalid-request'
  | 'failed';

export interface BackendNeuralRoamCounters {
  remaining: number;
  due: number;
  total: number;
  pendingAssociatedReview: number;
  sourceNodes: number;
}

export interface BackendNeuralRoamSessionState {
  sessionId: string | null;
  engineMode: string | null;
  currentNodeId: string | null;
  currentEventId: string | null;
  pathLength: number;
  historyCount: number;
  exhausted: boolean;
  projectionGeneration: number | null;
  policyHash: string | null;
}

export interface BackendNeuralRoamAdvanceResult {
  queueType: 'neural-roam';
  sessionId: string | null;
  status: 'advanced' | 'exhausted' | 'unavailable' | 'mismatch' | 'failed';
  nextItem: BackendNeuralRoamItem | null;
  counters: BackendNeuralRoamCounters;
  sessionState: BackendNeuralRoamSessionState;
  queueState: Record<string, unknown> | null;
  projectionImpact: BackendReviewFeedbackQueueImpact | null;
  unavailableReason: BackendNeuralRoamAdvanceUnavailableReason | null;
  message?: string | null;
}

export type BackendNeuralGraphQueryOperation =
  | 'fetchBlockData'
  | 'fetchNeighbors'
  | 'fetchBacklinks'
  | 'fetchDirectOutgoingLinks'
  | 'fetchIndirectOutgoingLinks'
  | 'fetchOutgoingLinks'
  | 'fetchDescriptors'
  | 'isConceptCard'
  | 'fetchSubtreeBlockIds'
  | 'fetchEdges'
  | 'fetchHyperspaceEdges'
  | 'fetchConceptMapEdges'
  | 'fetchElementLinkEdges'
  | 'fetchBlockTreeEdges'
  | 'fetchDocumentTreeEdges'
  | 'fetchNodePriority';

export interface BackendNeuralGraphQueryRequest {
  operation: BackendNeuralGraphQueryOperation;
  blockId: string;
  relatedBlockIds?: string[];
  options?: Record<string, unknown> | null;
}

export interface BackendNeuralGraphQueryResult<TData = unknown> {
  status: 'found' | 'known-missing' | 'unknown' | 'failed';
  blockId: string;
  data: TData | null;
  error?: string | null;
}

export interface BackendAutoCardDecisionSettings {
  enabledSymbols?: {
    basic?: boolean;
    concept?: boolean;
    descriptor?: boolean;
    cloze?: boolean;
    multiLine?: boolean;
  };
  topicDerivation?: {
    enabled?: boolean;
  };
}

export interface BackendAutoCardDecisionResolveRequest {
  candidateId?: string;
  idempotencyKey?: string;
  requesterInstanceId?: string;
  blockId: string;
  content: string;
  blockType?: string;
  resolvedCardType?: 'topic' | 'item';
  source?: 'symbol-listener' | 'doc-oneclick-scan';
  ruleScope?: 'all' | 'single-block' | 'structural';
  hasParentTopicCard?: boolean;
  settings?: BackendAutoCardDecisionSettings;
}

export interface BackendAutoCardDecisionProjection {
  id: string;
  family: string;
  templateId: string;
  cardType: string;
  mode: string;
  executorKind: string;
  renderProfile?: string;
  direction?: 'forward' | 'backward' | 'both';
  priority: number;
  conflictGroup?: string;
  hints?: Record<string, unknown>;
}

export interface BackendAutoCardDecisionResolveResult {
  candidateId: string;
  decisionEventId: string;
  status: 'selected' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
  unavailableClass: BackendUnavailableClass | null;
  matchedRuleIds: string[];
  enabledDecisions: BackendAutoCardDecisionProjection[];
  filteredDecisions: BackendAutoCardDecisionProjection[];
  selectedDecision: BackendAutoCardDecisionProjection | null;
  conflicted: boolean;
  strategyUsed: 'semantic-first' | 'cloze-first' | 'basic-first' | 'skip';
  markOnlyClozeCandidate: boolean;
  shouldUseTopicDerivation: boolean;
}

export interface BackendAutoCardExecutePlannerEnvelope {
  kind: 'planner-decision';
  blockId: string;
  content: string;
  decision: BackendAutoCardDecisionProjection;
  source: 'symbol-listener' | 'doc-oneclick-scan';
  docRootId?: string;
}

export interface BackendAutoCardExecuteTopicDerivedEnvelope {
  kind: 'topic-derived';
  input: {
    sourceBlockId: string;
    sourceDocId: string;
    parentTopicCardId: string;
    parentExcerptId?: string;
    sourceRootKind?: 'ordinary-doc' | 'piece' | 'excerpt-doc' | 'excerpt-block' | 'topic-doc';
    plannerContent: string;
    artifactContentDom?: string;
    mode?: 'planner-derived' | 'manual-cloze';
    answerFingerprint?: string;
    previewText?: string;
    decisions: BackendAutoCardDecisionProjection[];
    storageMode?: 'workbench' | 'source-child';
  };
}

export type BackendAutoCardExecuteEnvelope =
  | BackendAutoCardExecutePlannerEnvelope
  | BackendAutoCardExecuteTopicDerivedEnvelope;

export interface BackendAutoCardExecuteRequest {
  envelope: BackendAutoCardExecuteEnvelope;
}

export interface BackendAutoCardExecuteResult {
  candidateId?: string;
  decisionEventId?: string;
  status?: 'created' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
  unavailableClass?: BackendUnavailableClass | null;
  executed: boolean;
  created: number;
  skipped: number;
}

export interface BackendKernelTransactionIngestRequest {
  source?: 'kernel-sidecar' | 'ws-main';
  transactions?: unknown[];
  receivedAt?: number;
  idempotencyKey?: string;
}

export interface BackendKernelTransactionIngestResult {
  accepted: number;
  queued: number;
  receivedAt: number;
  duplicate: boolean;
  queueLength: number;
  maxQueueLength: number;
}

export interface BackendKernelTransactionActionBase {
  source: 'kernel-sidecar' | 'ws-main';
  receivedAt: number;
  idempotencyKey: string;
}

export interface BackendKernelTransactionRemoveAction extends BackendKernelTransactionActionBase {
  type: 'native-riff-remove';
  blockIds: string[];
}

export interface BackendKernelTransactionUpsertAction extends BackendKernelTransactionActionBase {
  type: 'native-riff-upsert';
  blockIds: string[];
}

export interface BackendKernelTransactionAutoCardAction extends BackendKernelTransactionActionBase {
  type: 'auto-card-candidates';
  operations: Array<{
    action: 'insert' | 'update' | 'delete';
    blockId: string;
  }>;
}

export type BackendKernelTransactionAction =
  | BackendKernelTransactionRemoveAction
  | BackendKernelTransactionUpsertAction
  | BackendKernelTransactionAutoCardAction;

export interface BackendKernelTransactionDequeueRequest {
  maxActions?: number;
}

export interface BackendKernelTransactionDequeueResult {
  actions: BackendKernelTransactionAction[];
  remaining: number;
}

export interface BackendKernelTransactionRequeueRequest {
  actions?: BackendKernelTransactionAction[];
}

export interface BackendKernelTransactionRequeueResult {
  requeued: number;
  queueLength: number;
  maxQueueLength: number;
}
