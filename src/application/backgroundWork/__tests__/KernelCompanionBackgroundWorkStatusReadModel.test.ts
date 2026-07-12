import { describe, expect, it } from 'vitest';

import { KernelCompanionBackgroundWorkRegistry } from '../KernelCompanionBackgroundWorkRegistry';
import { KernelCompanionBackgroundWorkStatusReadModel } from '../KernelCompanionBackgroundWorkStatusReadModel';

async function settleBackgroundWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('KernelCompanionBackgroundWorkStatusReadModel', () => {
  it('reports normalized status across current background work kinds', async () => {
    const scheduled: Array<() => void> = [];
    let now = 1_700_000_000_000;
    const registry = new KernelCompanionBackgroundWorkRegistry({
      now: () => now += 1,
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);

    registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: {
        reason: 'startup',
        pendingRows: 4,
        segmentPaths: ['truth/review-events/device-a/seg-1.msgpack'],
      },
      run: async () => ({
        diagnostics: {
          recordsWritten: 4,
          idempotencyDuplicateSkipped: 0,
        },
      }),
    });
    registry.submit({
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
    for (const run of scheduled) {
      run();
    }
    await settleBackgroundWork();

    expect(status.list()).toEqual([
      expect.objectContaining({
        kind: 'kernel-transaction-action-polling',
        state: 'completed',
        reason: 'timer',
        attemptCount: 1,
        terminalAt: expect.any(Number),
        diagnostics: expect.objectContaining({
          status: 'empty',
          actionCount: 0,
          remainingActions: 0,
          maxActionsPerPoll: 8,
        }),
      }),
      expect.objectContaining({
        kind: 'review-truth-backfill',
        state: 'completed',
        reason: 'startup',
        attemptCount: 1,
        terminalAt: expect.any(Number),
        diagnostics: expect.objectContaining({
          pendingRows: 4,
          recordsWritten: 4,
          idempotencyDuplicateSkipped: 0,
          segmentPaths: '[redacted]',
        }),
      }),
    ]);
  });

  it('reports startup storage maintenance owned phases without Review truth scheduling claims', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);

    const job = registry.submit({
      kind: 'startup-storage-maintenance',
      diagnostics: {
        reason: 'plugin.onload-ready',
        deferredDescriptorCount: 1,
        deferredDescriptorKinds: 'startup-storage-maintenance',
      },
      run: async () => ({
        diagnostics: {
          operationId: 'startup-storage-maintenance-v1',
          ownedPhaseCount: 2,
          scheduleNormalizationPhase: 'completed',
          scheduleAffectedCardCount: 3,
          scheduleCompletedBatches: 1,
          orphanCardRepairPhase: 'completed',
          orphanDiscoveredCardCount: 2,
          orphanRepairedCardCount: 2,
          orphanCompletedBatches: 1,
          reviewTruthMaintenanceScheduled: true,
        },
      }),
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(status.get(job.job.jobId)).toMatchObject({
      kind: 'startup-storage-maintenance',
      state: 'completed',
      diagnostics: {
        reason: 'plugin.onload-ready',
        deferredDescriptorCount: 1,
        deferredDescriptorKinds: 'startup-storage-maintenance',
        operationId: 'startup-storage-maintenance-v1',
        ownedPhaseCount: 2,
        scheduleNormalizationPhase: 'completed',
        scheduleAffectedCardCount: 3,
        scheduleCompletedBatches: 1,
        orphanCardRepairPhase: 'completed',
        orphanDiscoveredCardCount: 2,
        orphanRepairedCardCount: 2,
        orphanCompletedBatches: 1,
        reviewTruthMaintenanceScheduled: '[redacted]',
      },
    });
  });

  it('reports dedupe and coalescing evidence without exposing raw lifecycle keys', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const dedupeKey = 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A';

    const first = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey,
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => undefined,
    });
    const duplicate = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey,
      diagnostics: { reason: 'post-ready-reload' },
      run: async () => undefined,
    });
    const changedFrontier = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-B',
      diagnostics: { reason: 'post-ready-reload' },
      run: async () => undefined,
    });

    expect(duplicate.coalesced).toBe(true);
    const firstStatus = status.get(first.job.jobId);
    const changedStatus = status.get(changedFrontier.job.jobId);

    expect(status.list({ kind: 'startup-storage-maintenance' })).toHaveLength(2);
    expect(firstStatus).toMatchObject({
      coalescedSubmissionCount: 1,
      skippedSubmissionCount: 0,
      dedupeKeyDigest: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/),
    });
    expect(firstStatus).not.toHaveProperty('dedupeKey');
    expect(firstStatus?.dedupeKeyDigest).not.toContain('runtime-A');
    expect(firstStatus?.dedupeKeyDigest).not.toContain('plugin-A');
    expect(firstStatus?.dedupeKeyDigest).not.toContain('epoch-A');
    expect(changedStatus?.dedupeKeyDigest).toEqual(expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/));
    expect(changedStatus?.dedupeKeyDigest).not.toBe(firstStatus?.dedupeKeyDigest);
    expect(scheduled).toHaveLength(2);
  });

  it('reports skipped terminal evidence for unchanged completed lifecycle work', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const dedupeKey = 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A';
    const first = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey,
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => ({ diagnostics: { operationId: 'startup-storage-maintenance-v1' } }),
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    const duplicate = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey,
      diagnostics: { reason: 'warm-restart' },
      run: async () => undefined,
    });

    expect(duplicate.skipped).toBe(true);
    expect(status.get(first.job.jobId)).toMatchObject({
      state: 'completed',
      skippedSubmissionCount: 1,
      coalescedSubmissionCount: 0,
      diagnostics: {
        reason: 'plugin.onload-ready',
        operationId: 'startup-storage-maintenance-v1',
      },
    });
    expect(scheduled).toHaveLength(1);
  });

  it('reports parent child references without treating child submission as completion', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const child = registry.submit({
      kind: 'review-truth-flush',
      dedupeKey: 'review-truth-flush-lifecycle-v1:device-A:epoch-A:review-events-v1',
      diagnostics: { reason: 'startup', delayMs: 50 },
      run: async () => new Promise(() => undefined),
    });
    const parent = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => ({
        state: 'deferred',
        reason: 'waiting-for-child',
        diagnostics: {
          childJobId: child.job.jobId,
          childWorkKind: 'review-truth-flush',
          childState: 'running',
          waitingForChild: true,
        },
      }),
    });

    scheduled[0]?.();
    scheduled[1]?.();
    await settleBackgroundWork();

    expect(status.get(parent.job.jobId)).toMatchObject({
      kind: 'startup-storage-maintenance',
      state: 'deferred',
      reason: 'waiting-for-child',
      diagnostics: {
        childJobId: child.job.jobId,
        childWorkKind: 'review-truth-flush',
        childState: 'running',
        waitingForChild: true,
      },
    });
  });

  it('reports shutdown-settled lifecycle state with terminal time and safe reason', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const queued = registry.submit({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:runtime-A:plugin-A:epoch-A:frontier-A',
      diagnostics: { reason: 'plugin.onload-ready' },
      run: async () => undefined,
    });

    registry.shutdown('plugin-unload');
    scheduled[0]?.();
    await settleBackgroundWork();

    expect(status.get(queued.job.jobId)).toMatchObject({
      state: 'deferred',
      reason: 'plugin-unload',
      attemptCount: 0,
      terminalAt: expect.any(Number),
      dedupeKeyDigest: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/),
      diagnostics: {
        reason: 'plugin.onload-ready',
      },
    });
  });


  it('filters by kind with stable newest-first ordering', () => {
    const scheduled: Array<() => void> = [];
    let now = 1_700_000_000_000;
    const registry = new KernelCompanionBackgroundWorkRegistry({
      now: () => now += 1,
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);

    const olderReview = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 1 },
      run: async () => undefined,
    });
    registry.submit({
      kind: 'kernel-transaction-action-polling',
      diagnostics: { status: 'empty' },
      run: async () => undefined,
    });
    const newerReview = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: { pendingRows: 2 },
      run: async () => undefined,
    });

    expect(status.list({ kind: 'review-truth-backfill' }).map((job) => job.jobId)).toEqual([
      newerReview.job.jobId,
      olderReview.job.jobId,
    ]);
  });

  it('does not mutate registry lifecycle state during status reads', async () => {
    const scheduled: Array<() => void> = [];
    let finish: ((value: unknown) => void) | null = null;
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const running = registry.submit({
      kind: 'kernel-transaction-action-polling',
      diagnostics: { reason: 'timer' },
      run: async () => new Promise((resolve) => {
        finish = resolve;
      }),
    });

    scheduled[0]?.();
    await settleBackgroundWork();
    const beforeRead = registry.status(running.job.jobId);
    expect(status.list()).toEqual([
      expect.objectContaining({
        jobId: running.job.jobId,
        state: 'running',
        attemptCount: 1,
      }),
    ]);
    expect(registry.status(running.job.jobId)).toEqual(beforeRead);

    finish?.({ diagnostics: { status: 'empty' } });
    await settleBackgroundWork();
  });

  it('reports terminal failure with safe diagnostics and last error', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const failed = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: {
        reason: 'startup',
        pendingRows: 2,
      },
      run: async () => {
        throw new Error('truth backfill failed');
      },
    });

    scheduled[0]?.();
    await settleBackgroundWork();

    expect(status.get(failed.job.jobId)).toMatchObject({
      kind: 'review-truth-backfill',
      state: 'failed',
      reason: 'startup',
      attemptCount: 1,
      lastError: 'truth backfill failed',
      diagnostics: {
        reason: 'startup',
        pendingRows: 2,
      },
    });
  });

  it('redacts content-bearing or structured diagnostic values', () => {
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: () => undefined,
    });
    const status = new KernelCompanionBackgroundWorkStatusReadModel(registry);
    const job = registry.submit({
      kind: 'review-truth-backfill',
      diagnostics: {
        reason: 'startup',
        recordsWritten: 7,
        safeScalarEvidence: 'kept',
        cardContent: 'private card content',
        blockText: 'private block text',
        sqlPayload: 'select * from blocks',
        requestBody: { id: 'private-host-effect' },
        nestedEvidence: { count: 1 },
        unknownArray: ['private'],
      },
      run: async () => undefined,
    });

    expect(status.get(job.job.jobId)).toMatchObject({
      diagnostics: {
        reason: 'startup',
        recordsWritten: 7,
        safeScalarEvidence: 'kept',
        cardContent: '[redacted]',
        blockText: '[redacted]',
        sqlPayload: '[redacted]',
        requestBody: '[redacted]',
        nestedEvidence: '[redacted]',
        unknownArray: '[redacted]',
      },
    });
  });

  it('exposes only read methods on the status interface', () => {
    const status = new KernelCompanionBackgroundWorkStatusReadModel(new KernelCompanionBackgroundWorkRegistry());

    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(status)).sort()).toEqual([
      'constructor',
      'get',
      'list',
    ]);
    expect('submit' in status).toBe(false);
    expect('cancel' in status).toBe(false);
    expect('defer' in status).toBe(false);
    expect('shutdown' in status).toBe(false);
  });
});
