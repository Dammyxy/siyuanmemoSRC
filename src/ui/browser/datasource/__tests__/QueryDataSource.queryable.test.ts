import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../types';

const batchResetMock = vi.fn();
const batchSuspendMock = vi.fn();
const invalidateCardCacheMock = vi.fn();
const setBrowserCardsPriorityMock = vi.fn();
const deleteBrowserCardsMock = vi.fn();

vi.mock('../../browserService', () => ({
  batchReset: (...args: unknown[]) => batchResetMock(...args),
  batchSuspend: (...args: unknown[]) => batchSuspendMock(...args),
  invalidateCardCache: (...args: unknown[]) => invalidateCardCacheMock(...args),
}));

vi.mock('../DataSourceUtils', () => ({
  deleteBrowserCards: (...args: unknown[]) => deleteBrowserCardsMock(...args),
  setBrowserCardsPriority: (...args: unknown[]) => setBrowserCardsPriorityMock(...args),
}));

import { QueryDataSource } from '../QueryDataSource';
import { BrowserReadModelStateError } from '../../utils/browserReadModelStateError';

function makeBrowserCard(id: string, blockId = `block-${id}`, overrides: Partial<BrowserCard> = {}): BrowserCard {
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
    note: overrides.note,
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

function createManager() {
  return {
    getCard: vi.fn(),
    getCards: vi.fn(),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    getQueue: vi.fn(),
  };
}

function createBrowserService() {
  const readModel = {
    page: vi.fn(async () => ({
      status: 'ready' as const,
      rows: [makeBrowserCard('card-a', 'block-a')],
      total: 2,
      queryFingerprint: 'advanced-sql:fingerprint',
      generation: null,
      readOwner: { kind: 'block-id-intersection' as const },
    })),
    matchedIds: vi.fn(async () => ['block-a', 'card-b']),
    rowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => makeBrowserCard(id === 'block-a' ? 'card-a' : id, id === 'block-a' ? 'block-a' : `block-${id}`))),
    actionTargetsByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({
      id,
      blockId: id === 'block-a' ? 'block-a' : `block-${id}`,
      fsrsCardId: id === 'block-a' ? 'card-a' : id,
      priority: 50,
    }))),
    documentCounts: vi.fn(),
  };
  return {
    readModel,
    browserService: {
      getBrowserReadModel: vi.fn(() => readModel),
    },
  };
}

