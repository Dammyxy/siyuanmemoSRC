import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '@/types/browser';
import { createBrowserSourceExistenceRuntime } from '../browserSourceExistenceRuntime';

function createCard(blockId: string, blockType?: string): BrowserCard {
  return {
    id: `card-${blockId}`,
    blockId,
    deckId: 'deck',
    content: blockId,
    state: 'new',
    stateLabel: 'New',
    due: new Date(0),
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
    priority: 0,
    suspended: false,
    ...(blockType ? { blockType } : {}),
  } as BrowserCard;
}

function createRuntime(input: {
  activeQueueId?: string | null;
  rows?: BrowserCard[];
  rowsForFocus?: BrowserCard[];
  allRows?: BrowserCard[];
  loadedRows?: BrowserCard[];
} = {}) {
  let rows = input.rows ?? [];
  let rowsForFocus = input.rowsForFocus ?? [];
  let allRows = input.allRows ?? [];
  const loadedRows = new Map((input.loadedRows ?? []).map((row) => [row.blockId, row]));
  const patchGridRows = vi.fn((updatedRows: BrowserCard[]) => updatedRows.length);
  const runtime = createBrowserSourceExistenceRuntime({
    getActiveQueueId: () => input.activeQueueId ?? null,
    getRows: () => rows,
    setRows: (next) => {
      rows = next;
    },
    getRowsForFocus: () => rowsForFocus,
    setRowsForFocus: (next) => {
      rowsForFocus = next;
    },
    getAllRows: () => allRows,
    setAllRows: (next) => {
      allRows = next;
    },
    getLoadedRowByBlockId: (blockId) => loadedRows.get(blockId) ?? null,
    setLoadedRowByBlockId: (blockId, row) => {
      loadedRows.set(blockId, row);
    },
    patchGridRows,
  });

  return {
    runtime,
    patchGridRows,
    get rows() {
      return rows;
    },
    get rowsForFocus() {
      return rowsForFocus;
    },
    get allRows() {
      return allRows;
    },
    getLoaded(blockId: string) {
      return loadedRows.get(blockId) ?? null;
    },
  };
}

describe('browserSourceExistenceRuntime', () => {
  it('patches visible rows, focus rows, snapshots, loaded rows, and requests active queue reload for missing sources', () => {
    const row = createCard('block-1');
    const focus = createCard('block-2');
    const all = createCard('block-3');
    const loaded = createCard('block-4');
    const subject = createRuntime({
      activeQueueId: 'retrieval',
      rows: [row],
      rowsForFocus: [focus],
      allRows: [all],
      loadedRows: [loaded],
    });

    const result = subject.runtime.applyUpdate({
      source: 'visible-page',
      statuses: [
        { blockId: 'block-1', exists: false },
        { blockId: 'block-2', exists: false },
        { blockId: 'block-3', exists: false },
        { blockId: 'block-4', exists: false },
      ],
    });

    expect(result).toMatchObject({
      status: 'applied',
      patchedGridRows: 4,
      statusCount: 4,
      updatedRows: 4,
      shouldReloadActiveQueue: true,
    });
    expect(subject.rows[0]).not.toBe(row);
    expect(subject.rows[0]?.blockType).toBe('missing');
    expect(subject.rowsForFocus[0]?.blockType).toBe('missing');
    expect(subject.allRows[0]?.blockType).toBe('missing');
    expect(subject.getLoaded('block-4')?.blockType).toBe('missing');
    expect(subject.patchGridRows).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ blockId: 'block-1', blockType: 'missing' }),
      expect.objectContaining({ blockId: 'block-4', blockType: 'missing' }),
    ]));
  });

  it('clears missing marks without forcing queue reload and ignores empty updates', () => {
    const missing = createCard('block-1', 'missing');
    const subject = createRuntime({
      activeQueueId: 'retrieval',
      rows: [missing],
    });

    const result = subject.runtime.applyUpdate({
      source: 'visible-page',
      statuses: [{ blockId: 'block-1', exists: true }],
    });

    expect(result).toMatchObject({
      status: 'applied',
      shouldReloadActiveQueue: false,
      updatedRows: 1,
    });
    expect(subject.rows[0]?.blockType).toBeUndefined();

    expect(subject.runtime.applyUpdate({
      source: 'visible-page',
      statuses: [{ blockId: '', exists: false }],
    })).toEqual({ status: 'ignored', reason: 'empty-statuses' });
  });

  it('keeps reload policy separate from queue readiness interpretation', () => {
    const subject = createRuntime({
      activeQueueId: null,
      rows: [createCard('block-1')],
    });

    const result = subject.runtime.applyUpdate({
      source: 'visible-page',
      statuses: [{ blockId: 'block-1', exists: false }],
    });

    expect(result).toMatchObject({
      status: 'applied',
      shouldReloadActiveQueue: false,
    });
  });

  it('ignores source-existence patches when the captured read metadata is stale', () => {
    const row = createCard('block-1');
    const subject = createRuntime({
      activeQueueId: 'retrieval',
      rows: [row],
    });

    const result = subject.runtime.applyUpdate({
      source: 'visible-page',
      statuses: [{ blockId: 'block-1', exists: false }],
    }, {
      isCurrent: () => false,
    });

    expect(result).toEqual({ status: 'ignored', reason: 'stale-read-model' });
    expect(subject.rows[0]).toBe(row);
    expect(subject.patchGridRows).not.toHaveBeenCalled();
  });
});
