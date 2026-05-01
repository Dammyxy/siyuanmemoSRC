import {
  BACKEND_RPC_VERSION,
  type BackendAutoCardExecuteRequest,
  type BackendAutoCardExecuteResult,
  type BackendAutoCardDecisionResolveRequest,
  type BackendAutoCardDecisionResolveResult,
  type BackendBrowserDeckPageRequest,
  type BackendBrowserDeckSnapshotQuery,
  type BackendSourceExistenceSweepApplyRequest,
  type BackendSourceExistenceSweepApplyResult,
  type BackendKernelTransactionIngestRequest,
  type BackendKernelTransactionIngestResult,
  type BackendKernelTransactionDequeueRequest,
  type BackendKernelTransactionDequeueResult,
  type BackendKernelTransactionRequeueRequest,
  type BackendKernelTransactionRequeueResult,
  type BackendReviewFeedbackResult,
  type PrivateApiAuditQueryRequest,
  type PrivateApiMutationRequest,
  type PrivateApiMutationResult,
  type PrivateApiReadRequest,
  type PrivateApiReadResult,
  type BackendSourceExistenceRefreshCandidate,
  type BackendSourceExistenceRefreshRequest,
  type BackendSourceExistenceSummary,
  type BackendSourceExistenceUpdate,
  type BackendReviewFeedbackRequest,
  type BackendDiagnosticsStatusResult,
  type BackendHealthResult,
  type BackendRpcRequest,
  type BackendRpcResponse,
} from '../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import {
  createUnavailableSqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';

interface BackendKernelDependencies {
  database: WorkerSqliteDatabaseService;
  resolveExistingBlockIds?: (blockIds: string[]) => Promise<string[]>;
  executeAutoCard?: (request: BackendAutoCardExecuteRequest) => Promise<BackendAutoCardExecuteResult>;
}

function buildSuccess<TResult>(
  id: number | string,
  result: TResult,
): BackendRpcResponse<TResult> {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    result,
  };
}

function buildError(
  id: number | string,
  code: 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'METHOD_NOT_FOUND' | 'INTERNAL_ERROR',
  message: string,
): BackendRpcResponse {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };
}

export class BackendKernel {
  private readonly privateApiAuditTrail: Array<{
    requestId: string;
    method: string;
    callerIntent: string;
    status: 'accepted' | 'completed' | 'rejected' | 'failed';
    timestamp: number;
  }> = [];

  constructor(private readonly deps: BackendKernelDependencies) {}

  static createWithoutBridge(): BackendKernel {
    const reason = 'SrsBackendWorker persistence bridge is unavailable';
    const bridge = createUnavailableSqlitePersistenceBridge(reason);
    return BackendKernel.createWithBridge(bridge);
  }

  static createWithBridge(bridge: SqlitePersistenceBridge): BackendKernel {
    return new BackendKernel({
      database: new WorkerSqliteDatabaseService(bridge),
    });
  }

