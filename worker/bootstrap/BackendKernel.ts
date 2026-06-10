import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type BackendAiPromptExecuteRequest,
  type BackendAutoCardExecuteRequest,
  type BackendAutoCardExecuteResult,
  type BackendAutoCardDecisionResolveRequest,
  type BackendAutoCardDecisionResolveResult,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendReviewFeedbackResult,
  type BackendReviewFeedbackTruthFlushDiagnostics,
  type BackendReviewFeedbackTruthFlushRequest,
  type BackendReviewFeedbackTruthFlushResult,
  type BackendReviewTruthBackfillDiagnostics,
  type BackendReviewTruthBackfillRequest,
  type BackendReviewTruthBackfillResult,
  type BackendReviewRiffFeedbackExecuteRequest,
  type BackendReviewRiffFeedbackExecuteResult,
  type BackendReviewSourceRefreshExecuteRequest,
  type BackendReviewSourceRefreshExecuteResult,
  type BackendReviewSyncDivergenceAuditRequest,
  type BackendReviewSyncDivergenceAuditResult,
  type BackendSyncConflictMergeRequest,
  type BackendSyncConflictMergeResult,
  type BackendSyncConflictReloadResult,
  type BackendSyncConflictSummarizeRequest,
  type BackendSyncConflictSummarizeResult,
  type BackendReviewFeedbackRequest,
  type BackendDiagnosticsStatusResult,
  type BackendDomainSyncStatusResult,
  type BackendDomainSyncRepairApplyRequest,
  type BackendDomainSyncRepairApplyResult,
  type BackendDomainSyncRepairPreviewRequest,
  type BackendDomainSyncRepairPreviewResult,
  type BackendDomainSyncStatusRequest,
  type BackendDomainSyncConflictSourceCleanupRequest,
  type BackendDomainSyncConflictSourceCleanupCandidatesResult,
  type BackendDomainSyncConflictSourceCleanupResult,
  type BackendPreRequestMergeDiagnostic,
  type BackendPreRequestMergeDiagnosticsState,
  type BackendProgressiveCommandExecuteRequest,
  type BackendProgressiveCommandExecuteResult,
  type BackendTopicDerivedCommandExecuteRequest,
  type BackendTopicDerivedCommandExecuteResult,
  type BackendXiuyuanRiffReadAuditRequest,
  type BackendXiuyuanRiffReadAuditResult,
  type BackendRpcMethod,
  type BackendRpcRequest,
  type BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../truth/MessagePackTruthSegmentStore';
