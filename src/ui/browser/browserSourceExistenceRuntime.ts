import type { BrowserSourceExistenceUpdate } from '@/application/interfaces/IBrowserApplicationService';
import { applyKnownSourceExistenceToRows } from '@/application/queries/browser/shared/MissingBlockMarker';
import type { BrowserCard } from '@/types/browser';
import { shouldReloadQueueAfterSourceExistenceUpdate } from './sourceExistenceUpdatePolicy';

export type BrowserSourceExistenceStatusEntry = readonly [string, boolean | null];

export type BrowserSourceExistenceRuntimeDeps = {
  getActiveQueueId: () => string | null | undefined;
  getRows: () => BrowserCard[];
  setRows: (rows: BrowserCard[]) => void;
  getRowsForFocus: () => BrowserCard[];
  setRowsForFocus: (rows: BrowserCard[]) => void;
  getAllRows: () => BrowserCard[];
  setAllRows: (rows: BrowserCard[]) => void;
  getLoadedRowByBlockId: (blockId: string) => BrowserCard | null | undefined;
  setLoadedRowByBlockId: (blockId: string, row: BrowserCard) => void;
  patchGridRows: (updatedRows: BrowserCard[]) => number;
  allRowsScanLimit?: number;
};

export type BrowserSourceExistenceApplyResult =
  | { status: 'ignored'; reason: 'empty-statuses' }
  | {
      status: 'applied';
      patchedGridRows: number;
      shouldReloadActiveQueue: boolean;
      statusCount: number;
      updatedRows: number;
    };

export function normalizeBrowserSourceExistenceStatusEntries(
  update: Pick<BrowserSourceExistenceUpdate, 'statuses'>,
): BrowserSourceExistenceStatusEntry[] {
  return update.statuses
    .map((status) => [String(status.blockId || '').trim(), status.exists] as const)
    .filter(([blockId]) => Boolean(blockId));
}

export function patchBrowserSourceExistenceRows(
  targetRows: BrowserCard[],
  statusEntries: BrowserSourceExistenceStatusEntry[],
  maxScan: number = Number.POSITIVE_INFINITY,
): { rows: BrowserCard[]; updatedRows: BrowserCard[] } {
  if (targetRows.length === 0 || statusEntries.length === 0) {
    return { rows: targetRows, updatedRows: [] };
  }

  const scanLimit = Number.isFinite(maxScan) ? Math.max(0, Math.floor(maxScan)) : targetRows.length;
  const end = Math.min(targetRows.length, scanLimit);
  if (end === 0) {
    return { rows: targetRows, updatedRows: [] };
  }

  const scanRows = targetRows.slice(0, end);
  const patchedRows = applyKnownSourceExistenceToRows(scanRows, statusEntries);
  if (patchedRows === scanRows) {
    return { rows: targetRows, updatedRows: [] };
  }

  let nextRows = targetRows;
  const updatedRows: BrowserCard[] = [];
  for (let index = 0; index < patchedRows.length; index++) {
    const patched = patchedRows[index];
    if (patched === scanRows[index]) {
      continue;
    }
    if (nextRows === targetRows) {
      nextRows = [...targetRows];
    }
    nextRows[index] = patched;
    updatedRows.push(patched);
  }

  return { rows: nextRows, updatedRows };
}

export function createBrowserSourceExistenceRuntime(deps: BrowserSourceExistenceRuntimeDeps) {
  const allRowsScanLimit = deps.allRowsScanLimit ?? 2000;

  function patchRowSet(
    getRows: () => BrowserCard[],
    setRows: (rows: BrowserCard[]) => void,
    statusEntries: BrowserSourceExistenceStatusEntry[],
    updatedRows: BrowserCard[],
    maxScan?: number,
  ): void {
    const currentRows = getRows();
    const patch = patchBrowserSourceExistenceRows(currentRows, statusEntries, maxScan);
    if (patch.rows !== currentRows) {
      setRows(patch.rows);
      updatedRows.push(...patch.updatedRows);
    }
  }

  function patchLoadedRows(
    statusEntries: BrowserSourceExistenceStatusEntry[],
    updatedRows: BrowserCard[],
  ): void {
    for (const [blockId] of statusEntries) {
      const current = deps.getLoadedRowByBlockId(blockId);
      if (!current) {
        continue;
      }
      const [patched] = applyKnownSourceExistenceToRows([current], statusEntries);
      if (patched !== current) {
        deps.setLoadedRowByBlockId(blockId, patched);
        updatedRows.push(patched);
      }
    }
  }

  function applyUpdate(update: BrowserSourceExistenceUpdate): BrowserSourceExistenceApplyResult {
    const statusEntries = normalizeBrowserSourceExistenceStatusEntries(update);
    if (statusEntries.length === 0) {
      return { status: 'ignored', reason: 'empty-statuses' };
    }

    const updatedRows: BrowserCard[] = [];
    patchRowSet(deps.getRows, deps.setRows, statusEntries, updatedRows);
    patchRowSet(deps.getRowsForFocus, deps.setRowsForFocus, statusEntries, updatedRows);
    patchRowSet(deps.getAllRows, deps.setAllRows, statusEntries, updatedRows, allRowsScanLimit);
    patchLoadedRows(statusEntries, updatedRows);

    return {
      status: 'applied',
      patchedGridRows: deps.patchGridRows(updatedRows),
      shouldReloadActiveQueue: shouldReloadQueueAfterSourceExistenceUpdate({
        activeQueueId: deps.getActiveQueueId(),
        statuses: update.statuses,
      }),
      statusCount: statusEntries.length,
      updatedRows: updatedRows.length,
    };
  }

  return {
    applyUpdate,
  };
}
