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
  overlayKind: 'loading' | 'projection-refreshing' | 'repair-required' | 'unavailable' | null;
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
  const datasourcePending = input.loading && firstRowsPending;
  const projectionRefreshing = firstRowsPending
    && (input.firstRowsStatus === 'projection-not-ready' || input.firstRowsStatus === 'read-model-preparing');
  const repairRequired = firstRowsPending && input.firstRowsStatus === 'read-model-repair-required';
  const unavailable = firstRowsPending && input.firstRowsStatus === 'read-model-unavailable';

  return {
    overlayKind: repairRequired
      ? 'repair-required'
      : unavailable
      ? 'unavailable'
      : projectionRefreshing
      ? 'projection-refreshing'
      : datasourcePending
      ? 'loading'
      : null,
    showEmptyState: !input.loading && input.hasFirstDataBlockLoaded && input.totalRowCount === 0,
    // Keep AG Grid mounted on non-neural Browser surfaces; destroying it during
    // queue datasource preparation causes visible flashes before rows arrive.
    showGrid: true,
    showShellLoading: false,
  };
}
