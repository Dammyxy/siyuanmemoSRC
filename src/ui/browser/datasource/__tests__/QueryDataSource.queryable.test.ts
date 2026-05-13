import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';
import type { FSRSCard } from '@/types/card';

const runBrowserSqlMock = vi.fn();
const loadBrowserCardProjectionsByBlockIdsMock = vi.fn();
const loadBrowserCardsByBlockIdsMock = vi.fn();
const batchResetMock = vi.fn();
const batchSuspendMock = vi.fn();
const invalidateCardCacheMock = vi.fn();
const setBrowserCardsPriorityMock = vi.fn();
const deleteBrowserCardsMock = vi.fn();
const sortBrowserRowsMock = vi.fn(<T>(rows: T[]) => rows);
const testSiyuanApi = {} as never;

vi.mock('../../browserService', () => ({
  batchReset: (...args: unknown[]) => batchResetMock(...args),
  batchSuspend: (...args: unknown[]) => batchSuspendMock(...args),
  invalidateCardCache: (...args: unknown[]) => invalidateCardCacheMock(...args),
  runBrowserSql: (...args: unknown[]) => runBrowserSqlMock(...args),
  loadBrowserCardProjectionsByBlockIds: (...args: unknown[]) => loadBrowserCardProjectionsByBlockIdsMock(...args),
  loadBrowserCardsByBlockIds: (...args: unknown[]) => loadBrowserCardsByBlockIdsMock(...args),
}));

