import {
  BACKEND_RPC_VERSION,
  type BackendBrowserDeckPageRequest,
  type BackendBrowserDeckSnapshotQuery,
  type BackendSourceExistenceSweepApplyRequest,
  type BackendSourceExistenceSweepApplyResult,
  type BackendKernelTransactionIngestRequest,
  type BackendKernelTransactionIngestResult,
  type BackendKernelTransactionDequeueRequest,
  type BackendKernelTransactionDequeueResult,
  type BackendReviewFeedbackResult,
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
        case 'review.feedback':
          return buildSuccess(request.id, await this.handleReviewFeedback(request.params));
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
}
