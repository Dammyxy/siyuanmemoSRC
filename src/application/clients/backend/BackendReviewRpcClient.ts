import type {
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  BackendReviewSessionCurrentRequest,
  BackendReviewSessionFeedbackRequest,
  BackendReviewSessionFeedbackResult,
  BackendReviewSessionSkipRequest,
  BackendReviewSessionSkipResult,
  BackendReviewSessionStartRequest,
  BackendReviewSessionState,
  BackendReviewSessionUndoRequest,
  BackendReviewSessionUndoResult,
  BackendReviewFeedbackTruthFlushRequest,
  BackendReviewFeedbackTruthFlushResult,
  BackendReviewSourceRefreshExecuteRequest,
  BackendReviewSourceRefreshExecuteResult,
  BackendReviewTruthBackfillRequest,
  BackendReviewTruthBackfillResult,
  BackendReviewTruthMaintenanceStatusResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendReviewClientFacet {
  reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult>;
  reviewSessionStart(request: BackendReviewSessionStartRequest): Promise<BackendReviewSessionState>;
  reviewSessionCurrent(request: BackendReviewSessionCurrentRequest): Promise<BackendReviewSessionState>;
  reviewSessionFeedback(request: BackendReviewSessionFeedbackRequest): Promise<BackendReviewSessionFeedbackResult>;
  reviewSessionSkip(request: BackendReviewSessionSkipRequest): Promise<BackendReviewSessionSkipResult>;
  reviewSessionUndo(request: BackendReviewSessionUndoRequest): Promise<BackendReviewSessionUndoResult>;
  reviewTruthFlush(request: BackendReviewFeedbackTruthFlushRequest): Promise<BackendReviewFeedbackTruthFlushResult>;
  reviewTruthBackfill(request: BackendReviewTruthBackfillRequest): Promise<BackendReviewTruthBackfillResult>;
  reviewTruthMaintenanceStatus(): Promise<BackendReviewTruthMaintenanceStatusResult>;
  executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult>;
}

export class BackendReviewRpcClient implements BackendReviewClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    return this.rpcCaller.call<BackendReviewFeedbackResult>('review.feedback', request);
  }

  reviewSessionStart(request: BackendReviewSessionStartRequest): Promise<BackendReviewSessionState> {
    return this.rpcCaller.call<BackendReviewSessionState>('review.session.start', request);
  }

  reviewSessionCurrent(request: BackendReviewSessionCurrentRequest): Promise<BackendReviewSessionState> {
    return this.rpcCaller.call<BackendReviewSessionState>('review.session.current', request);
  }

  reviewSessionFeedback(request: BackendReviewSessionFeedbackRequest): Promise<BackendReviewSessionFeedbackResult> {
    return this.rpcCaller.call<BackendReviewSessionFeedbackResult>('review.session.feedback', request);
  }

  reviewSessionSkip(request: BackendReviewSessionSkipRequest): Promise<BackendReviewSessionSkipResult> {
    return this.rpcCaller.call<BackendReviewSessionSkipResult>('review.session.skip', request);
  }

  reviewSessionUndo(request: BackendReviewSessionUndoRequest): Promise<BackendReviewSessionUndoResult> {
    return this.rpcCaller.call<BackendReviewSessionUndoResult>('review.session.undo', request);
  }

  reviewTruthFlush(request: BackendReviewFeedbackTruthFlushRequest): Promise<BackendReviewFeedbackTruthFlushResult> {
    return this.rpcCaller.call<BackendReviewFeedbackTruthFlushResult>('review.truth.flush', request);
  }

  reviewTruthBackfill(request: BackendReviewTruthBackfillRequest): Promise<BackendReviewTruthBackfillResult> {
    return this.rpcCaller.call<BackendReviewTruthBackfillResult>('review.truth.backfill', request);
  }

  reviewTruthMaintenanceStatus(): Promise<BackendReviewTruthMaintenanceStatusResult> {
    return this.rpcCaller.call<BackendReviewTruthMaintenanceStatusResult>('review.truth.maintenanceStatus');
  }

  executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult> {
    return this.rpcCaller.call<BackendReviewSourceRefreshExecuteResult>('review.sourceRefresh.execute', request);
  }
}
