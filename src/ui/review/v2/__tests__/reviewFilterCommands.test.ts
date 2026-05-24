import { describe, expect, it, vi } from 'vitest';
import { createReviewFilterRuntime } from '../reviewFilterCommands';
import type { CardFilter } from '@/types/unified-data-source';

const t = (_key: string, fallback: string) => fallback;

describe('reviewFilterCommands', () => {
  it('syncs the active filter and opens the dialog', () => {
    const filter: CardFilter = { scopeDocIds: ['doc-1'] };
    const runtime = createReviewFilterRuntime({
      t,
      showMessage: vi.fn(),
      logger: {},
      getFilterGroupQueue: () => ({
        getFilter: () => filter,
      }),
      getFilterCommandClient: () => null,
      reload: vi.fn(),
    });

    runtime.openDialog();

    expect(runtime.dialogOpen.value).toBe(true);
    expect(runtime.appliedFilter.value).toEqual(filter);
    expect(runtime.appliedFilter.value).not.toBe(filter);
  });

  it('applies filter, rebuilds queue, closes dialog, and reloads review', async () => {
    const setFilterGroupFilter = vi.fn(async () => true);
    const rebuildFilterGroupQueue = vi.fn(async () => true);
    const reload = vi.fn();
    const runtime = createReviewFilterRuntime({
      t,
      showMessage: vi.fn(),
      logger: {},
      getFilterGroupQueue: () => null,
      getFilterCommandClient: () => ({ setFilterGroupFilter, rebuildFilterGroupQueue }),
      reload,
    });

    runtime.dialogOpen.value = true;
    await runtime.handleApply({ cardType: 'item' });

    expect(setFilterGroupFilter).toHaveBeenCalledWith({ cardType: 'item' });
    expect(rebuildFilterGroupQueue).toHaveBeenCalledTimes(1);
    expect(runtime.dialogOpen.value).toBe(false);
    expect(runtime.appliedFilter.value).toEqual({ cardType: 'item' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable filter queues without reloading', async () => {
    const showMessage = vi.fn();
    const reload = vi.fn();
    const runtime = createReviewFilterRuntime({
      t,
      showMessage,
      logger: {},
      getFilterGroupQueue: () => null,
      getFilterCommandClient: () => null,
      reload,
    });

    await runtime.handleClear();

    expect(showMessage).toHaveBeenCalledWith('筛选复习队列不可用', 3000, 'error');
    expect(reload).not.toHaveBeenCalled();
  });
});
