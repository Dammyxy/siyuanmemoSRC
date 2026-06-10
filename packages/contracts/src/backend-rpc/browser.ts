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
  BackendRpcMethod,
  BackendRpcMethodContract,
  BackendSourceExistenceRefreshCandidate,
  BackendSourceExistenceRefreshRequest,
  BackendSourceExistenceSummary,
  BackendSourceExistenceSweepApplyRequest,
  BackendSourceExistenceSweepApplyResult,
  BackendSourceExistenceUpdate,
} from '../backend-rpc';

export const BACKEND_BROWSER_RPC_METHODS = [
  'browser.deck.page',
  'browser.deck.matchedIds',
  'browser.deck.rowsByIds',
  'browser.deck.documentCounts',
  'browser.stats',
  'browser.count',
  'browser.sourceExistence.refreshCandidates',
  'browser.sourceExistence.update',
  'browser.sourceExistence.byBlockIds',
  'browser.sourceExistence.summary',
  'browser.sourceExistence.applySweep',
  'browser.sourceExistence.applySweepHost',
  'browser.aggregate.snapshot',
  'browser.aggregate.page',
  'browser.aggregate.focus',
] as const satisfies readonly BackendRpcMethod[];

export type BackendBrowserRpcMethod = typeof BACKEND_BROWSER_RPC_METHODS[number];

export interface BackendBrowserDeckPageParams {
  query?: BackendBrowserDeckSnapshotQuery;
  page?: BackendBrowserDeckPageRequest;
}

export interface BackendBrowserDeckMatchedIdsParams {
  query?: BackendBrowserDeckSnapshotQuery;
}

export interface BackendBrowserDeckMatchedIdsResult {
  ids: string[];
}

export interface BackendBrowserDeckRowsByIdsParams {
  ids?: string[];
}

export interface BackendBrowserDeckRowsByIdsResult {
  cards: unknown[];
}

export interface BackendBrowserDocumentCountsParams {
  scope?: BackendBrowserDocumentCountsScope;
}

export interface BackendBrowserStatsParams {
  now?: number;
}

export type BackendBrowserStatsResult = Record<string, number>;

export interface BackendBrowserCountParams {
  query?: unknown;
}

export interface BackendBrowserCountResult {
  count: number;
}

export interface BackendSourceExistenceRefreshCandidatesParams {
  request?: BackendSourceExistenceRefreshRequest;
}

export interface BackendSourceExistenceRefreshCandidatesResult {
  candidates: BackendSourceExistenceRefreshCandidate[];
}

export interface BackendSourceExistenceUpdateParams {
  updates?: BackendSourceExistenceUpdate[];
  checkedAt?: number;
}

export interface BackendSourceExistenceUpdateResult {
  updated: number;
}

export interface BackendSourceExistenceByBlockIdsParams {
  blockIds?: string[];
}

export interface BackendSourceExistenceByBlockIdsResult {
  statusByBlockId: Array<{ blockId: string; exists: boolean | null }>;
}

export interface BackendSourceExistenceSummaryParams {
  staleBefore?: number;
}

export type BackendBrowserRpcMethodContractMap = {
  readonly 'browser.deck.page': BackendRpcMethodContract<
    'browser.deck.page',
    BackendBrowserDeckPageParams,
    BackendBrowserDeckPageResult
  >;
  readonly 'browser.deck.matchedIds': BackendRpcMethodContract<
    'browser.deck.matchedIds',
    BackendBrowserDeckMatchedIdsParams,
    BackendBrowserDeckMatchedIdsResult
  >;
  readonly 'browser.deck.rowsByIds': BackendRpcMethodContract<
    'browser.deck.rowsByIds',
    BackendBrowserDeckRowsByIdsParams,
    BackendBrowserDeckRowsByIdsResult
  >;
  readonly 'browser.deck.documentCounts': BackendRpcMethodContract<
    'browser.deck.documentCounts',
    BackendBrowserDocumentCountsParams,
    BackendBrowserDocumentCountsResult
  >;
  readonly 'browser.stats': BackendRpcMethodContract<'browser.stats', BackendBrowserStatsParams, BackendBrowserStatsResult>;
  readonly 'browser.count': BackendRpcMethodContract<'browser.count', BackendBrowserCountParams, BackendBrowserCountResult>;
  readonly 'browser.sourceExistence.refreshCandidates': BackendRpcMethodContract<
    'browser.sourceExistence.refreshCandidates',
    BackendSourceExistenceRefreshCandidatesParams,
    BackendSourceExistenceRefreshCandidatesResult
  >;
  readonly 'browser.sourceExistence.update': BackendRpcMethodContract<
    'browser.sourceExistence.update',
    BackendSourceExistenceUpdateParams,
    BackendSourceExistenceUpdateResult
  >;
  readonly 'browser.sourceExistence.byBlockIds': BackendRpcMethodContract<
    'browser.sourceExistence.byBlockIds',
    BackendSourceExistenceByBlockIdsParams,
    BackendSourceExistenceByBlockIdsResult
  >;
  readonly 'browser.sourceExistence.summary': BackendRpcMethodContract<
    'browser.sourceExistence.summary',
    BackendSourceExistenceSummaryParams,
    BackendSourceExistenceSummary
  >;
  readonly 'browser.sourceExistence.applySweep': BackendRpcMethodContract<
    'browser.sourceExistence.applySweep',
    BackendSourceExistenceSweepApplyRequest,
    BackendSourceExistenceSweepApplyResult
  >;
  readonly 'browser.sourceExistence.applySweepHost': BackendRpcMethodContract<
    'browser.sourceExistence.applySweepHost',
    BackendSourceExistenceSweepApplyRequest,
    BackendSourceExistenceSweepApplyResult
  >;
  readonly 'browser.aggregate.snapshot': BackendRpcMethodContract<
    'browser.aggregate.snapshot',
    BackendBrowserAggregateSnapshotRequest,
    BackendBrowserAggregateSnapshotResult
  >;
  readonly 'browser.aggregate.page': BackendRpcMethodContract<
    'browser.aggregate.page',
    BackendBrowserAggregatePageRequest,
    BackendBrowserAggregatePageResult
  >;
  readonly 'browser.aggregate.focus': BackendRpcMethodContract<
    'browser.aggregate.focus',
    BackendBrowserAggregateFocusRequest,
    BackendBrowserAggregateFocusResult
  >;
};

export const BACKEND_BROWSER_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'browser.deck.page', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.deck.matchedIds', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.deck.rowsByIds', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.deck.documentCounts', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.stats', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.count', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.sourceExistence.refreshCandidates', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.sourceExistence.update', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.sourceExistence.byBlockIds', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.sourceExistence.summary', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.sourceExistence.applySweep', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.sourceExistence.applySweepHost', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.aggregate.snapshot', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.aggregate.page', family: 'browser', clientExposure: 'facade' },
  { method: 'browser.aggregate.focus', family: 'browser', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_BROWSER_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_BROWSER_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendBrowserRpcMethodContractMap>;
