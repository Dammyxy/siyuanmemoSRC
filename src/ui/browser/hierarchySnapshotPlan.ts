import type { BrowserGridRowsLifecycleStatus } from './BrowserGridFirstRowsLifecycle';

export const DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS = 4800;

export type BrowserHierarchySnapshotMode = 'focus' | 'all' | 'none';

export function resolveBrowserHierarchySnapshotMode(input: {
  shouldFocusDocList: boolean;
  activeDocId: string | null;
}): BrowserHierarchySnapshotMode {
  if (input.activeDocId) {
    return 'none';
  }

  return input.shouldFocusDocList ? 'focus' : 'all';
}

export function normalizeHierarchySnapshotDelayMs(
  snapshotDelayMs?: number,
  fallbackMs: number = DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS,
): number {
  if (!Number.isFinite(snapshotDelayMs)) {
    return fallbackMs;
  }

  return Math.max(0, Math.floor(Number(snapshotDelayMs)));
}

export function shouldDelayHierarchySnapshot(input: {
  hasFirstDataBlockLoaded: boolean;
  loading: boolean;
  firstRowsStatus: BrowserGridRowsLifecycleStatus | 'pending';
}): boolean {
  return (input.loading && !input.hasFirstDataBlockLoaded)
    || input.firstRowsStatus === 'projection-not-ready';
}
