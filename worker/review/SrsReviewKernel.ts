import type {
  WorkerReviewSessionFeedbackRequest,
  WorkerReviewSessionFeedbackResult,
  WorkerReviewSessionSkipRequest,
  WorkerReviewSessionSkipResult,
  WorkerReviewSessionStartRequest,
  WorkerReviewSessionState,
  WorkerReviewSessionRuntime,
} from './WorkerReviewSessionRuntime';

export interface SrsReviewKernelDiagnostics {
  readonly authority: 'worker-review-session';
  readonly sessionCount: number | null;
}

export interface SrsReviewKernel {
  startSession(request?: WorkerReviewSessionStartRequest): Promise<WorkerReviewSessionState>;
  current(sessionId: string): WorkerReviewSessionState;
  answer(request: WorkerReviewSessionFeedbackRequest): Promise<WorkerReviewSessionFeedbackResult>;
  skip(request: WorkerReviewSessionSkipRequest): WorkerReviewSessionSkipResult;
  undo(sessionId: string): never;
  lookahead(sessionId: string): WorkerReviewSessionState['lookaheadCards'];
  counters(sessionId: string): WorkerReviewSessionState['counters'];
  diagnostics(sessionId?: string | null): SrsReviewKernelDiagnostics;
}

export class WorkerSrsReviewKernelAdapter implements SrsReviewKernel {
  constructor(private readonly sessionRuntime: WorkerReviewSessionRuntime) {}

  startSession(request: WorkerReviewSessionStartRequest = {}): Promise<WorkerReviewSessionState> {
    return this.sessionRuntime.startSession(request);
  }

  current(sessionId: string): WorkerReviewSessionState {
    return this.sessionRuntime.getSessionState(sessionId);
  }

  answer(request: WorkerReviewSessionFeedbackRequest): Promise<WorkerReviewSessionFeedbackResult> {
    return this.sessionRuntime.feedback(request);
  }

  skip(request: WorkerReviewSessionSkipRequest): WorkerReviewSessionSkipResult {
    return this.sessionRuntime.skip(request);
  }

  undo(sessionId: string): never {
    throw new Error(`WORKER_REVIEW_SESSION_UNDO_UNAVAILABLE: ${sessionId}`);
  }

  lookahead(sessionId: string): WorkerReviewSessionState['lookaheadCards'] {
    return this.current(sessionId).lookaheadCards;
  }

  counters(sessionId: string): WorkerReviewSessionState['counters'] {
    return this.current(sessionId).counters;
  }

  diagnostics(_sessionId?: string | null): SrsReviewKernelDiagnostics {
    return {
      authority: 'worker-review-session',
      sessionCount: null,
    };
  }
}
