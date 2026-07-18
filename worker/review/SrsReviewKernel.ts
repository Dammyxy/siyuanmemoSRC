import type {
  WorkerReviewSessionFeedbackRequest,
  WorkerReviewSessionFeedbackResult,
  WorkerReviewSessionSkipRequest,
  WorkerReviewSessionSkipResult,
  WorkerReviewSessionStartRequest,
  WorkerReviewSessionState,
  WorkerReviewSessionRuntime,
  WorkerReviewSessionUndoRequest,
  WorkerReviewSessionUndoResult,
} from './WorkerReviewSessionRuntime';
import { QueueType } from '@/types/unified-data-source';

export interface SrsReviewKernelDiagnostics {
  readonly authority: 'worker-review-session';
  readonly sessionCount: number | null;
}

export type SrsReviewKernelFactIdentity =
  | {
    readonly kind: 'idempotency-key';
    readonly idempotencyKey: string;
  }
  | {
    readonly kind: 'unavailable';
    readonly idempotencyKey: null;
  };

export interface SrsReviewKernelAnswerReceipt {
  readonly answeredCardId: string;
  readonly reviewedAt: number;
  readonly queueType: string;
  readonly commit: {
    readonly outcome: 'committed' | 'not-committed';
    readonly updatedCard: WorkerReviewSessionFeedbackResult['feedback']['updatedCard'];
    readonly duplicate: boolean;
  };
  readonly factIdentity: SrsReviewKernelFactIdentity;
  readonly durability: {
    readonly status: 'durable' | 'not-durable';
    readonly evidence: 'storage-summary' | 'worker-commit';
  };
  readonly undo: {
    readonly token: string | null;
    readonly evidence: 'transaction-journal' | 'session-snapshot' | 'unavailable';
  };
  readonly queueImpact: NonNullable<WorkerReviewSessionFeedbackResult['feedback']['queueImpact']> | null;
  readonly storage: WorkerReviewSessionFeedbackResult['feedback']['storage'] | null;
  readonly diagnostics: {
    readonly authority: 'worker-review-session';
    readonly projectionState: WorkerReviewSessionState['projectionState'];
    readonly storageSummaryAvailable: boolean;
  };
}

export type SrsReviewKernelFailureKind =
  | 'invalid'
  | 'conflict'
  | 'not-found'
  | 'unavailable'
  | 'durability';

export interface SrsReviewKernelFailure {
  readonly type: 'failure';
  readonly command: SrsReviewKernelCommand['type'] | SrsReviewKernelQuery['type'];
  readonly error: {
    readonly kind: SrsReviewKernelFailureKind;
    readonly code: string;
    readonly message: string;
  };
  readonly diagnostics: {
    readonly authority: 'worker-review-session';
    readonly sessionId: string | null;
    readonly cardId: string | null;
  };
}

export type SrsReviewKernelCommand =
  | {
    readonly type: 'start';
    readonly request?: WorkerReviewSessionStartRequest;
  }
  | {
    readonly type: 'answer';
    readonly request: WorkerReviewSessionFeedbackRequest;
  }
  | {
    readonly type: 'skip';
    readonly request: WorkerReviewSessionSkipRequest;
  }
  | {
    readonly type: 'undo';
    readonly request: WorkerReviewSessionUndoRequest;
  };

export type SrsReviewKernelResult =
  | {
    readonly type: 'start';
    readonly state: WorkerReviewSessionState;
  }
  | {
    readonly type: 'answer';
    readonly state: WorkerReviewSessionState;
    readonly receipt: SrsReviewKernelAnswerReceipt;
  }
  | {
    readonly type: 'skip';
    readonly state: WorkerReviewSessionSkipResult;
  }
  | {
    readonly type: 'undo';
    readonly state: WorkerReviewSessionUndoResult;
  }
  | SrsReviewKernelFailure;

