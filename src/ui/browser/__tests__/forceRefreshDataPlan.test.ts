import { describe, expect, it, vi } from 'vitest';
import { runBrowserForceRefresh } from '../forceRefreshDataPlan';

describe('runBrowserForceRefresh', () => {
  it('forces current view refresh before queue count reconciliation', async () => {
    const steps: string[] = [];
    const invalidateCardCache = vi.fn(() => {
      steps.push('invalidate');
    });
    const refreshGlobalStats = vi.fn(async (force?: boolean) => {
      steps.push(`global:${String(force)}`);
    });
    const refreshData = vi.fn(async (
      forceRefresh?: boolean,
      preserveScroll?: boolean,
      options?: { refreshQueueCounts?: boolean },
    ) => {
      steps.push(`data:${String(forceRefresh)}:${String(preserveScroll)}:${String(options?.refreshQueueCounts)}`);
    });
    const refreshQueueCounts = vi.fn(async (request: { forceRefresh?: boolean }) => {
      steps.push(`counts:${String(request.forceRefresh)}`);
    });

    await runBrowserForceRefresh({
      invalidateCardCache,
      refreshGlobalStats,
      refreshData,
      refreshQueueCounts,
    });

    expect(steps).toEqual([
      'invalidate',
      'global:true',
      'data:true:false:false',
      'counts:true',
    ]);
    expect(refreshData).toHaveBeenCalledWith(true, false, { refreshQueueCounts: false });
    expect(refreshQueueCounts).toHaveBeenCalledWith({ forceRefresh: true });
  });
});
