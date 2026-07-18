import { describe, expect, it, vi } from 'vitest';
import type { StorageInventoryMetric, StorageInventoryRecord } from '../../../packages/contracts/src/backend-rpc';
import {
  classifyWorkerStoragePressure,
  type WorkerStorageBudgetPolicy,
} from '../WorkerStoragePressureClassifier';
import { WorkerStoragePressureAdmissionModule } from '../WorkerStoragePressureAdmissionModule';

const identity = {
  deviceId: 'device-pressure-test',
  identityEpoch: 'epoch-pressure-test',
};

function metric(
  family: string,
  overrides: Partial<StorageInventoryMetric> = {},
): StorageInventoryMetric {
  return {
    family,
    ...identity,
    files: 0,
    bytes: 0,
    oldestAgeMs: null,
    generationCount: 0,
    currentGenerationId: null,
    previousGenerationId: null,
    uncoveredMutationCount: 0,
    compactionStatus: 'idle',
    ...overrides,
  };
}

function inventory(
  metrics: StorageInventoryMetric[],
  measuredAt = 1_700_000_000_000,
  policies: readonly WorkerStorageBudgetPolicy[] = [{
    family: 'sqlite-delta',
    files: { target: 0, soft: 2, high: 3, hard: 4 },
    bytes: { target: 0, soft: 2_000, high: 3_000, hard: 4_000 },
  }],
): StorageInventoryRecord {
  return {
    version: 1,
    measuredAt,
    metrics,
    pressure: classifyWorkerStoragePressure(metrics, measuredAt, policies),
  };
}

describe('WorkerStoragePressureAdmissionModule', () => {
  it('establishes an exact normal baseline and admits without recollecting', async () => {
    const exact = inventory([
      metric('sqlite-delta'),
      metric('temporary-sqlite-projection', { files: 1, bytes: 500, compactionStatus: 'not-applicable' }),
    ]);
    const collectExactInventory = vi.fn(async () => exact);
    const admission = new WorkerStoragePressureAdmissionModule({ collectExactInventory });

    await admission.refreshExact();

    expect(admission.decide()).toMatchObject({ kind: 'allow', level: 'normal', exact: true });
    expect(admission.currentInventory()).toEqual(exact);
    expect(collectExactInventory).toHaveBeenCalledTimes(1);
  });

  it('reclassifies append evidence in memory and conservatively grows projection bytes', async () => {
    const policies: readonly WorkerStorageBudgetPolicy[] = [{
      family: 'sqlite-delta',
      files: { target: 0, soft: 1, high: 2, hard: 3 },
      bytes: { target: 0, soft: 1_000, high: 2_000, hard: 3_000 },
    }];
    const collectExactInventory = vi.fn(async () => inventory([
      metric('sqlite-delta'),
      metric('temporary-sqlite-projection', { files: 1, bytes: 500, compactionStatus: 'not-applicable' }),
    ], 1_700_000_000_000, policies));
    const admission = new WorkerStoragePressureAdmissionModule({
      collectExactInventory,
      budgetPolicies: policies,
      now: () => 1_700_000_000_100,
    });
    await admission.refreshExact();

    admission.observeJournaledDelta({
      files: 1,
      entries: 1,
      bytes: 1_100,
      oldestCreatedAt: 1_700_000_000_050,
      entryByteEstimate: 600,
    });

    expect(admission.decide()).toMatchObject({ kind: 'refresh-background', level: 'soft', exact: false });
    expect(admission.currentInventory()?.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'sqlite-delta', files: 1, bytes: 1_100, oldestAgeMs: 50 }),
      expect.objectContaining({ family: 'temporary-sqlite-projection', bytes: 1_100 }),
    ]));
    expect(collectExactInventory).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent exact refreshes', async () => {
    let resolveInventory!: (value: StorageInventoryRecord) => void;
    const pending = new Promise<StorageInventoryRecord>((resolve) => {
      resolveInventory = resolve;
    });
    const collectExactInventory = vi.fn(() => pending);
    const admission = new WorkerStoragePressureAdmissionModule({ collectExactInventory });

    const first = admission.refreshExact();
    const second = admission.refreshExact();
    resolveInventory(inventory([metric('sqlite-delta')]));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(collectExactInventory).toHaveBeenCalledTimes(1);
  });

  it('retains hard blocking evidence until an exact lower-pressure refresh', async () => {
    const policies: readonly WorkerStorageBudgetPolicy[] = [{
      family: 'sqlite-delta',
      files: { target: 0, soft: 1, high: 1, hard: 1 },
    }];
    const hard = inventory([metric('sqlite-delta', { files: 1 })], 1_700_000_000_000, policies);
    const normal = inventory([metric('sqlite-delta', { files: 0 })], 1_700_000_000_100, policies);
    const collectExactInventory = vi.fn()
      .mockResolvedValueOnce(hard)
      .mockResolvedValueOnce(normal);
    const admission = new WorkerStoragePressureAdmissionModule({
      collectExactInventory,
      budgetPolicies: policies,
    });

    await admission.refreshExact();
    admission.block('hard pressure remains after maintenance');

    expect(admission.currentInventory()?.pressure).toMatchObject({
      level: 'hard',
      blockingMutationGrowth: true,
      code: 'STORAGE_PRESSURE',
      reason: 'hard pressure remains after maintenance',
    });

    await admission.refreshExact();
    expect(admission.decide()).toMatchObject({ kind: 'allow', level: 'normal', exact: true });
    expect(admission.blockReason()).toBeNull();
  });
});
