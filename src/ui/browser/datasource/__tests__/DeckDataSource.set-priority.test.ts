import { describe, expect, it, vi } from 'vitest';

const setBrowserCardsPriorityMock = vi.fn();
const invalidateCardCacheMock = vi.fn();
const batchSuspendMock = vi.fn();

vi.mock('../DataSourceUtils', () => ({
  applyCardTypeFilter: (rows: unknown[]) => rows,
  applyDocFilter: (rows: unknown[]) => rows,
  applyLegacyPresetFilter: (rows: unknown[]) => rows,
  applySimpleQueryFilter: (rows: unknown[]) => rows,
  deleteBrowserCards: vi.fn(),
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
