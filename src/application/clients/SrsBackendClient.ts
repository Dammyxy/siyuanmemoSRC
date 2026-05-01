import type {
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendBrowserDeckPageRequest,
  BackendBrowserDeckPageResult,
  BackendBrowserDeckSnapshotQuery,
  BackendSourceExistenceSweepApplyResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionDequeueRequest,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionRequeueRequest,
  BackendKernelTransactionRequeueResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
  BackendSourceExistenceRefreshCandidate,
  BackendSourceExistenceRefreshRequest,
  BackendSourceExistenceSummary,
  BackendSourceExistenceUpdate,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendRpcRequest,
  BackendRpcResponse,
  BackendRpcSuccess,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_RPC_VERSION } from '../../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { FSRSCard } from '@/types/card';

export interface SrsBackendTransport {
  request(request: BackendRpcRequest): Promise<BackendRpcResponse>;
}

export class SrsBackendClient {
  private requestId = 0;

  constructor(private readonly transport: SrsBackendTransport) {}

  async systemHealth(): Promise<BackendHealthResult> {
    return this.call<BackendHealthResult>('system.health');
  }

  async loadDatabase(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    return this.call('db.load');
  }

  async persistDatabase(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    return this.call('db.persist');
  }

  async diagnosticsStatus(): Promise<BackendDiagnosticsStatusResult> {
    return this.call<BackendDiagnosticsStatusResult>('diagnostics.status');
  }

  async browserDeckPage(
    query: BackendBrowserDeckSnapshotQuery,
    page: BackendBrowserDeckPageRequest,
  ): Promise<BackendBrowserDeckPageResult> {
    return this.call('browser.deck.page', { query, page });
  }

  async browserDeckMatchedIds(query: BackendBrowserDeckSnapshotQuery): Promise<string[]> {
    const result = await this.call<{ ids: string[] }>('browser.deck.matchedIds', { query });
    return result.ids || [];
  }

