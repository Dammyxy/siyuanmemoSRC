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
  BackendReviewFeedbackTruthFlushRequest,
  BackendReviewFeedbackTruthFlushResult,
  BackendReviewRiffFeedbackExecuteRequest,
  BackendReviewRiffFeedbackExecuteResult,
  BackendReviewSourceRefreshExecuteRequest,
  BackendReviewSourceRefreshExecuteResult,
  BackendReviewTruthBackfillRequest,
  BackendReviewTruthBackfillResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_REVIEW_RPC_METHODS = [
  'review.feedback',
  'review.session.start',
  'review.session.current',
  'review.session.feedback',
  'review.session.skip',
  'review.truth.flush',
  'review.truth.backfill',
  'review.riffFeedback.execute',
  'review.sourceRefresh.execute',
] as const satisfies readonly BackendRpcMethod[];

export type BackendReviewRpcMethod = typeof BACKEND_REVIEW_RPC_METHODS[number];

export type BackendReviewRpcMethodContractMap = {
  readonly 'review.feedback': BackendRpcMethodContract<
    'review.feedback',
    BackendReviewFeedbackRequest,
    BackendReviewFeedbackResult
  >;
  readonly 'review.session.start': BackendRpcMethodContract<
    'review.session.start',
    BackendReviewSessionStartRequest,
    BackendReviewSessionState
  >;
  readonly 'review.session.current': BackendRpcMethodContract<
    'review.session.current',
    BackendReviewSessionCurrentRequest,
    BackendReviewSessionState
  >;
  readonly 'review.session.feedback': BackendRpcMethodContract<
    'review.session.feedback',
    BackendReviewSessionFeedbackRequest,
    BackendReviewSessionFeedbackResult
  >;
  readonly 'review.session.skip': BackendRpcMethodContract<
    'review.session.skip',
    BackendReviewSessionSkipRequest,
    BackendReviewSessionSkipResult
  >;
  readonly 'review.truth.flush': BackendRpcMethodContract<
    'review.truth.flush',
    BackendReviewFeedbackTruthFlushRequest,
    BackendReviewFeedbackTruthFlushResult
  >;
  readonly 'review.truth.backfill': BackendRpcMethodContract<
    'review.truth.backfill',
    BackendReviewTruthBackfillRequest,
    BackendReviewTruthBackfillResult
  >;
  readonly 'review.riffFeedback.execute': BackendRpcMethodContract<
    'review.riffFeedback.execute',
    BackendReviewRiffFeedbackExecuteRequest,
    BackendReviewRiffFeedbackExecuteResult
  >;
  readonly 'review.sourceRefresh.execute': BackendRpcMethodContract<
    'review.sourceRefresh.execute',
    BackendReviewSourceRefreshExecuteRequest,
    BackendReviewSourceRefreshExecuteResult
  >;
};

export const BACKEND_REVIEW_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'review.feedback', family: 'review', clientExposure: 'facade' },
  { method: 'review.session.start', family: 'review', clientExposure: 'facade' },
  { method: 'review.session.current', family: 'review', clientExposure: 'facade' },
  { method: 'review.session.feedback', family: 'review', clientExposure: 'facade' },
  { method: 'review.session.skip', family: 'review', clientExposure: 'facade' },
  { method: 'review.truth.flush', family: 'review', clientExposure: 'facade' },
  { method: 'review.truth.backfill', family: 'review', clientExposure: 'facade' },
  { method: 'review.riffFeedback.execute', family: 'review', clientExposure: 'facade' },
  { method: 'review.sourceRefresh.execute', family: 'review', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_REVIEW_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_REVIEW_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendReviewRpcMethodContractMap>;
