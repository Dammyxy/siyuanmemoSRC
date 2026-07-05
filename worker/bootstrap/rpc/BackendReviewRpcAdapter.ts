import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type BackendReviewFeedbackRequest,
  type BackendReviewFeedbackResult,
  type BackendReviewSessionCurrentRequest,
  type BackendReviewSessionFeedbackRequest,
  type BackendReviewSessionFeedbackResult,
  type BackendReviewSessionSkipRequest,
  type BackendReviewSessionSkipResult,
  type BackendReviewSessionStartRequest,
  type BackendReviewSessionState,
  type BackendReviewFeedbackTruthFlushDiagnostics,
  type BackendReviewFeedbackTruthFlushRequest,
  type BackendReviewFeedbackTruthFlushResult,
  type BackendReviewRiffFeedbackExecuteRequest,
  type BackendReviewRiffFeedbackExecuteResult,
  type BackendReviewSourceRefreshExecuteRequest,
  type BackendReviewSourceRefreshExecuteResult,
  type BackendReviewTruthBackfillDiagnostics,
  type BackendReviewTruthBackfillRequest,
  type BackendReviewTruthBackfillResult,
  type BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_REVIEW_RPC_METHODS, type BackendReviewRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { ReviewFeedbackJournalStore } from '../../db/ReviewFeedbackJournalStore';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../../truth/MessagePackTruthSegmentStore';
import { ReviewFeedbackTruthFlushRuntime } from '../../truth/ReviewFeedbackTruthFlushRuntime';
import {
  type ReviewSqlTruthBackfillProjectionPatch,
  type ReviewSqlTruthBackfillRow,
  ReviewSqlTruthBackfillRuntime,
} from '../../truth/ReviewSqlTruthBackfillRuntime';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';
import type { WorkerReviewSessionRuntime } from '../../review/WorkerReviewSessionRuntime';

export interface BackendReviewRpcDatabase {
  reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> | BackendReviewFeedbackResult;
  invalidateReviewFeedbackMainDbFastSkip(reason: string): void;
  mergeExternalDatabaseIfChanged(
    source?: unknown,
    options?: {
      context?: string;
      cardId?: string | null;
      forceMainDbRead?: boolean;
      ignoreProcessedSourceDeduplication?: boolean;
    },
  ): Promise<unknown>;
  markReviewFeedbackOwnPersistedMainDbClean(): void;
  getReviewFeedbackJournalStore(): ReviewFeedbackJournalStore | null;
  listReviewEventsForTruthBackfill(limit?: number): Promise<ReviewSqlTruthBackfillRow[]>;
  patchReviewTruthBackfillProjectionRefs(patches: ReviewSqlTruthBackfillProjectionPatch[]): Promise<void>;
  countReviewEventsPendingTruthBackfill(): Promise<number>;
  updateSourceExistence(
    entries: Array<{ cardId?: string; blockId: string; exists: boolean }>,
    checkedAt: number,
  ): Promise<unknown> | unknown;
}

export interface BackendReviewRpcRuntimeOptions {
  readonly database: BackendReviewRpcDatabase;
  readonly truthFileStore?: MessagePackTruthSegmentFileStore;
  readonly sessionRuntime?: WorkerReviewSessionRuntime | null;
  executeReviewRiffFeedback?(
    request: BackendReviewRiffFeedbackExecuteRequest,
  ): Promise<BackendReviewRiffFeedbackExecuteResult> | BackendReviewRiffFeedbackExecuteResult;
}

export interface BackendReviewFeedbackKernelTiming {
  readonly cardId: string | null;
  readonly requestStartedAt: number | null;
  logStep(step: string, durationMs: number, extra: Record<string, unknown>): void;
}

export class BackendReviewRpcRuntime {
  private readonly reviewRiffFeedbackResultsByIdempotencyKey = new Map<string, BackendReviewRiffFeedbackExecuteResult>();
  private readonly reviewSourceRefreshResultsByIdempotencyKey = new Map<string, BackendReviewSourceRefreshExecuteResult>();
  private lastReviewFeedbackTruthFlush: BackendReviewFeedbackTruthFlushResult | null = null;
  private lastReviewTruthBackfill: BackendReviewTruthBackfillResult | null = null;

  constructor(private readonly options: BackendReviewRpcRuntimeOptions) {}

