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
      dedupeKey: 'review-truth-backfill:runtime-A:plugin-A:epoch-A:frontier-A',
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
      dedupeKey: 'review-truth-backfill:runtime-A:plugin-A:epoch-A:frontier-A',
      state: 'accepted',
      attemptCount: 0,
      diagnostics: { pendingRows: 2 },
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(registry.status(result.job.jobId)).toMatchObject({
      state: 'completed',
      dedupeKey: 'review-truth-backfill:runtime-A:plugin-A:epoch-A:frontier-A',
      attemptCount: 1,
      diagnostics: {
        pendingRows: 2,
        recordsWritten: 2,
      },
      lastError: null,
    });
  });

  it('records lifecycle dedupe key without changing accepted execution', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });

    const result = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: {
        reason: 'plugin.onload-ready',
      },
      run: async () => ({
        diagnostics: {
          operationId: 'startup-storage-maintenance-v1',
        },
      }),
    });

    expect(result).toMatchObject({
      accepted: true,
      job: {
        kind: 'startup-storage-maintenance',
        dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
        state: 'accepted',
        attemptCount: 0,
      },
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(registry.status(result.job.jobId)).toMatchObject({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      state: 'completed',
      attemptCount: 1,
      diagnostics: {
        reason: 'plugin.onload-ready',
        operationId: 'startup-storage-maintenance-v1',
      },
    });
  });

  it('coalesces equivalent accepted work by lifecycle dedupe key', async () => {
    const scheduled: Array<() => void> = [];
    const firstRun = vi.fn(async () => ({
      diagnostics: {
        operationId: 'startup-storage-maintenance-v1',
      },
    }));
    const secondRun = vi.fn(async () => ({
      diagnostics: {
        operationId: 'duplicate',
      },
    }));
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });

    const first = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: firstRun,
    });
    const duplicate = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'post-ready-reload' },
      run: secondRun,
    });

    expect(duplicate).toMatchObject({
      accepted: false,
      coalesced: true,
      skipped: false,
      job: {
        jobId: first.job.jobId,
        state: 'accepted',
        diagnostics: { reason: 'plugin.onload-ready' },
      },
    });
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(secondRun).not.toHaveBeenCalled();
    expect(registry.status()).toHaveLength(1);
  });

  it('coalesces equivalent running work by lifecycle dedupe key', async () => {
    const scheduled: Array<() => void> = [];
    let finish: ((value: unknown) => void) | null = null;
    const duplicateRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const running = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => new Promise((resolve) => {
        finish = resolve;
      }),
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    const duplicate = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'post-ready-reload' },
      run: duplicateRun,
    });

    expect(duplicate).toMatchObject({
      accepted: false,
      coalesced: true,
      skipped: false,
      job: {
        jobId: running.job.jobId,
        state: 'running',
      },
    });
    expect(scheduled).toHaveLength(1);

    finish?.({ diagnostics: { operationId: 'startup-storage-maintenance-v1' } });
    await settleBackgroundWork();

    expect(duplicateRun).not.toHaveBeenCalled();
    expect(registry.status()).toHaveLength(1);
  });

  it('returns unchanged completed lifecycle evidence without re-execution', async () => {
    const scheduled: Array<() => void> = [];
    const run = vi.fn(async () => ({
      diagnostics: {
        operationId: 'startup-storage-maintenance-v1',
        scheduleAffectedCardCount: 0,
      },
    }));
    const duplicateRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const first = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run,
    });
    scheduled[0]?.();
    await settleBackgroundWork();

    const duplicate = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'warm-restart' },
      run: duplicateRun,
    });

    expect(duplicate).toMatchObject({
      accepted: false,
      coalesced: false,
      skipped: true,
      job: {
        jobId: first.job.jobId,
        state: 'completed',
        diagnostics: {
          reason: 'plugin.onload-ready',
          operationId: 'startup-storage-maintenance-v1',
          scheduleAffectedCardCount: 0,
        },
      },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(duplicateRun).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(registry.status()).toHaveLength(1);
  });

  it('executes changed frontier submissions as distinct lifecycle work', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });

    registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => undefined,
    });
    const changed = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-B',
      diagnostics: { reason: 'post-ready-reload' },
      run: async () => undefined,
    });

    expect(changed).toMatchObject({
      accepted: true,
      coalesced: false,
      skipped: false,
      job: {
        state: 'accepted',
        dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-B',
      },
    });
    expect(scheduled).toHaveLength(2);
    expect(registry.status()).toHaveLength(2);
  });

  it('returns failed lifecycle evidence until retry is explicit', async () => {
    const scheduled: Array<() => void> = [];
    const duplicateRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const failed = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => {
        throw new Error('startup maintenance failed');
      },
    });
    scheduled[0]?.();
    await settleBackgroundWork();

    const duplicate = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'post-ready-reload' },
      run: duplicateRun,
    });

    expect(duplicate).toMatchObject({
      accepted: false,
      coalesced: false,
      skipped: false,
      job: {
        jobId: failed.job.jobId,
        state: 'failed',
        attemptCount: 1,
        lastError: 'startup maintenance failed',
      },
    });
    expect(duplicateRun).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(registry.status()).toHaveLength(1);
  });

  it('retries failed lifecycle work on the same job without concurrent duplicate execution', async () => {
    const scheduled: Array<() => void> = [];
    const retryRun = vi.fn(async () => ({
      diagnostics: {
        operationId: 'startup-storage-maintenance-v1',
      },
    }));
    const duplicateRetryRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const failed = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => {
        throw new Error('startup maintenance failed');
      },
    });
    scheduled[0]?.();
    await settleBackgroundWork();

    const retry = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      retry: true,
      diagnostics: { reason: 'manual-retry' },
      run: retryRun,
    });
    const duplicateRetry = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      retry: true,
      diagnostics: { reason: 'second-manual-retry' },
      run: duplicateRetryRun,
    });

    expect(retry).toMatchObject({
      accepted: true,
      coalesced: false,
      skipped: false,
      job: {
        jobId: failed.job.jobId,
        state: 'accepted',
        attemptCount: 1,
        lastError: null,
        diagnostics: { reason: 'manual-retry' },
      },
    });
    expect(duplicateRetry).toMatchObject({
      accepted: false,
      coalesced: true,
      skipped: false,
      job: {
        jobId: failed.job.jobId,
        state: 'accepted',
        attemptCount: 1,
      },
    });
    expect(scheduled).toHaveLength(2);

    scheduled[1]?.();
    await settleBackgroundWork();

    expect(retryRun).toHaveBeenCalledTimes(1);
    expect(duplicateRetryRun).not.toHaveBeenCalled();
    expect(registry.status(failed.job.jobId)).toMatchObject({
      state: 'completed',
      attemptCount: 2,
      diagnostics: {
        reason: 'manual-retry',
        operationId: 'startup-storage-maintenance-v1',
      },
    });
    expect(registry.status()).toHaveLength(1);
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

  it('shutdown settles queued startup lifecycle work and rejects follow-up submissions', async () => {
    const scheduled: Array<() => void> = [];
    const run = vi.fn(async () => undefined);
    const followUpRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const queued = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run,
    });

    registry.shutdown('plugin-unload');
    const followUp = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'post-ready-reload' },
      run: followUpRun,
    });

    expect(followUp).toMatchObject({
      accepted: false,
      job: {
        kind: 'startup-storage-maintenance',
        state: 'deferred',
        reason: 'plugin-unload',
        lastError: 'BACKGROUND_WORK_REGISTRY_SHUTDOWN',
      },
    });
    scheduled[0]?.();
    await settleBackgroundWork();

    expect(run).not.toHaveBeenCalled();
    expect(followUpRun).not.toHaveBeenCalled();
    expect(registry.status(queued.job.jobId)).toMatchObject({
      state: 'deferred',
      reason: 'plugin-unload',
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

  it('shutdown prevents running startup work from spawning executable follow-up jobs', async () => {
    const scheduled: Array<() => void> = [];
    let finish: (() => void) | null = null;
    const childRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const running = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        registry.submit({
          kind: 'review-truth-flush',
          dedupeKey: 'review-truth-flush-lifecycle-v1:device-A:epoch-A:review-events-v1',
          diagnostics: { reason: 'child-after-shutdown' },
          run: childRun,
        });
        return {
          diagnostics: { attemptedChildSubmission: true },
        };
      },
    });

    scheduled[0]?.();
    await settleBackgroundWork();
    expect(registry.status(running.job.jobId)).toMatchObject({
      state: 'running',
      attemptCount: 1,
    });

    registry.shutdown('plugin-unload');
    finish?.();
    await settleBackgroundWork();

    expect(childRun).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(registry.status()).toEqual([
      expect.objectContaining({
        jobId: running.job.jobId,
        kind: 'startup-storage-maintenance',
        state: 'canceled',
        reason: 'plugin-unload',
      }),
      expect.objectContaining({
        kind: 'review-truth-flush',
        state: 'deferred',
        reason: 'plugin-unload',
        lastError: 'BACKGROUND_WORK_REGISTRY_SHUTDOWN',
      }),
    ]);
  });

  it('shutdown rejects failed-job retry without scheduling duplicate execution', async () => {
    const scheduled: Array<() => void> = [];
    const retryRun = vi.fn(async () => undefined);
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (start) => scheduled.push(start),
    });
    const failed = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => {
        throw new Error('startup maintenance failed');
      },
    });
    scheduled[0]?.();
    await settleBackgroundWork();
    expect(registry.status(failed.job.jobId)).toMatchObject({
      state: 'failed',
      attemptCount: 1,
    });

    registry.shutdown('plugin-unload');
    const retry = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      retry: true,
      diagnostics: { reason: 'manual-retry' },
      run: retryRun,
    });

    expect(retry).toMatchObject({
      accepted: false,
      job: {
        kind: 'startup-storage-maintenance',
        state: 'deferred',
        reason: 'plugin-unload',
        lastError: 'BACKGROUND_WORK_REGISTRY_SHUTDOWN',
      },
    });
    expect(retryRun).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
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

});
