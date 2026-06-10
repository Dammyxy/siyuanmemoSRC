import type {
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregateFocusResult,
  BackendBrowserAggregatePageRequest,
  BackendBrowserAggregatePageResult,
  BackendBrowserAggregateSnapshotRequest,
  BackendBrowserAggregateSnapshotResult,
  BackendBrowserCountParams,
  BackendBrowserCountResult,
  BackendBrowserDeckMatchedIdsParams,
  BackendBrowserDeckMatchedIdsResult,
  BackendBrowserDeckPageParams,
  BackendBrowserDeckPageResult,
  BackendBrowserDeckRowsByIdsParams,
  BackendBrowserDeckRowsByIdsResult,
  BackendBrowserDocumentCountsParams,
  BackendBrowserDocumentCountsResult,
  BackendBrowserStatsParams,
  BackendBrowserStatsResult,
  BackendRpcHandlerAdapter,
  BackendSourceExistenceByBlockIdsParams,
  BackendSourceExistenceByBlockIdsResult,
  BackendSourceExistenceRefreshCandidate,
  BackendSourceExistenceRefreshCandidatesParams,
  BackendSourceExistenceRefreshCandidatesResult,
  BackendSourceExistenceRefreshRequest,
  BackendSourceExistenceSummary,
  BackendSourceExistenceSummaryParams,
  BackendSourceExistenceSweepApplyRequest,
  BackendSourceExistenceSweepApplyResult,
  BackendSourceExistenceUpdateParams,
  BackendSourceExistenceUpdateResult,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_BROWSER_RPC_METHODS, type BackendBrowserRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendBrowserRpcDatabase {
  queryDeckPage(
    query: NonNullable<BackendBrowserDeckPageParams['query']>,
    page: NonNullable<BackendBrowserDeckPageParams['page']>,
  ): Promise<BackendBrowserDeckPageResult | null> | BackendBrowserDeckPageResult | null;
  queryDeckMatchedIds(
    query: NonNullable<BackendBrowserDeckMatchedIdsParams['query']>,
  ): Promise<string[] | null> | string[] | null;
  getDeckRowsByIds(ids: string[]): Promise<unknown[]> | unknown[];
  queryBrowserDocumentCounts(
    scope: NonNullable<BackendBrowserDocumentCountsParams['scope']>,
  ): Promise<BackendBrowserDocumentCountsResult> | BackendBrowserDocumentCountsResult;
  countCards(query: BackendBrowserCountParams['query']): Promise<number> | number;
  getBrowserStats(now: BackendBrowserStatsParams['now']): Promise<BackendBrowserStatsResult> | BackendBrowserStatsResult;
  getSourceExistenceRefreshCandidates(
    request: BackendSourceExistenceRefreshRequest,
  ): Promise<BackendSourceExistenceRefreshCandidate[]> | BackendSourceExistenceRefreshCandidate[];
  updateSourceExistence(
    updates: NonNullable<BackendSourceExistenceUpdateParams['updates']>,
    checkedAt: BackendSourceExistenceUpdateParams['checkedAt'],
  ): Promise<void> | void;
  getSourceExistenceByBlockIds(
    blockIds: string[],
  ): Promise<BackendSourceExistenceByBlockIdsResult['statusByBlockId']>
    | BackendSourceExistenceByBlockIdsResult['statusByBlockId'];
  getSourceExistenceSummary(
    staleBefore: BackendSourceExistenceSummaryParams['staleBefore'],
  ): Promise<BackendSourceExistenceSummary> | BackendSourceExistenceSummary;
  applySourceExistenceSweep(
    request: BackendSourceExistenceRefreshRequest,
    existingBlockIds: string[],
    checkedAt: BackendSourceExistenceSweepApplyRequest['checkedAt'],
  ): Promise<BackendSourceExistenceSweepApplyResult> | BackendSourceExistenceSweepApplyResult;
  applySourceExistenceSweepFromCandidates(
    candidates: BackendSourceExistenceRefreshCandidate[],
    existingBlockIds: string[],
    checkedAt: BackendSourceExistenceSweepApplyRequest['checkedAt'],
  ): Promise<BackendSourceExistenceSweepApplyResult> | BackendSourceExistenceSweepApplyResult;
}

export interface BackendBrowserAggregateReader {
  snapshot(
    request: BackendBrowserAggregateSnapshotRequest,
  ): Promise<BackendBrowserAggregateSnapshotResult> | BackendBrowserAggregateSnapshotResult;
  page(
    request: BackendBrowserAggregatePageRequest,
  ): Promise<BackendBrowserAggregatePageResult> | BackendBrowserAggregatePageResult;
  focus(
    request: BackendBrowserAggregateFocusRequest,
  ): Promise<BackendBrowserAggregateFocusResult> | BackendBrowserAggregateFocusResult;
}

export interface BackendBrowserRpcRuntime {
  readonly database: BackendBrowserRpcDatabase;
  readonly aggregateReader: BackendBrowserAggregateReader;
  resolveExistingBlockIds?(blockIds: string[]): Promise<string[]> | string[];
}

export interface BackendBrowserRpcHandlerContext extends BackendRpcHandlerContext {
  readonly browser: BackendBrowserRpcRuntime;
}

export type BackendBrowserRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendBrowserRpcHandlerContext
>;

const BACKEND_BROWSER_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendBrowserRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendBrowserRpcHandlerContext
  >;
} = {
  'browser.deck.page': {
    method: 'browser.deck.page',
    family: 'browser',
    async handle(params, context): Promise<BackendBrowserDeckPageResult> {
      const named = readNamedParams<BackendBrowserDeckPageParams>(params);
      const result = await context.browser.database.queryDeckPage(named?.query ?? {}, named?.page ?? {});
      return {
        total: result?.total ?? 0,
        cards: result?.cards ?? [],
        generation: result?.generation ?? null,
      };
    },
  },
  'browser.deck.matchedIds': {
    method: 'browser.deck.matchedIds',
    family: 'browser',
    async handle(params, context): Promise<BackendBrowserDeckMatchedIdsResult> {
      const named = readNamedParams<BackendBrowserDeckMatchedIdsParams>(params);
      const ids = await context.browser.database.queryDeckMatchedIds(named?.query ?? {});
      return { ids: ids ?? [] };
    },
  },
  'browser.deck.rowsByIds': {
    method: 'browser.deck.rowsByIds',
    family: 'browser',
    async handle(params, context): Promise<BackendBrowserDeckRowsByIdsResult> {
      const named = readNamedParams<BackendBrowserDeckRowsByIdsParams>(params);
      const ids = Array.isArray(named?.ids) ? named.ids : [];
      const cards = await context.browser.database.getDeckRowsByIds(ids);
      return { cards };
    },
  },
  'browser.deck.documentCounts': {
    method: 'browser.deck.documentCounts',
    family: 'browser',
    handle(params, context): Promise<BackendBrowserDocumentCountsResult> | BackendBrowserDocumentCountsResult {
      const named = readNamedParams<BackendBrowserDocumentCountsParams>(params);
      return context.browser.database.queryBrowserDocumentCounts(named?.scope ?? { kind: 'deck' });
    },
  },
  'browser.stats': {
    method: 'browser.stats',
    family: 'browser',
    handle(params, context): Promise<BackendBrowserStatsResult> | BackendBrowserStatsResult {
      const named = readNamedParams<BackendBrowserStatsParams>(params);
      return context.browser.database.getBrowserStats(named?.now);
    },
  },
  'browser.count': {
    method: 'browser.count',
    family: 'browser',
    async handle(params, context): Promise<BackendBrowserCountResult> {
      const named = readNamedParams<BackendBrowserCountParams>(params);
      const count = await context.browser.database.countCards(named?.query);
      return { count };
    },
  },
  'browser.sourceExistence.refreshCandidates': {
    method: 'browser.sourceExistence.refreshCandidates',
    family: 'browser',
    async handle(params, context): Promise<BackendSourceExistenceRefreshCandidatesResult> {
      const named = readNamedParams<BackendSourceExistenceRefreshCandidatesParams>(params);
      const candidates = await context.browser.database.getSourceExistenceRefreshCandidates(named?.request ?? {});
      return { candidates };
    },
  },
  'browser.sourceExistence.update': {
    method: 'browser.sourceExistence.update',
    family: 'browser',
    async handle(params, context): Promise<BackendSourceExistenceUpdateResult> {
      const named = readNamedParams<BackendSourceExistenceUpdateParams>(params);
      const updates = Array.isArray(named?.updates) ? named.updates : [];
      await context.browser.database.updateSourceExistence(updates, named?.checkedAt);
      return { updated: updates.length };
    },
  },
  'browser.sourceExistence.byBlockIds': {
    method: 'browser.sourceExistence.byBlockIds',
    family: 'browser',
    async handle(params, context): Promise<BackendSourceExistenceByBlockIdsResult> {
      const named = readNamedParams<BackendSourceExistenceByBlockIdsParams>(params);
      const blockIds = Array.isArray(named?.blockIds) ? named.blockIds : [];
      const statusByBlockId = await context.browser.database.getSourceExistenceByBlockIds(blockIds);
      return { statusByBlockId };
    },
  },
  'browser.sourceExistence.summary': {
    method: 'browser.sourceExistence.summary',
    family: 'browser',
    handle(params, context): Promise<BackendSourceExistenceSummary> | BackendSourceExistenceSummary {
      const named = readNamedParams<BackendSourceExistenceSummaryParams>(params);
      return context.browser.database.getSourceExistenceSummary(named?.staleBefore);
    },
  },
  'browser.sourceExistence.applySweep': {
    method: 'browser.sourceExistence.applySweep',
    family: 'browser',
    handle(params, context): Promise<BackendSourceExistenceSweepApplyResult> | BackendSourceExistenceSweepApplyResult {
      const named = readNamedParams<BackendSourceExistenceSweepApplyRequest>(params);
      const existingBlockIds = Array.isArray(named?.existingBlockIds) ? named.existingBlockIds : [];
      return context.browser.database.applySourceExistenceSweep(named?.request ?? {}, existingBlockIds, named?.checkedAt);
    },
  },
  'browser.sourceExistence.applySweepHost': {
    method: 'browser.sourceExistence.applySweepHost',
    family: 'browser',
    async handle(params, context): Promise<BackendSourceExistenceSweepApplyResult> {
      const applied = await applyBrowserSourceExistenceSweepHostWithChanges(params, context.browser);
      return {
        ...applied.result,
        changedBlockIds: applied.changedBlockIds,
      };
    },
  },
  'browser.aggregate.snapshot': {
    method: 'browser.aggregate.snapshot',
    family: 'browser',
    handle(params, context): Promise<BackendBrowserAggregateSnapshotResult> | BackendBrowserAggregateSnapshotResult {
      const named = readRequiredNamedParams<BackendBrowserAggregateSnapshotRequest>(
        params,
        'browser.aggregate.snapshot requires named params',
      );
      return context.browser.aggregateReader.snapshot(named);
    },
  },
  'browser.aggregate.page': {
    method: 'browser.aggregate.page',
    family: 'browser',
    handle(params, context): Promise<BackendBrowserAggregatePageResult> | BackendBrowserAggregatePageResult {
      const named = readRequiredNamedParams<BackendBrowserAggregatePageRequest>(
        params,
        'browser.aggregate.page requires named params',
      );
      return context.browser.aggregateReader.page(named);
    },
  },
  'browser.aggregate.focus': {
    method: 'browser.aggregate.focus',
    family: 'browser',
    handle(params, context): Promise<BackendBrowserAggregateFocusResult> | BackendBrowserAggregateFocusResult {
      const named = readRequiredNamedParams<BackendBrowserAggregateFocusRequest>(
        params,
        'browser.aggregate.focus requires named params',
      );
      return context.browser.aggregateReader.focus(named);
    },
  },
};