describe('QueryDataSource queryable path', () => {
  beforeEach(() => {
    batchResetMock.mockReset();
    batchSuspendMock.mockReset();
    invalidateCardCacheMock.mockReset();
    setBrowserCardsPriorityMock.mockReset();
    deleteBrowserCardsMock.mockReset();
  });

  it('fetchRows uses BrowserReadModel advanced SQL page and exposes read metadata', async () => {
    const { browserService, readModel } = createBrowserService();
    const dataSource = new QueryDataSource('select id from blocks', { browserService: browserService as never });

    const result = await dataSource.fetchRows({
      startRow: 0,
      endRow: 20,
      sortModel: [{ colId: 'priority', sort: 'asc' }],
      filterModel: {},
    });

    expect(result).toMatchObject({
      totalCount: 2,
      queryFingerprint: 'advanced-sql:fingerprint',
      generation: null,
      readOwner: { kind: 'block-id-intersection' },
    });
    expect(result.rows.map((row) => row.fsrsCardId)).toEqual(['card-a']);
    expect(readModel.page).toHaveBeenCalledWith({
      source: 'advanced-sql',
      statement: 'select id from blocks',
    }, {
      startRow: 0,
      endRow: 20,
    });
  });

  it.each([
    ['preparing'],
    ['repair-required'],
    ['unavailable'],
  ] as const)('throws typed read-model state error when advanced SQL page is %s', async (state) => {
    const readModel = {
      page: vi.fn(async () => ({
        status: state,
        rows: [],
        total: 0,
        reason: `${state} reason`,
        queryFingerprint: `advanced-sql:${state}`,
        generation: null,
        readOwner: { kind: 'block-id-intersection' as const },
      })),
    };
    const dataSource = new QueryDataSource('select id from blocks', {
      browserService: {
        getBrowserReadModel: vi.fn(() => readModel),
      } as never,
    });

    const fetch = dataSource.fetchRows({
      startRow: 0,
      endRow: 20,
      sortModel: [],
      filterModel: {},
    });

    await expect(fetch).rejects.toBeInstanceOf(BrowserReadModelStateError);
    await expect(fetch).rejects.toMatchObject({
      browserReadModelState: state,
      reason: `${state} reason`,
    });
  });

  it('resolves all-select ids and action targets at action time through BrowserReadModel', async () => {
    const { browserService, readModel } = createBrowserService();
    const dataSource = new QueryDataSource('select id from blocks', { browserService: browserService as never });

    await expect(dataSource.getAllMatchedIds('all-select')).resolves.toEqual(['block-a', 'card-b']);
    await expect(dataSource.getRowsByIds(['block-a', 'card-b'])).resolves.toEqual([
      expect.objectContaining({ fsrsCardId: 'card-a', blockId: 'block-a' }),
      expect.objectContaining({ fsrsCardId: 'card-b', blockId: 'block-card-b' }),
    ]);
    await expect(dataSource.getActionTargetsByIds(['block-a', 'card-b'], 'bulk-action')).resolves.toEqual([
      { id: 'block-a', blockId: 'block-a', fsrsCardId: 'card-a', priority: 50 },
      { id: 'card-b', blockId: 'block-card-b', fsrsCardId: 'card-b', priority: 50 },
    ]);

    expect(readModel.matchedIds).toHaveBeenCalledWith({
      source: 'advanced-sql',
      statement: 'select id from blocks',
    }, {
      reason: 'all-select',
    });
    expect(readModel.rowsByIds).toHaveBeenCalledWith(['block-a', 'card-b'], { source: 'deck' });
    expect(readModel.actionTargetsByIds).toHaveBeenCalledWith(['block-a', 'card-b'], {
      source: 'deck',
      reason: 'bulk-action',
    });
  });

  it('fails SQL reads closed without BrowserReadModel ownership', async () => {
    const dataSource = new QueryDataSource('select id from blocks');

    await expect(dataSource.fetchRows({
      startRow: 0,
      endRow: 20,
      sortModel: [],
      filterModel: {},
    })).rejects.toThrow('BACKEND_UNAVAILABLE: BrowserReadModel required for SQL mode');
    await expect(dataSource.getAllMatchedIds()).rejects.toThrow('BACKEND_UNAVAILABLE: BrowserReadModel required for SQL mode');
  });

  it('exposes the same card actions as normal SQL-backed card rows when a manager is available', () => {
    const dataSource = new QueryDataSource('select id from blocks', {
      manager: createManager() as never,
      browserService: createBrowserService().browserService as never,
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
      'priority-plus-10',
      'priority-minus-10',
      'postpone',
      'advance',
      'spread',
      'reset',
      'suspend',
      'unsuspend',
    ]);
    expect(addToQueue?.label).toBe('加入队列');
  });

  it('routes concept rows to the shared neural-roam current-route add service', async () => {
    const manager = createManager();
    const addConceptBlocksToCurrentRoute = vi.fn(async () => ({
      ok: true,
      status: 'ok',
      blockIds: ['block-a'],
      added: 1,
      skipped: 0,
      routeId: 'route-current',
      message: 'added',
    }));
    const dataSource = new QueryDataSource('select id from blocks', {
      manager: manager as never,
      browserService: createBrowserService().browserService as never,
      plugin: {
        getContext: () => ({
          getNeuralRoamEntryActionService: () => ({
            addConceptBlocksToCurrentRoute,
          }),
        }),
      } as never,
    });

    const result = await dataSource.performAction('add-to-neural-roam-queue', [
      { ...makeBrowserCard('card-a', 'block-a'), cardType: 'concept' },
    ]) as { added: number };

    expect(result.added).toBe(1);
    expect(addConceptBlocksToCurrentRoute).toHaveBeenCalledWith(['block-a'], {
      source: 'browser',
      enabled: true,
    });
    expect(manager.getQueue).not.toHaveBeenCalled();
  });

  it('fails queue add closed when the manager batch command is missing', async () => {
    const manager = createManager();
    manager.getQueue.mockImplementation(() => {
      throw new Error('live queue should not be read');
    });
    const dataSource = new QueryDataSource('select id from blocks', {
      manager: manager as never,
      browserService: createBrowserService().browserService as never,
    });

    const result = await dataSource.performAction('add-to-retrieval-queue', [
      { id: 'card-a', blockId: 'block-a', fsrsCardId: 'card-a', cardType: 'item' },
    ]) as { added: number; message: string };

    expect(manager.getQueue).not.toHaveBeenCalled();
    expect(result).toEqual({ added: 0, message: '提取练习队列不可用' });
  });

  it('delegates SQL result priority changes to the unified card manager', async () => {
    const manager = createManager();
    const target = {
      id: 'card-a',
      blockId: 'block-a',
      fsrsCardId: 'card-a',
      priority: 50,
    };
    setBrowserCardsPriorityMock.mockResolvedValue({ updated: [target], skipped: [] });

    const dataSource = new QueryDataSource('select id from blocks', {
      manager: manager as never,
      browserService: createBrowserService().browserService as never,
    });
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
