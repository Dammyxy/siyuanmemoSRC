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
  loadQueueCardsSimple: (cardIds: string[]) => Promise<BrowserCard[]>;
  onRowsDeleted?: (deletedBlockIds: string[]) => void;
}

const logger = createLogger('useIncrementalGridUpdates');

function isRowMatchedByEventIds(row: BrowserCard, eventIdSet: Set<string>): boolean {
  if (row.blockId && eventIdSet.has(row.blockId)) return true;
  if (row.fsrsCardId && eventIdSet.has(row.fsrsCardId)) return true;
  if (row.id && eventIdSet.has(row.id)) return true;
  return false;
}

function collectUniqueBlockIds(rows: BrowserCard[]): string[] {
  return Array.from(new Set(rows.map((row) => String(row.blockId || '')).filter(Boolean)));
}

export function useIncrementalGridUpdates(options: UseIncrementalGridUpdatesOptions) {
  let rafId: number | null = null;
  const pendingUpdateMap = new Map<string, BrowserCard>();
  const pendingDeletedBlockIds = new Set<string>();

  const refreshQueueCountsSafely = async () => {
    try {
      await options.refreshQueueCounts();
    } catch (error) {
      logger.error('Failed to refresh queue counts:', error);
    }
  };

  const flushPendingToGrid = () => {
    const api = options.gridApi.value;
    if (!api) {
      pendingUpdateMap.clear();
      pendingDeletedBlockIds.clear();
      return;
    }

    if (pendingUpdateMap.size > 0) {
      let patched = 0;
      api.forEachNode((node) => {
        const current = node.data as BrowserCard | undefined;
        if (!current?.blockId) return;
        const updated = pendingUpdateMap.get(current.blockId);
        if (!updated) return;
        node.setData(updated);
        patched++;
      });
      pendingUpdateMap.clear();
      logger.debug('Incremental grid patch flushed', { patched });
    }

    if (pendingDeletedBlockIds.size > 0) {
      const deleted = Array.from(pendingDeletedBlockIds);
      pendingDeletedBlockIds.clear();
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

  const handleCardUpdatedIncremental = async (cardIds: string[]) => {
    if (cardIds.length === 0) {
      await refreshQueueCountsSafely();
      return;
    }

    try {
      const eventIdSet = new Set(cardIds);
      const impactedRows = options.rows.value.filter((row) => isRowMatchedByEventIds(row, eventIdSet));

      if (impactedRows.length === 0) {
        await refreshQueueCountsSafely();
        logger.debug('No loaded rows matched update event IDs');
        return;
      }

      const blockIdsToReload = collectUniqueBlockIds(impactedRows);
      const updatedCards = await options.loadQueueCardsSimple(blockIdsToReload);
      if (updatedCards.length === 0) {
        await refreshQueueCountsSafely();
        logger.warn('Incremental update returned no card payload', {
          cardIds,
          blockIdsToReload,
        });
        return;
      }

      const updatedMap = new Map(updatedCards.map((card) => [card.blockId, card]));
      const updatedBlockIds = new Set(updatedCards.map((card) => card.blockId));

      const patchRows = (targetRows: BrowserCard[]) => {
        for (let i = 0; i < targetRows.length; i++) {
          const row = targetRows[i];
          if (!updatedBlockIds.has(row.blockId)) continue;
          const updated = updatedMap.get(row.blockId);
          if (!updated) continue;
          targetRows[i] = updated;
        }
      };

      patchRows(options.rows.value);
      patchRows(options.rowsForFocus.value);
      patchRows(options.allRows.value);

      for (const card of updatedCards) {
        pendingUpdateMap.set(card.blockId, card);
      }
      scheduleGridUpdate();

      await refreshQueueCountsSafely();
      logger.info('Incremental update completed', {
        requested: cardIds.length,
        updated: updatedCards.length,
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
      const rowsToRemove = options.rows.value.filter((row) => isRowMatchedByEventIds(row, eventIdSet));

      if (rowsToRemove.length === 0) {
        await refreshQueueCountsSafely();
        logger.debug('No loaded rows matched delete event IDs');
        return;
      }

      const removedBlockIds = new Set(rowsToRemove.map((row) => row.blockId));
      const shouldRemoveRow = (row: BrowserCard): boolean => (
        isRowMatchedByEventIds(row, eventIdSet) || removedBlockIds.has(row.blockId)
      );

      options.rows.value = options.rows.value.filter((row) => !shouldRemoveRow(row));
      options.rowsForFocus.value = options.rowsForFocus.value.filter((row) => !shouldRemoveRow(row));
      options.allRows.value = options.allRows.value.filter((row) => !shouldRemoveRow(row));

      for (const row of rowsToRemove) {
        pendingUpdateMap.delete(row.blockId);
      }
      for (const blockId of removedBlockIds) {
        pendingDeletedBlockIds.add(blockId);
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
    pendingDeletedBlockIds.clear();
  };

  return {
    handleCardUpdatedIncremental,
    handleCardDeletedIncremental,
    disposeIncrementalGridUpdates,
  };
}