  async handleReviewFeedback(params: unknown): Promise<BackendReviewFeedbackResult> {
    const named = readRequiredNamedParams<BackendReviewFeedbackRequest>(
      params,
      'review.feedback requires named params',
    );
    const result = await this.reviewFeedbackWithForcedMainDbRetry(named);
    if (result.committed) {
      this.options.database.markReviewFeedbackOwnPersistedMainDbClean();
    }
    return result;
  }

  async handleReviewSessionStart(params: unknown): Promise<BackendReviewSessionState> {
    const named = readRequiredNamedParams<BackendReviewSessionStartRequest>(
      params,
      'review.session.start requires named params',
    );
    return this.requireSessionRuntime().startSession(named);
  }

  handleReviewSessionCurrent(params: unknown): BackendReviewSessionState {
    const named = readRequiredNamedParams<BackendReviewSessionCurrentRequest>(
      params,
      'review.session.current requires named params',
    );
    const sessionId = String(named.sessionId || '').trim();
    if (!sessionId) {
      throw new Error('INVALID_REQUEST: review.session.current requires sessionId');
    }
    return this.requireSessionRuntime().getSessionState(sessionId);
  }

  async handleReviewSessionFeedback(params: unknown): Promise<BackendReviewSessionFeedbackResult> {
    const named = readRequiredNamedParams<BackendReviewSessionFeedbackRequest>(
      params,
      'review.session.feedback requires named params',
    );
    return this.requireSessionRuntime().feedback(named);
  }

  handleReviewSessionSkip(params: unknown): BackendReviewSessionSkipResult {
    const named = readRequiredNamedParams<BackendReviewSessionSkipRequest>(
      params,
      'review.session.skip requires named params',
    );
    return this.requireSessionRuntime().skip(named);
  }