export type SrsReviewKernelQuery =
  | {
    readonly type: 'current';
    readonly sessionId: string;
  }
  | {
    readonly type: 'diagnostics';
    readonly sessionId?: string | null;
  };

export type SrsReviewKernelView =
  | {
    readonly type: 'current';
    readonly state: WorkerReviewSessionState;
  }
  | {
    readonly type: 'diagnostics';
    readonly diagnostics: SrsReviewKernelDiagnostics;
  }
  | SrsReviewKernelFailure;

type SrsReviewKernelAnswerResult = Extract<SrsReviewKernelResult, { type: 'answer' }>;

interface SrsReviewKernelAnswerIdentity {
  readonly sessionId: string;
  readonly cardId: string;
  readonly rating: WorkerReviewSessionFeedbackRequest['rating'];
}

interface SrsReviewKernelAnswerReplay {
  readonly identity: SrsReviewKernelAnswerIdentity;
  readonly result: Promise<SrsReviewKernelAnswerResult>;
}

export interface SrsReviewKernel {
  execute(command: SrsReviewKernelCommand): Promise<SrsReviewKernelResult>;
  read(query: SrsReviewKernelQuery): SrsReviewKernelView;
}

export class WorkerSrsReviewKernel implements SrsReviewKernel {
  private readonly answerReplays = new Map<string, SrsReviewKernelAnswerReplay>();

  constructor(private readonly sessionRuntime: WorkerReviewSessionRuntime) {}

  async execute(command: SrsReviewKernelCommand): Promise<SrsReviewKernelResult> {
    const invalid = validateCommand(command);
    if (invalid) {
      return invalid;
    }
    try {
      switch (command.type) {
        case 'start':
          return {
            type: 'start',
            state: await this.sessionRuntime.startSession(command.request),
          };
        case 'answer':
          return await this.executeAnswer(command);
        case 'skip':
          return {
            type: 'skip',
            state: await this.sessionRuntime.skip(command.request),
          };
        case 'undo':
          return {
            type: 'undo',
            state: await this.sessionRuntime.undo(command.request),
          };
      }
    } catch (error) {
      return mapKernelFailure(command.type, error, command);
    }
  }

  read(query: SrsReviewKernelQuery): SrsReviewKernelView {
    const invalid = validateQuery(query);
    if (invalid) {
      return invalid;
    }
    try {
      switch (query.type) {
        case 'current':
          return {
            type: 'current',
            state: this.sessionRuntime.getSessionState(query.sessionId),
          };
        case 'diagnostics':
          return {
            type: 'diagnostics',
            diagnostics: this.buildDiagnostics(),
          };
      }
    } catch (error) {
      return mapKernelFailure(query.type, error, query);
    }
  }

  private buildDiagnostics(): SrsReviewKernelDiagnostics {
    return {
      authority: 'worker-review-session',
      sessionCount: null,
    };
  }

  private async executeAnswer(
    command: Extract<SrsReviewKernelCommand, { type: 'answer' }>,
  ): Promise<SrsReviewKernelResult> {
    const idempotencyKey = normalizeOptionalIdentity(command.request.idempotencyKey);
    if (!idempotencyKey) {
      return this.commitAnswer(command.request);
    }

    const identity = toAnswerIdentity(command.request);
    const existing = this.answerReplays.get(idempotencyKey);
    if (existing) {
      if (!sameAnswerIdentity(existing.identity, identity)) {
        return createKernelFailure(
          'answer',
          'conflict',
          'IDEMPOTENCY_CONFLICT',
          `Idempotency key already belongs to another Review answer: ${idempotencyKey}`,
          command,
        );
      }
      return existing.result;
    }

    const result = this.commitAnswer(command.request);
    this.answerReplays.set(idempotencyKey, {
      identity,
      result,
    });

    try {
      return await result;
    } catch (error) {
      this.answerReplays.delete(idempotencyKey);
      throw error;
    }
  }

