import { describe, expect, it } from 'vitest';
import type { ColumnState, GridApi } from 'ag-grid-community';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import {
  normalizeSortColId,
  normalizeSortModel,
  resolveEffectiveSortModel,
  toSortModelFromColumnState,
} from '../sortModel';

function createApi(options: {
  destroyed?: boolean;
  columnState?: ColumnState[];
  legacySortModel?: SortModel[];
} = {}): GridApi {
  return {
    isDestroyed: () => options.destroyed === true,
    getColumnState: () => options.columnState || [],
    getSortModel: () => options.legacySortModel || [],
  } as unknown as GridApi;
}

describe('sortModel utils', () => {
  it('normalizes formatted column ids to raw sort keys', () => {
    expect(normalizeSortColId('dueFormatted')).toBe('due');
    expect(normalizeSortColId('lastReviewFormatted')).toBe('lastReview');
    expect(normalizeSortColId('firstReviewFormatted')).toBe('firstReview');
    expect(normalizeSortColId('priority')).toBe('priority');
    expect(normalizeSortColId('')).toBeNull();
  });

  it('filters invalid sort model entries', () => {
    const normalized = normalizeSortModel([
      { colId: 'due', sort: 'asc' },
      { colId: 'dueFormatted', sort: 'desc' },
      { colId: '', sort: 'asc' },
      { colId: 'priority', sort: 'invalid' as 'asc' },
    ]);

    expect(normalized).toEqual([
      { colId: 'due', sort: 'asc' },
      { colId: 'due', sort: 'desc' },
    ]);
  });

  it('resolves sort model from column state order', () => {
    const resolved = toSortModelFromColumnState([
      { colId: 'priority', sort: 'desc', sortIndex: 1 } as ColumnState,
      { colId: 'dueFormatted', sort: 'asc', sortIndex: 0 } as ColumnState,
    ]);

    expect(resolved).toEqual([
      { colId: 'due', sort: 'asc' },
      { colId: 'priority', sort: 'desc' },
    ]);
  });

  it('prioritizes request sort model over current and grid state', () => {
    const api = createApi({
      columnState: [{ colId: 'priority', sort: 'asc', sortIndex: 0 } as ColumnState],
    });

    const resolved = resolveEffectiveSortModel({
      requestSortModel: [{ colId: 'due', sort: 'desc' }],
      currentSortModel: [{ colId: 'priority', sort: 'asc' }],
      api,
    });

    expect(resolved).toEqual([{ colId: 'due', sort: 'desc' }]);
  });

  it('falls back to current sort model when request sort model is empty', () => {
    const api = createApi({
      columnState: [{ colId: 'priority', sort: 'asc', sortIndex: 0 } as ColumnState],
    });

    const resolved = resolveEffectiveSortModel({
      requestSortModel: [],
      currentSortModel: [{ colId: 'due', sort: 'asc' }],
      api,
    });

    expect(resolved).toEqual([{ colId: 'due', sort: 'asc' }]);
  });

  it('falls back to grid column state when request and current models are empty', () => {
    const api = createApi({
      columnState: [{ colId: 'priority', sort: 'desc', sortIndex: 0 } as ColumnState],
    });

    const resolved = resolveEffectiveSortModel({
      requestSortModel: [],
      currentSortModel: [],
      api,
    });

    expect(resolved).toEqual([{ colId: 'priority', sort: 'desc' }]);
  });
});
