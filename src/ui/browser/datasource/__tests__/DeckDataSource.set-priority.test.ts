import { beforeEach, describe, expect, it, vi } from 'vitest';

const setBrowserCardsPriorityMock = vi.fn();
const invalidateCardCacheMock = vi.fn();
const batchSuspendMock = vi.fn();
const deleteBrowserCardsMock = vi.fn();

vi.mock('../DataSourceUtils', () => ({
  applyCardTypeFilter: (rows: unknown[]) => rows,
  applyDocFilter: (rows: unknown[]) => rows,
  applyLegacyPresetFilter: (rows: unknown[]) => rows,
  applySimpleQueryFilter: (rows: unknown[]) => rows,
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
});
