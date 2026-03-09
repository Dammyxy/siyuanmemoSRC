import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { RetrievalDataSource } from '../RetrievalDataSource';

const toggleBrowserCardsSuspendedMock = vi.fn();

vi.mock('../DataSourceUtils', () => ({
  applyQueueFilters: (rows: unknown[]) => rows,
  deleteBrowserCards: vi.fn(),
  removeCardsFromQueue: vi.fn(),
  setBrowserCardsPriority: vi.fn(),
  sortBrowserCards: (rows: unknown[]) => rows,
  toggleBrowserCardsSuspended: (...args: unknown[]) => toggleBrowserCardsSuspendedMock(...args),
}));

function buildCard(id: string): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: '',
    blockId: `block-${id}`,
    due: now,
    stability: 3,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 60_000,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now,
    meta: {
      content: `card-${id}`,
    },
  };
}

describe('RetrievalDataSource query session invalidation', () => {
  it('exposes suspend in queue view and routes the action through the suspend helper', async () => {
    toggleBrowserCardsSuspendedMock.mockReset();
    const card = buildCard('card-1');
    const queue = {
      getCards: vi.fn(async () => [card]),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      getCards: vi.fn(async () => [card]),
      updateCard: vi.fn(),
    } as never;

    const dataSource = new RetrievalDataSource(manager, { preset: 'all' });
    const rows = await dataSource.fetchRows({ startRow: 0, endRow: 20, sortModel: [], filterModel: {} });
    const selectedRow = rows.rows[0];

    expect(selectedRow).toBeDefined();
    expect(dataSource.getSupportedActions().some((action) => action.id === 'suspend')).toBe(true);
    expect(dataSource.getSupportedActions().some((action) => action.id === 'unsuspend')).toBe(false);

    await dataSource.performAction('suspend', [selectedRow!]);

    expect(toggleBrowserCardsSuspendedMock).toHaveBeenCalledWith(
      manager,
      [selectedRow],
      true,
      { scope: 'RetrievalDataSource' },
    );
  });

  it('rebuilds queue membership after external card updates invalidate the session', async () => {
    let cards = [buildCard('card-1')];
    const queue = {
      getCards: vi.fn(async () => cards),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;

    const dataSource = new RetrievalDataSource(manager);

    const initial = await dataSource.fetchRows({ startRow: 0, endRow: 20, sortModel: [], filterModel: {} });
    expect(initial.rows).toHaveLength(1);
    expect(initial.rows[0]?.fsrsCardId).toBe('card-1');

    cards = [];

    const staleRows = await dataSource.getRowsByIds(['card-1']);
    expect(staleRows).toHaveLength(1);

    dataSource.invalidateQuerySession();

    const refreshedRows = await dataSource.getRowsByIds(['card-1']);
    expect(refreshedRows).toEqual([]);
  });
});