  async handleReviewTruthFlush(params: unknown): Promise<BackendReviewFeedbackTruthFlushResult> {
    const named = readRequiredNamedParams<BackendReviewFeedbackTruthFlushRequest>(
      params,
      'review.truth.flush requires named params',
    );
    const journalStore = this.options.database.getReviewFeedbackJournalStore();
    if (!journalStore) {
      throw new Error('BACKEND_UNAVAILABLE: review.truth.flush requires Review feedback journal store');
    }
    if (!this.options.truthFileStore) {
      throw new Error('BACKEND_UNAVAILABLE: review.truth.flush requires truth segment file store');
    }
    const deviceId = String(named.deviceId || '').trim();
    const generationId = String(named.generationId || '').trim();
    if (!deviceId) {
      throw new Error('TRUTH_DEVICE_ID_UNAVAILABLE: review.truth.flush requires truth-wide persistent local device id');
    }
    if (!generationId) {
      throw new Error('INVALID_REQUEST: review.truth.flush requires generationId');
    }
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: this.options.truthFileStore,
      family: 'review-events',
      deviceId,
      generationId,
      schemaVersion: Math.max(1, Math.floor(Number(named.schemaVersion) || MESSAGEPACK_TRUTH_SCHEMA_VERSION)),
      maxSegmentBytes: Math.max(256, Math.floor(Number(named.maxSegmentBytes) || 1024 * 1024)),
    });
    const runtime = new ReviewFeedbackTruthFlushRuntime({
      journalStore,
      truthStore,
      batchLimit: named.batchLimit,
      scheduleProjectionRefresh: async () => undefined,
    });
    const result = await runtime.flushProjectionApplied();
    this.lastReviewFeedbackTruthFlush = result;
    return result;
  }

  async handleReviewTruthBackfill(params: unknown): Promise<BackendReviewTruthBackfillResult> {
    const named = readRequiredNamedParams<BackendReviewTruthBackfillRequest>(
      params,
      'review.truth.backfill requires named params',
    );
    if (!this.options.truthFileStore) {
      throw new Error('BACKEND_UNAVAILABLE: review.truth.backfill requires truth segment file store');
    }
    const deviceId = String(named.deviceId || '').trim();
    const generationId = String(named.generationId || '').trim();
    if (!deviceId) {
      throw new Error('TRUTH_DEVICE_ID_UNAVAILABLE: review.truth.backfill requires truth-wide persistent local device id');
    }
    if (!generationId) {
      throw new Error('INVALID_REQUEST: review.truth.backfill requires generationId');
    }
    const schemaVersion = Math.max(1, Math.floor(Number(named.schemaVersion) || MESSAGEPACK_TRUTH_SCHEMA_VERSION));
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: this.options.truthFileStore,
      family: 'review-events',
      deviceId,
      generationId,
      schemaVersion,
      maxSegmentBytes: Math.max(256, Math.floor(Number(named.maxSegmentBytes) || 1024 * 1024)),
    });
    const runtime = new ReviewSqlTruthBackfillRuntime({
      truthStore,
      deviceId,
      generationId,
      schemaVersion,
      limit: named.batchLimit,
      sourceId: named.sourceId,
      listRows: (limit) => this.options.database.listReviewEventsForTruthBackfill(limit),
      patchRows: (patches) => this.options.database.patchReviewTruthBackfillProjectionRefs(patches),
      scheduleProjectionRefresh: async () => undefined,
    });
    const result = await runtime.backfill();
    this.lastReviewTruthBackfill = result;
    return result;
  }

  async handleReviewRiffFeedbackExecute(params: unknown): Promise<BackendReviewRiffFeedbackExecuteResult> {
    const named = readRequiredNamedParams<BackendReviewRiffFeedbackExecuteRequest>(
      params,
      'review.riffFeedback.execute requires named params',
    );
    const key = String(named.idempotencyKey || '').trim();
    const cached = this.reviewRiffFeedbackResultsByIdempotencyKey.get(key);
    if (cached) {
      return cached.status === 'completed' ? { ...cached, status: 'duplicate' } : cached;
    }
    if (typeof this.options.executeReviewRiffFeedback !== 'function') {
      const result = this.createReviewRiffFeedbackUnavailable(named, 'review.riffFeedback.execute host effect unavailable');
      this.reviewRiffFeedbackResultsByIdempotencyKey.set(key, result);
      return result;
    }
    try {
      const result = await this.options.executeReviewRiffFeedback(named);
      this.reviewRiffFeedbackResultsByIdempotencyKey.set(key, result);
      return result;
    } catch (error) {
      const result = this.createReviewRiffFeedbackUnavailable(
        named,
        error instanceof Error ? error.message : String(error || 'review riff feedback failed'),
        'FAILED',
      );
      this.reviewRiffFeedbackResultsByIdempotencyKey.set(key, result);
      return result;
    }
  }

  async handleReviewSourceRefreshExecute(params: unknown): Promise<BackendReviewSourceRefreshExecuteResult> {
    const named = readRequiredNamedParams<BackendReviewSourceRefreshExecuteRequest>(
      params,
      'review.sourceRefresh.execute requires named params',
    );
    const key = String(named.idempotencyKey || '').trim();
    const cached = this.reviewSourceRefreshResultsByIdempotencyKey.get(key);
    if (cached) {
      return cached;
    }
    const changed = new Set((named.changedBlockIds || []).map((id) => String(id || '').trim()).filter(Boolean));
    const matchedBlockIds = (named.dependencyBlockIds || [])
      .map((id) => String(id || '').trim())
      .filter((id) => id && changed.has(id));
    const now = Date.now();
    const currentBlockId = String(named.currentBlockId || '').trim();
    const missingSourceBlockIds = new Set(
      (named.missingSourceBlockIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    );
    if (currentBlockId && missingSourceBlockIds.has(currentBlockId)) {
      await this.options.database.updateSourceExistence([{
        cardId: String(named.currentCardId || '').trim() || undefined,
        blockId: currentBlockId,
        exists: false,
      }], now);
      const missingResult: BackendReviewSourceRefreshExecuteResult = {
        status: 'missing-source',
        commandId: String(named.commandId || ''),
        idempotencyKey: key,
        matchedBlockIds: [currentBlockId],
        impact: {
          refreshVisibleContent: false,
          cleanupMissingSource: true,
        },
        diagnostics: {
          diagnosticEventId: `review-source-refresh:${String(named.commandId || 'unknown')}:${now}`,
          family: 'review.source-refresh',
          commandId: String(named.commandId || ''),
          timing: {
            submittedAt: now,
            deadlineAt: named.deadlineAt ?? null,
            completedAt: now,
          },
          counters: {
            changedBlockIds: changed.size,
            matchedBlockIds: 1,
            missingSourceBlockIds: missingSourceBlockIds.size,
          },
          errorCategory: null,
        },
      };
      this.reviewSourceRefreshResultsByIdempotencyKey.set(key, missingResult);
      return missingResult;
    }
    const result: BackendReviewSourceRefreshExecuteResult = {
      status: matchedBlockIds.length > 0 ? 'refresh-required' : 'no-op',
      commandId: String(named.commandId || ''),
      idempotencyKey: key,
      matchedBlockIds,
      impact: {
        refreshVisibleContent: matchedBlockIds.length > 0,
        cleanupMissingSource: false,
      },
      diagnostics: {
        diagnosticEventId: `review-source-refresh:${String(named.commandId || 'unknown')}:${now}`,
        family: 'review.source-refresh',
        commandId: String(named.commandId || ''),
        timing: {
          submittedAt: now,
          deadlineAt: named.deadlineAt ?? null,
          completedAt: now,
        },
        counters: {
          changedBlockIds: changed.size,
          matchedBlockIds: matchedBlockIds.length,
        },
        errorCategory: null,
      },
    };
    this.reviewSourceRefreshResultsByIdempotencyKey.set(key, result);
    return result;
  }

  getReviewFeedbackTruthFlushDiagnostics(): BackendReviewFeedbackTruthFlushDiagnostics {
    return {
      family: 'review-events',
      storage: this.options.truthFileStore ? 'truth-segments' : 'unavailable',
      last: this.lastReviewFeedbackTruthFlush ? structuredClone(this.lastReviewFeedbackTruthFlush) : null,
    };
  }

  async getReviewTruthBackfillDiagnostics(): Promise<BackendReviewTruthBackfillDiagnostics> {
    let pendingSqlRows: number | null = null;
    let pendingSqlRowsCheckedAt: number | null = null;
    let lastError: string | null = this.lastReviewTruthBackfill?.error ?? null;
    try {
      pendingSqlRows = await this.options.database.countReviewEventsPendingTruthBackfill();
      pendingSqlRowsCheckedAt = Date.now();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    return {
      family: 'review-events',
      source: 'review_events',
      storage: this.options.truthFileStore ? 'truth-segments' : 'unavailable',
      pendingSqlRows,
      pendingSqlRowsCheckedAt,
      syncVisible: this.lastReviewTruthBackfill?.syncVisible === true,
      last: this.lastReviewTruthBackfill ? structuredClone(this.lastReviewTruthBackfill) : null,
      lastError,
    };
  }

  private async reviewFeedbackWithForcedMainDbRetry(
    request: BackendReviewFeedbackRequest,
  ): Promise<BackendReviewFeedbackResult> {
    try {
      return await this.options.database.reviewFeedback(request);
    } catch (error) {
      if (!isReviewFeedbackCardNotFoundError(error, request.cardId)) {
        throw error;
      }
      this.options.database.invalidateReviewFeedbackMainDbFastSkip('review-feedback-card-not-found-retry');
      await this.options.database.mergeExternalDatabaseIfChanged(undefined, {
        context: 'review-feedback-preflight',
        cardId: request.cardId,
        forceMainDbRead: true,
        ignoreProcessedSourceDeduplication: true,
      });
      return this.options.database.reviewFeedback(request);
    }
  }

  private createReviewRiffFeedbackUnavailable(
    request: BackendReviewRiffFeedbackExecuteRequest,
    reason: string,
    unavailableClass: BackendReviewRiffFeedbackExecuteResult['unavailableClass'] = 'BACKEND_UNAVAILABLE',
  ): BackendReviewRiffFeedbackExecuteResult {
    const now = Date.now();
    return {
      status: unavailableClass === 'FAILED' ? 'failed' : 'unavailable',
      commandId: String(request.commandId || ''),
      idempotencyKey: String(request.idempotencyKey || ''),
      action: request.action,
      updated: 0,
      skipped: 1,
      unavailableClass,
      reason,
      queueImpact: {
        refreshRequired: false,
        projectionChanged: false,
        removedFromQueue: false,
      },
      diagnostics: {
        diagnosticEventId: `review-riff-feedback:${String(request.commandId || 'unknown')}:${now}`,
        family: 'review.riff-feedback',
        commandId: String(request.commandId || ''),
        timing: {
          submittedAt: now,
          deadlineAt: request.deadlineAt ?? null,
          completedAt: now,
        },
        errorCategory: unavailableClass,
      },
    };
  }

  private requireSessionRuntime(): WorkerReviewSessionRuntime {
    if (!this.options.sessionRuntime) {
      throw new Error('BACKEND_UNAVAILABLE: worker Review session runtime unavailable');
    }
    return this.options.sessionRuntime;
  }
}

export interface BackendReviewRpcHandlerContext extends BackendRpcHandlerContext {
  readonly review: BackendReviewRpcRuntime;
  readonly reviewFeedbackTiming?: BackendReviewFeedbackKernelTiming;
}

export type BackendReviewRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendReviewRpcHandlerContext
>;

const BACKEND_REVIEW_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendReviewRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendReviewRpcHandlerContext
  >;
} = {
  'review.feedback': {
    method: 'review.feedback',
    family: 'review',
    async handle(params, context): Promise<BackendReviewFeedbackResult> {
      const handlerStartedAt = Date.now();
      const result = await context.review.handleReviewFeedback(params);
      const timing = context.reviewFeedbackTiming;
      if (timing) {
        timing.logStep('handler', Date.now() - handlerStartedAt, {
          backendMethod: 'review.feedback',
        });
        timing.logStep(
          'request-total',
          Date.now() - (timing.requestStartedAt ?? handlerStartedAt),
          { backendMethod: 'review.feedback' },
        );
      }
      return result;
    },
  },
  'review.session.start': {
    method: 'review.session.start',
    family: 'review',
    handle(params, context): Promise<BackendReviewSessionState> {
      return context.review.handleReviewSessionStart(params);
    },
  },
  'review.session.current': {
    method: 'review.session.current',
    family: 'review',
    handle(params, context): BackendReviewSessionState {
      return context.review.handleReviewSessionCurrent(params);
    },
  },
  'review.session.feedback': {
    method: 'review.session.feedback',
    family: 'review',
    async handle(params, context): Promise<BackendReviewSessionFeedbackResult> {
      const handlerStartedAt = Date.now();
      const result = await context.review.handleReviewSessionFeedback(params);
      const timing = context.reviewFeedbackTiming;
      if (timing) {
        timing.logStep('handler', Date.now() - handlerStartedAt, {
          backendMethod: 'review.session.feedback',
        });
        timing.logStep(
          'request-total',
          Date.now() - (timing.requestStartedAt ?? handlerStartedAt),
          { backendMethod: 'review.session.feedback' },
        );
      }
      return result;
    },
  },
  'review.session.skip': {
    method: 'review.session.skip',
    family: 'review',
    handle(params, context): BackendReviewSessionSkipResult {
      return context.review.handleReviewSessionSkip(params);
    },
  },
  'review.truth.flush': {
    method: 'review.truth.flush',
    family: 'review',
    handle(params, context): Promise<BackendReviewFeedbackTruthFlushResult> {
      return context.review.handleReviewTruthFlush(params);
    },
  },
  'review.truth.backfill': {
    method: 'review.truth.backfill',
    family: 'review',
    handle(params, context): Promise<BackendReviewTruthBackfillResult> {
      return context.review.handleReviewTruthBackfill(params);
    },
  },
  'review.riffFeedback.execute': {
    method: 'review.riffFeedback.execute',
    family: 'review',
    handle(params, context): Promise<BackendReviewRiffFeedbackExecuteResult> {
      return context.review.handleReviewRiffFeedbackExecute(params);
    },
  },
  'review.sourceRefresh.execute': {
    method: 'review.sourceRefresh.execute',
    family: 'review',
    handle(params, context): Promise<BackendReviewSourceRefreshExecuteResult> {
      return context.review.handleReviewSourceRefreshExecute(params);
    },
  },
};

export const BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS: readonly BackendReviewRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_REVIEW_RPC_METHODS.map((method) => ({
      ...BACKEND_REVIEW_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendReviewRpcAdapter',
    })),
  );

function readNamedParams<TParams extends object>(params: unknown): TParams | null {
  if (!params) {
    return null;
  }
  if (Array.isArray(params)) {
    const [first] = params;
    if (!first || typeof first !== 'object') {
      return null;
    }
    return first as TParams;
  }
  if (typeof params === 'object') {
    return params as TParams;
  }
  return null;
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return named;
}

function isReviewFeedbackCardNotFoundError(error: unknown, cardId: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('review.feedback card not found')
    && message.includes(cardId);
}
