import type { BrowserCard } from './types';
import type {
  IBrowserQueryableDataSource,
  ICardDataSource,
  SortModel,
} from './datasource/types';
import { isBrowserQueryableDataSource } from './datasource/types';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
} from '@/utils/runtimePerformanceDiagnostics';

export function resolveQueryableDataSource(
  dataSource: ICardDataSource | null,
): IBrowserQueryableDataSource | null {
  if (!dataSource || !isBrowserQueryableDataSource(dataSource)) {
    return null;
  }
  return dataSource;
}

export async function fetchAllRowsFromDataSource(
  dataSource: ICardDataSource,
  sortModel: SortModel[] = [],
): Promise<BrowserCard[]> {
  const probe = await measureRuntimePerformance('browser', 'snapshot.fetch-all.probe', () => dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: 1,
  }));

  if (probe.totalCount <= probe.rows.length) {
    return probe.rows;
  }

  const full = await measureRuntimePerformance('browser', 'snapshot.fetch-all.full', () => dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: probe.totalCount,
  }), { totalCount: probe.totalCount });
  return full.rows;
}

export async function loadAllRowsFromQueryableDataSource(
  dataSource: ICardDataSource,
  sortModel: SortModel[] = [],
  options: {
    chunkSize?: number;
    shouldAbort?: () => boolean;
  } = {},
): Promise<BrowserCard[]> {
  const queryable = resolveQueryableDataSource(dataSource);
  if (!queryable) {
    return fetchAllRowsFromDataSource(dataSource, sortModel);
  }

  await measureRuntimePerformance('browser', 'snapshot.queryable.prime-session', () => dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: 0,
  }));

  if (options.shouldAbort?.()) {
    return [];
  }

  const allIds = await measureRuntimePerformance('browser', 'snapshot.queryable.get-all-matched-ids', () => queryable.getAllMatchedIds());
  incrementRuntimePerformanceCounter('browser', 'snapshot-matched-ids', allIds.length);
  if (allIds.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.floor(Number(options.chunkSize) || 500));
  const rows: BrowserCard[] = [];
  for (let index = 0; index < allIds.length; index += chunkSize) {
    if (options.shouldAbort?.()) {
      return rows;
    }

    const chunkIds = allIds.slice(index, index + chunkSize);
    const hydratedRows = await measureRuntimePerformance('browser', 'snapshot.queryable.hydrate-chunk', () => queryable.getRowsByIds(chunkIds), {
      chunkSize: chunkIds.length,
      offset: index,
    });
    if (options.shouldAbort?.()) {
      return rows;
    }
    rows.push(...hydratedRows);
  }

  return rows;
}
