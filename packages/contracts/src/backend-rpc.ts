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

export interface BackendReviewFeedbackRequest {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  queueType?: string;
  queueMode?: string;
  commitPolicy?: string;
  sessionId?: string;
  reviewedAt?: number;
  scheduler?: BackendReviewSchedulerConfig;
}

export interface BackendReviewSchedulerConfig {
  defaultScheduler?: 'fsrs-v6' | 'a-factor-v2';
  fsrsParams?: unknown;
}

export interface BackendReviewFeedbackResult {
  cardId: string;
  committed: boolean;
  reviewedAt: number;
  queueType: string;
  updatedCard: unknown | null;
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
