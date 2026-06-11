import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { RetrievalDataSource } from '../RetrievalDataSource';
import type { BrowserCard } from '../../types';

const toggleBrowserCardsSuspendedMock = vi.fn();

vi.mock('../DataSourceUtils', () => ({
  applyQueueFilters: (rows: unknown[]) => rows,
  applyQueueFiltersToSnapshotRows: (rows: unknown[]) => rows,
  deleteBrowserCards: vi.fn(),
  removeCardsFromQueue: vi.fn(),
  setBrowserCardsPriority: vi.fn(),
  sortBrowserCards: (rows: unknown[]) => rows,
  sortQueueSnapshotRows: (rows: unknown[]) => rows,
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

function buildBrowserCard(card: FSRSCard): BrowserCard {
  const content = typeof card.meta?.content === 'string' ? card.meta.content : card.id;
  return {
    id: card.id,
    fsrsCardId: card.id,
    blockId: card.blockId,
    deckId: 'deck-a',
    content,
    fullContent: content,
    rootId: 'doc-a',
    state: card.state,
    stateLabel: 'Review',
    due: new Date(card.due),
    dueFormatted: '',
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability: 0.5,
    reps: card.reps,
    lapses: card.lapses,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    lastReview: new Date(card.lastReview),
    lastReviewFormatted: '',
    interval: card.scheduledDays,
    firstReview: null,
    firstReviewFormatted: '',
    priority: card.priority,
    suspended: card.state === CardState.Suspended,
    tags: card.tags,
    note: '',
    cardType: 'item',
    meta: { content },
  };
}

function buildBrowserService(readCards: () => FSRSCard[]) {
  return {
    getQueueQuerySnapshot: vi.fn(async () => ({
      total: readCards().length,
      rows: readCards().map((card) => ({
        id: card.id,
        fsrsCardId: card.id,
        blockId: card.blockId,
      })),
    })),
    getQueueRowsByIds: vi.fn(async (_queueId: string, ids: string[]) => {
      const idSet = new Set(ids);
      return readCards()
        .map(buildBrowserCard)
        .filter((row) => idSet.has(row.id));
    }),
  };
}

describe('RetrievalDataSource query session invalidation', () => {
  it('exposes suspend in queue view and routes the action through the suspend helper', async () => {
    toggleBrowserCardsSuspendedMock.mockReset();
    const card = buildCard('card-1');
    const browserService = buildBrowserService(() => [card]);
    const queue = {
      getCards: vi.fn(async () => [card]),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      getCards: vi.fn(async () => [card]),
      updateCard: vi.fn(),
    } as never;

    const dataSource = new RetrievalDataSource(
      manager,
      { preset: 'all' },
      undefined,
      { browserService },
    );
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
    const browserService = buildBrowserService(() => cards);

    const dataSource = new RetrievalDataSource(
      manager,
      undefined,
      undefined,
      { browserService },
    );

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