  private async commitAnswer(
    request: WorkerReviewSessionFeedbackRequest,
  ): Promise<SrsReviewKernelAnswerResult> {
    const answer = await this.sessionRuntime.feedback(request);
    return {
      type: 'answer',
      state: toSessionState(answer),
      receipt: toAnswerReceipt(answer),
    };
  }
}

function toSessionState(state: WorkerReviewSessionState): WorkerReviewSessionState {
  return {
    sessionId: state.sessionId,
    queueType: state.queueType,
    current: state.current,
    lookaheadCards: state.lookaheadCards,
    counters: state.counters,
    projectionState: state.projectionState,
    projectionGeneration: state.projectionGeneration,
    projectionPolicyHash: state.projectionPolicyHash,
  };
}

function toAnswerReceipt(result: WorkerReviewSessionFeedbackResult): SrsReviewKernelAnswerReceipt {
  const idempotencyKey = normalizeOptionalIdentity(result.feedback.idempotencyKey);
  const undoToken = normalizeOptionalIdentity(result.undoToken);
  return {
    answeredCardId: result.answeredCardId,
    reviewedAt: result.feedback.reviewedAt,
    queueType: result.feedback.queueType,
    commit: {
      outcome: result.feedback.committed ? 'committed' : 'not-committed',
      updatedCard: result.feedback.updatedCard,
      duplicate: result.feedback.duplicate === true,
    },
    factIdentity: idempotencyKey
      ? {
        kind: 'idempotency-key',
        idempotencyKey,
      }
      : {
        kind: 'unavailable',
        idempotencyKey: null,
      },
    durability: {
      status: result.feedback.committed ? 'durable' : 'not-durable',
      evidence: result.feedback.storage ? 'storage-summary' : 'worker-commit',
    },
    undo: {
      token: undoToken,
      evidence: result.feedback.undoJournalPersisted === true
        ? 'transaction-journal'
        : (undoToken ? 'session-snapshot' : 'unavailable'),
    },
    queueImpact: result.feedback.queueImpact ?? null,
    storage: result.feedback.storage ?? null,
    diagnostics: {
      authority: 'worker-review-session',
      projectionState: result.projectionState,
      storageSummaryAvailable: Boolean(result.feedback.storage),
    },
  };
}

