import type { BrowserGridRowsLifecycleStatus } from './BrowserGridFirstRowsLifecycle';

export interface BrowserGridFirstPageStateInput {
  currentDataSourceReady: boolean;
  firstRowsStatus: BrowserGridRowsLifecycleStatus | 'pending';
  hasFirstDataBlockLoaded: boolean;
  loading: boolean;
  showNeuralCustomSubview: boolean;
  totalRowCount: number;
}

export interface BrowserGridFirstPageState {
  overlayKind: 'loading' | 'projection-refreshing' | null;
  showEmptyState: boolean;
  showGrid: boolean;
  showShellLoading: boolean;
}

export function resolveBrowserGridFirstPageState(input: BrowserGridFirstPageStateInput): BrowserGridFirstPageState {
  if (input.showNeuralCustomSubview) {
    return {
      overlayKind: null,
      showEmptyState: false,
      showGrid: false,
      showShellLoading: false,
    };
  }

  const firstRowsPending = !input.hasFirstDataBlockLoaded;
  const datasourcePending = input.loading && input.currentDataSourceReady && firstRowsPending;
  const projectionRefreshing = firstRowsPending && input.firstRowsStatus === 'projection-not-ready';

  return {
    overlayKind: projectionRefreshing ? 'projection-refreshing' : datasourcePending ? 'loading' : null,
    showEmptyState: !input.loading && input.hasFirstDataBlockLoaded && input.totalRowCount === 0,
    showGrid: input.currentDataSourceReady || !input.loading,
    showShellLoading: input.loading && !input.currentDataSourceReady,
  };
}
