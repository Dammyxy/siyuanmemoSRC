import { describe, expect, it, vi } from 'vitest';
import { createBrowserGridFirstRowsLifecycle } from '../BrowserGridFirstRowsLifecycle';
import type { BrowserCard } from '../types';
import { QueueProjectionNotReadyError } from '@/types/unified-data-source';

function ref<T>(value: T): { value: T } {
  return { value };
}

function createLifecycle(overrides: Record<string, unknown> = {}) {
  const state = {
    activeDocId: ref<string | null>(null),
    hasFirstDataBlockLoaded: ref(false),
    loading: ref(true),
    rows: ref<BrowserCard[]>([]),
    rowsForFocus: ref<BrowserCard[]>([]),
    shouldFocusDocList: ref(false),
    totalRowCount: ref(0),
  };
  const calls = {
    applyGlobalSelectionToLoadedRows: vi.fn(),
    failCallback: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn() },
    mergeLoadedRows: vi.fn(),
    nextTick: vi.fn((callback: () => void) => callback()),
    recordFirstRowsVisible: vi.fn(),
    scheduleUiUpdate: vi.fn((_version: number, update: () => void) => update()),
    successCallback: vi.fn(),
  };
  const lifecycle = createBrowserGridFirstRowsLifecycle({
    ...state,
    applyGlobalSelectionToLoadedRows: calls.applyGlobalSelectionToLoadedRows,
    logger: calls.logger,
    mergeLoadedRows: calls.mergeLoadedRows,
    nextTick: calls.nextTick,
    recordFirstRowsVisible: calls.recordFirstRowsVisible,
    scheduleUiUpdate: calls.scheduleUiUpdate,
    ...overrides,
  } as any);
  return { calls, lifecycle, state };
}

describe('BrowserGridFirstRowsLifecycle', () => {
  it('applies empty datasource as first visible empty rows', () => {
    const { calls, lifecycle, state } = createLifecycle();

    const status = lifecycle.applyEmptyDatasource({
      isCurrentVersion: () => true,
      successCallback: calls.successCallback,
      version: 3,
    });

    expect(status).toBe('empty-datasource');
    expect(calls.successCallback).toHaveBeenCalledWith([], 0);
    expect(state.hasFirstDataBlockLoaded.value).toBe(true);
    expect(state.loading.value).toBe(false);
    expect(calls.recordFirstRowsVisible).toHaveBeenCalledWith(expect.objectContaining({
      empty: true,
      source: 'empty-datasource',
      version: 3,
    }));
  });

  it('applies loaded rows and updates visible Browser state', () => {
    const onTotalCountLoaded = vi.fn();
    const { calls, lifecycle, state } = createLifecycle({ onTotalCountLoaded });
    const rows = [{ id: 'a', blockId: 'a' }] as BrowserCard[];

    const status = lifecycle.applyLoadedRows({
      isCurrentVersion: () => true,
      rowsForBlock: rows,
      successCallback: calls.successCallback,
      totalCount: 4,
      version: 5,
    });

    expect(status).toBe('loaded');
    expect(calls.successCallback).toHaveBeenCalledWith(rows, 4);
    expect(state.rows.value).toBe(rows);
    expect(state.rowsForFocus.value).toEqual(rows);
    expect(state.totalRowCount.value).toBe(4);
    expect(onTotalCountLoaded).toHaveBeenCalledWith(4);
    expect(calls.mergeLoadedRows).toHaveBeenCalledWith(rows);
    expect(calls.applyGlobalSelectionToLoadedRows).toHaveBeenCalledTimes(1);
    expect(calls.recordFirstRowsVisible).toHaveBeenCalledWith(expect.objectContaining({
      empty: false,
      rowCount: 1,
      source: 'datasource-ui-update',
    }));
  });

  it('maps projection-not-ready errors to quiet failure without first-row empty state', () => {
    const { calls, lifecycle, state } = createLifecycle();

    const status = lifecycle.applyRowsError({
      error: new QueueProjectionNotReadyError('refreshing'),
      failCallback: calls.failCallback,
      isCurrentVersion: () => true,
      version: 7,
    });

    expect(status).toBe('projection-not-ready');
    expect(calls.failCallback).toHaveBeenCalledTimes(1);
    expect(calls.logger.info).toHaveBeenCalledTimes(1);
    expect(calls.logger.error).not.toHaveBeenCalled();
    expect(state.hasFirstDataBlockLoaded.value).toBe(false);
    expect(state.loading.value).toBe(false);
  });

  it('maps hard getRows errors to explicit grid error state', () => {
    const { calls, lifecycle, state } = createLifecycle();
    const error = new Error('boom');

    const status = lifecycle.applyRowsError({
      error,
      failCallback: calls.failCallback,
      isCurrentVersion: () => true,
      version: 9,
    });

    expect(status).toBe('error');
    expect(calls.failCallback).toHaveBeenCalledTimes(1);
    expect(calls.logger.error).toHaveBeenCalledWith('[SiYuanMemo][SRSBrowser] Infinite datasource getRows failed:', error);
    expect(state.hasFirstDataBlockLoaded.value).toBe(true);
    expect(state.loading.value).toBe(false);
  });
});
