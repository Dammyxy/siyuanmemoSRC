import type {
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregateFocusResult,
  BackendBrowserAggregatePageRequest,
  BackendBrowserAggregatePageResult,
  BackendBrowserAggregateSnapshotRequest,
  BackendBrowserAggregateSnapshotResult,
  BackendBrowserDeckPageRequest,
  BackendBrowserDeckPageResult,
  BackendBrowserDeckSnapshotQuery,
  BackendBrowserDocumentCountsResult,
  BackendBrowserDocumentCountsScope,
  BackendSourceExistenceRefreshCandidate,
  BackendSourceExistenceRefreshRequest,
  BackendSourceExistenceSummary,
  BackendSourceExistenceSweepApplyResult,
  BackendSourceExistenceUpdate,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { StructuredCardQuery } from '@/types/card-query';
import type { FSRSCard } from '@/types/card';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendBrowserClientFacet {
  browserDeckPage(
    query: BackendBrowserDeckSnapshotQuery,
    page: BackendBrowserDeckPageRequest,
  ): Promise<BackendBrowserDeckPageResult>;
  browserDeckMatchedIds(query: BackendBrowserDeckSnapshotQuery): Promise<string[]>;
  browserDeckRowsByIds(ids: string[]): Promise<FSRSCard[]>;
  browserDeckDocumentCounts(scope: BackendBrowserDocumentCountsScope): Promise<BackendBrowserDocumentCountsResult>;
  browserStats(now?: number): Promise<BrowserStats>;
  browserCountCards(query?: StructuredCardQuery): Promise<number>;
  browserSourceExistenceRefreshCandidates(
    request: BackendSourceExistenceRefreshRequest,
  ): Promise<BackendSourceExistenceRefreshCandidate[]>;
  browserSourceExistenceUpdate(updates: BackendSourceExistenceUpdate[], checkedAt?: number): Promise<number>;
  browserSourceExistenceByBlockIds(blockIds: string[]): Promise<Map<string, boolean | null>>;
  browserSourceExistenceSummary(staleBefore?: number): Promise<BackendSourceExistenceSummary>;
  browserSourceExistenceApplySweep(
    request: BackendSourceExistenceRefreshRequest,
    existingBlockIds: string[],
    checkedAt?: number,
  ): Promise<BackendSourceExistenceSweepApplyResult>;
  browserSourceExistenceApplySweepHost(
    request: BackendSourceExistenceRefreshRequest,
    checkedAt?: number,
  ): Promise<BackendSourceExistenceSweepApplyResult>;
  browserAggregateSnapshot(request: BackendBrowserAggregateSnapshotRequest): Promise<BackendBrowserAggregateSnapshotResult>;
  browserAggregatePage<TRow = unknown>(
    request: BackendBrowserAggregatePageRequest,
  ): Promise<BackendBrowserAggregatePageResult<TRow>>;
  browserAggregateFocus<TRow = unknown>(
    request: BackendBrowserAggregateFocusRequest,
  ): Promise<BackendBrowserAggregateFocusResult<TRow>>;
}

export class BackendBrowserRpcClient implements BackendBrowserClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  browserDeckPage(
    query: BackendBrowserDeckSnapshotQuery,
    page: BackendBrowserDeckPageRequest,
  ): Promise<BackendBrowserDeckPageResult> {
    return this.rpcCaller.call('browser.deck.page', { query, page });
  }

  async browserDeckMatchedIds(query: BackendBrowserDeckSnapshotQuery): Promise<string[]> {
    const result = await this.rpcCaller.call<{ ids: string[] }>('browser.deck.matchedIds', { query });
    return result.ids || [];
  }

  async browserDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    const result = await this.rpcCaller.call<{ cards: FSRSCard[] }>('browser.deck.rowsByIds', { ids });
    return result.cards || [];
  }

  browserDeckDocumentCounts(scope: BackendBrowserDocumentCountsScope): Promise<BackendBrowserDocumentCountsResult> {
    return this.rpcCaller.call<BackendBrowserDocumentCountsResult>('browser.deck.documentCounts', { scope });
  }

  browserStats(now?: number): Promise<BrowserStats> {
    return this.rpcCaller.call<BrowserStats>('browser.stats', { now });
  }

  async browserCountCards(query?: StructuredCardQuery): Promise<number> {
    const result = await this.rpcCaller.call<{ count: number }>('browser.count', { query });
    return Number(result.count || 0);
  }

  async browserSourceExistenceRefreshCandidates(
    request: BackendSourceExistenceRefreshRequest,
  ): Promise<BackendSourceExistenceRefreshCandidate[]> {
    const result = await this.rpcCaller.call<{ candidates: BackendSourceExistenceRefreshCandidate[] }>(
      'browser.sourceExistence.refreshCandidates',
      { request },
    );
    return result.candidates || [];
  }

  async browserSourceExistenceUpdate(
    updates: BackendSourceExistenceUpdate[],
    checkedAt = Date.now(),
  ): Promise<number> {
    const result = await this.rpcCaller.call<{ updated: number }>(
      'browser.sourceExistence.update',
      { updates, checkedAt },
    );
    return Number(result.updated || 0);
  }

  async browserSourceExistenceByBlockIds(blockIds: string[]): Promise<Map<string, boolean | null>> {
    const result = await this.rpcCaller.call<{ statusByBlockId: Array<{ blockId: string; exists: boolean | null }> }>(
      'browser.sourceExistence.byBlockIds',
      { blockIds },
    );
    return new Map((result.statusByBlockId || []).map((row) => [row.blockId, row.exists] as const));
  }

  browserSourceExistenceSummary(staleBefore?: number): Promise<BackendSourceExistenceSummary> {
    return this.rpcCaller.call<BackendSourceExistenceSummary>('browser.sourceExistence.summary', { staleBefore });
  }

  browserSourceExistenceApplySweep(
    request: BackendSourceExistenceRefreshRequest,
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.rpcCaller.call<BackendSourceExistenceSweepApplyResult>('browser.sourceExistence.applySweep', {
      request,
      existingBlockIds,
      checkedAt,
    });
  }

  browserSourceExistenceApplySweepHost(
    request: BackendSourceExistenceRefreshRequest,
    checkedAt = Date.now(),
  ): Promise<BackendSourceExistenceSweepApplyResult> {
    return this.rpcCaller.call<BackendSourceExistenceSweepApplyResult>('browser.sourceExistence.applySweepHost', {
      request,
      checkedAt,
    });
  }

  browserAggregateSnapshot(
    request: BackendBrowserAggregateSnapshotRequest,
  ): Promise<BackendBrowserAggregateSnapshotResult> {
    return this.rpcCaller.call<BackendBrowserAggregateSnapshotResult>('browser.aggregate.snapshot', request);
  }

  browserAggregatePage<TRow = unknown>(
    request: BackendBrowserAggregatePageRequest,
  ): Promise<BackendBrowserAggregatePageResult<TRow>> {
    return this.rpcCaller.call<BackendBrowserAggregatePageResult<TRow>>('browser.aggregate.page', request);
  }

  browserAggregateFocus<TRow = unknown>(
    request: BackendBrowserAggregateFocusRequest,
  ): Promise<BackendBrowserAggregateFocusResult<TRow>> {
    return this.rpcCaller.call<BackendBrowserAggregateFocusResult<TRow>>('browser.aggregate.focus', request);
  }
}
