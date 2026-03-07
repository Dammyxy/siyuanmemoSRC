import type { Ref } from 'vue';
import type { GridApi } from 'ag-grid-community';
import type { BrowserCard } from '../types';
import { createLogger } from '@/utils/logger';

interface UseIncrementalGridUpdatesOptions {
  gridApi: Ref<GridApi | null>;
  rows: Ref<BrowserCard[]>;
  rowsForFocus: Ref<BrowserCard[]>;
  allRows: Ref<BrowserCard[]>;
  refreshQueueCounts: () => Promise<void>;
  loadVisibleRows: (rows: BrowserCard[]) => Promise<BrowserCard[]>;
  onRowsDeleted?: (deletedRowIds: string[]) => void;
}

const logger = createLogger('useIncrementalGridUpdates');

function resolveBrowserCardRowId(row: BrowserCard | null | undefined): string {
  if (!row) return '';
  return String(row.fsrsCardId || row.id || row.blockId || '').trim();
}

function isRowMatchedByEventIds(row: BrowserCard, eventIdSet: Set<string>): boolean {
  if (row.blockId && eventIdSet.has(row.blockId)) return true;
  if (row.fsrsCardId && eventIdSet.has(row.fsrsCardId)) return true;
  if (row.id && eventIdSet.has(row.id)) return true;
  return false;
}

