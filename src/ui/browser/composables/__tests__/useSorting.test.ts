import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import type { BrowserCard } from '../../types';
import { useSorting } from '../useSorting';

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
    stability: 1,
    difficulty: 1,
    retrievability: 0.9,
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
    note: '',
  };
}

function createGridApiMock() {
  return {
    applyColumnState: vi.fn(),
    getColumnState: vi.fn(() => [{ colId: 'priority', sort: 'asc' }]),
    isDestroyed: vi.fn(() => false),
  } as unknown as GridApi;
}

describe('useSorting', () => {
  it('random sort fetches full dataset once and reuses it for queue reorder', async () => {
    const gridApi = ref<GridApi | null>(createGridApiMock());
    const currentSortModel = ref<SortModel[]>([{ colId: 'priority', sort: 'asc' }]);
    const activeQueueId = ref<string | null>('final-drill');
    const queueReorder = vi.fn().mockResolvedValue(true);
    const loadData = vi.fn().mockResolvedValue(undefined);
    const loadAllRowsForCurrentView = vi.fn().mockResolvedValue([
      buildCard('b1'),
      buildCard('b2'),
      buildCard('b3'),
    ]);
    const applyRandomSortRows = vi.fn();
    const pushMsg = vi.fn().mockResolvedValue(undefined);
    const pushErrMsg = vi.fn().mockResolvedValue(undefined);

    const sorting = useSorting({
      gridApi,
      currentSortModel,
      getQueueById: () => ({ reorder: queueReorder }),
      activeQueueId,
      loadData,
      loadAllRowsForCurrentView,
      applyRandomSortRows,
      t: (_key, fallback) => fallback,
      pushMsg,
      pushErrMsg,
    });

    await sorting.applyRandomSort();
    expect(loadAllRowsForCurrentView).toHaveBeenCalledTimes(1);
    expect(loadAllRowsForCurrentView).toHaveBeenCalledWith([]);
    expect(applyRandomSortRows).toHaveBeenCalledTimes(1);
    expect(applyRandomSortRows.mock.calls[0][0]).toHaveLength(3);

    await sorting.handleApplySortToQueue();
    expect(queueReorder).toHaveBeenCalledTimes(1);
    expect(queueReorder.mock.calls[0][0]).toHaveLength(3);
    // random mode should not trigger another full fetch before reorder
    expect(loadAllRowsForCurrentView).toHaveBeenCalledTimes(1);
  });

  it('apply-to-queue in non-random mode uses full sorted snapshot', async () => {
    const gridApi = ref<GridApi | null>(createGridApiMock());
    const currentSortModel = ref<SortModel[]>([{ colId: 'priority', sort: 'desc' }]);
    const activeQueueId = ref<string | null>('final-drill');
    const queueReorder = vi.fn().mockResolvedValue(true);
    const loadAllRowsForCurrentView = vi.fn().mockResolvedValue([
      buildCard('b3'),
      buildCard('b2'),
      buildCard('b1'),
    ]);

    const sorting = useSorting({
      gridApi,
      currentSortModel,
      getQueueById: () => ({ reorder: queueReorder }),
      activeQueueId,
      loadData: vi.fn().mockResolvedValue(undefined),
      loadAllRowsForCurrentView,
      applyRandomSortRows: vi.fn(),
      t: (_key, fallback) => fallback,
      pushMsg: vi.fn().mockResolvedValue(undefined),
      pushErrMsg: vi.fn().mockResolvedValue(undefined),
    });

    await sorting.handleApplySortToQueue();
    expect(loadAllRowsForCurrentView).toHaveBeenCalledWith([{ colId: 'priority', sort: 'desc' }]);
    expect(queueReorder).toHaveBeenCalledTimes(1);
    expect(queueReorder.mock.calls[0][0].map((card: BrowserCard) => card.blockId)).toEqual([
      'b3',
      'b2',
      'b1',
    ]);
  });

  it('falls back to columnState sort model when currentSortModel is empty', async () => {
    const gridApi = ref<GridApi | null>(createGridApiMock());
    const currentSortModel = ref<SortModel[]>([]);
    const activeQueueId = ref<string | null>('final-drill');
    const queueReorder = vi.fn().mockResolvedValue(true);
    const loadAllRowsForCurrentView = vi.fn().mockResolvedValue([
      buildCard('b1'),
      buildCard('b2'),
    ]);

    const sorting = useSorting({
      gridApi,
      currentSortModel,
      getQueueById: () => ({ reorder: queueReorder }),
      activeQueueId,
      loadData: vi.fn().mockResolvedValue(undefined),
      loadAllRowsForCurrentView,
      applyRandomSortRows: vi.fn(),
      t: (_key, fallback) => fallback,
      pushMsg: vi.fn().mockResolvedValue(undefined),
      pushErrMsg: vi.fn().mockResolvedValue(undefined),
    });

    await sorting.handleApplySortToQueue();
    expect(loadAllRowsForCurrentView).toHaveBeenCalledWith([{ colId: 'priority', sort: 'asc' }]);
    expect(queueReorder).toHaveBeenCalledTimes(1);
  });
});