import { ReviewFeedbackTruthFlushRuntime } from '../truth/ReviewFeedbackTruthFlushRuntime';
import { ReviewSqlTruthBackfillRuntime } from '../truth/ReviewSqlTruthBackfillRuntime';
import { BackendHotspotCommandRuntime } from './BackendHotspotCommandRuntime';
import { BackendJobRuntime } from './BackendJobRuntime';
import { WorkerBrowserAggregateReadService } from './WorkerBrowserAggregateReadService';
import { WorkerGraphQueryService } from './WorkerGraphQueryService';
import { WorkerNeuralRoamAdvanceService } from './WorkerNeuralRoamAdvanceService';
import {
  createUnavailableSqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';
import { recordBackendWorkerInnerStep, recordReviewFeedbackInnerStep } from './ReviewFeedbackTimingScope';
import { createLogger } from '@/utils/logger';
import {
  type BackendBrowserRpcRuntime,
} from './rpc/BackendBrowserRpcAdapter';
import { BackendAiToolJobRuntime } from './rpc/BackendAiJobHotspotRpcAdapter';
import { BackendP6OwnershipRuntime } from './rpc/BackendP6OwnershipRpcAdapter';
import { BackendPrivateApiRuntime } from './rpc/BackendPrivateApiRpcAdapter';
import { BackendProgressiveCommandRuntime } from './rpc/BackendProgressiveRpcAdapter';
import type { BackendQueueProjectionRpcRuntime } from './rpc/BackendQueueProjectionRpcAdapter';
import { BackendRpcDispatcher, mapBackendRpcDispatchError } from './rpc/BackendRpcDispatcher';
import {
  BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS,
  createBackendRpcHandlerRegistry,
  type BackendKernelRpcHandlerContext,
} from './rpc/BackendRpcRegistry';
import { BackendTopicDerivedCommandRuntime } from './rpc/BackendTopicDerivedRpcAdapter';
import { BackendXiuyuanSyncRuntime } from './rpc/BackendXiuyuanRpcAdapter';

const logger = createLogger('BackendKernel');
const REVIEW_FEEDBACK_KERNEL_STEP_SLOW_MS = 120;
const DIAGNOSTIC_TIMING_METHODS = new Set<string>([
  'browser.deck.page',
  'browser.stats',
  'browser.deck.documentCounts',
  'storage.projection.rebuild',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'queue.projection.replace',
]);

interface BackendKernelDependencies {
  database: WorkerSqliteDatabaseService;
  resolveExistingBlockIds?: (blockIds: string[]) => Promise<string[]>;
  resolveNeuralGraphQuery?: (
    request: BackendNeuralGraphQueryRequest,
  ) => Promise<BackendNeuralGraphQueryResult>;
  executeAutoCard?: (request: BackendAutoCardExecuteRequest) => Promise<BackendAutoCardExecuteResult>;
  executeAiPrompt?: (
    request: BackendAiPromptExecuteRequest['request'],
    context: BackendAiPromptExecuteRequest,
  ) => Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>;
  readXiuyuanRiffFacts?: (
    request: BackendXiuyuanRiffReadAuditRequest,
  ) => Promise<BackendXiuyuanRiffReadAuditResult>;
  executeProgressiveCommand?: (
    request: BackendProgressiveCommandExecuteRequest,
  ) => Promise<BackendProgressiveCommandExecuteResult>;
  executeTopicDerivedCommand?: (
    request: BackendTopicDerivedCommandExecuteRequest,
  ) => Promise<BackendTopicDerivedCommandExecuteResult>;
  executeReviewRiffFeedback?: (
    request: BackendReviewRiffFeedbackExecuteRequest,
  ) => Promise<BackendReviewRiffFeedbackExecuteResult>;
  truthFileStore?: MessagePackTruthSegmentFileStore;
}

const STORAGE_REFRESH_EXEMPT_METHODS = new Set<string>([
  'system.health',
  'diagnostics.status',
  'sync.reviewDivergence.audit',
  'sync.conflict.merge',
  'sync.conflict.summarize',
  'sync.conflict.reload',
  'review.truth.flush',
  'review.truth.backfill',
  'storage.projection.rebuild',
  'kernel.transaction.dequeue',
]);

const REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_PRESERVE_METHODS = new Set<string>([
  'system.health',
  'diagnostics.status',
  'domainSync.status',
  'sync.reviewDivergence.audit',
  'sync.conflict.summarize',
  'review.truth.flush',
  'review.truth.backfill',
  'kernel.transaction.dequeue',
]);

const REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_READ_ONLY_METHODS = new Set<string>([
  'browser.deck.page',
  'browser.deck.matchedIds',
  'browser.deck.rowsByIds',
  'browser.deck.documentCounts',
  'browser.count',
  'browser.stats',
  'browser.sourceExistence.refreshCandidates',
  'browser.sourceExistence.byBlockIds',
  'browser.sourceExistence.summary',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'neural-roam.viewState',
  'ai.session.get',
  'job.get',
]);

const PREFLIGHT_MAIN_DB_SKIP_METHODS = new Set<string>([
  ...REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_READ_ONLY_METHODS,
  'browser.sourceExistence.update',
  'browser.sourceExistence.applySweep',
  'browser.sourceExistence.applySweepHost',
]);

const PREFLIGHT_MAIN_DB_REFRESH_READ_ONLY_METHODS = new Set<string>([
  'domainSync.status',
]);

export class BackendKernel {
  private readonly reviewRiffFeedbackResultsByIdempotencyKey = new Map<string, BackendReviewRiffFeedbackExecuteResult>();
  private readonly reviewSourceRefreshResultsByIdempotencyKey = new Map<string, BackendReviewSourceRefreshExecuteResult>();
  private readonly preRequestMergeDiagnostics: BackendPreRequestMergeDiagnostic[] = [];
  private readonly aiRuntime: BackendJobRuntime;
  private readonly aiToolJobRuntime: BackendAiToolJobRuntime;
  private readonly hotspotRuntime: BackendHotspotCommandRuntime;
  private readonly browserAggregateReadService: WorkerBrowserAggregateReadService;
  private readonly graphQueryService: WorkerGraphQueryService;
  private readonly neuralRoamRuntime: WorkerNeuralRoamAdvanceService;
  private readonly privateApiRuntime: BackendPrivateApiRuntime;
  private readonly semanticRuntime: BackendKernelRpcHandlerContext['semantic'];
  private readonly p6OwnershipRuntime: BackendP6OwnershipRuntime;
  private readonly xiuyuanSyncRuntime: BackendXiuyuanSyncRuntime;
  private readonly progressiveCommandRuntime: BackendProgressiveCommandRuntime;
  private readonly topicDerivedCommandRuntime: BackendTopicDerivedCommandRuntime;
  private readonly rpcDispatcher: BackendRpcDispatcher<BackendKernelRpcHandlerContext>;
  private lastReviewFeedbackTruthFlush: BackendReviewFeedbackTruthFlushResult | null = null;
  private lastReviewTruthBackfill: BackendReviewTruthBackfillResult | null = null;

  constructor(private readonly deps: BackendKernelDependencies) {
    this.aiRuntime = new BackendJobRuntime({
      onSessionCreate: () => this.deps.database.recordAiSessionOutcome('create'),
      onSessionUpdate: () => this.deps.database.recordAiSessionOutcome('update'),
      onSessionCancel: () => this.deps.database.recordAiSessionOutcome('cancel'),
      onStreamStart: () => this.deps.database.recordAiStreamOutcome('start'),
      onStreamCancel: () => this.deps.database.recordAiStreamOutcome('cancel'),
      onJobCreated: () => this.deps.database.recordAiJobOutcome('created'),
      onJobCompleted: () => this.deps.database.recordAiJobOutcome('completed'),
      onJobCanceled: () => this.deps.database.recordAiJobOutcome('canceled'),
      onJobTimeout: () => this.deps.database.recordAiJobOutcome('timeout'),
      onJobFailed: () => this.deps.database.recordAiJobOutcome('failed'),
    });
    this.aiToolJobRuntime = new BackendAiToolJobRuntime();
    this.hotspotRuntime = new BackendHotspotCommandRuntime();
    this.browserAggregateReadService = new WorkerBrowserAggregateReadService(this.deps.database);
    this.graphQueryService = new WorkerGraphQueryService({
      resolveNeuralGraphQuery: this.deps.resolveNeuralGraphQuery,
    });
    this.neuralRoamRuntime = new WorkerNeuralRoamAdvanceService({
      database: this.deps.database,
      resolveNeuralGraphQuery: this.deps.resolveNeuralGraphQuery,
    });
    this.privateApiRuntime = new BackendPrivateApiRuntime({
      database: this.deps.database,
      browser: this.createBrowserRpcRuntime(),
    });
    this.semanticRuntime = {
      executeCommand: (request) => this.deps.database.executeSemanticCommand(request),
      readSession: (request) => this.deps.database.readSemanticSession(request),
      readSidebar: (request) => this.deps.database.readSemanticSidebar(request),
      readBrowser: (request) => this.deps.database.readSemanticBrowser(request),
    };
    this.p6OwnershipRuntime = new BackendP6OwnershipRuntime();
    this.xiuyuanSyncRuntime = new BackendXiuyuanSyncRuntime({
      loadLocalFacts: () => this.deps.database.readXiuyuanSyncLocalFacts(),
      readNativeRiffFacts: this.deps.readXiuyuanRiffFacts,
      applySyncPlan: (input) => this.deps.database.applyXiuyuanSyncPlan(input),
    });
    this.progressiveCommandRuntime = new BackendProgressiveCommandRuntime(this.deps.executeProgressiveCommand);
    this.topicDerivedCommandRuntime = new BackendTopicDerivedCommandRuntime(this.deps.executeTopicDerivedCommand);
    this.rpcDispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS),
    );
  }

  static createWithoutBridge(): BackendKernel {
    const reason = 'SrsBackendWorker persistence bridge is unavailable';
    const bridge = createUnavailableSqlitePersistenceBridge(reason);
    return BackendKernel.createWithBridge(bridge);
  }

  static createWithBridge(bridge: SqlitePersistenceBridge): BackendKernel {
    return new BackendKernel({
      database: new WorkerSqliteDatabaseService(bridge),
      truthFileStore: bridge.truthFileStore,
    });
  }

  async handle(request: BackendRpcRequest): Promise<BackendRpcResponse> {
    return this.rpcDispatcher.dispatch(request, this.createRpcHandlerContext());
  }

  private createRpcHandlerContext(): BackendKernelRpcHandlerContext {
    let reviewFeedbackRequestStartedAt: number | null = null;
    let reviewFeedbackCardId: string | null = null;
    return {
      lifecycle: {
        beforeHandle: async ({ method, params }) => {
          reviewFeedbackRequestStartedAt = Date.now();
          reviewFeedbackCardId = method === 'review.feedback'
            ? this.extractReviewFeedbackCardId(params)
            : null;
          await this.runPreRequestLifecycle(method, params, reviewFeedbackCardId);
        },
        mapError: mapBackendRpcDispatchError,
      },
      core: {
        database: this.deps.database,
        readDiagnosticsStatus: () => this.diagnosticsStatus(),
        getPrivateAuditEventCount: () => this.privateApiRuntime.auditEventCount(),
      },
      browser: this.createBrowserRpcRuntime(),
      queueProjection: this.createQueueProjectionRpcRuntime(),
      neuralRoam: this.neuralRoamRuntime,
      kernelTransaction: this.deps.database,
      graph: this.graphQueryService,
      privateApi: this.privateApiRuntime,
      semantic: this.semanticRuntime,
      p6Ownership: this.p6OwnershipRuntime,
      xiuyuan: this.xiuyuanSyncRuntime,
      progressive: this.progressiveCommandRuntime,
      topicDerived: this.topicDerivedCommandRuntime,
      ai: {
        createSession: (request) => this.aiRuntime.createSession(request),
        getSession: (request) => this.aiRuntime.getSession(request),
        updateSession: (request) => this.aiRuntime.updateSession(request),
        cancelSession: (request) => this.aiRuntime.cancelSession(request),
        executePrompt: (request) => this.aiRuntime.executePrompt(request, this.deps.executeAiPrompt),
        executeToolJob: (request) => this.aiToolJobRuntime.execute(request),
        approveToolJob: (request) => this.aiToolJobRuntime.approve(request),
        startStream: (request) => this.aiRuntime.startStream(request),
        cancelStream: (request) => this.aiRuntime.cancelStream(request),
        getJob: (request) => this.aiRuntime.getJob(request),
        cancelJob: (request) => this.aiRuntime.cancelJob(request),
      },
      hotspot: this.hotspotRuntime,
      handleLegacyBackendKernelMethod: (method, params) => this.handleLegacyBackendKernelMethod(
        method,
        params,
        {
          reviewFeedbackCardId,
          reviewFeedbackRequestStartedAt,
        },
      ),
    };
  }

  private createBrowserRpcRuntime(): BackendBrowserRpcRuntime {
    return {
      database: this.deps.database,
      aggregateReader: this.browserAggregateReadService,
      resolveExistingBlockIds: this.deps.resolveExistingBlockIds,
    };
  }

  private createQueueProjectionRpcRuntime(): BackendQueueProjectionRpcRuntime {
    return {
      database: this.deps.database,
      truthFileStore: this.deps.truthFileStore,
      resolveNeuralGraphQuery: this.deps.resolveNeuralGraphQuery,
    };
  }

  private async runPreRequestLifecycle(
    method: BackendRpcMethod,
    params: unknown,
    reviewFeedbackCardId: string | null,
  ): Promise<void> {
    const isReviewFeedback = method === 'review.feedback';
    const isReviewDomainSyncStatusPreflight = this.isDomainSyncStatusPreflight(
      method,
      params,
      'review-feedback-preflight',
    );
    const requiresStorageRefresh =
      !isReviewDomainSyncStatusPreflight
      && !STORAGE_REFRESH_EXEMPT_METHODS.has(method);
    const isReviewFeedbackFastSkipReadOnlyMethod =
      REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_READ_ONLY_METHODS.has(method);
    const shouldSkipPreflightMainDbRead = PREFLIGHT_MAIN_DB_SKIP_METHODS.has(method);
    const shouldRefreshMainDbReadOnly = PREFLIGHT_MAIN_DB_REFRESH_READ_ONLY_METHODS.has(method);
    if (
      !isReviewFeedback
      && !isReviewFeedbackFastSkipReadOnlyMethod
      && !REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_PRESERVE_METHODS.has(method)
    ) {
      this.deps.database.invalidateReviewFeedbackMainDbFastSkip(`backend-method:${method}`);
    }
    if (!requiresStorageRefresh) {
      return;
    }
    const mergeStartedAt = Date.now();
    const merge = await this.deps.database.mergeExternalDatabaseIfChanged(
      undefined,
      isReviewFeedback
        ? { context: 'review-feedback-preflight', cardId: reviewFeedbackCardId }
        : shouldRefreshMainDbReadOnly
          ? { context: 'read-only-preflight' }
        : shouldSkipPreflightMainDbRead
          ? { context: 'read-only-preflight', skipMainDbRead: true }
        : {},
    );
    if (isReviewFeedback) {
      this.logReviewFeedbackKernelStepIfSlow(
        'pre-request-merge',
        reviewFeedbackCardId,
        Date.now() - mergeStartedAt,
        {
          changed: merge.changed,
          mergedCards: merge.mergedCards,
          mergedReviewEvents: merge.mergedReviewEvents,
          importedOperations: merge.importedOperations,
          sanityStatus: merge.sanityStatus,
          sourceCount: merge.sourceIds.length,
          mainDbReadSkipped: merge.mainDbReadSkipped,
          mainDbReadSkipReason: merge.mainDbReadSkipReason,
          conflictSourceCount: merge.conflictSourceCount,
          nonEmptyConflictSourceCount: merge.nonEmptyConflictSourceCount,
        },
      );
    }
    if (!isReviewFeedback && DIAGNOSTIC_TIMING_METHODS.has(method)) {
      recordBackendWorkerInnerStep({
        layer: 'kernel',
        step: 'pre-request-merge',
        durationMs: Math.max(0, Date.now() - mergeStartedAt),
        extra: {
          backendMethod: method,
          changed: merge.changed,
          mergedCards: merge.mergedCards,
          mergedReviewEvents: merge.mergedReviewEvents,
          importedOperations: merge.importedOperations,
          sanityStatus: merge.sanityStatus,
          sourceCount: merge.sourceIds.length,
          mainDbReadSkipped: merge.mainDbReadSkipped,
          mainDbReadSkipReason: merge.mainDbReadSkipReason,
          conflictSourceCount: merge.conflictSourceCount,
          nonEmptyConflictSourceCount: merge.nonEmptyConflictSourceCount,
        },
      });
    }
    this.recordPreRequestMergeDiagnostic(method, merge);
  }

  private async handleLegacyBackendKernelMethod(
    method: BackendRpcMethod,
    params: unknown,
    timing: {
      readonly reviewFeedbackCardId: string | null;
      readonly reviewFeedbackRequestStartedAt: number | null;
    },
  ): Promise<unknown> {
    switch (method) {
        case 'sync.conflict.merge':
          return this.handleSyncConflictMerge(params);
        case 'sync.conflict.summarize':
          return this.handleSyncConflictSummarize(params);
        case 'sync.conflict.reload':
          return this.handleSyncConflictReload();
        case 'domainSync.status':
          return this.handleDomainSyncStatus(params);
        case 'domainSync.repair.preview':
          return this.handleDomainSyncRepairPreview(params);
        case 'domainSync.repair.apply':
          return this.handleDomainSyncRepairApply(params);
        case 'domainSync.conflictSources.cleanupCandidates':
          return this.handleDomainSyncConflictSourceCleanupCandidates();
        case 'domainSync.conflictSources.cleanup':
          return this.handleDomainSyncConflictSourceCleanup(params);
        case 'sync.reviewDivergence.audit':
          return this.handleReviewSyncDivergenceAudit(params);
        case 'autocard.decision.resolve':
          return this.handleAutoCardDecisionResolve(params);
        case 'autocard.execute':
          return this.handleAutoCardExecute(params);
        case 'review.feedback':
          {
            const handlerStartedAt = Date.now();
            const result = await this.handleReviewFeedback(params);
            this.logReviewFeedbackKernelStepIfSlow(
              'handler',
              timing.reviewFeedbackCardId,
              Date.now() - handlerStartedAt,
              {},
            );
            this.logReviewFeedbackKernelStepIfSlow(
              'request-total',
              timing.reviewFeedbackCardId,
              Date.now() - (timing.reviewFeedbackRequestStartedAt ?? handlerStartedAt),
              {},
            );
            return result;
          }
        case 'review.truth.flush':
          return this.handleReviewTruthFlush(params);
        case 'review.truth.backfill':
          return this.handleReviewTruthBackfill(params);
        case 'review.riffFeedback.execute':
          return this.handleReviewRiffFeedbackExecute(params);
        case 'review.sourceRefresh.execute':
          return this.handleReviewSourceRefreshExecute(params);
        default:
          throw new Error(`METHOD_NOT_FOUND: Unknown method: ${method}`);
      }
  }

  private extractReviewFeedbackCardId(params: unknown): string | null {
    const payload = this.firstParam(params);
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const cardId = String((payload as { cardId?: unknown }).cardId || '').trim();
    return cardId || null;
  }

  private logReviewFeedbackKernelStepIfSlow(
    step: string,
    cardId: string | null,
    durationMs: number,
    extra: Record<string, unknown>,
  ): void {
    if (durationMs < REVIEW_FEEDBACK_KERNEL_STEP_SLOW_MS) {
      return;
    }
    recordReviewFeedbackInnerStep({
      layer: 'kernel',
      step,
      cardId,
      durationMs,
      extra,
    });
    logger.info('[SiYuanMemo][BackendKernel] slow review.feedback kernel step', {
      step,
      cardId,
      durationMs,
      ...extra,
    });
  }

  private async diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> {
    const status = this.deps.database.getStatus();
    const reviewJournal = await this.deps.database.getReviewFeedbackJournalDiagnostics();
    const sqliteDelta = await this.deps.database.getSqliteDeltaDiagnostics();
    return {
      runtime: 'srs-backend-worker',
      initialized: status.initialized,
      dbFile: status.dbFile,
      ingest: status.ingest,
      autoCard: status.autoCard,
      review: {
        ...status.review,
        journal: reviewJournal,
        truthFlush: this.getReviewFeedbackTruthFlushDiagnostics(),
        truthBackfill: await this.getReviewTruthBackfillDiagnostics(),
      },
      storage: {
        sqliteDelta,
      },
      ai: status.ai,
      hotspot: this.hotspotRuntime.getDiagnostics(),
      preRequestMerge: this.getPreRequestMergeDiagnostics(),
      domainSync: await this.deps.database.getDomainSyncStatus(),
    };
  }

  private getReviewFeedbackTruthFlushDiagnostics(): BackendReviewFeedbackTruthFlushDiagnostics {
    return {
      family: 'review-events',
      storage: this.deps.truthFileStore ? 'truth-segments' : 'unavailable',
      last: this.lastReviewFeedbackTruthFlush ? structuredClone(this.lastReviewFeedbackTruthFlush) : null,
    };
  }

  private async getReviewTruthBackfillDiagnostics(): Promise<BackendReviewTruthBackfillDiagnostics> {
    let pendingSqlRows: number | null = null;
    let pendingSqlRowsCheckedAt: number | null = null;
    let lastError: string | null = this.lastReviewTruthBackfill?.error ?? null;
    try {
      pendingSqlRows = await this.deps.database.countReviewEventsPendingTruthBackfill();
      pendingSqlRowsCheckedAt = Date.now();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    return {
      family: 'review-events',
      source: 'review_events',
      storage: this.deps.truthFileStore ? 'truth-segments' : 'unavailable',
      pendingSqlRows,
      pendingSqlRowsCheckedAt,
      syncVisible: this.lastReviewTruthBackfill?.syncVisible === true,
      last: this.lastReviewTruthBackfill ? structuredClone(this.lastReviewTruthBackfill) : null,
      lastError,
    };
  }

  private firstParam(params: unknown): unknown {
    return Array.isArray(params) ? params[0] : params;
  }

  private isDomainSyncStatusPreflight(
    method: BackendRpcMethod,
    params: unknown,
    context: BackendDomainSyncStatusRequest['context'],
  ): boolean {
    if (method !== 'domainSync.status') {
      return false;
    }
    const param = this.firstParam(params);
    if (!param || typeof param !== 'object') {
      return false;
    }
    return (param as BackendDomainSyncStatusRequest).context === context;
  }

  private async handleDomainSyncStatus(params?: unknown): Promise<BackendDomainSyncStatusResult> {
    const [request] = Array.isArray(params) ? params : [params];
    const statusRequest = (request ?? {}) as BackendDomainSyncStatusRequest;
    if (statusRequest.context === 'review-feedback-preflight') {
      await this.deps.database.mergeExternalDatabaseIfChanged(undefined, {
        context: 'review-feedback-preflight',
        cardId: typeof statusRequest.cardId === 'string' ? statusRequest.cardId : null,
        skipMainDbRead: true,
      });
      return this.deps.database.getDomainSyncStatusForPreflight('review-feedback-preflight');
    }
    return this.deps.database.getDomainSyncStatus();
  }

  private async handleDomainSyncRepairPreview(params: unknown): Promise<BackendDomainSyncRepairPreviewResult> {
    const [request] = Array.isArray(params) ? params : [params];
    return this.deps.database.previewDomainSyncRepair((request ?? {}) as BackendDomainSyncRepairPreviewRequest);
  }

  private async handleDomainSyncRepairApply(params: unknown): Promise<BackendDomainSyncRepairApplyResult> {
    const [request] = Array.isArray(params) ? params : [params];
    return this.deps.database.applyDomainSyncRepair((request ?? {}) as BackendDomainSyncRepairApplyRequest);
  }

  private async handleDomainSyncConflictSourceCleanupCandidates(): Promise<BackendDomainSyncConflictSourceCleanupCandidatesResult> {
    return this.deps.database.listDomainSyncConflictSourceCleanupCandidates();
  }

  private async handleDomainSyncConflictSourceCleanup(params: unknown): Promise<BackendDomainSyncConflictSourceCleanupResult> {
    const [request] = Array.isArray(params) ? params : [params];
    return this.deps.database.cleanupDomainSyncConflictSources((request ?? {}) as BackendDomainSyncConflictSourceCleanupRequest);
  }

  private recordPreRequestMergeDiagnostic(
    method: string,
    merge: Awaited<ReturnType<WorkerSqliteDatabaseService['mergeExternalDatabaseIfChanged']>>,
  ): void {
    if (
      merge.mergedReviewEvents <= 0
      && merge.mergedCards <= 0
      && merge.ignoredReviewEvents <= 0
      && merge.ignoredCards <= 0
      && merge.importedOperations <= 0
      && merge.ignoredOperations <= 0
      && merge.skippedSources.length === 0
    ) {
      return;
    }
    const divergenceReasonCounts: Record<string, number> = {};
    for (const record of merge.diagnostics.reviewCardDivergences || []) {
      const reason = String(record.reason || 'unknown');
      divergenceReasonCounts[reason] = (divergenceReasonCounts[reason] || 0) + 1;
    }
    this.preRequestMergeDiagnostics.push({
      method,
      timestamp: Date.now(),
      sources: merge.sourceIds.length,
      sourceIds: merge.sourceIds,
      importedOperations: merge.importedOperations,
      ignoredOperations: merge.ignoredOperations,
      processedSourceIds: merge.processedSourceIds,
      skippedSourceReasons: merge.skippedSourceReasons,
      sanityStatus: merge.sanityStatus,
      mergedReviewEvents: merge.mergedReviewEvents,
      mergedCards: merge.mergedCards,
      ignoredReviewEvents: merge.ignoredReviewEvents,
      ignoredCards: merge.ignoredCards,
      skippedSources: merge.skippedSources,
      divergenceCount: merge.diagnostics.reviewCardDivergences?.length ?? 0,
      divergenceReasonCounts,
    });
    if (this.preRequestMergeDiagnostics.length > 20) {
      this.preRequestMergeDiagnostics.splice(0, this.preRequestMergeDiagnostics.length - 20);
    }
  }

  private getPreRequestMergeDiagnostics(): BackendPreRequestMergeDiagnosticsState {
    const history = this.preRequestMergeDiagnostics.slice(-20);
    return {
      latest: history.at(-1) ?? null,
      history,
    };
  }

  private readNamedParams<TParams extends object>(params: unknown): TParams | null {
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

  private async handleReviewFeedback(params: unknown): Promise<BackendReviewFeedbackResult> {
    const named = this.readNamedParams<BackendReviewFeedbackRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('review.feedback requires named params');
    }
    const result = await this.reviewFeedbackWithForcedMainDbRetry(named);
    if (result.committed) {
      this.deps.database.markReviewFeedbackOwnPersistedMainDbClean();
    }
    return result;
  }

  private async handleReviewTruthFlush(params: unknown): Promise<BackendReviewFeedbackTruthFlushResult> {
    const named = this.readNamedParams<BackendReviewFeedbackTruthFlushRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: review.truth.flush requires named params');
    }
    const journalStore = this.deps.database.getReviewFeedbackJournalStore();
    if (!journalStore) {
      throw new Error('BACKEND_UNAVAILABLE: review.truth.flush requires Review feedback journal store');
    }
    if (!this.deps.truthFileStore) {
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
      fileStore: this.deps.truthFileStore,
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

  private async handleReviewTruthBackfill(params: unknown): Promise<BackendReviewTruthBackfillResult> {
    const named = this.readNamedParams<BackendReviewTruthBackfillRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: review.truth.backfill requires named params');
    }
    if (!this.deps.truthFileStore) {
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
      fileStore: this.deps.truthFileStore,
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
      listRows: (limit) => this.deps.database.listReviewEventsForTruthBackfill(limit),
      patchRows: (patches) => this.deps.database.patchReviewTruthBackfillProjectionRefs(patches),
      scheduleProjectionRefresh: async () => undefined,
    });
    const result = await runtime.backfill();
    this.lastReviewTruthBackfill = result;
    return result;
  }

  private async reviewFeedbackWithForcedMainDbRetry(
    request: BackendReviewFeedbackRequest,
  ): Promise<BackendReviewFeedbackResult> {
    try {
      return await this.deps.database.reviewFeedback(request);
    } catch (error) {
      if (!this.isReviewFeedbackCardNotFoundError(error, request.cardId)) {
        throw error;
      }
      this.deps.database.invalidateReviewFeedbackMainDbFastSkip('review-feedback-card-not-found-retry');
      await this.deps.database.mergeExternalDatabaseIfChanged(undefined, {
        context: 'review-feedback-preflight',
        cardId: request.cardId,
        forceMainDbRead: true,
        ignoreProcessedSourceDeduplication: true,
      });
      return this.deps.database.reviewFeedback(request);
    }
  }

  private isReviewFeedbackCardNotFoundError(error: unknown, cardId: string): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('review.feedback card not found')
      && message.includes(cardId);
  }

  private async handleSyncConflictMerge(params: unknown): Promise<BackendSyncConflictMergeResult> {
    const named = this.readNamedParams<BackendSyncConflictMergeRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('sync.conflict.merge requires named params');
    }
    return this.deps.database.mergeSyncConflictDatabases(named);
  }

  private async handleReviewSyncDivergenceAudit(params: unknown): Promise<BackendReviewSyncDivergenceAuditResult> {
    const named = this.readNamedParams<BackendReviewSyncDivergenceAuditRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('sync.reviewDivergence.audit requires named params');
    }
    return this.deps.database.auditReviewSyncDivergence(named);
  }

  private async handleSyncConflictSummarize(params: unknown): Promise<BackendSyncConflictSummarizeResult> {
    const named = this.readNamedParams<BackendSyncConflictSummarizeRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('sync.conflict.summarize requires named params');
    }
    return this.deps.database.summarizeSyncConflictDatabases(named);
  }

  private async handleSyncConflictReload(): Promise<BackendSyncConflictReloadResult> {
    return this.deps.database.reloadFromDisk();
  }

  private async handleReviewRiffFeedbackExecute(params: unknown): Promise<BackendReviewRiffFeedbackExecuteResult> {
    const named = this.readNamedParams<BackendReviewRiffFeedbackExecuteRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: review.riffFeedback.execute requires named params');
    }
    const key = String(named.idempotencyKey || '').trim();
    const cached = this.reviewRiffFeedbackResultsByIdempotencyKey.get(key);
    if (cached) {
      return cached.status === 'completed' ? { ...cached, status: 'duplicate' } : cached;
    }
    if (typeof this.deps.executeReviewRiffFeedback !== 'function') {
      const result = this.createReviewRiffFeedbackUnavailable(named, 'review.riffFeedback.execute host effect unavailable');
      this.reviewRiffFeedbackResultsByIdempotencyKey.set(key, result);
      return result;
    }
    try {
      const result = await this.deps.executeReviewRiffFeedback(named);
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

  private async handleReviewSourceRefreshExecute(params: unknown): Promise<BackendReviewSourceRefreshExecuteResult> {
    const named = this.readNamedParams<BackendReviewSourceRefreshExecuteRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('INVALID_REQUEST: review.sourceRefresh.execute requires named params');
    }
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
      await this.deps.database.updateSourceExistence([{
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

  private async handleAutoCardDecisionResolve(
    params: unknown,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    const named = this.readNamedParams<BackendAutoCardDecisionResolveRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('autocard.decision.resolve requires named params');
    }
    return this.deps.database.resolveAutoCardDecision(named);
  }

  private async handleAutoCardExecute(
    params: unknown,
  ): Promise<BackendAutoCardExecuteResult> {
    const named = this.readNamedParams<BackendAutoCardExecuteRequest>(params);
    if (!named || typeof named !== 'object' || !named.envelope || typeof named.envelope !== 'object') {
      throw new Error('autocard.execute requires named params with envelope');
    }
    if (typeof this.deps.executeAutoCard !== 'function') {
      this.deps.database.recordAutoCardExecuteOutcome({
        status: 'unavailable',
      });
      throw new Error('SrsBackendWorker autocard.execute unavailable: execute callback is not configured');
    }
    try {
      const result = await this.deps.executeAutoCard(named);
      this.deps.database.recordAutoCardExecuteOutcome({
        status: result.executed ? 'created' : result.skipped > 0 ? 'skipped' : 'no-op',
        created: result.created,
        skipped: result.skipped,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.deps.database.recordAutoCardExecuteOutcome({
        status: message.startsWith('BACKEND_UNAVAILABLE:') ? 'unavailable' : 'failed',
      });
      throw error;
    }
  }

}