vi.mock('../DataSourceUtils', () => ({
  deleteBrowserCards: (...args: unknown[]) => deleteBrowserCardsMock(...args),
  setBrowserCardsPriority: (...args: unknown[]) => setBrowserCardsPriorityMock(...args),
  sortBrowserRows: (...args: unknown[]) => sortBrowserRowsMock(...args),
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

function makeFsrsCard(id: string, blockId: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: overrides.xiuyuanID ?? `xy-${id}`,
    blockId,
    due: overrides.due ?? Date.now(),
    stability: overrides.stability ?? 0,
    difficulty: overrides.difficulty ?? 0,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? 0,
    lastReview: overrides.lastReview ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: (overrides.type ?? 'item') as FSRSCard['type'],
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    ...overrides,
    meta: {
      content: id,
      rootId: 'doc-a',
      deckId: 'deck-a',
      ...(overrides.meta || {}),
    },
  };
}

function createManager(cards: FSRSCard[]) {
  return {
    getCard: vi.fn(),
    getCards: vi.fn(async (filter?: { blockIds?: string[] }) => {
      const blockIds = new Set((filter?.blockIds || []).map(String));
      return cards.filter((card) => blockIds.size === 0 || blockIds.has(card.blockId));
    }),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    getQueue: vi.fn(),
  };
}

describe('QueryDataSource queryable path', () => {
  beforeEach(() => {
    runBrowserSqlMock.mockReset();
    loadBrowserCardProjectionsByBlockIdsMock.mockReset();
    loadBrowserCardsByBlockIdsMock.mockReset();
    batchResetMock.mockReset();
    batchSuspendMock.mockReset();
    invalidateCardCacheMock.mockReset();
    setBrowserCardsPriorityMock.mockReset();
    deleteBrowserCardsMock.mockReset();
    sortBrowserRowsMock.mockClear();
    sortBrowserRowsMock.mockImplementation(<T>(rows: T[]) => rows);
  });

  it('fetchRows keeps only real cards from SQL block hits and hydrates the requested page', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
      { id: 'block-b', content: 'Beta', root_id: 'doc-b' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a'),
    ]);
    const manager = createManager([makeFsrsCard('card-a', 'block-a')]);

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never, siyuanApi: testSiyuanApi });
    const result = await dataSource.fetchRows({
      startRow: 0,
      endRow: 1,
      sortModel: [{ colId: 'priority', sort: 'asc' }],
      filterModel: {},
    });

    expect(result.totalCount).toBe(1);
    expect(result.rows.map((row) => row.blockId)).toEqual(['block-a']);
    expect(result.rows.map((row) => row.fsrsCardId)).toEqual(['card-a']);
    expect(runBrowserSqlMock).toHaveBeenCalledWith('select * from blocks', testSiyuanApi);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a', 'block-b'] });
    expect(loadBrowserCardProjectionsByBlockIdsMock).toHaveBeenCalledWith(
      ['block-a'],
      { applyQueryFilter: false, manager, siyuanApi: testSiyuanApi },
    );
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a'] });
    expect(loadBrowserCardsByBlockIdsMock).not.toHaveBeenCalled();
    expect(sortBrowserRowsMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ fsrsCardId: 'card-a' })]),
      [{ colId: 'priority', sort: 'asc' }],
    );
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
    const manager = createManager([
      makeFsrsCard('card-a', 'block-a', { priority: 11 }),
      makeFsrsCard('card-b', 'block-b', { priority: 22 }),
    ]);

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never, siyuanApi: testSiyuanApi });
    const ids = await dataSource.getAllMatchedIds();
    const targets = await dataSource.getActionTargetsByIds(['card-b', 'card-a']);

    expect(ids).toEqual(['card-a', 'card-b']);
    expect(targets).toEqual([
      { id: 'card-b', blockId: 'block-b', fsrsCardId: 'card-b', cardType: 'item', priority: 22 },
      { id: 'card-a', blockId: 'block-a', fsrsCardId: 'card-a', cardType: 'item', priority: 11 },
    ]);
    expect(loadBrowserCardsByBlockIdsMock).not.toHaveBeenCalled();
  });

  it('does not expose action targets for SQL hits without real FSRS cards', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
      { id: 'block-b', content: 'Beta', root_id: 'doc-b' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a', { priority: 11 }),
    ]);
    const manager = createManager([
      makeFsrsCard('card-a', 'block-a', { priority: 11 }),
    ]);

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never, siyuanApi: testSiyuanApi });
    const ids = await dataSource.getAllMatchedIds();
    const targets = await dataSource.getActionTargetsByIds(['block-b', 'card-a']);

    expect(ids).toEqual(['card-a']);
    expect(targets).toEqual([
      { id: 'card-a', blockId: 'block-a', fsrsCardId: 'card-a', cardType: 'item', priority: 11 },
    ]);
    expect(loadBrowserCardsByBlockIdsMock).not.toHaveBeenCalled();
  });

  it('returns every real card under a matched block and deduplicates repeated SQL hits', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
      { id: 'block-b', content: 'Beta', root_id: 'doc-b' },
      { id: 'block-a', content: 'Alpha again', root_id: 'doc-a' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a1', 'block-a'),
      makeProjection('card-b', 'block-b'),
    ]);
    const manager = createManager([
      makeFsrsCard('card-a1', 'block-a', { priority: 11 }),
      makeFsrsCard('card-a2', 'block-a', { priority: 12 }),
      makeFsrsCard('card-b', 'block-b', { priority: 22 }),
    ]);

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never, siyuanApi: testSiyuanApi });
    const ids = await dataSource.getAllMatchedIds();

    expect(ids).toEqual(['card-a1', 'card-a2', 'card-b']);
    expect(loadBrowserCardProjectionsByBlockIdsMock).toHaveBeenCalledWith(
      ['block-a', 'block-b'],
      { applyQueryFilter: false, manager, siyuanApi: testSiyuanApi },
    );
  });

  it('builds template-backed rows with card schedule state and template source content', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a', {
        deckId: 'deck-template',
        rootId: 'doc-template',
        content: 'Template source',
        fullContent: '<p>Template source</p>',
        priority: 77,
        suspended: true,
        tags: ['template-tag'],
        aFactor: 2.8,
      }),
    ]);
    const due = 1_700_432_000_000;
    const manager = createManager([
      makeFsrsCard('card-a', 'block-a', {
        due,
        stability: 9,
        difficulty: 3,
        reps: 6,
        lapses: 2,
        scheduledDays: 11,
        priority: 0,
        tags: ['card-tag'],
        aFactor: 2.4,
        meta: {
          content: '',
          deckId: '',
          rootId: '',
        },
      }),
    ]);

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never, siyuanApi: testSiyuanApi });
    const result = await dataSource.fetchRows({
      startRow: 0,
      endRow: 1,
      sortModel: [],
      filterModel: {},
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'card-a',
      fsrsCardId: 'card-a',
      blockId: 'block-a',
      deckId: 'deck-template',
      rootId: 'doc-template',
      content: 'Template source',
      fullContent: '<p>Template source</p>',
      due: new Date(due),
      stability: 9,
      difficulty: 3,
      reps: 6,
      lapses: 2,
      scheduledDays: 11,
      priority: 0,
      suspended: true,
      tags: ['card-tag'],
      aFactor: 2.4,
    });
  });

  it('filters out cards that disappear or mismatch before hydration', async () => {
    runBrowserSqlMock.mockResolvedValue([
      { id: 'block-a', content: 'Alpha', root_id: 'doc-a' },
    ]);
    loadBrowserCardProjectionsByBlockIdsMock.mockResolvedValue([
      makeProjection('card-a', 'block-a'),
    ]);
    const manager = createManager([]);
    manager.getCards
      .mockResolvedValueOnce([makeFsrsCard('card-a', 'block-a')])
      .mockResolvedValueOnce([makeFsrsCard('card-other', 'block-a')]);

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never, siyuanApi: testSiyuanApi });
    const ids = await dataSource.getAllMatchedIds();
    const rows = await dataSource.getRowsByIds(ids);

    expect(ids).toEqual(['card-a']);
    expect(rows).toEqual([]);
    expect(loadBrowserCardsByBlockIdsMock).not.toHaveBeenCalled();
  });

  it('exposes the same card actions as normal SQL-backed card rows when a manager is available', () => {
    const dataSource = new QueryDataSource('select * from blocks', {
      manager: {
        getCard: vi.fn(),
        getCards: vi.fn(),
        updateCard: vi.fn(),
        deleteCard: vi.fn(),
        getQueue: vi.fn(),
      } as never,
      plugin: {
        i18n: {
          setPriority: '设置优先级',
          addToQueueMenu: '加入队列',
        },
      },
    });

    const actions = dataSource.getSupportedActions();
    const ids = actions.map((action) => action.id);
    const addToQueue = actions.find((action) => action.id === 'add-to-queue');

    expect(ids).toEqual([
      'open',
      'delete-card',
      'add-to-queue',
      'set-priority',
      'postpone',
      'advance',
      'spread',
      'reset',
      'suspend',
      'unsuspend',
    ]);
    expect(addToQueue?.label).toBe('加入队列');
    expect(addToQueue?.submenu?.map((action) => action.id)).toEqual([
      'add-to-retrieval-queue',
      'add-to-retrieval-queue-all',
      'add-to-incremental-queue',
      'add-to-incremental-queue-all',
      'add-to-final-drill-queue',
      'add-to-filter-group-queue',
      'add-to-neural-roam-queue',
    ]);
  });

  it('delegates SQL result priority changes to the unified card manager', async () => {
    const manager = {
      getCard: vi.fn(),
      getCards: vi.fn(),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      getQueue: vi.fn(),
    };
    const target = {
      id: 'card-a',
      blockId: 'block-a',
      fsrsCardId: 'card-a',
      priority: 50,
    };
    setBrowserCardsPriorityMock.mockResolvedValue({ updated: [target], skipped: [] });

    const dataSource = new QueryDataSource('select * from blocks', { manager: manager as never });
    const before = dataSource.getQueryFingerprint();
    const result = await dataSource.performAction('set-priority', [target], { priority: 12 });

    expect(result).toEqual({ updated: [target], skipped: [] });
    expect(setBrowserCardsPriorityMock).toHaveBeenCalledWith(
      manager,
      [target],
      12,
      { scope: 'QueryDataSource' },
    );
    expect(invalidateCardCacheMock).toHaveBeenCalledTimes(1);
    expect(dataSource.getQueryFingerprint()).not.toBe(before);
  });
});
