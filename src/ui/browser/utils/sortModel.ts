import type { ColumnState, GridApi } from 'ag-grid-community';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import { normalizeSortContractColId } from '../config/sortDisplayContract';

type LegacySortApi = GridApi & {
  getSortModel?: () => SortModel[] | undefined;
};

export function normalizeSortColId(colId: unknown): string | null {
  return normalizeSortContractColId(colId);
}

export function normalizeSortModel(sortModel?: SortModel[] | null): SortModel[] {
  if (!Array.isArray(sortModel)) {
    return [];
  }

  const normalized: SortModel[] = [];

  for (const item of sortModel) {
    if (!item || (item.sort !== 'asc' && item.sort !== 'desc')) {
      continue;
    }

    const colId = normalizeSortColId(item.colId);
    if (!colId) {
      continue;
    }

    normalized.push({
      colId,
      sort: item.sort,
    });
  }

  return normalized;
}

export function toSortModelFromColumnState(columnState?: ColumnState[] | null): SortModel[] {
  if (!Array.isArray(columnState)) {
    return [];
  }

  return columnState
    .filter((col) => typeof col.colId === 'string' && (col.sort === 'asc' || col.sort === 'desc'))
    .sort((a, b) => {
      const aIndex = Number.isFinite(a.sortIndex) ? Number(a.sortIndex) : Number.MAX_SAFE_INTEGER;
      const bIndex = Number.isFinite(b.sortIndex) ? Number(b.sortIndex) : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    })
    .map((col) => {
      const colId = normalizeSortColId(col.colId);
      if (!colId) {
        return null;
      }
      return {
        colId,
        sort: col.sort as 'asc' | 'desc',
      };
    })
    .filter((item): item is SortModel => Boolean(item));
}

export function resolveEffectiveSortModel(options: {
  requestSortModel?: SortModel[] | null;
  currentSortModel?: SortModel[] | null;
  api?: GridApi | null;
}): SortModel[] {
  const requestSortModel = normalizeSortModel(options.requestSortModel);
  if (requestSortModel.length > 0) {
    return requestSortModel;
  }

  const currentSortModel = normalizeSortModel(options.currentSortModel);
  if (currentSortModel.length > 0) {
    return currentSortModel;
  }

  const api = options.api;
  if (!api) {
    return [];
  }

  if (typeof api.isDestroyed === 'function' && api.isDestroyed()) {
    return [];
  }

  const fromColumnState = toSortModelFromColumnState(api.getColumnState?.() || []);
  if (fromColumnState.length > 0) {
    return fromColumnState;
  }

  return normalizeSortModel((api as LegacySortApi).getSortModel?.());
}
