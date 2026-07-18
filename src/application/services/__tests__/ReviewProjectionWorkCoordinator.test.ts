import { describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { ReviewProjectionWorkCoordinator } from '../ReviewProjectionWorkCoordinator';

function createCoordinator() {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  };
  return {
    coordinator: new ReviewProjectionWorkCoordinator(logger),
    logger,
  };
}

async function flushWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ReviewProjectionWorkCoordinator', () => {
  it('publishes dialog priority and restores the latest tab after dialog release', () => {
    const { coordinator, logger } = createCoordinator();
    const snapshots = [coordinator.getSnapshot()];
    coordinator.subscribe((snapshot) => snapshots.push(snapshot));

    const retrievalTab = coordinator.activateSurface({
      surfaceId: 'tab-retrieval',
      surfaceKind: 'tab',
      queueType: QueueType.RetrievalPractice,
    });
    const incrementalTab = coordinator.activateSurface({
      surfaceId: 'tab-incremental',
      surfaceKind: 'tab',
      queueType: QueueType.IncrementalLearning,
    });
    const dialog = coordinator.activateSurface({
      surfaceId: 'review-dialog',
      surfaceKind: 'dialog',
      queueType: QueueType.FinalDrill,
    });

    expect(coordinator.getSnapshot()).toMatchObject({
      active: true,
      activeQueueType: QueueType.FinalDrill,
      surfaceId: 'review-dialog',
      surfaceKind: 'dialog',
    });

    retrievalTab.markActive();
    expect(coordinator.getSnapshot().activeQueueType).toBe(QueueType.FinalDrill);

    dialog.release();
    expect(coordinator.getSnapshot()).toMatchObject({
      activeQueueType: QueueType.RetrievalPractice,
      surfaceId: 'tab-retrieval',
      surfaceKind: 'tab',
    });

    incrementalTab.release();
    retrievalTab.release();
    expect(coordinator.getSnapshot()).toMatchObject({
      active: false,
      activeQueueType: null,
      surfaceId: null,
      surfaceKind: null,
    });
    expect(snapshots.at(-1)?.revision).toBeGreaterThan(0);
    expect(logger.info).toHaveBeenCalledTimes(snapshots.length - 1);
  });

  it('selects the most recently active tab without duplicate transitions', () => {
    const { coordinator, logger } = createCoordinator();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    const first = coordinator.activateSurface({
      surfaceId: 'first',
      surfaceKind: 'tab',
      queueType: QueueType.RetrievalPractice,
    });
    const second = coordinator.activateSurface({
      surfaceId: 'second',
      surfaceKind: 'tab',
      queueType: QueueType.IncrementalLearning,
    });

    first.markActive();
    expect(coordinator.getSnapshot().surfaceId).toBe('first');
    first.markActive();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledTimes(3);
    second.release();
    first.release();
  });

  it('coalesces a pending stable key and runs the latest callback once on idle', async () => {
    const { coordinator } = createCoordinator();
    const surface = coordinator.activateSurface({
      surfaceId: 'active-review',
      surfaceKind: 'dialog',
      queueType: QueueType.IncrementalLearning,
    });
    const firstRun = vi.fn();
    const latestRun = vi.fn();

    expect(coordinator.scheduleWork({
      key: 'browser:warmup:filter-group',
      queueType: QueueType.FilterGroup,
      run: firstRun,
    })).toBe('deferred');
    expect(coordinator.scheduleWork({
      key: 'browser:warmup:filter-group',
      queueType: QueueType.FilterGroup,
      run: latestRun,
    })).toBe('coalesced');

    await flushWork();
    expect(firstRun).not.toHaveBeenCalled();
    expect(latestRun).not.toHaveBeenCalled();

    surface.release();
    await flushWork();
    expect(firstRun).not.toHaveBeenCalled();
    expect(latestRun).toHaveBeenCalledTimes(1);
  });

  it('releases only newly eligible queue work on active queue transition', async () => {
    const { coordinator } = createCoordinator();
    const incremental = coordinator.activateSurface({
      surfaceId: 'incremental-review',
      surfaceKind: 'dialog',
      queueType: QueueType.IncrementalLearning,
    });
    const retrievalRun = vi.fn();
    const filterRun = vi.fn();
    coordinator.scheduleWork({
      key: 'browser:warmup:retrieval',
      queueType: QueueType.RetrievalPractice,
      run: retrievalRun,
    });
    coordinator.scheduleWork({
      key: 'browser:warmup:filter',
      queueType: QueueType.FilterGroup,
      run: filterRun,
    });

    const retrieval = coordinator.activateSurface({
      surfaceId: 'retrieval-review',
      surfaceKind: 'dialog',
      queueType: QueueType.RetrievalPractice,
    });
    await flushWork();

    expect(retrievalRun).toHaveBeenCalledTimes(1);
    expect(filterRun).not.toHaveBeenCalled();

    retrieval.release();
    incremental.release();
    await flushWork();
    expect(filterRun).toHaveBeenCalledTimes(1);
  });

  it('keeps idle-only work pending until the final Review surface closes', async () => {
    const { coordinator } = createCoordinator();
    const tab = coordinator.activateSurface({
      surfaceId: 'tab',
      surfaceKind: 'tab',
      queueType: QueueType.RetrievalPractice,
    });
    const run = vi.fn();

    coordinator.scheduleWork({
      key: 'browser:queue-counts',
      queueType: null,
      run,
    });
    tab.markActive();
    await flushWork();
    expect(run).not.toHaveBeenCalled();

    tab.release();
    await flushWork();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work and ignores stale or disposed lifecycle handles', async () => {
    const { coordinator } = createCoordinator();
    const stale = coordinator.activateSurface({
      surfaceId: 'same',
      surfaceKind: 'tab',
      queueType: QueueType.RetrievalPractice,
    });
    const current = coordinator.activateSurface({
      surfaceId: 'same',
      surfaceKind: 'tab',
      queueType: QueueType.IncrementalLearning,
    });
    stale.release();
    expect(coordinator.getSnapshot().activeQueueType).toBe(QueueType.IncrementalLearning);

    const cancelledRun = vi.fn();
    coordinator.scheduleWork({
      key: 'cancelled',
      queueType: QueueType.FilterGroup,
      run: cancelledRun,
    });
    coordinator.cancelWork('cancelled');
    current.release();
    await flushWork();
    expect(cancelledRun).not.toHaveBeenCalled();

    const disposedRun = vi.fn();
    const active = coordinator.activateSurface({
      surfaceId: 'dispose',
      surfaceKind: 'tab',
      queueType: QueueType.RetrievalPractice,
    });
    coordinator.scheduleWork({
      key: 'disposed',
      queueType: null,
      run: disposedRun,
    });
    coordinator.dispose();
    active.release();
    await flushWork();
    expect(disposedRun).not.toHaveBeenCalled();
  });
});
