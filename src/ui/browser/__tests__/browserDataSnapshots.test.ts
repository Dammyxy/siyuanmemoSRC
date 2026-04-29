import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../types';
import type { ICardDataSource } from '../datasource/types';
import {
  fetchAllRowsFromDataSource,
  loadAllRowsFromQueryableDataSource,
  resolveQueryableDataSource,
} from '../browserDataSnapshots';

function row(id: string): BrowserCard {
  return { id, blockId: id } as BrowserCard;
}

describe('browserDataSnapshots', () => {
  it('fetches the full range when the probe reports more rows', async () => {
    const fetchRows = vi.fn()
      .mockResolvedValueOnce({ rows: [row('a')], totalCount: 3 })
      .mockResolvedValueOnce({ rows: [row('a'), row('b'), row('c')], totalCount: 3 });
    const dataSource = { fetchRows } as unknown as ICardDataSource;

    await expect(fetchAllRowsFromDataSource(dataSource, [{ colId: 'due', sort: 'asc' }])).resolves
      .toEqual([row('a'), row('b'), row('c')]);

    expect(fetchRows).toHaveBeenNthCalledWith(1, {
      sortModel: [{ colId: 'due', sort: 'asc' }],
      filterModel: {},
      startRow: 0,
      endRow: 1,
    });
    expect(fetchRows).toHaveBeenNthCalledWith(2, {
      sortModel: [{ colId: 'due', sort: 'asc' }],
      filterModel: {},
      startRow: 0,
      endRow: 3,
    });
  });

  it('hydrates queryable ids in chunks and keeps the query session warm', async () => {
    const fetchRows = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
    const getAllMatchedIds = vi.fn(async () => ['a', 'b', 'c', 'd', 'e']);
    const getRowsByIds = vi.fn(async (ids: string[]) => ids.map(row));
    const dataSource = {
      fetchRows,
      getActionTargetsByIds: vi.fn(),
      getAllMatchedIds,
      getQueryFingerprint: vi.fn(() => 'fp'),
      getRowsByIds,
    } as unknown as ICardDataSource;

    await expect(loadAllRowsFromQueryableDataSource(dataSource, [], { chunkSize: 2 })).resolves
      .toEqual(['a', 'b', 'c', 'd', 'e'].map(row));

    expect(fetchRows).toHaveBeenCalledWith({
      sortModel: [],
      filterModel: {},
      startRow: 0,
      endRow: 0,
    });
    expect(getRowsByIds).toHaveBeenNthCalledWith(1, ['a', 'b']);
    expect(getRowsByIds).toHaveBeenNthCalledWith(2, ['c', 'd']);
    expect(getRowsByIds).toHaveBeenNthCalledWith(3, ['e']);
  });

  it('drops an in-flight chunk when abort happens after hydration', async () => {
    let aborted = false;
    const dataSource = {
      fetchRows: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
      getActionTargetsByIds: vi.fn(),
      getAllMatchedIds: vi.fn(async () => ['a', 'b', 'c']),
      getQueryFingerprint: vi.fn(() => 'fp'),
      getRowsByIds: vi.fn(async (ids: string[]) => {
        aborted = true;
        return ids.map(row);
      }),
    } as unknown as ICardDataSource;

    await expect(loadAllRowsFromQueryableDataSource(dataSource, [], {
      chunkSize: 2,
      shouldAbort: () => aborted,
    })).resolves.toEqual([]);
  });

  it('detects queryable datasources', () => {
    expect(resolveQueryableDataSource(null)).toBeNull();
    expect(resolveQueryableDataSource({ fetchRows: vi.fn() } as unknown as ICardDataSource)).toBeNull();

    const queryable = {
      fetchRows: vi.fn(),
      getActionTargetsByIds: vi.fn(),
      getAllMatchedIds: vi.fn(),
      getQueryFingerprint: vi.fn(),
      getRowsByIds: vi.fn(),
    } as unknown as ICardDataSource;
    expect(resolveQueryableDataSource(queryable)).toBe(queryable);
  });
});
