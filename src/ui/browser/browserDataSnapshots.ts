import type { BrowserCard } from './types';
import type {
  IBrowserQueryableDataSource,
  ICardDataSource,
  SortModel,
} from './datasource/types';
import { isBrowserQueryableDataSource } from './datasource/types';

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
  const probe = await dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: 1,
  });

  if (probe.totalCount <= probe.rows.length) {
    return probe.rows;
  }

  const full = await dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: probe.totalCount,
  });
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

  await dataSource.fetchRows({
    sortModel,
    filterModel: {},
    startRow: 0,
    endRow: 0,
  });

  if (options.shouldAbort?.()) {
    return [];
  }

  const allIds = await queryable.getAllMatchedIds();
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
    const hydratedRows = await queryable.getRowsByIds(chunkIds);
    if (options.shouldAbort?.()) {
      return rows;
    }
    rows.push(...hydratedRows);
  }

  return rows;
}