  async browserDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    const result = await this.call<{ cards: FSRSCard[] }>('browser.deck.rowsByIds', { ids });
    return result.cards || [];
  }

  async browserStats(now?: number): Promise<BrowserStats> {
    return this.call<BrowserStats>('browser.stats', { now });
  }

  async browserCountCards(query?: StructuredCardQuery): Promise<number> {
    const result = await this.call<{ count: number }>('browser.count', { query });
    return Number(result.count || 0);
  }

  async browserSourceExistenceRefreshCandidates(
    request: BackendSourceExistenceRefreshRequest,
  ): Promise<BackendSourceExistenceRefreshCandidate[]> {
    const result = await this.call<{ candidates: BackendSourceExistenceRefreshCandidate[] }>(
      'browser.sourceExistence.refreshCandidates',
      { request },
    );
    return result.candidates || [];
  }

  async browserSourceExistenceUpdate(updates: BackendSourceExistenceUpdate[], checkedAt = Date.now()): Promise<number> {
    const result = await this.call<{ updated: number }>(
      'browser.sourceExistence.update',
      { updates, checkedAt },
    );
    return Number(result.updated || 0);
  }

  async browserSourceExistenceByBlockIds(blockIds: string[]): Promise<Map<string, boolean | null>> {
    const result = await this.call<{ statusByBlockId: Array<{ blockId: string; exists: boolean | null }> }>(
      'browser.sourceExistence.byBlockIds',
      { blockIds },
    );
    return new Map((result.statusByBlockId || []).map((row) => [row.blockId, row.exists] as const));
  }

  async browserSourceExistenceSummary(staleBefore?: number): Promise<BackendSourceExistenceSummary> {
    return this.call<BackendSourceExistenceSummary>('browser.sourceExistence.summary', { staleBefore });
  }

  async browserSourceExistenceApplySweep(
    request: BackendSourceExistenceRefreshRequest,
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.call<BackendSourceExistenceSweepApplyResult>('browser.sourceExistence.applySweep', {
      request,
      existingBlockIds,
      checkedAt,
    });
  }

  async browserSourceExistenceApplySweepHost(
    request: BackendSourceExistenceRefreshRequest,
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.call<BackendSourceExistenceSweepApplyResult>('browser.sourceExistence.applySweepHost', {
      request,
      checkedAt,
    });
  }

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    return this.call<BackendReviewFeedbackResult>('review.feedback', request);
  }

  async privateHealth(): Promise<{ ok: true; runtime: 'srs-backend-worker'; feature: 'private-api' }> {
    return this.call('private.health');
  }

  async privateDiagnosticsStatus(): Promise<unknown> {
    return this.call('private.diagnostics.status');
  }

  async privateAuditQuery(request: { requestId: string; method: 'private.audit.query'; callerIntent: string; limit?: number }): Promise<unknown> {
    return this.call('private.audit.query', request);
  }

  async privateRead(request: PrivateApiReadRequest): Promise<PrivateApiReadResult> {
    return this.call<PrivateApiReadResult>(request.method, request);
  }

  async privateCommand(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    return this.call<PrivateApiMutationResult>(request.method, request);
  }

  async ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> {
    return this.call<BackendKernelTransactionIngestResult>('kernel.transaction.ingest', request);
  }

  async dequeueKernelTransactions(
    request: BackendKernelTransactionDequeueRequest = {},
  ): Promise<BackendKernelTransactionDequeueResult> {
    return this.call<BackendKernelTransactionDequeueResult>('kernel.transaction.dequeue', request);
  }

  async requeueKernelTransactions(
    request: BackendKernelTransactionRequeueRequest = {},
  ): Promise<BackendKernelTransactionRequeueResult> {
    return this.call<BackendKernelTransactionRequeueResult>('kernel.transaction.requeue', request);
  }

  async resolveAutoCardDecision(
    request: BackendAutoCardDecisionResolveRequest,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    const result = await this.call<BackendAutoCardDecisionResolveResult>('autocard.decision.resolve', request);
    return this.validateAutoCardDecisionResolveResult(result);
  }

  async executeAutoCard(
    request: BackendAutoCardExecuteRequest,
  ): Promise<BackendAutoCardExecuteResult> {
    return this.call<BackendAutoCardExecuteResult>('autocard.execute', request);
  }

  private async call<TResult>(method: BackendRpcRequest['method'], params?: unknown): Promise<TResult> {
    const request: BackendRpcRequest = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: ++this.requestId,
      method,
      params: params == null ? [] : [params],
    };
    const response = await this.transport.request(request);
    if ('error' in response) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return (response as BackendRpcSuccess<TResult>).result;
  }

  private assertObjectResult<T extends Record<string, unknown>>(method: string, payload: unknown): T {
    if (!payload || typeof payload !== 'object') {
      throw new Error(`${method} returned invalid payload`);
    }
    return payload as T;
  }

  private validateAutoCardDecisionResolveResult(
    payload: unknown,
  ): BackendAutoCardDecisionResolveResult {
    const candidate = this.assertObjectResult<Record<string, unknown>>('autocard.decision.resolve', payload);
    const status = String(candidate.status || '').trim();
    if (!this.isAutoCardDecisionStatus(status)) {
      throw new Error('autocard.decision.resolve returned invalid payload');
    }
    const candidateId = String(candidate.candidateId || '').trim();
    const decisionEventId = String(candidate.decisionEventId || '').trim();
    if (!candidateId || !decisionEventId) {
      throw new Error('autocard.decision.resolve returned invalid payload');
    }
    return candidate as BackendAutoCardDecisionResolveResult;
  }

  private isAutoCardDecisionStatus(
    value: string,
  ): value is BackendAutoCardDecisionResolveResult['status'] {
    return value === 'selected'
      || value === 'skipped'
      || value === 'no-op'
      || value === 'unavailable'
      || value === 'failed';
  }
}
