import { beforeEach, describe, expect, it, vi } from 'vitest';

const setBrowserCardsPriorityMock = vi.fn();
const adjustBrowserCardsPriorityRelativeMock = vi.fn();
const invalidateCardCacheMock = vi.fn();
const batchSuspendMock = vi.fn();
const deleteBrowserCardsMock = vi.fn();

vi.mock('../DataSourceUtils', () => ({
  applyCardTypeFilter: (rows: unknown[]) => rows,
  applyDocFilter: (rows: unknown[]) => rows,
  applyLegacyPresetFilter: (rows: unknown[]) => rows,
  applySimpleQueryFilter: (rows: unknown[]) => rows,
  adjustBrowserCardsPriorityRelative: (...args: unknown[]) => adjustBrowserCardsPriorityRelativeMock(...args),
  deleteBrowserCards: (...args: unknown[]) => deleteBrowserCardsMock(...args),
  setBrowserCardsPriority: (...args: unknown[]) => setBrowserCardsPriorityMock(...args),
  sortBrowserCards: (rows: unknown[]) => rows,
}));

vi.mock('../../browserService', () => ({
  batchReset: vi.fn(),
  batchSuspend: (...args: unknown[]) => batchSuspendMock(...args),
  invalidateCardCache: (...args: unknown[]) => invalidateCardCacheMock(...args),
}));

import { DeckDataSource } from '../DeckDataSource';

