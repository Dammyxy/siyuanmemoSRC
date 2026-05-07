import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { DeckDataSource } from '../DeckDataSource';
import type { BrowserCard } from '../../types';

function makeBrowserCard(id: string, overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id,
    fsrsCardId: overrides.fsrsCardId ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
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
    note: overrides.note,
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

describe('DeckDataSource query snapshot path', () => {
  it('uses paged browserService path without building a full snapshot when available', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when paged browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckPage: vi.fn(async () => ({
        total: 3,
        rows: [makeBrowserCard('card-2'), makeBrowserCard('card-3')],
      })),
      getDeckMatchedIds: vi.fn(async () => ['card-1', 'card-2', 'card-3']),
      getDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id))),
      getDeckQuerySnapshot: vi.fn(),
    };

    const dataSource = new DeckDataSource(
      manager,
      {
        preset: 'all',
        currentDocId: 'doc-a',
        scopeDocIds: ['doc-a'],
        queryText: 'alpha',
        cardType: 'item-only',
      },
      undefined,
      { browserService },
    );

    const page = await dataSource.fetchRows({
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      filterModel: {},
      startRow: 1,
      endRow: 3,
    });
    expect(page.totalCount).toBe(3);
    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(['card-2', 'card-3']);
    expect(browserService.getDeckPage).toHaveBeenCalledWith({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: ['doc-a'],
      searchText: 'alpha',
      cardTypes: ['item'],
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    }, {
      startRow: 1,
      endRow: 3,
    });
    expect(browserService.getDeckQuerySnapshot).not.toHaveBeenCalled();

    await expect(dataSource.getAllMatchedIds()).resolves.toEqual(['card-1', 'card-2', 'card-3']);
    await expect(dataSource.getRowsByIds(['card-3'])).resolves.toMatchObject([{ fsrsCardId: 'card-3' }]);
    await expect(dataSource.getActionTargetsByIds(['card-2'])).resolves.toMatchObject([{ fsrsCardId: 'card-2' }]);
    expect(manager.getCards).not.toHaveBeenCalled();
  });

  it('passes cloneable browserService query payloads when Vue reactive arrays reach the data source', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when paged browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckPage: vi.fn(async (query: unknown, page: unknown) => {
        expect(() => structuredClone({ query, page })).not.toThrow();
        return {
          total: 1,
          rows: [makeBrowserCard('card-1')],
        };
      }),
    };

    const dataSource = new DeckDataSource(
      manager,
      {
        preset: 'all',
        currentDocId: 'doc-a',
        scopeDocIds: reactive(['doc-a', 'doc-a-child']) as unknown as string[],
        queryText: 'alpha',
        cardType: 'item-only',
      },
      undefined,
      { browserService },
    );

    const page = await dataSource.fetchRows({
      sortModel: reactive([{ colId: 'priority', sort: 'desc' }]) as never,
      filterModel: {},
      startRow: 0,
      endRow: 1,
    });

    expect(page.totalCount).toBe(1);
    expect(browserService.getDeckPage).toHaveBeenCalledWith({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: ['doc-a', 'doc-a-child'],
      searchText: 'alpha',
      cardTypes: ['item'],
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    }, {
      startRow: 0,
      endRow: 1,
    });
  });

  it('passes cloneable deck row id payloads when Vue reactive arrays reach direct hydration', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when paged browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckPage: vi.fn(async () => ({
        total: 0,
        rows: [],
      })),
      getDeckRowsByIds: vi.fn(async (ids: unknown) => {
        expect(() => structuredClone({ ids })).not.toThrow();
        return [makeBrowserCard('card-1')];
      }),
    };

    const dataSource = new DeckDataSource(
      manager,
      { preset: 'all' },
      undefined,
      { browserService },
    );

    const rows = await dataSource.getRowsByIds(reactive(['card-1']) as unknown as string[]);

    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-1']);
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledWith(['card-1']);
  });

  it('fetchRows uses browserService snapshot and hydrates only the requested page', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckQuerySnapshot: vi.fn().mockResolvedValue({
        total: 3,
        rows: [
          { id: 'card-1', blockId: 'block-1', fsrsCardId: 'card-1' },
          { id: 'card-2', blockId: 'block-2', fsrsCardId: 'card-2' },
          { id: 'card-3', blockId: 'block-3', fsrsCardId: 'card-3' },
        ],
      }),
      getDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id))),
    };

    const dataSource = new DeckDataSource(
      manager,
      {
        preset: 'all',
        currentDocId: 'doc-a',
        scopeDocIds: ['doc-a', 'doc-a-child'],
        queryText: 'alpha',
        cardType: 'item-only',
      },
      undefined,
      { browserService },
    );

    const result = await dataSource.fetchRows({
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      filterModel: {},
      startRow: 1,
      endRow: 3,
    });

    expect(result.totalCount).toBe(3);
    expect(result.rows.map((row) => row.fsrsCardId)).toEqual(['card-2', 'card-3']);
    expect(browserService.getDeckQuerySnapshot).toHaveBeenCalledWith({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: ['doc-a', 'doc-a-child'],
      searchText: 'alpha',
      cardTypes: ['item'],
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    });
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledTimes(1);
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledWith(['card-2', 'card-3']);
    expect(manager.getCards).not.toHaveBeenCalled();
  });

  it('getAllMatchedIds reuses the lite-row session without hydrating rows', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckQuerySnapshot: vi.fn().mockResolvedValue({
        total: 2,
        rows: [
          { id: 'card-a', blockId: 'block-a', fsrsCardId: 'card-a' },
          { id: 'card-b', blockId: 'block-b', fsrsCardId: 'card-b' },
        ],
      }),
      getDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id))),
    };

    const dataSource = new DeckDataSource(
      manager,
      { preset: 'review', currentDocId: undefined, queryText: '', cardType: 'all' },
      undefined,
      { browserService },
    );

    const ids = await dataSource.getAllMatchedIds();
    expect(ids).toEqual(['card-a', 'card-b']);
    expect(browserService.getDeckQuerySnapshot).toHaveBeenCalledTimes(1);
    expect(browserService.getDeckRowsByIds).not.toHaveBeenCalled();

    const hydrated = await dataSource.getRowsByIds(['card-b', 'card-a']);
    expect(hydrated.map((row) => row.fsrsCardId)).toEqual(['card-b', 'card-a']);
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledTimes(1);
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledWith(['card-b', 'card-a']);
  });
});
