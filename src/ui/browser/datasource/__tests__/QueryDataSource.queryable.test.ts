import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';

const runBrowserSqlMock = vi.fn();
const loadBrowserCardProjectionsByBlockIdsMock = vi.fn();
const loadBrowserCardsByBlockIdsMock = vi.fn();

vi.mock('../../browserService', () => ({
  runBrowserSql: (...args: unknown[]) => runBrowserSqlMock(...args),
  loadBrowserCardProjectionsByBlockIds: (...args: unknown[]) => loadBrowserCardProjectionsByBlockIdsMock(...args),
  loadBrowserCardsByBlockIds: (...args: unknown[]) => loadBrowserCardsByBlockIdsMock(...args),
}));

vi.mock('../DataSourceUtils', () => ({
  sortBrowserRows: <T>(rows: T[]) => rows,
}));

import { QueryDataSource } from '../QueryDataSource';

function makeProjection(id: string, blockId: string, overrides: Partial<BrowserCard> = {}) {
  return {
    id,
    fsrsCardId: overrides.fsrsCardId ?? id,
    blockId,
    deckId: overrides.deckId ?? 'deck-a',
    content: overrides.content ?? id,
    fullContent: overrides.fullContent ?? id,
    rootId: overrides.rootId ?? 'doc-a',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 0,
    difficulty: overrides.difficulty ?? 0,
    retrievability: overrides.retrievability ?? 0,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
  };
}

describe('QueryDataSource queryable path', () => {
  beforeEach(() => {
    runBrowserSqlMock.mockReset();
    loadBrowserCardProjectionsByBlockIdsMock.mockReset();
    loadBrowserCardsByBlockIdsMock.mockReset();
  });

  it('fetchRows builds lite rows from SQL result and hydrates only the requested page', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
      { id: 'block-b', content: 'Beta', root_id: 'doc-b' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a'),
    ]);
    loadBrowserCardsByBlockIdsMock.mockImplementation(async (blockIds: string[]) =>
      blockIds.map((blockId) =>
        blockId === 'block-b'
          ? makeProjection(blockId, blockId)
          : makeProjection(`card-${blockId.slice(-1)}`, blockId)
      )
    );

    const dataSource = new QueryDataSource('select * from blocks');
    const result = await dataSource.fetchRows({
      startRow: 1,
      endRow: 2,
      sortModel: [{ colId: 'priority', sort: 'asc' }],
      filterModel: {},
    });

    expect(result.totalCount).toBe(2);
    expect(result.rows.map((row) => row.blockId)).toEqual(['block-b']);
    expect(runBrowserSqlMock).toHaveBeenCalledWith('select * from blocks');
    expect(loadBrowserCardProjectionsByBlockIdsMock).toHaveBeenCalledWith(
      ['block-a', 'block-b'],
      { applyQueryFilter: false },
    );
    expect(loadBrowserCardsByBlockIdsMock).toHaveBeenCalledTimes(1);
    expect(loadBrowserCardsByBlockIdsMock).toHaveBeenCalledWith(['block-b'], { applyQueryFilter: false });
  });

  it('getActionTargetsByIds reuses lite rows without hydrating cards', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
      { id: 'block-b', content: 'Beta', root_id: 'doc-b' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a', { priority: 11 }),
      makeProjection('card-b', 'block-b', { priority: 22 }),
    ]);
    loadBrowserCardsByBlockIdsMock.mockResolvedValue([]);

    const dataSource = new QueryDataSource('select * from blocks');
    const ids = await dataSource.getAllMatchedIds();
    const targets = await dataSource.getActionTargetsByIds(['card-b', 'card-a']);

    expect(ids).toEqual(['card-a', 'card-b']);
    expect(targets).toEqual([
      { id: 'card-b', blockId: 'block-b', fsrsCardId: 'card-b', cardType: undefined, priority: 22 },
      { id: 'card-a', blockId: 'block-a', fsrsCardId: 'card-a', cardType: undefined, priority: 11 },
    ]);
    expect(loadBrowserCardsByBlockIdsMock).not.toHaveBeenCalled();
  });
});
