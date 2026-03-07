import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import type { BrowserCard } from '../../types';
import { useIncrementalGridUpdates } from '../useIncrementalGridUpdates';

function buildCard(blockId: string): BrowserCard {
  return {
    id: blockId,
    fsrsCardId: blockId,
    blockId,
    deckId: 'deck-a',
    content: blockId,
    fullContent: blockId,
    rootId: 'doc-a',
    state: 0,
    stateLabel: 'New',
    due: new Date(),
    dueFormatted: '',
    stability: 0,
    difficulty: 0,
    retrievability: 0,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 0,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 50,
    suspended: false,
    tags: [],
  };
}

describe('useIncrementalGridUpdates', () => {
  it('updates visible grid rows even when rows state is empty', async () => {
    const initial = buildCard('b1');
    const updated = { ...initial, content: 'updated' };
    const setData = vi.fn();
    const gridApi = {
      forEachNode: (cb: (node: { data: BrowserCard; setData: (row: BrowserCard) => void }) => void) => {
        cb({ data: initial, setData });
      },
      isDestroyed: () => false,
    } as unknown as GridApi;

    const rows = ref<BrowserCard[]>([]);
    const rowsForFocus = ref<BrowserCard[]>([]);
    const allRows = ref<BrowserCard[]>([]);
    const loadVisibleRows = vi.fn().mockResolvedValue([updated]);

    const { handleCardUpdatedIncremental } = useIncrementalGridUpdates({
      gridApi: ref(gridApi),
      rows,
      rowsForFocus,
      allRows,
      loadVisibleRows,
    });

    const result = await handleCardUpdatedIncremental(['b1']);
    await vi.waitFor(() => {
      expect(setData).toHaveBeenCalledWith(updated);
    });

    expect(result).toEqual({
      updatedVisibleRows: 1,
      removedRowIds: [],
      requiresReorder: false,
    });
    expect(loadVisibleRows).toHaveBeenCalledWith([initial]);
  });

  it('removes rows that no longer match the current queue after an update', async () => {
    const initial = buildCard('b1');
    const gridApi = {
      forEachNode: (cb: (node: { data: BrowserCard; setData: (row: BrowserCard) => void }) => void) => {
        cb({ data: initial, setData: vi.fn() });
      },
      isDestroyed: () => false,
    } as unknown as GridApi;
    const rows = ref<BrowserCard[]>([initial]);
    const rowsForFocus = ref<BrowserCard[]>([initial]);
    const allRows = ref<BrowserCard[]>([initial]);
    const loadVisibleRows = vi.fn().mockResolvedValue([]);
    const onRowsDeleted = vi.fn();

    const { handleCardUpdatedIncremental } = useIncrementalGridUpdates({
      gridApi: ref(gridApi),
      rows,
      rowsForFocus,
      allRows,
      loadVisibleRows,
      onRowsDeleted,
    });

    const result = await handleCardUpdatedIncremental(['b1']);

    expect(rows.value).toEqual([]);
    expect(rowsForFocus.value).toEqual([]);
    expect(allRows.value).toEqual([]);
    expect(result).toEqual({
      updatedVisibleRows: 0,
      removedRowIds: ['b1'],
      requiresReorder: false,
    });
    await vi.waitFor(() => {
      expect(onRowsDeleted).toHaveBeenCalledWith(['b1']);
    });
  });

  it('disposes cleanly after delete bookkeeping has been populated', async () => {
    const initial = buildCard('b1');
    const gridApi = {
      forEachNode: (cb: (node: { data: BrowserCard; setData: (row: BrowserCard) => void }) => void) => {
        cb({ data: initial, setData: vi.fn() });
      },
      isDestroyed: () => false,
    } as unknown as GridApi;
    const rows = ref<BrowserCard[]>([initial]);
    const rowsForFocus = ref<BrowserCard[]>([initial]);
    const allRows = ref<BrowserCard[]>([initial]);
    const loadVisibleRows = vi.fn().mockResolvedValue([]);

    const { handleCardDeletedIncremental, disposeIncrementalGridUpdates } = useIncrementalGridUpdates({
      gridApi: ref(gridApi),
      rows,
      rowsForFocus,
      allRows,
      loadVisibleRows,
    });

    await handleCardDeletedIncremental(['b1']);

    expect(() => disposeIncrementalGridUpdates()).not.toThrow();
  });
});
