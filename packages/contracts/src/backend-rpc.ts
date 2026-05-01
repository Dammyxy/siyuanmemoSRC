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
  | 'review.feedback';

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
}

export interface BackendReviewFeedbackRequest {
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  queueType?: string;
  queueMode?: string;
  commitPolicy?: string;
  sessionId?: string;
  reviewedAt?: number;
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
