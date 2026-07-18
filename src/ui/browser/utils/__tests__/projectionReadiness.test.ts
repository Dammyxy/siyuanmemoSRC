import { describe, expect, it, vi } from 'vitest';
import { QueueProjectionNotReadyError } from '@/types/unified-data-source';
import {
  fetchRowsWithProjectionReadinessRetry,
  isQueueProjectionNotReadyError,
} from '../projectionReadiness';
import { BrowserReadModelStateError } from '../browserReadModelStateError';

describe('projectionReadiness', () => {
  it('identifies transient queue projection readiness errors', () => {
    expect(isQueueProjectionNotReadyError(new QueueProjectionNotReadyError('refreshing'))).toBe(true);
    expect(isQueueProjectionNotReadyError(new Error('QUEUE_PROJECTION_NOT_READY: refreshing'))).toBe(true);
    expect(isQueueProjectionNotReadyError(new Error('QUEUE_PROJECTION_UNAVAILABLE: down'))).toBe(false);
  });

  it('retries transient projection-not-ready row fetches', async () => {
    vi.useFakeTimers();
    const dataSource = {
      id: 'queue',
      label: 'Queue',
      getSupportedActions: () => [],
      performAction: vi.fn(),
      fetchRows: vi.fn()
        .mockRejectedValueOnce(new QueueProjectionNotReadyError('refreshing'))
        .mockResolvedValueOnce({ rows: [], totalCount: 0 }),
    };

    const resultPromise = fetchRowsWithProjectionReadinessRetry(
      dataSource,
      { sortModel: [], filterModel: {}, startRow: 0, endRow: 20 },
      () => true,
    );

    await vi.advanceTimersByTimeAsync(150);
    await expect(resultPromise).resolves.toEqual({ rows: [], totalCount: 0 });
    expect(dataSource.fetchRows).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry Browser read-model preparing row fetches', async () => {
    const dataSource = {
      id: 'queue',
      label: 'Queue',
      getSupportedActions: () => [],
      performAction: vi.fn(),
      fetchRows: vi.fn(async () => {
        throw new BrowserReadModelStateError('preparing', 'projection warmup pending');
      }),
    };

    await expect(fetchRowsWithProjectionReadinessRetry(
      dataSource,
      { sortModel: [], filterModel: {}, startRow: 0, endRow: 20 },
      () => true,
    )).rejects.toThrow('BROWSER_READ_MODEL_PREPARING');
    expect(dataSource.fetchRows).toHaveBeenCalledTimes(1);
  });

  it('does not retry hard projection unavailable errors', async () => {
    const dataSource = {
      id: 'queue',
      label: 'Queue',
      getSupportedActions: () => [],
      performAction: vi.fn(),
      fetchRows: vi.fn(async () => {
        throw new Error('QUEUE_PROJECTION_UNAVAILABLE: backend down');
      }),
    };

    await expect(fetchRowsWithProjectionReadinessRetry(
      dataSource,
      { sortModel: [], filterModel: {}, startRow: 0, endRow: 20 },
      () => true,
    )).rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');
    expect(dataSource.fetchRows).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['repair-required'],
    ['unavailable'],
  ] as const)('does not retry Browser read-model %s row fetches', async (state) => {
    const dataSource = {
      id: 'queue',
      label: 'Queue',
      getSupportedActions: () => [],
      performAction: vi.fn(),
      fetchRows: vi.fn(async () => {
        throw new BrowserReadModelStateError(state, `${state} reason`);
      }),
    };

    await expect(fetchRowsWithProjectionReadinessRetry(
      dataSource,
      { sortModel: [], filterModel: {}, startRow: 0, endRow: 20 },
      () => true,
    )).rejects.toThrow(`BROWSER_READ_MODEL_${state.toUpperCase()}`);
    expect(dataSource.fetchRows).toHaveBeenCalledTimes(1);
  });
});
