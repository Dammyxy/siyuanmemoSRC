import {
  type BackendAutoCardExecuteRequest,
  type BackendAutoCardExecuteResult,
  type BackendAutoCardExecuteBatchRequest,
  type BackendAutoCardExecuteBatchResult,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendReviewRiffFeedbackExecuteRequest,
  type BackendReviewRiffFeedbackExecuteResult,
  type BackendDiagnosticsStatusResult,
  type BackendDomainSyncStatusRequest,
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
import type { MessagePackTruthSegmentFileStore } from '../truth/MessagePackTruthSegmentStore';
import { BackendHotspotCommandRuntime } from './BackendHotspotCommandRuntime';
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
import { BackendP6OwnershipRuntime } from './rpc/BackendP6OwnershipRpcAdapter';
import { BackendPrivateApiRuntime } from './rpc/BackendPrivateApiRpcAdapter';
import { BackendProgressiveCommandRuntime } from './rpc/BackendProgressiveRpcAdapter';
import type { BackendQueueProjectionRpcRuntime } from './rpc/BackendQueueProjectionRpcAdapter';
import { BackendReviewRpcRuntime } from './rpc/BackendReviewRpcAdapter';
import { BackendRpcDispatcher, mapBackendRpcDispatchError } from './rpc/BackendRpcDispatcher';
import {
  BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS,
  createBackendRpcHandlerRegistry,
  type BackendKernelRpcHandlerContext,
} from './rpc/BackendRpcRegistry';
import { BackendTopicDerivedCommandRuntime } from './rpc/BackendTopicDerivedRpcAdapter';
import { BackendXiuyuanSyncRuntime } from './rpc/BackendXiuyuanRpcAdapter';
import { WorkerReviewSessionRuntime } from '../review/WorkerReviewSessionRuntime';

const logger = createLogger('BackendKernel');
const REVIEW_FEEDBACK_KERNEL_STEP_SLOW_MS = 120;
const DIAGNOSTIC_TIMING_METHODS = new Set<string>([
  'browser.deck.page',
  'browser.stats',
  'browser.deck.documentCounts',
  'review.session.feedback',
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
  executeAutoCardBatch?: (request: BackendAutoCardExecuteBatchRequest) => Promise<BackendAutoCardExecuteBatchResult>;
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
  'queue.projection.replace',
  'kernel.transaction.dequeue',
]);

function isReviewFeedbackTimingMethod(method: string): boolean {
  return method === 'review.feedback' || method === 'review.session.feedback';
}

const REVIEW_FEEDBACK_MAIN_DB_FAST_SKIP_PRESERVE_METHODS = new Set<string>([
  'system.health',
  'diagnostics.status',
  'domainSync.status',
  'sync.reviewDivergence.audit',
  'sync.conflict.summarize',
  'review.truth.flush',
  'review.truth.backfill',
  'kernel.transaction.dequeue',
  'queue.projection.replace',
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
  private readonly preRequestMergeDiagnostics: BackendPreRequestMergeDiagnostic[] = [];
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
  private readonly reviewSessionRuntime: WorkerReviewSessionRuntime;
  private readonly reviewRuntime: BackendReviewRpcRuntime;
  private readonly rpcDispatcher: BackendRpcDispatcher<BackendKernelRpcHandlerContext>;

  constructor(private readonly deps: BackendKernelDependencies) {
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
    this.reviewSessionRuntime = new WorkerReviewSessionRuntime({
      repository: {
        getCard: (cardId) => this.deps.database.getCard(cardId),
      },
      queueProjection: {
        readGeneration: (queueType) => this.deps.database.getQueueProjectionGeneration(queueType),
        readRows: (query) => this.deps.database.readQueueProjectionRows(query),
      },
      feedbackRuntime: {
        reviewFeedback: (request) => this.deps.database.reviewFeedback(request),
      },
    });
    this.reviewRuntime = new BackendReviewRpcRuntime({
      database: this.deps.database,
      truthFileStore: this.deps.truthFileStore,
      sessionRuntime: this.reviewSessionRuntime,
      executeReviewRiffFeedback: this.deps.executeReviewRiffFeedback,
    });
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
          reviewFeedbackCardId = isReviewFeedbackTimingMethod(method)
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
      sync: {
        database: this.deps.database,
      },
      queueProjection: this.createQueueProjectionRpcRuntime(),
      neuralRoam: this.neuralRoamRuntime,
      kernelTransaction: this.deps.database,
      autoCard: {
        database: this.deps.database,
        executeAutoCard: this.deps.executeAutoCard,
        executeAutoCardBatch: this.deps.executeAutoCardBatch,
      },
      review: this.reviewRuntime,
      reviewFeedbackTiming: {
        get cardId() {
          return reviewFeedbackCardId;
        },
        get requestStartedAt() {
          return reviewFeedbackRequestStartedAt;
        },
        logStep: (step, durationMs, extra) => this.logReviewFeedbackKernelStepIfSlow(
          step,
          reviewFeedbackCardId,
          durationMs,
          extra,
        ),
      },
      graph: this.graphQueryService,
      privateApi: this.privateApiRuntime,
      semantic: this.semanticRuntime,
      p6Ownership: this.p6OwnershipRuntime,
      xiuyuan: this.xiuyuanSyncRuntime,
      progressive: this.progressiveCommandRuntime,
      topicDerived: this.topicDerivedCommandRuntime,
      hotspot: this.hotspotRuntime,
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
    const isReviewFeedback = isReviewFeedbackTimingMethod(method);
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
    if (isReviewFeedback) {
      recordReviewFeedbackInnerStep({
        layer: 'kernel',
        step: 'sync-divergent-diagnostic',
        durationMs: 0,
        cardId: reviewFeedbackCardId,
        extra: {
          diagnostic: 'sync-divergent',
          backendMethod: method,
          context: 'review-feedback-preflight',
          fullMergeSkipped: true,
          repairOwner: 'domainSync.repair.apply',
        },
      });
      return;
    }
    const mergeStartedAt = Date.now();
    const merge = await this.deps.database.mergeExternalDatabaseIfChanged(
      undefined,
      shouldRefreshMainDbReadOnly
          ? { context: 'read-only-preflight' }
        : shouldSkipPreflightMainDbRead
          ? { context: 'read-only-preflight', skipMainDbRead: true }
        : {},
    );
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
        truthFlush: this.reviewRuntime.getReviewFeedbackTruthFlushDiagnostics(),
        truthBackfill: await this.reviewRuntime.getReviewTruthBackfillDiagnostics(),
      },
      storage: {
        sqliteDelta,
        diagnostics: status.storageDiagnostics,
      },
      ai: status.ai,
      hotspot: this.hotspotRuntime.getDiagnostics(),
      preRequestMerge: this.getPreRequestMergeDiagnostics(),
      domainSync: await this.deps.database.getDomainSyncStatus(),
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

}
