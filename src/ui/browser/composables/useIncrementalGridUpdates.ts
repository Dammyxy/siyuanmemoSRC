import type { Ref } from 'vue';
import type { GridApi } from 'ag-grid-community';
import type { BrowserCard } from '../types';
import { createLogger } from '@/utils/logger';

interface UseIncrementalGridUpdatesOptions {
  gridApi: Ref<GridApi | null>;
  rows: Ref<BrowserCard[]>;
  rowsForFocus: Ref<BrowserCard[]>;
  allRows: Ref<BrowserCard[]>;
  loadData: (forceRefresh?: boolean) => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
  loadQueueCardsSimple: (cardIds: string[]) => Promise<BrowserCard[]>;
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

  const scheduleGridUpdate = () => {
    if (rafId !== null) return;

    rafId = requestAnimationFrame(() => {
      const api = options.gridApi.value;
      const pendingUpdates = Array.from(pendingUpdateMap.values());
      if (api && pendingUpdates.length > 0) {
        api.applyTransaction({ update: pendingUpdates });
        pendingUpdateMap.clear();
      }
      rafId = null;
    });
  };

  const handleCardUpdatedIncremental = async (cardIds: string[]) => {
    if (!options.gridApi.value || cardIds.length === 0) {
      logger.debug('Falling back to full reload (no grid or no cards)');
      await options.loadData(true);
      await options.refreshQueueCounts();
      return;
    }

    try {
      const eventIdSet = new Set(cardIds);
      const impactedRows = options.rows.value.filter((row) => isRowMatchedByEventIds(row, eventIdSet));

      if (impactedRows.length === 0) {
        await options.refreshQueueCounts();
        logger.debug('No visible rows matched update event IDs');
        return;
      }

      const blockIdsToReload = collectUniqueBlockIds(impactedRows);
      const updatedCards = await options.loadQueueCardsSimple(blockIdsToReload);
      if (updatedCards.length === 0) {
        logger.warn('Incremental update missed card payload, fallback to full reload');
        await options.loadData(true);
        await options.refreshQueueCounts();
        return;
      }

      const updatedMap = new Map(updatedCards.map((card) => [card.blockId, card]));
      const updatedBlockIds = new Set(updatedCards.map((card) => card.blockId));

      const patchRows = (targetRows: BrowserCard[]) => {
        for (const row of targetRows) {
          if (!updatedBlockIds.has(row.blockId)) continue;
          const updated = updatedMap.get(row.blockId);
          if (!updated) continue;
          Object.assign(row, updated);
        }
      };

      patchRows(options.rows.value);
      patchRows(options.rowsForFocus.value);
      patchRows(options.allRows.value);

      const rowsToUpdate = options.rows.value.filter((row) => updatedBlockIds.has(row.blockId));
      for (const row of rowsToUpdate) {
        pendingUpdateMap.set(row.blockId, row);
      }

      if (rowsToUpdate.length > 0) {
        scheduleGridUpdate();
      }

      await options.refreshQueueCounts();
      logger.info(`Incremental update completed: ${rowsToUpdate.length}/${cardIds.length} rows patched`);
    } catch (error) {
      logger.error('Incremental update failed, falling back to full reload:', error);
      await options.loadData(true);
      await options.refreshQueueCounts();
    }
  };

  const handleCardDeletedIncremental = async (cardIds: string[]) => {
    if (!options.gridApi.value || cardIds.length === 0) {
      logger.debug('Falling back to full reload (no grid or no cards)');
      await options.loadData(true);
      await options.refreshQueueCounts();
      return;
    }

    try {
      const eventIdSet = new Set(cardIds);
      const rowsToRemove = options.rows.value.filter((row) => isRowMatchedByEventIds(row, eventIdSet));

      if (rowsToRemove.length === 0) {
        await options.refreshQueueCounts();
        logger.debug('No visible rows matched delete event IDs');
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

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      rafId = requestAnimationFrame(() => {
        const api = options.gridApi.value;
        if (api) {
          const pendingUpdates = Array.from(pendingUpdateMap.values());
          if (pendingUpdates.length > 0) {
            api.applyTransaction({ update: pendingUpdates });
            pendingUpdateMap.clear();
          }
          api.applyTransaction({ remove: rowsToRemove });
        }
        rafId = null;
      });

      await options.refreshQueueCounts();
      logger.info(`Incremental delete completed: ${rowsToRemove.length}/${cardIds.length} rows removed`);
    } catch (error) {
      logger.error('Incremental delete failed, falling back to full reload:', error);
      await options.loadData(true);
      await options.refreshQueueCounts();
    }
  };

  const disposeIncrementalGridUpdates = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pendingUpdateMap.clear();
  };

  return {
    handleCardUpdatedIncremental,
    handleCardDeletedIncremental,
    disposeIncrementalGridUpdates,
  };
}
