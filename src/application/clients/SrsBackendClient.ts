import type {
  BackendBrowserDeckPageRequest,
  BackendBrowserDeckPageResult,
  BackendBrowserDeckSnapshotQuery,
  BackendSourceExistenceSweepApplyResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
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
}
