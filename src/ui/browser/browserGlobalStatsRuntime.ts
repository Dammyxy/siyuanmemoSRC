import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';

export type BrowserGlobalStatsState = {
  dismissed: number;
  lost: number;
  total: number | null;
};

export type BrowserGlobalStatsScope = {
  activeDocId: string | null;
  activeQueueId: string | null;
  activeScopeDocIds: string[] | null;
  currentCardType: string;
  currentPreset: string;
  searchQuery: string;
};

function normalizeCount(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

function isLoadedCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isDefaultAllCardsScope(scope: BrowserGlobalStatsScope): boolean {
  return (
    !scope.activeQueueId
    && !scope.activeDocId
    && !(scope.activeScopeDocIds?.length)
    && scope.currentPreset === 'all'
    && scope.currentCardType === 'all'
    && !String(scope.searchQuery || '').trim()
  );
}

export function applyLoadedAllCardsTotal(
  current: BrowserGlobalStatsState,
  scope: BrowserGlobalStatsScope,
  loadedTotal: unknown,
): BrowserGlobalStatsState {
  if (!isDefaultAllCardsScope(scope)) {
    return current;
  }
  return {
    ...current,
    total: normalizeCount(loadedTotal),
  };
}

export function applyBackendBrowserStats(
  current: BrowserGlobalStatsState,
  scope: BrowserGlobalStatsScope,
  stats: BrowserStats,
  loadedTotal: unknown,
): BrowserGlobalStatsState {
  const backendTotal = normalizeCount(stats.totalCards);
  const defaultScope = isDefaultAllCardsScope(scope);
  const total = defaultScope
    ? (isLoadedCount(loadedTotal) ? normalizeCount(loadedTotal) : current.total)
    : backendTotal;

  return {
    total,
    lost: normalizeCount(stats.lostCards),
    dismissed: normalizeCount(stats.suspendedCards),
  };
}
