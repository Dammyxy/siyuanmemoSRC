import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
  normalizeHierarchySnapshotDelayMs,
  resolveBrowserHierarchySnapshotMode,
  shouldDelayHierarchySnapshot,
} from '../hierarchySnapshotPlan';

describe('hierarchySnapshotPlan', () => {
  it('resolves all-cards mode to a background full snapshot', () => {
    expect(resolveBrowserHierarchySnapshotMode({
      shouldFocusDocList: false,
      activeDocId: null,
    })).toBe('all');
  });

  it('resolves focused queue/search mode to the focus snapshot', () => {
    expect(resolveBrowserHierarchySnapshotMode({
      shouldFocusDocList: true,
      activeDocId: null,
    })).toBe('focus');
  });

  it('skips extra hierarchy snapshots when a document is already selected', () => {
    expect(resolveBrowserHierarchySnapshotMode({
      shouldFocusDocList: false,
      activeDocId: 'doc-1',
    })).toBe('none');
  });

  it('keeps snapshotDelayMs=0 as an immediate path and falls back for invalid input', () => {
    expect(normalizeHierarchySnapshotDelayMs(0)).toBe(0);
    expect(normalizeHierarchySnapshotDelayMs(undefined)).toBe(DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS);
    expect(normalizeHierarchySnapshotDelayMs(Number.NaN, 45)).toBe(45);
    expect(normalizeHierarchySnapshotDelayMs(12.8)).toBe(12);
  });

  it('delays hierarchy snapshots while projection is still refreshing', () => {
    expect(shouldDelayHierarchySnapshot({
      hasFirstDataBlockLoaded: false,
      loading: false,
      firstRowsStatus: 'projection-not-ready',
    })).toBe(true);
    expect(shouldDelayHierarchySnapshot({
      hasFirstDataBlockLoaded: false,
      loading: true,
      firstRowsStatus: 'pending',
    })).toBe(true);
    expect(shouldDelayHierarchySnapshot({
      hasFirstDataBlockLoaded: true,
      loading: false,
      firstRowsStatus: 'loaded',
    })).toBe(false);
    expect(shouldDelayHierarchySnapshot({
      hasFirstDataBlockLoaded: false,
      loading: false,
      firstRowsStatus: 'error',
    })).toBe(false);
  });
});
