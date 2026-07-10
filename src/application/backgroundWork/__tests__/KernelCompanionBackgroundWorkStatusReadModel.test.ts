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
