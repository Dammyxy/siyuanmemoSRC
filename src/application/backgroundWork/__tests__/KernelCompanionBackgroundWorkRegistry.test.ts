import { describe, expect, it, vi } from 'vitest';

import { KernelCompanionBackgroundWorkRegistry } from '../KernelCompanionBackgroundWorkRegistry';

async function settleBackgroundWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('KernelCompanionBackgroundWorkRegistry', () => {
  it('records accepted work and terminal completion diagnostics', async () => {
    const scheduled: Array<() => void> = [];
    let now = 1_700_000_000_000;
    const registry = new KernelCompanionBackgroundWorkRegistry({
      now: () => now += 1,
      schedule: (run) => scheduled.push(run),
    });

    const result = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 2 },
      run: async () => ({
        diagnostics: {
          recordsWritten: 2,
        },
      }),
    });

    expect(result.accepted).toBe(true);
    expect(result.job).toMatchObject({
      kind: 'review-truth-backfill',
      state: 'accepted',
      attemptCount: 0,
      diagnostics: { pendingRows: 2 },
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(registry.status(result.job.jobId)).toMatchObject({
      state: 'completed',
      attemptCount: 1,
      diagnostics: {
        pendingRows: 2,
        recordsWritten: 2,
      },
      lastError: null,
    });
  });

  it('cancels pending work without running its handler', async () => {
    const scheduled: Array<() => void> = [];
    const run = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const result = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 3 },
      run,
    });

    expect(registry.cancel(result.job.jobId, 'user-cancel')).toMatchObject({
      state: 'canceled',
      reason: 'user-cancel',
    });
    scheduled[0]?.();
    await settleBackgroundWork();

    expect(run).not.toHaveBeenCalled();
    expect(registry.status(result.job.jobId)).toMatchObject({
      state: 'canceled',
      attemptCount: 0,
    });
  });

  it('defers pending work with diagnostics without executing heavy work', async () => {
    const scheduled: Array<() => void> = [];
    const run = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const result = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 8 },
      run,
    });

    expect(registry.defer(result.job.jobId, 'shutdown', { deferredBatches: 2 })).toMatchObject({
      state: 'deferred',
      reason: 'shutdown',
      diagnostics: {
        pendingRows: 8,
        deferredBatches: 2,
      },
    });
    scheduled[0]?.();
    await settleBackgroundWork();

    expect(run).not.toHaveBeenCalled();
  });

  it('shutdown defer-marks queued work and blocks new submissions', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const queued = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 5 },
      run: async () => undefined,
    });

    expect(registry.shutdown('plugin-unload')).toEqual([
      expect.objectContaining({
        jobId: queued.job.jobId,
        state: 'deferred',
        reason: 'plugin-unload',
      }),
    ]);

    const rejected = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 1 },
      run: async () => undefined,
    });

    expect(rejected).toMatchObject({
      accepted: false,
      job: {
        state: 'deferred',
        reason: 'plugin-unload',
        lastError: 'BACKGROUND_WORK_REGISTRY_SHUTDOWN',
        diagnostics: {
          pendingRows: 1,
          unavailable: true,
        },
      },
    });
    scheduled[0]?.();
    await settleBackgroundWork();
    expect(registry.status(queued.job.jobId)).toMatchObject({
      state: 'deferred',
      attemptCount: 0,
    });
  });

  it('shutdown cancel-marks running work and ignores late handler results', async () => {
    const scheduled: Array<() => void> = [];
    let finish: ((value: unknown) => void) | null = null;
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const running = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 4 },
      run: async () => new Promise((resolve) => {
        finish = resolve;
      }),
    });

    scheduled[0]?.();
    await settleBackgroundWork();
    expect(registry.status(running.job.jobId)).toMatchObject({
      state: 'running',
      attemptCount: 1,
    });

    registry.shutdown('dispose');
    expect(registry.status(running.job.jobId)).toMatchObject({
      state: 'canceled',
      reason: 'dispose',
    });

    finish?.({ diagnostics: { recordsWritten: 4 } });
    await settleBackgroundWork();
    expect(registry.status(running.job.jobId)).toMatchObject({
      state: 'canceled',
      diagnostics: { pendingRows: 4 },
    });
  });

  it('records kernel transaction action polling diagnostics', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const result = registry.submit({
      kind: 'kernel-transaction-action-polling',
      diagnostics: {
        reason: 'timer',
        maxActionsPerPoll: 8,
      },
      run: async () => ({
        diagnostics: {
          status: 'empty',
          actionCount: 0,
          remainingActions: 0,
        },
      }),
    });

    expect(result.job).toMatchObject({
      kind: 'kernel-transaction-action-polling',
      state: 'accepted',
      diagnostics: {
        reason: 'timer',
        maxActionsPerPoll: 8,
      },
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(registry.status(result.job.jobId)).toMatchObject({
      state: 'completed',
      diagnostics: {
        reason: 'timer',
        maxActionsPerPoll: 8,
        status: 'empty',
        actionCount: 0,
        remainingActions: 0,
      },
    });
  });

  it('records Xiuyuan startup sync diagnostics', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const result = registry.submit({
      kind: 'xiuyuan-startup-sync',
      diagnostics: {
        reason: 'plugin-start',
        syncType: 'incremental',
        source: 'startup',
        persistIdleCheckpoint: false,
        status: 'submitted',
      },
      run: async () => ({
        diagnostics: {
          status: 'completed',
          addedCount: 1,
          updatedCount: 2,
          deletedCount: 0,
          skippedCount: 3,
          detectedCount: 0,
        },
      }),
    });

    expect(result.job).toMatchObject({
      kind: 'xiuyuan-startup-sync',
      state: 'accepted',
      diagnostics: {
        reason: 'plugin-start',
        syncType: 'incremental',
        source: 'startup',
        persistIdleCheckpoint: false,
        status: 'submitted',
      },
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(registry.status(result.job.jobId)).toMatchObject({
      state: 'completed',
      diagnostics: {
        reason: 'plugin-start',
        syncType: 'incremental',
        source: 'startup',
        persistIdleCheckpoint: false,
        status: 'completed',
        addedCount: 1,
        updatedCount: 2,
        deletedCount: 0,
        skippedCount: 3,
      },
    });
  });
});
