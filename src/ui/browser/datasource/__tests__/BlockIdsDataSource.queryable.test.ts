import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';

const loadBrowserCardProjectionsByBlockIdsMock = vi.fn();
const loadBrowserCardsByBlockIdsMock = vi.fn();

vi.mock('../../browserService', () => ({
  loadBrowserCardProjectionsByBlockIds: (...args: unknown[]) => loadBrowserCardProjectionsByBlockIdsMock(...args),
  loadBrowserCardsByBlockIds: (...args: unknown[]) => loadBrowserCardsByBlockIdsMock(...args),
}));

vi.mock('../DataSourceUtils', () => ({
  insertCardsIntoQueue: vi.fn(),
  removeCardsFromQueue: vi.fn(),
  resolveBrowserCardId: (row: { fsrsCardId?: string; id?: string; blockId?: string }) => row.fsrsCardId || row.id || row.blockId || '',
  setBrowserCardsPriority: vi.fn(),
  sortBrowserRows: <T>(rows: T[]) => rows,
}));

import { BlockIdsDataSource } from '../BlockIdsDataSource';

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

describe('BlockIdsDataSource queryable path', () => {
  beforeEach(() => {
    loadBrowserCardProjectionsByBlockIdsMock.mockReset();
    loadBrowserCardsByBlockIdsMock.mockReset();
  });

  it('fetchRows builds lite rows and hydrates only the requested page', async () => {
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a'),
      makeProjection('card-b', 'block-b'),
      makeProjection('card-c', 'block-c'),
    ]);
    loadBrowserCardsByBlockIdsMock.mockImplementation(async (blockIds: string[]) =>
      blockIds.map((blockId) => makeProjection(`card-${blockId.slice(-1)}`, blockId))
    );

    const dataSource = new BlockIdsDataSource({
      id: 'neural-roam',
      label: 'Neural Roam',
      blockIds: ['block-a', 'block-b', 'block-c'],
      queueId: 'neural-roam',
      queryText: 'alpha',
    });

    const result = await dataSource.fetchRows({
      startRow: 1,
      endRow: 3,
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      filterModel: {},
    });

    expect(result.totalCount).toBe(3);
    expect(result.rows.map((row) => row.blockId)).toEqual(['block-b', 'block-c']);
    expect(loadBrowserCardProjectionsByBlockIdsMock).toHaveBeenCalledWith(
      ['block-a', 'block-b', 'block-c'],
      { queryText: 'alpha', applyQueryFilter: true },
    );
    expect(loadBrowserCardsByBlockIdsMock).toHaveBeenCalledTimes(1);
    expect(loadBrowserCardsByBlockIdsMock).toHaveBeenCalledWith(['block-b', 'block-c'], { applyQueryFilter: false });
  });

  it('preserves multiple cards that share the same blockId during page hydration', async () => {
    const rows = [
      makeProjection('card-a', 'same-block', { fsrsCardId: 'fsrs-a' }),
      makeProjection('card-b', 'same-block', { fsrsCardId: 'fsrs-b' }),
      makeProjection('card-c', 'same-block', { fsrsCardId: 'fsrs-c' }),
    ];
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue(rows);
    loadBrowserCardsByBlockIdsMock.mockResolvedValue(rows);

    const dataSource = new BlockIdsDataSource({
      id: 'neural-roam',
      label: 'Neural Roam',
      blockIds: ['same-block'],
      queueId: 'neural-roam',
    });

    const result = await dataSource.fetchRows({
      startRow: 0,
      endRow: 3,
      sortModel: [],
      filterModel: {},
    });

    expect(result.totalCount).toBe(3);
    expect(result.rows.map((row) => row.fsrsCardId)).toEqual(['fsrs-a', 'fsrs-b', 'fsrs-c']);
    expect(loadBrowserCardsByBlockIdsMock).toHaveBeenCalledWith(
      ['same-block'],
      { applyQueryFilter: false },
    );
  });

  it('getAllMatchedIds and getActionTargetsByIds reuse lite rows without hydrating cards', async () => {
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a', { priority: 12 }),
      makeProjection('card-b', 'block-b', { priority: 34 }),
    ]);
    loadBrowserCardsByBlockIdsMock.mockResolvedValue([]);

    const dataSource = new BlockIdsDataSource({
      id: 'neural-roam',
      label: 'Neural Roam',
      blockIds: ['block-a', 'block-b'],
      queueId: 'neural-roam',
      queryText: 'beta',
    });

    const ids = await dataSource.getAllMatchedIds();
    const targets = await dataSource.getActionTargetsByIds(['card-b', 'card-a']);

    expect(ids).toEqual(['card-a', 'card-b']);
    expect(targets).toEqual([
      { id: 'card-b', blockId: 'block-b', fsrsCardId: 'card-b', cardType: undefined, priority: 34 },
      { id: 'card-a', blockId: 'block-a', fsrsCardId: 'card-a', cardType: undefined, priority: 12 },
    ]);
    expect(loadBrowserCardsByBlockIdsMock).not.toHaveBeenCalled();
  });
});
