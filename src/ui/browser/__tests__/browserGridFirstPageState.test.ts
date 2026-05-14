import { describe, expect, it } from 'vitest';
import { resolveBrowserGridFirstPageState } from '../browserGridFirstPageState';

const baseInput = {
  currentDataSourceReady: false,
  firstRowsStatus: 'pending' as const,
  hasFirstDataBlockLoaded: false,
  loading: false,
  showNeuralCustomSubview: false,
  totalRowCount: 0,
};

describe('browser grid first-page state', () => {
  it('shows shell loading before a datasource is attached', () => {
    expect(resolveBrowserGridFirstPageState({
      ...baseInput,
      loading: true,
    })).toEqual({
      overlayKind: null,
      showEmptyState: false,
      showGrid: false,
      showShellLoading: true,
    });
  });

  it('keeps grid mounted with loading overlay while first rows are pending', () => {
    expect(resolveBrowserGridFirstPageState({
      ...baseInput,
      currentDataSourceReady: true,
      loading: true,
    })).toEqual({
      overlayKind: 'loading',
      showEmptyState: false,
      showGrid: true,
      showShellLoading: false,
    });
  });

  it('shows projection-refreshing overlay without confirming empty state', () => {
    expect(resolveBrowserGridFirstPageState({
      ...baseInput,
      currentDataSourceReady: true,
      firstRowsStatus: 'projection-not-ready',
      loading: false,
    })).toEqual({
      overlayKind: 'projection-refreshing',
      showEmptyState: false,
      showGrid: true,
      showShellLoading: false,
    });
  });

  it('shows empty state only after first rows confirm zero rows', () => {
    expect(resolveBrowserGridFirstPageState({
      ...baseInput,
      hasFirstDataBlockLoaded: true,
      totalRowCount: 0,
    })).toEqual({
      overlayKind: null,
      showEmptyState: true,
      showGrid: true,
      showShellLoading: false,
    });
  });

  it('shows loaded grid without overlay after rows are visible', () => {
    expect(resolveBrowserGridFirstPageState({
      ...baseInput,
      currentDataSourceReady: true,
      firstRowsStatus: 'loaded',
      hasFirstDataBlockLoaded: true,
      totalRowCount: 3,
    })).toEqual({
      overlayKind: null,
      showEmptyState: false,
      showGrid: true,
      showShellLoading: false,
    });
  });

  it('suppresses Browser grid states for neural custom subviews', () => {
    expect(resolveBrowserGridFirstPageState({
      ...baseInput,
      currentDataSourceReady: true,
      loading: true,
      showNeuralCustomSubview: true,
    })).toEqual({
      overlayKind: null,
      showEmptyState: false,
      showGrid: false,
      showShellLoading: false,
    });
  });
});