  async handle(request: BackendRpcRequest): Promise<BackendRpcResponse> {
    if (!request || request.jsonrpc !== BACKEND_RPC_VERSION || !request.method) {
      return buildError(
        request?.id ?? 'invalid-request',
        'INVALID_REQUEST',
        'Invalid SrsBackendWorker JSON-RPC request',
      );
    }

    try {
      switch (request.method) {
        case 'system.health':
          return buildSuccess(request.id, this.systemHealth());
        case 'db.load':
          return buildSuccess(request.id, await this.deps.database.load());
        case 'db.persist':
          return buildSuccess(request.id, await this.deps.database.persist());
        case 'diagnostics.status':
          return buildSuccess(request.id, this.diagnosticsStatus());
        case 'browser.deck.page':
          return buildSuccess(request.id, await this.handleBrowserDeckPage(request.params));
        case 'browser.deck.matchedIds':
          return buildSuccess(request.id, await this.handleBrowserDeckMatchedIds(request.params));
        case 'browser.deck.rowsByIds':
          return buildSuccess(request.id, await this.handleBrowserDeckRowsByIds(request.params));
        case 'browser.count':
          return buildSuccess(request.id, await this.handleBrowserCount(request.params));
        case 'browser.stats':
          return buildSuccess(request.id, await this.handleBrowserStats(request.params));
        case 'browser.sourceExistence.refreshCandidates':
          return buildSuccess(request.id, await this.handleSourceExistenceRefreshCandidates(request.params));
        case 'browser.sourceExistence.update':
          return buildSuccess(request.id, await this.handleSourceExistenceUpdate(request.params));
        case 'browser.sourceExistence.byBlockIds':
          return buildSuccess(request.id, await this.handleSourceExistenceByBlockIds(request.params));
        case 'browser.sourceExistence.summary':
          return buildSuccess(request.id, await this.handleSourceExistenceSummary(request.params));
        case 'browser.sourceExistence.applySweepHost':
          return buildSuccess(request.id, await this.handleSourceExistenceApplySweepHost(request.params));
        case 'kernel.transaction.ingest':
          return buildSuccess(request.id, await this.handleKernelTransactionIngest(request.params));
        case 'kernel.transaction.dequeue':
          return buildSuccess(request.id, await this.handleKernelTransactionDequeue(request.params));
        case 'kernel.transaction.requeue':
          return buildSuccess(request.id, await this.handleKernelTransactionRequeue(request.params));
        case 'autocard.decision.resolve':
          return buildSuccess(request.id, await this.handleAutoCardDecisionResolve(request.params));
        case 'autocard.execute':
          return buildSuccess(request.id, await this.handleAutoCardExecute(request.params));
        case 'review.feedback':
          return buildSuccess(request.id, await this.handleReviewFeedback(request.params));
        case 'private.health':
          return buildSuccess(request.id, this.handlePrivateHealth());
        case 'private.diagnostics.status':
          return buildSuccess(request.id, this.handlePrivateDiagnosticsStatus());
        case 'private.audit.query':
          return buildSuccess(request.id, this.handlePrivateAuditQuery(request.params));
        case 'private.read.cards':
        case 'private.read.queues':
        case 'private.read.sessions':
          return buildSuccess(request.id, await this.handlePrivateRead(request.method, request.params));
        case 'private.command.execute':
          return buildSuccess(request.id, await this.handlePrivateCommand(request.params));
        case 'browser.sourceExistence.applySweep':
          return buildSuccess(request.id, await this.handleSourceExistenceApplySweep(request.params));
        default:
          return buildError(request.id, 'METHOD_NOT_FOUND', `Unknown method: ${request.method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('persistence bridge is unavailable')
        || message.includes('is unavailable')
        || message.includes(' unavailable ')
        || message.includes('unavailable:')
        || message.startsWith('unavailable')
      ) {
        return buildError(request.id, 'BACKEND_UNAVAILABLE', message);
      }
      return buildError(request.id, 'INTERNAL_ERROR', message);
    }
  }

  private systemHealth(): BackendHealthResult {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      initialized: this.deps.database.getStatus().initialized,
    };
  }

  private diagnosticsStatus(): BackendDiagnosticsStatusResult {
    const status = this.deps.database.getStatus();
    return {
      runtime: 'srs-backend-worker',
      initialized: status.initialized,
      dbFile: status.dbFile,
      ingest: status.ingest,
      autoCard: status.autoCard,
      review: status.review,
    };
  }

  private readNamedParams<TParams extends Record<string, unknown>>(params: unknown): TParams | null {
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

  private async handleBrowserDeckPage(params: unknown): Promise<{ total: number; cards: unknown[] }> {
    const named = this.readNamedParams<{ query?: BackendBrowserDeckSnapshotQuery; page?: BackendBrowserDeckPageRequest }>(params);
    const query = named?.query ?? {};
    const page = named?.page ?? {};
    const result = await this.deps.database.queryDeckPage(query, page);
    return {
      total: result?.total ?? 0,
      cards: result?.cards ?? [],
    };
  }

  private async handleBrowserDeckMatchedIds(params: unknown): Promise<{ ids: string[] }> {
    const named = this.readNamedParams<{ query?: BackendBrowserDeckSnapshotQuery }>(params);
    const ids = await this.deps.database.queryDeckMatchedIds(named?.query ?? {});
    return { ids: ids ?? [] };
  }

  private async handleBrowserDeckRowsByIds(params: unknown): Promise<{ cards: unknown[] }> {
    const named = this.readNamedParams<{ ids?: string[] }>(params);
    const ids = Array.isArray(named?.ids) ? named.ids : [];
    const cards = await this.deps.database.getDeckRowsByIds(ids);
    return { cards };
  }

  private async handleBrowserCount(params: unknown): Promise<{ count: number }> {
    const named = this.readNamedParams<{ query?: StructuredCardQuery }>(params);
    const count = await this.deps.database.countCards(named?.query);
    return { count };
  }

  private async handleBrowserStats(params: unknown): Promise<Record<string, number>> {
    const named = this.readNamedParams<{ now?: number }>(params);
    return this.deps.database.getBrowserStats(named?.now);
  }

  private async handleSourceExistenceRefreshCandidates(
    params: unknown,
  ): Promise<{ candidates: BackendSourceExistenceRefreshCandidate[] }> {
    const named = this.readNamedParams<{ request?: BackendSourceExistenceRefreshRequest }>(params);
    const candidates = await this.deps.database.getSourceExistenceRefreshCandidates(named?.request ?? {});
    return { candidates };
  }

  private async handleSourceExistenceUpdate(params: unknown): Promise<{ updated: number }> {
    const named = this.readNamedParams<{ updates?: BackendSourceExistenceUpdate[]; checkedAt?: number }>(params);
    const updates = Array.isArray(named?.updates) ? named.updates : [];
    await this.deps.database.updateSourceExistence(updates, named?.checkedAt);
    return { updated: updates.length };
  }

  private async handleSourceExistenceByBlockIds(params: unknown): Promise<{ statusByBlockId: Array<{ blockId: string; exists: boolean | null }> }> {
    const named = this.readNamedParams<{ blockIds?: string[] }>(params);
    const blockIds = Array.isArray(named?.blockIds) ? named.blockIds : [];
    const statusByBlockId = await this.deps.database.getSourceExistenceByBlockIds(blockIds);
    return { statusByBlockId };
  }

  private async handleSourceExistenceSummary(params: unknown): Promise<BackendSourceExistenceSummary> {
    const named = this.readNamedParams<{ staleBefore?: number }>(params);
    return this.deps.database.getSourceExistenceSummary(named?.staleBefore);
  }

  private async handleSourceExistenceApplySweep(params: unknown): Promise<BackendSourceExistenceSweepApplyResult> {
    const named = this.readNamedParams<BackendSourceExistenceSweepApplyRequest>(params);
    const existingBlockIds = Array.isArray(named?.existingBlockIds) ? named.existingBlockIds : [];
    return this.deps.database.applySourceExistenceSweep(
      named?.request ?? {},
      existingBlockIds,
      named?.checkedAt,
    );
  }

  private async handleSourceExistenceApplySweepHost(params: unknown): Promise<BackendSourceExistenceSweepApplyResult> {
    if (!this.deps.resolveExistingBlockIds) {
      throw new Error('SrsBackendWorker host source-existence resolver is unavailable');
    }
    const named = this.readNamedParams<{ request?: BackendSourceExistenceRefreshRequest; checkedAt?: number }>(params);
    const request = named?.request ?? {};
    const candidates = await this.deps.database.getSourceExistenceRefreshCandidates(request);
    if (candidates.length === 0) {
      return { checked: 0, updated: 0, changed: false, changedToMissing: false };
    }
    const existingBlockIds = await this.deps.resolveExistingBlockIds(
      candidates.map((candidate) => candidate.blockId),
    );
    return this.deps.database.applySourceExistenceSweepFromCandidates(
      candidates,
      existingBlockIds,
      named?.checkedAt,
    );
  }

  private async handleReviewFeedback(params: unknown): Promise<BackendReviewFeedbackResult> {
    const named = this.readNamedParams<BackendReviewFeedbackRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('review.feedback requires named params');
    }
    return this.deps.database.reviewFeedback(named);
  }

  private async handleKernelTransactionIngest(params: unknown): Promise<BackendKernelTransactionIngestResult> {
    const named = this.readNamedParams<BackendKernelTransactionIngestRequest>(params);
    return this.deps.database.ingestKernelTransactions(named ?? {});
  }

  private async handleKernelTransactionDequeue(params: unknown): Promise<BackendKernelTransactionDequeueResult> {
    const named = this.readNamedParams<BackendKernelTransactionDequeueRequest>(params);
    const maxActions = Number(named?.maxActions);
    return this.deps.database.dequeueKernelTransactionActions(Number.isFinite(maxActions) ? maxActions : 16);
  }

  private async handleKernelTransactionRequeue(params: unknown): Promise<BackendKernelTransactionRequeueResult> {
    const named = this.readNamedParams<BackendKernelTransactionRequeueRequest>(params);
    const actions = Array.isArray(named?.actions) ? named.actions : [];
    return this.deps.database.requeueKernelTransactionActions(actions);
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

  private handlePrivateHealth(): { ok: true; runtime: 'srs-backend-worker'; feature: 'private-api' } {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      feature: 'private-api',
    };
  }

  private handlePrivateDiagnosticsStatus(): {
    ok: true;
    runtime: 'srs-backend-worker';
    status: BackendDiagnosticsStatusResult;
    auditEvents: number;
  } {
    return {
      ok: true,
      runtime: 'srs-backend-worker',
      status: this.diagnosticsStatus(),
      auditEvents: this.privateApiAuditTrail.length,
    };
  }

  private handlePrivateAuditQuery(params: unknown): {
    ok: true;
    data: unknown[];
    diagnosticEventId: string;
    auditStatus: 'recorded';
  } {
    const named = this.readNamedParams<PrivateApiAuditQueryRequest>(params);
    const limit = Math.max(1, Math.floor(Number(named?.limit ?? 20)));
    const rows = this.privateApiAuditTrail.slice(-limit).reverse();
    return {
      ok: true,
      data: rows,
      diagnosticEventId: `private-audit:${Date.now()}`,
      auditStatus: 'recorded',
    };
  }

  private async handlePrivateRead(
    method: 'private.read.cards' | 'private.read.queues' | 'private.read.sessions',
    params: unknown,
  ): Promise<PrivateApiReadResult> {
    const named = this.readNamedParams<PrivateApiReadRequest>(params);
    const requestId = String(named?.requestId || `private-read:${Date.now()}`).trim();
    const callerIntent = String(named?.callerIntent || 'unknown').trim() || 'unknown';
    const limit = Math.max(1, Math.floor(Number(named?.limit ?? 20)));
    this.recordPrivateApiAudit({
      requestId,
      method,
      callerIntent,
      status: 'accepted',
    });
    let data: unknown;
    if (method === 'private.read.cards') {
      const page = await this.deps.database.queryDeckPage({}, { startRow: 0, endRow: limit });
      data = page.cards ?? [];
    } else if (method === 'private.read.queues') {
      const status = this.deps.database.getStatus();
      data = {
        ingest: status.ingest,
      };
    } else {
      data = [];
    }
    this.recordPrivateApiAudit({
      requestId,
      method,
      callerIntent,
      status: 'completed',
    });
    return {
      ok: true,
      data,
      diagnosticEventId: `private-read:${requestId}`,
      auditStatus: 'recorded',
    };
  }

  private async handlePrivateCommand(params: unknown): Promise<PrivateApiMutationResult> {
    const named = this.readNamedParams<PrivateApiMutationRequest>(params);
    if (!named || typeof named !== 'object') {
      throw new Error('private.command.execute requires named params');
    }
    const requestId = String(named.requestId || '').trim();
    const callerIntent = String(named.callerIntent || '').trim();
    const idempotencyKey = String(named.idempotencyKey || '').trim();
    if (!requestId || !callerIntent || !idempotencyKey) {
      throw new Error('private.command.execute requires requestId/callerIntent/idempotencyKey');
    }
    this.recordPrivateApiAudit({
      requestId,
      method: 'private.command.execute',
      callerIntent,
      status: 'accepted',
    });
    const result = {
      ok: true,
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: {},
      result: {
        idempotencyKey,
        committed: false,
      },
      auditStatus: 'recorded',
      diagnosticEventId: `private-command:${requestId}`,
    } as PrivateApiMutationResult;
    this.recordPrivateApiAudit({
      requestId,
      method: 'private.command.execute',
      callerIntent,
      status: 'completed',
    });
    return result;
  }

  private recordPrivateApiAudit(input: {
    requestId: string;
    method: string;
    callerIntent: string;
    status: 'accepted' | 'completed' | 'rejected' | 'failed';
  }): void {
    this.privateApiAuditTrail.push({
      requestId: input.requestId,
      method: input.method,
      callerIntent: input.callerIntent,
      status: input.status,
      timestamp: Date.now(),
    });
    if (this.privateApiAuditTrail.length > 500) {
      this.privateApiAuditTrail.splice(0, this.privateApiAuditTrail.length - 500);
    }
  }
}