describe('DeckDataSource set-priority regression', () => {
  beforeEach(() => {
    adjustBrowserCardsPriorityRelativeMock.mockReset();
    deleteBrowserCardsMock.mockReset();
    setBrowserCardsPriorityMock.mockReset();
    invalidateCardCacheMock.mockReset();
    batchSuspendMock.mockReset();
  });

  it('delegates to unified priority updater without extra block-attr write path', async () => {
    const selectedRow = {
      id: 'row-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      priority: 50,
    };
    const manager = {} as never;
    setBrowserCardsPriorityMock.mockResolvedValue({ updated: [selectedRow], skipped: [] });

    const ds = new DeckDataSource(manager, { preset: 'all' });

    await ds.performAction('set-priority', [selectedRow] as never[], { priority: 12 });

    expect(setBrowserCardsPriorityMock).toHaveBeenCalledWith(
      manager,
      [selectedRow],
      12,
      { scope: 'DeckDataSource' },
    );
    expect(invalidateCardCacheMock).toHaveBeenCalledTimes(1);
  });

  it('exposes and routes relative priority actions without opening the absolute priority path', async () => {
    const selectedRow = {
      id: 'row-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      priority: 50,
    };
    const manager = {} as never;
    adjustBrowserCardsPriorityRelativeMock.mockResolvedValue({
      delta: 10,
      lowerBoundReached: false,
      skipped: [],
      updated: [selectedRow],
      upperBoundReached: true,
    });

    const ds = new DeckDataSource(manager, { preset: 'all' });
    const actions = ds.getSupportedActions().map((action) => action.id);
    const result = await ds.performAction('priority-plus-10', [selectedRow] as never[], { priority: 12 });

    expect(actions).toEqual(expect.arrayContaining(['set-priority', 'priority-plus-10', 'priority-minus-10']));
    expect(setBrowserCardsPriorityMock).not.toHaveBeenCalled();
    expect(adjustBrowserCardsPriorityRelativeMock).toHaveBeenCalledWith(
      manager,
      [selectedRow],
      10,
      { scope: 'DeckDataSource' },
    );
    expect(result).toEqual({
      delta: 10,
      lowerBoundReached: false,
      skipped: 0,
      updated: 1,
      upperBoundReached: true,
    });
  });

  it('routes delete-card through the unified manager and returns update summary', async () => {
    const selectedRow = {
      id: 'row-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      priority: 50,
    };
    const manager = {
      deleteCard: vi.fn(),
    } as never;
    deleteBrowserCardsMock.mockResolvedValue({
      attemptedCount: 2,
      deletedCount: 1,
      deletedCardIds: ['card-1'],
      failedCardIds: ['card-2'],
    });

    const ds = new DeckDataSource(manager, { preset: 'all' });
    const result = await ds.performAction('delete-card', [selectedRow] as never[]);

    expect(deleteBrowserCardsMock).toHaveBeenCalledWith(
      manager,
      [selectedRow],
      { scope: 'DeckDataSource' },
    );
    expect(result).toEqual({ updated: 1, skipped: 1 });
  });

  it('exposes dismiss in normal list and restore in dismissed preset', async () => {
    const manager = {} as never;

    const defaultSource = new DeckDataSource(manager, { preset: 'all' });
    expect(defaultSource.getSupportedActions().some((action) => action.id === 'suspend')).toBe(true);
    expect(defaultSource.getSupportedActions().some((action) => action.id === 'unsuspend')).toBe(false);

    const dismissedSource = new DeckDataSource(manager, { preset: 'suspended' });
    expect(dismissedSource.getSupportedActions().some((action) => action.id === 'unsuspend')).toBe(true);
    expect(dismissedSource.getSupportedActions().some((action) => action.id === 'suspend')).toBe(false);
  });

  it('routes restore through batchSuspend(false)', async () => {
    const selectedRow = {
      id: 'row-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      priority: 50,
    };
    const manager = {
      getCards: vi.fn(),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
    } as never;
    batchSuspendMock.mockResolvedValue(1);

    const ds = new DeckDataSource(manager, { preset: 'suspended' });
    await ds.performAction('unsuspend', [selectedRow] as never[]);

    expect(batchSuspendMock).toHaveBeenCalledWith(['block-1'], false, expect.any(Object));
  });

  it('routes review-subset with exact selected card ids', async () => {
    const openSubsetReviewDialog = vi.fn();
    const manager = {} as never;
    const selectedRows = [
      {
        id: 'riff-1',
        fsrsCardId: 'card-1',
        blockId: 'block-shared',
        priority: 50,
      },
      {
        id: 'riff-2',
        fsrsCardId: 'card-2',
        blockId: 'block-shared',
        priority: 50,
      },
    ];

    const ds = new DeckDataSource(manager, { preset: 'all' }, { openSubsetReviewDialog } as never);
    await ds.performAction('review-subset', selectedRows as never[]);

    expect(openSubsetReviewDialog).toHaveBeenCalledWith(['block-shared'], {
      cardIds: ['card-1', 'card-2'],
      preferredCardId: 'card-1',
    });
  });

  it('routes queue add through manager batch command without reading the live queue first', async () => {
    const selectedRow = {
      id: 'row-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      priority: 50,
      cardType: 'item',
    };
    const manager = {
      batchAddToQueue: vi.fn(async () => ({
        attemptedCount: 1,
        changedCount: 1,
        failedIds: [],
        failedItems: [],
      })),
      getQueue: vi.fn(() => {
        throw new Error('live queue should not be read');
      }),
    };

    const ds = new DeckDataSource(manager as never, { preset: 'all' });
    const result = await ds.performAction('add-to-retrieval-queue', [selectedRow] as never[]);

    expect(manager.batchAddToQueue).toHaveBeenCalledWith('retrieval-practice', ['card-1'], 'manual');
    expect(manager.getQueue).not.toHaveBeenCalled();
    expect(result).toEqual({ added: 1, message: '已加入 1 张卡片到提取练习队列' });
  });

  it('fails queue add closed when the manager batch command is missing', async () => {
    const selectedRow = {
      id: 'row-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      priority: 50,
      cardType: 'item',
    };
    const manager = {
      getQueue: vi.fn(() => {
        throw new Error('live queue should not be read');
      }),
      getCards: vi.fn(async () => []),
    };

    const ds = new DeckDataSource(manager as never, { preset: 'all' });
    const result = await ds.performAction('add-to-retrieval-queue', [selectedRow] as never[]);

    expect(manager.getQueue).not.toHaveBeenCalled();
    expect(result).toEqual({ added: 0, message: '提取练习队列不可用' });
  });
});
