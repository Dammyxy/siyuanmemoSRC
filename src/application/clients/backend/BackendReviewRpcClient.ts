import type {
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  BackendReviewFeedbackTruthFlushRequest,
  BackendReviewFeedbackTruthFlushResult,
  BackendReviewRiffFeedbackExecuteRequest,
  BackendReviewRiffFeedbackExecuteResult,
  BackendReviewSourceRefreshExecuteRequest,
  BackendReviewSourceRefreshExecuteResult,
  BackendReviewTruthBackfillRequest,
  BackendReviewTruthBackfillResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendReviewClientFacet {
  reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult>;
  reviewTruthFlush(request: BackendReviewFeedbackTruthFlushRequest): Promise<BackendReviewFeedbackTruthFlushResult>;
  reviewTruthBackfill(request: BackendReviewTruthBackfillRequest): Promise<BackendReviewTruthBackfillResult>;
  executeReviewRiffFeedback(
    request: BackendReviewRiffFeedbackExecuteRequest,
  ): Promise<BackendReviewRiffFeedbackExecuteResult>;
  executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult>;
}

export class BackendReviewRpcClient implements BackendReviewClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    return this.rpcCaller.call<BackendReviewFeedbackResult>('review.feedback', request);
  }

  reviewTruthFlush(request: BackendReviewFeedbackTruthFlushRequest): Promise<BackendReviewFeedbackTruthFlushResult> {
    return this.rpcCaller.call<BackendReviewFeedbackTruthFlushResult>('review.truth.flush', request);
  }

  reviewTruthBackfill(request: BackendReviewTruthBackfillRequest): Promise<BackendReviewTruthBackfillResult> {
    return this.rpcCaller.call<BackendReviewTruthBackfillResult>('review.truth.backfill', request);
  }

  executeReviewRiffFeedback(
    request: BackendReviewRiffFeedbackExecuteRequest,
  ): Promise<BackendReviewRiffFeedbackExecuteResult> {
    return this.rpcCaller.call<BackendReviewRiffFeedbackExecuteResult>('review.riffFeedback.execute', request);
  }

  executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult> {
    return this.rpcCaller.call<BackendReviewSourceRefreshExecuteResult>('review.sourceRefresh.execute', request);
  }
}
