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
  | 'review.feedback';

export type BackendRpcId = number | string;

export interface BackendRpcRequest<TParams = unknown> {
  jsonrpc: typeof BACKEND_RPC_VERSION;
  id: BackendRpcId;
  method: BackendRpcMethod;
  params?: TParams;
}

export type BackendRpcErrorCode =
  | 'BACKEND_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_FOUND'
  | 'INTERNAL_ERROR';

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
    removeActionQueuedTotal: number;
    upsertActionQueuedTotal: number;
    lastAcceptedAt: number | null;
    lastDrainAt: number | null;
  };
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

export type BackendKernelTransactionAction =
  | BackendKernelTransactionRemoveAction
  | BackendKernelTransactionUpsertAction;

export interface BackendKernelTransactionDequeueRequest {
  maxActions?: number;
}

export interface BackendKernelTransactionDequeueResult {
  actions: BackendKernelTransactionAction[];
  remaining: number;
}
