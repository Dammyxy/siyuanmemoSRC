import { describe, expect, it, vi } from 'vitest';
import type { KernelCompanionBackgroundWorkRunContext } from '@/application/backgroundWork/KernelCompanionBackgroundWorkRegistry';
import { XiuyuanStartupSyncLifecycle } from '../XiuyuanStartupSyncLifecycle';

function createRunContext(isCanceled: () => boolean): KernelCompanionBackgroundWorkRunContext {
  return {
    jobId: 'xiuyuan-startup-sync-test',
    kind: 'xiuyuan-startup-sync',
    isCanceled,
  };
}

describe('XiuyuanStartupSyncLifecycle', () => {
  it('records staged diagnostics through checkpoint completion', async () => {
    const lifecycle = new XiuyuanStartupSyncLifecycle();
    const result = await lifecycle.run({
      context: createRunContext(() => false),
      syncType: 'incremental',
      phases: {
        scan: vi.fn(async () => ({ diagnostics: { scannedCount: 2 } })),
        plan: vi.fn(async () => ({ diagnostics: { plannedCreateCount: 1 } })),
        apply: vi.fn(async () => ({ diagnostics: { appliedCount: 1 } })),
        checkpoint: vi.fn(async () => ({
          result: {
            success: true,
            addedCount: 1,
            updatedCount: 0,
            deletedCount: 0,
            skippedCount: 1,
            detectedCount: 0,
          },
        })),
      },
    });

    expect(result).toMatchObject({
      diagnostics: {
        status: 'completed',
        latestCompletedPhase: 'checkpoint',
        scannedCount: 2,
        plannedCreateCount: 1,
        appliedCount: 1,
        addedCount: 1,
        skippedCount: 1,
      },
    });
  });

  it('stops before planning when canceled after scan', async () => {
    let canceled = false;
    const lifecycle = new XiuyuanStartupSyncLifecycle();
    const plan = vi.fn();
    const apply = vi.fn();

    const result = await lifecycle.run({
      context: createRunContext(() => canceled),
      syncType: 'full',
      phases: {
        scan: vi.fn(async () => {
          canceled = true;
          return { diagnostics: { scannedCount: 3 } };
        }),
        plan,
        apply,
        checkpoint: vi.fn(),
      },
    });

    expect(plan).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: 'canceled',
      reason: 'startup-sync-canceled-before-plan',
      diagnostics: {
        status: 'canceled',
        latestCompletedPhase: 'scan',
        scannedCount: 3,
      },
    });
  });

  it('stops before apply when canceled after planning', async () => {
    let canceled = false;
    const lifecycle = new XiuyuanStartupSyncLifecycle();
    const apply = vi.fn();

    const result = await lifecycle.run({
      context: createRunContext(() => canceled),
      syncType: 'full',
      phases: {
        scan: vi.fn(async () => ({ diagnostics: { scannedCount: 3 } })),
        plan: vi.fn(async () => {
          canceled = true;
          return { diagnostics: { plannedCreateCount: 2 } };
        }),
        apply,
        checkpoint: vi.fn(),
      },
    });

    expect(apply).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: 'canceled',
      reason: 'startup-sync-canceled-before-apply',
      diagnostics: {
        status: 'canceled',
        latestCompletedPhase: 'plan',
        plannedCreateCount: 2,
      },
    });
  });
});