function normalizeOptionalIdentity(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function toAnswerIdentity(
  request: WorkerReviewSessionFeedbackRequest,
): SrsReviewKernelAnswerIdentity {
  return {
    sessionId: request.sessionId.trim(),
    cardId: request.cardId.trim(),
    rating: request.rating,
  };
}

function sameAnswerIdentity(
  left: SrsReviewKernelAnswerIdentity,
  right: SrsReviewKernelAnswerIdentity,
): boolean {
  return left.sessionId === right.sessionId
    && left.cardId === right.cardId
    && left.rating === right.rating;
}

function validateCommand(command: SrsReviewKernelCommand): SrsReviewKernelFailure | null {
  switch (command.type) {
    case 'start': {
      const queueType = normalizeOptionalIdentity(command.request?.queueType);
      if (queueType && !isSupportedSessionQueueType(queueType)) {
        return createKernelFailure('start', 'unavailable', 'UNSUPPORTED_QUEUE_MODE', `Unsupported queue mode: ${queueType}`, command);
      }
      const policyHash = normalizeOptionalIdentity(command.request?.projectionPolicyHash);
      const generation = normalizePositiveInteger(command.request?.projectionGeneration);
      if ((policyHash && generation === null) || (!policyHash && command.request?.projectionGeneration != null)) {
        return createKernelFailure(
          'start',
          'conflict',
          'STALE_PROJECTION_IDENTITY',
          'Projection policy and generation must identify one admitted projection',
          command,
        );
      }
      return null;
    }
    case 'answer':
      if (!normalizeOptionalIdentity(command.request.sessionId)) {
        return createKernelFailure('answer', 'invalid', 'INVALID_SESSION_ID', 'Answer requires sessionId', command);
      }
      if (!normalizeOptionalIdentity(command.request.cardId)) {
        return createKernelFailure('answer', 'invalid', 'INVALID_CARD_ID', 'Answer requires cardId', command);
      }
      if (!Number.isInteger(command.request.rating) || command.request.rating < 1 || command.request.rating > 4) {
        return createKernelFailure('answer', 'invalid', 'INVALID_RATING', 'Rating must be an integer from 1 to 4', command);
      }
      return null;
    case 'skip':
      if (!normalizeOptionalIdentity(command.request.sessionId)) {
        return createKernelFailure('skip', 'invalid', 'INVALID_SESSION_ID', 'Skip requires sessionId', command);
      }
      if (!normalizeOptionalIdentity(command.request.cardId)) {
        return createKernelFailure('skip', 'invalid', 'INVALID_CARD_ID', 'Skip requires cardId', command);
      }
      return null;
    case 'undo':
      return normalizeOptionalIdentity(command.request.sessionId)
        ? null
        : createKernelFailure('undo', 'invalid', 'INVALID_SESSION_ID', 'Undo requires sessionId', command);
  }
}

function validateQuery(query: SrsReviewKernelQuery): SrsReviewKernelFailure | null {
  if (query.type === 'current' && !normalizeOptionalIdentity(query.sessionId)) {
    return createKernelFailure('current', 'invalid', 'INVALID_SESSION_ID', 'Current requires sessionId', query);
  }
  return null;
}

function mapKernelFailure(
  command: SrsReviewKernelFailure['command'],
  error: unknown,
  input: SrsReviewKernelCommand | SrsReviewKernelQuery,
): SrsReviewKernelFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('CURRENT_MISMATCH')) {
    return createKernelFailure(command, 'conflict', 'STALE_CURRENT_TARGET', message, input);
  }
  if (message.includes('conflicting review commit idempotency key')) {
    return createKernelFailure(command, 'conflict', 'IDEMPOTENCY_CONFLICT', message, input);
  }
  if (message.includes('SESSION_UNAVAILABLE') || message.includes('card not found')) {
    return createKernelFailure(command, 'not-found', 'REVIEW_TARGET_NOT_FOUND', message, input);
  }
  if (message.includes('COMMIT_FAILED') || message.includes('durability')) {
    return createKernelFailure(command, 'durability', 'REVIEW_DURABILITY_FAILED', message, input);
  }
  if (message.includes('UNAVAILABLE') || message.includes('unavailable')) {
    return createKernelFailure(command, 'unavailable', 'REVIEW_RUNTIME_UNAVAILABLE', message, input);
  }
  if (message.includes('INVALID_REQUEST')) {
    return createKernelFailure(command, 'invalid', 'INVALID_REQUEST', message, input);
  }
  return createKernelFailure(command, 'unavailable', 'REVIEW_RUNTIME_FAILURE', message, input);
}

function createKernelFailure(
  command: SrsReviewKernelFailure['command'],
  kind: SrsReviewKernelFailureKind,
  code: string,
  message: string,
  input: SrsReviewKernelCommand | SrsReviewKernelQuery,
): SrsReviewKernelFailure {
  const request = 'request' in input ? input.request : null;
  return {
    type: 'failure',
    command,
    error: {
      kind,
      code,
      message,
    },
    diagnostics: {
      authority: 'worker-review-session',
      sessionId: normalizeOptionalIdentity(
        input.type === 'current'
          ? input.sessionId
          : request && 'sessionId' in request
            ? request.sessionId
            : input.type === 'diagnostics'
              ? input.sessionId
              : null,
      ),
      cardId: normalizeOptionalIdentity(request && 'cardId' in request ? request.cardId : null),
    },
  };
}

function isSupportedSessionQueueType(queueType: string): boolean {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning
    || queueType === QueueType.FilterGroup;
}

function normalizePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}