export const BACKEND_BROWSER_RPC_HANDLER_REGISTRATIONS: readonly BackendBrowserRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_BROWSER_RPC_METHODS.map((method) => ({
      ...BACKEND_BROWSER_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendBrowserRpcAdapter',
    })),
  );

export function readNamedParams<TParams extends object>(params: unknown): TParams | null {
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

export async function applyBrowserSourceExistenceSweepHostWithChanges(
  params: unknown,
  runtime: BackendBrowserRpcRuntime,
): Promise<{
  result: BackendSourceExistenceSweepApplyResult;
  changedBlockIds: string[];
}> {
  if (!runtime.resolveExistingBlockIds) {
    throw new Error('SrsBackendWorker host source-existence resolver is unavailable');
  }
  const named = readNamedParams<{ request?: BackendSourceExistenceRefreshRequest; checkedAt?: number }>(params);
  const request = named?.request ?? {};
  const candidates = await runtime.database.getSourceExistenceRefreshCandidates(request);
  if (candidates.length === 0) {
    return {
      result: { checked: 0, updated: 0, changed: false, changedToMissing: false },
      changedBlockIds: [],
    };
  }
  const existingBlockIds = await runtime.resolveExistingBlockIds(
    candidates.map((candidate) => candidate.blockId),
  );
  const existingSet = new Set(
    existingBlockIds
      .map((blockId) => String(blockId || '').trim())
      .filter(Boolean),
  );
  const changedBlockIds = candidates
    .filter((candidate) => candidate.sourceExists !== existingSet.has(candidate.blockId))
    .map((candidate) => candidate.blockId);
  const result = await runtime.database.applySourceExistenceSweepFromCandidates(
    candidates,
    existingBlockIds,
    named?.checkedAt,
  );
  return {
    result,
    changedBlockIds: result.changedBlockIds && result.changedBlockIds.length > 0
      ? result.changedBlockIds
      : changedBlockIds,
  };
}
