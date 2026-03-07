import { describe, expect, it, vi } from 'vitest';

const setBrowserCardsPriorityMock = vi.fn();
const invalidateCardCacheMock = vi.fn();

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
  batchSuspend: vi.fn(),
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
});
