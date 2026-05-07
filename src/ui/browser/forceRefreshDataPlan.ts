import type { BrowserQueueCountsRequest } from '@/application/interfaces/IBrowserApplicationService';

type RefreshDataOptions = {
  refreshQueueCounts?: boolean;
};

export interface BrowserForceRefreshPlanDeps {
  invalidateCardCache: () => void;
  refreshGlobalStats: (force?: boolean) => Promise<void>;
  refreshData: (
    forceRefresh?: boolean,
    preserveScroll?: boolean,
    options?: RefreshDataOptions,
  ) => Promise<void>;
  refreshQueueCounts: (request: BrowserQueueCountsRequest) => Promise<void>;
}

export async function runBrowserForceRefresh(deps: BrowserForceRefreshPlanDeps): Promise<void> {
  deps.invalidateCardCache();
  await deps.refreshData(true, false, { refreshQueueCounts: false });
  await deps.refreshQueueCounts({ forceRefresh: true });
  await deps.refreshGlobalStats(true);
}
