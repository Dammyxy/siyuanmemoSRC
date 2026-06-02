import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { DeckDataSource } from '../DeckDataSource';
import type { BrowserCard } from '../../types';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { BrowserReadModelStateError } from '../../utils/browserReadModelStateError';

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

function expectLegacyGetCardsUnused(manager: unknown): void {
  expect((manager as { getCards: ReturnType<typeof vi.fn> }).getCards).not.toHaveBeenCalled();
}

describe('DeckDataSource query snapshot path', () => {
  it('routes normal deck page reads through BrowserReadModel.page metadata contract', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when read model is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const page = vi.fn(async () => ({
      status: 'ready' as const,
      total: 1,
      rows: [makeBrowserCard('card-read-model-page')],
      queryFingerprint: 'deck-fingerprint:read-model',
      generation: 42,
      readOwner: { kind: 'sql-card-universe' as const },
    }));
    const browserService = {
      getBrowserReadModel: vi.fn(() => ({
        page,
      })),
    };

    const dataSource = new DeckDataSource(
      manager,
      {
        preset: 'all',
        currentDocId: 'doc-a',
        queryText: 'alpha',
      },
      undefined,
      { browserService: browserService as never },
    );

    const result = await dataSource.fetchRows({
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      filterModel: {},
      startRow: 0,
      endRow: 20,
    });

    expect(result).toMatchObject({
      totalCount: 1,
      queryFingerprint: 'deck-fingerprint:read-model',
      generation: 42,
      readOwner: { kind: 'sql-card-universe' },
    });
    expect(result.rows.map((row) => row.fsrsCardId)).toEqual(['card-read-model-page']);
    expect(page).toHaveBeenCalledWith({
      source: 'deck',
      query: {
        preset: 'all',
        docId: 'doc-a',
        scopeDocIds: null,
        searchText: 'alpha',
        cardTypes: undefined,
        sortModel: [{ colId: 'priority', sort: 'desc' }],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });
    expectLegacyGetCardsUnused(manager);
  });

  it.each([
    ['preparing'],
    ['repair-required'],
    ['unavailable'],
  ] as const)('throws typed read-model state error when deck page is %s', async (state) => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when read model is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const page = vi.fn(async () => ({
      status: state,
      rows: [],
      total: 0,
      reason: `${state} reason`,
      queryFingerprint: `deck:${state}`,
      generation: 7,
      readOwner: { kind: 'sql-card-universe' as const },
    }));
    const dataSource = new DeckDataSource(
      manager,
      { preset: 'all' },
      undefined,
      {
        browserService: {
          getBrowserReadModel: vi.fn(() => ({ page })),
        } as never,
      },
    );

    const fetch = dataSource.fetchRows({
      sortModel: [],
      filterModel: {},
      startRow: 0,
      endRow: 20,
    });

    await expect(fetch).rejects.toBeInstanceOf(BrowserReadModelStateError);
    await expect(fetch).rejects.toMatchObject({
      browserReadModelState: state,
      reason: `${state} reason`,
    });
    expectLegacyGetCardsUnused(manager);
  });

  it('shows symbol quick-card title when persisted content is stored in meta.title', async () => {
    const now = Date.now();
    const symbolCard: FSRSCard = {
      id: 'card-symbol-title',
      xiuyuanID: 'xy-block-symbol-title',
      blockId: 'block-symbol-title',
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: {
        title: '符号卡片标题',
        source: 'symbol',
        cardSource: 'quick-symbol',
        symbolDetected: true,
      },
    };
    const manager = {
      getCards: vi.fn(async () => [symbolCard]),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;

    const dataSource = new DeckDataSource(
      manager,
      { preset: 'all' },
    );

    const result = await dataSource.fetchRows({
      sortModel: [],
      filterModel: {},
      startRow: 0,
      endRow: 20,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.content).toBe('符号卡片标题');
    expect(result.rows[0]?.fullContent).toBe('符号卡片标题');
  });

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
    expectLegacyGetCardsUnused(manager);
  });

  it('prefers bounded backend page reads for normal rows even when aggregate paths are available', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when aggregate browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckAggregatePage: vi.fn(async () => ({
        total: 3,
        rows: [makeBrowserCard('aggregate-card-2'), makeBrowserCard('aggregate-card-3')],
      })),
      getDeckAggregateSnapshot: vi.fn(async () => ({
        total: 3,
        rows: [
          { id: 'card-1', blockId: 'block-1', fsrsCardId: 'card-1' },
          { id: 'card-2', blockId: 'block-2', fsrsCardId: 'card-2' },
          { id: 'card-3', blockId: 'block-3', fsrsCardId: 'card-3' },
        ],
      })),
      getDeckPage: vi.fn(async () => ({
        total: 3,
        rows: [makeBrowserCard('card-2'), makeBrowserCard('card-3')],
      })),
      getDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id))),
      getDeckQuerySnapshot: vi.fn(),
    };

    const dataSource = new DeckDataSource(
      manager,
      { preset: 'all', currentDocId: 'doc-a', queryText: 'alpha' },
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
    expect(browserService.getDeckPage).toHaveBeenCalledTimes(1);
    expect(browserService.getDeckPage).toHaveBeenCalledWith(expect.objectContaining({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: null,
      searchText: 'alpha',
      cardTypes: undefined,
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    }), {
      startRow: 1,
      endRow: 3,
    });
    expect(browserService.getDeckAggregatePage).not.toHaveBeenCalled();
    expect(browserService.getDeckAggregateSnapshot).not.toHaveBeenCalled();

    await expect(dataSource.getAllMatchedIds('all-select')).resolves.toEqual(['card-1', 'card-2', 'card-3']);
    expect(browserService.getDeckAggregateSnapshot).toHaveBeenCalledTimes(1);
    expect(browserService.getDeckAggregateSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      fullUniverseReason: 'all-select',
    }));
    expect(browserService.getDeckQuerySnapshot).not.toHaveBeenCalled();
    expectLegacyGetCardsUnused(manager);
  });

  it('keeps bounded page and explicit aggregate ordering aligned for the same sort and filters', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const orderedIds = ['card-priority-high', 'card-priority-low', 'card-priority-tail'];
    const browserService = {
      getDeckAggregateSnapshot: vi.fn(async () => ({
        total: orderedIds.length,
        rows: orderedIds.map((id) => ({
          id,
          blockId: `block-${id}`,
          fsrsCardId: id,
        })),
      })),
      getDeckPage: vi.fn(async () => ({
        total: orderedIds.length,
        rows: orderedIds.slice(0, 2).map((id) => makeBrowserCard(id)),
      })),
      getDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id))),
    };

    const dataSource = new DeckDataSource(
      manager,
      {
        preset: 'all',
        currentDocId: 'doc-a',
        scopeDocIds: ['doc-a', 'doc-b'],
        queryText: 'alpha',
        cardType: 'concept-only',
      },
      undefined,
      { browserService },
    );

    const page = await dataSource.fetchRows({
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      filterModel: {},
      startRow: 0,
      endRow: 2,
    });
    const aggregateIds = await dataSource.getAllMatchedIds('diagnostics');
    const aggregateFirstPageRows = await dataSource.getRowsByIds(aggregateIds.slice(0, 2));

    expect(page.rows.map((row) => row.fsrsCardId)).toEqual(aggregateFirstPageRows.map((row) => row.fsrsCardId));
    expect(browserService.getDeckPage).toHaveBeenCalledWith({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: ['doc-a', 'doc-b'],
      searchText: 'alpha',
      cardTypes: ['concept'],
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    }, {
      startRow: 0,
      endRow: 2,
    });
    expect(browserService.getDeckAggregateSnapshot).toHaveBeenCalledWith({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: ['doc-a', 'doc-b'],
      searchText: 'alpha',
      cardTypes: ['concept'],
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      fullUniverseReason: 'diagnostics',
    });
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledWith(['card-priority-high', 'card-priority-low']);
    expectLegacyGetCardsUnused(manager);
  });

  it('passes forceRefresh to bounded deck page queries', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when aggregate browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckAggregatePage: vi.fn(async () => ({
        total: 1,
        rows: [makeBrowserCard('aggregate-force-refresh')],
      })),
      getDeckAggregateSnapshot: vi.fn(async () => ({
        total: 1,
        rows: [{ id: 'aggregate-force-refresh', blockId: 'block-aggregate-force-refresh', fsrsCardId: 'aggregate-force-refresh' }],
      })),
      getDeckPage: vi.fn(async () => ({
        total: 1,
        rows: [makeBrowserCard('card-force-refresh')],
      })),
    };

    const dataSource = new DeckDataSource(
      manager,
      { preset: 'all' },
      undefined,
      { browserService },
    );

    await dataSource.fetchRows({
      sortModel: [{ colId: 'reps', sort: 'asc' }],
      filterModel: {},
      startRow: 0,
      endRow: 1,
      forceRefresh: true,
    });

    expect(browserService.getDeckPage).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      sortModel: [{ colId: 'reps', sort: 'asc' }],
    }), {
      startRow: 0,
      endRow: 1,
    });
    expect(browserService.getDeckAggregatePage).not.toHaveBeenCalled();
    expect(browserService.getDeckAggregateSnapshot).not.toHaveBeenCalled();
  });

  it('fails normal row fetch closed when only aggregate snapshot service is available', async () => {
    const manager = {
      getCards: vi.fn(() => {
        throw new Error('legacy getCards should not be used when browserService is available');
      }),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    } as never;
    const browserService = {
      getDeckAggregateSnapshot: vi.fn(async () => ({
        total: 1,
        rows: [{ id: 'card-1', blockId: 'block-1', fsrsCardId: 'card-1' }],
      })),
      getDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id))),
    };

    const dataSource = new DeckDataSource(
      manager,
      { preset: 'all' },
      undefined,
      { browserService },
    );

    await expect(dataSource.fetchRows({
      sortModel: [],
      filterModel: {},
      startRow: 0,
      endRow: 20,
    })).rejects.toThrow('BACKEND_UNAVAILABLE: browser.deck.page unavailable for normal deck rows');

    expect(browserService.getDeckAggregateSnapshot).not.toHaveBeenCalled();
    expect(browserService.getDeckRowsByIds).not.toHaveBeenCalled();
    expectLegacyGetCardsUnused(manager);
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

  it('explicit all-row snapshot uses browserService snapshot and hydrates requested rows by id', async () => {
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

    await expect(dataSource.getAllMatchedIds('all-rows-snapshot')).resolves.toEqual(['card-1', 'card-2', 'card-3']);
    const result = await dataSource.getRowsByIds(['card-2', 'card-3']);

    expect(result.map((row) => row.fsrsCardId)).toEqual(['card-2', 'card-3']);
    expect(browserService.getDeckQuerySnapshot).toHaveBeenCalledWith({
      preset: 'all',
      docId: 'doc-a',
      scopeDocIds: ['doc-a', 'doc-a-child'],
      searchText: 'alpha',
      cardTypes: ['item'],
      sortModel: [],
      fullUniverseReason: 'all-rows-snapshot',
    });
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledTimes(1);
    expect(browserService.getDeckRowsByIds).toHaveBeenCalledWith(['card-2', 'card-3']);
    expectLegacyGetCardsUnused(manager);
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