export function useIncrementalGridUpdates(options: UseIncrementalGridUpdatesOptions) {
  let rafId: number | null = null;
  const pendingUpdateMap = new Map<string, BrowserCard>();
  const pendingDeletedRowIds = new Set<string>();

  const refreshQueueCountsSafely = async () => {
    try {
      await options.refreshQueueCounts();
    } catch (error) {
      logger.error('Failed to refresh queue counts:', error);
    }
  };

  const flushPendingToGrid = () => {
    const api = options.gridApi.value;
    if (!api || (typeof api.isDestroyed === 'function' && api.isDestroyed())) {
      pendingUpdateMap.clear();
      pendingDeletedRowIds.clear();
      return;
    }

    if (pendingUpdateMap.size > 0) {
      let patched = 0;
      api.forEachNode((node) => {
        const current = node.data as BrowserCard | undefined;
        const rowId = resolveBrowserCardRowId(current);
        if (!rowId) return;
        const updated = pendingUpdateMap.get(rowId);
        if (!updated) return;
        node.setData(updated);
        patched++;
      });
      pendingUpdateMap.clear();
      logger.debug('Incremental grid patch flushed', { patched });
    }

    if (pendingDeletedRowIds.size > 0) {
      const deleted = Array.from(pendingDeletedRowIds);
      pendingDeletedRowIds.clear();
      options.onRowsDeleted?.(deleted);
      logger.debug('Incremental delete flushed', { deletedCount: deleted.length });
    }
  };

  const scheduleGridUpdate = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      flushPendingToGrid();
    });
  };

  const collectVisibleRowsFromGrid = (): BrowserCard[] => {
    const api = options.gridApi.value;
    if (!api || (typeof api.isDestroyed === 'function' && api.isDestroyed())) {
      return [...options.rows.value];
    }

    const visibleRows: BrowserCard[] = [];
    api.forEachNode((node) => {
      const row = node.data as BrowserCard | undefined;
      if (row) {
        visibleRows.push(row);
      }
    });
    return visibleRows;
  };

  const patchRowsInPlace = (
    targetRows: BrowserCard[],
    updatedMap: Map<string, BrowserCard>,
    maxScan: number = Number.POSITIVE_INFINITY
  ): void => {
    const scanLimit = Number.isFinite(maxScan) ? Math.max(0, Math.floor(maxScan)) : targetRows.length;
    const end = Math.min(targetRows.length, scanLimit);
    for (let i = 0; i < end; i++) {
      const row = targetRows[i];
      const updated = updatedMap.get(resolveBrowserCardRowId(row));
      if (updated) {
        targetRows[i] = updated;
      }
    }
  };

  const removeRowsByIds = (
    targetRows: BrowserCard[],
    deletedRowIds: Set<string>,
  ): BrowserCard[] => {
    if (deletedRowIds.size === 0) {
      return targetRows;
    }

    return targetRows.filter((row) => !deletedRowIds.has(resolveBrowserCardRowId(row)));
  };

  const handleCardUpdatedIncremental = async (cardIds: string[]) => {
    if (cardIds.length === 0) {
      await refreshQueueCountsSafely();
      return;
    }

    try {
      const eventIdSet = new Set(cardIds);
      const visibleRows = collectVisibleRowsFromGrid();
      const impactedRows = visibleRows.filter((row) => isRowMatchedByEventIds(row, eventIdSet));

      if (impactedRows.length === 0) {
        await refreshQueueCountsSafely();
        logger.debug('No visible rows matched update event IDs');
        return;
      }

      const updatedCards = await options.loadVisibleRows(impactedRows);
      const updatedMap = new Map(
        updatedCards
          .map((card) => [resolveBrowserCardRowId(card), card] as const)
          .filter(([rowId]) => Boolean(rowId))
      );
      const deletedRowIds = new Set(
        impactedRows
          .map((row) => resolveBrowserCardRowId(row))
          .filter((rowId) => rowId && !updatedMap.has(rowId))
      );

      if (updatedMap.size === 0 && deletedRowIds.size === 0) {
        await refreshQueueCountsSafely();
        logger.warn('Incremental update returned no visible card payload', {
          cardIds,
        });
        return;
      }

      options.rows.value = removeRowsByIds(
        options.rows.value.map((row) => updatedMap.get(resolveBrowserCardRowId(row)) || row),
        deletedRowIds,
      );
      options.rowsForFocus.value = removeRowsByIds(options.rowsForFocus.value, deletedRowIds);
      patchRowsInPlace(options.rowsForFocus.value, updatedMap);
      options.allRows.value = removeRowsByIds(options.allRows.value, deletedRowIds);
      patchRowsInPlace(options.allRows.value, updatedMap, 2000);

      for (const card of updatedCards) {
        pendingUpdateMap.set(resolveBrowserCardRowId(card), card);
      }
      for (const rowId of deletedRowIds) {
        pendingUpdateMap.delete(rowId);
        pendingDeletedRowIds.add(rowId);
      }
      scheduleGridUpdate();

      await refreshQueueCountsSafely();
      logger.info('Incremental update completed', {
        requested: cardIds.length,
        updated: updatedCards.length,
        removed: deletedRowIds.size,
      });
    } catch (error) {
      logger.error('Incremental update failed:', error);
      await refreshQueueCountsSafely();
    }
  };

  const handleCardDeletedIncremental = async (cardIds: string[]) => {
    if (cardIds.length === 0) {
      await refreshQueueCountsSafely();
      return;
    }

    try {
      const eventIdSet = new Set(cardIds);
      const visibleRows = collectVisibleRowsFromGrid();
      const rowsToRemove = visibleRows.filter((row) => isRowMatchedByEventIds(row, eventIdSet));

      if (rowsToRemove.length === 0) {
        await refreshQueueCountsSafely();
        logger.debug('No visible rows matched delete event IDs');
        return;
      }

      const removedRowIds = new Set(
        rowsToRemove
          .map((row) => resolveBrowserCardRowId(row))
          .filter(Boolean)
      );
      const shouldRemoveRow = (row: BrowserCard): boolean => (
        isRowMatchedByEventIds(row, eventIdSet) || removedRowIds.has(resolveBrowserCardRowId(row))
      );

      options.rows.value = options.rows.value.filter((row) => !shouldRemoveRow(row));
      options.rowsForFocus.value = options.rowsForFocus.value.filter((row) => !shouldRemoveRow(row));
      if (options.allRows.value.length <= 2000) {
        options.allRows.value = options.allRows.value.filter((row) => !shouldRemoveRow(row));
      }

      for (const row of rowsToRemove) {
        pendingUpdateMap.delete(resolveBrowserCardRowId(row));
      }
      for (const rowId of removedRowIds) {
        pendingDeletedRowIds.add(rowId);
      }
      scheduleGridUpdate();

      await refreshQueueCountsSafely();
      logger.info('Incremental delete completed', {
        requested: cardIds.length,
        removed: rowsToRemove.length,
      });
    } catch (error) {
      logger.error('Incremental delete failed:', error);
      await refreshQueueCountsSafely();
    }
  };

  const disposeIncrementalGridUpdates = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pendingUpdateMap.clear();
    pendingDeletedRowIds.clear();
  };

  return {
    handleCardUpdatedIncremental,
    handleCardDeletedIncremental,
    disposeIncrementalGridUpdates,
  };
}
