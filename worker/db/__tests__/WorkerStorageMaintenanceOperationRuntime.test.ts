import { describe, expect, it } from 'vitest';
import {
  WorkerStorageMaintenanceOperationRuntime,
  type WorkerStorageMaintenanceOperationRecord,
  type WorkerStorageMaintenancePersistence,
} from '../WorkerStorageMaintenanceOperationRuntime';

class MemoryMaintenancePersistence implements WorkerStorageMaintenancePersistence {
  readonly records = new Map<string, WorkerStorageMaintenanceOperationRecord>();
  readonly migrations = new Set<string>();

  read(operationId: string): WorkerStorageMaintenanceOperationRecord | null {
    return this.records.get(operationId) ?? null;
  }

  write(record: WorkerStorageMaintenanceOperationRecord): void {
    this.records.set(record.operationId, structuredClone(record));
  }

  hasMigration(migrationId: string): boolean {
    return this.migrations.has(migrationId);
  }

  markMigration(migrationId: string): void {
    this.migrations.add(migrationId);
  }
}

describe('WorkerStorageMaintenanceOperationRuntime', () => {
  it('reports migration completion without creating a maintenance operation', () => {
    const persistence = new MemoryMaintenancePersistence();
    persistence.markMigration('legacy-import-v1');
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);

    expect(runtime.status({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
    })).toEqual({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      required: false,
      status: 'completed',
      completedBatches: 0,
      totalBatches: null,
      lastMutationId: null,
      completedAt: null,
      error: null,
    });
    expect(persistence.records.size).toBe(0);
  });

  it('runs bounded batches with stable mutation ids and persists completion', async () => {
    const persistence = new MemoryMaintenancePersistence();
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);
    const seen: string[] = [];

    const result = await runtime.run({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      totalBatches: 3,
      executeBatch: async ({ batchIndex, mutationId }) => {
        seen.push(`${batchIndex}:${mutationId}`);
      },
    });

    expect(seen).toEqual([
      '0:maintenance:legacy-import-v1:batch:0',
      '1:maintenance:legacy-import-v1:batch:1',
      '2:maintenance:legacy-import-v1:batch:2',
    ]);
    expect(result).toMatchObject({
      status: 'completed',
      completedBatches: 3,
      totalBatches: 3,
      lastMutationId: 'maintenance:legacy-import-v1:batch:2',
      error: null,
    });
    expect(persistence.hasMigration('legacy-import-v1')).toBe(true);
  });

  it('resumes after persisted failed progress without rerunning completed batches', async () => {
    const persistence = new MemoryMaintenancePersistence();
    persistence.write({
      version: 1,
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      status: 'failed',
      completedBatches: 2,
      totalBatches: 4,
      lastMutationId: 'maintenance:legacy-import-v1:batch:1',
      startedAt: 100,
      updatedAt: 200,
      completedAt: null,
      error: 'interrupted',
    });
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);
    const seen: number[] = [];

    const result = await runtime.run({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      totalBatches: 4,
      executeBatch: async ({ batchIndex }) => {
        seen.push(batchIndex);
      },
    });

    expect(seen).toEqual([2, 3]);
    expect(result.status).toBe('completed');
    expect(result.completedBatches).toBe(4);
  });

  it('persists failed diagnostics and retries the failed batch', async () => {
    const persistence = new MemoryMaintenancePersistence();
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);

    await expect(runtime.run({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      totalBatches: 2,
      executeBatch: async ({ batchIndex }) => {
        if (batchIndex === 1) {
          throw new Error('disk full');
        }
      },
    })).rejects.toThrow('disk full');

    expect(persistence.read('legacy-import-v1')).toMatchObject({
      status: 'failed',
      completedBatches: 1,
      lastMutationId: 'maintenance:legacy-import-v1:batch:1',
      error: 'disk full',
    });

    const retried: number[] = [];
    const result = await runtime.run({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      totalBatches: 2,
      executeBatch: async ({ batchIndex }) => {
        retried.push(batchIndex);
      },
    });

    expect(retried).toEqual([1]);
    expect(result.status).toBe('completed');
  });

  it('keeps timed-out apply batches non-terminal and retries without duplicating committed batches', async () => {
    const persistence = new MemoryMaintenancePersistence();
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);
    const committed: number[] = [];

    await expect(runtime.run({
      operationId: 'startup-maintenance-timeout',
      migrationId: 'startup-maintenance-timeout',
      totalBatches: 2,
      executeBatch: async ({ batchIndex }) => {
        if (batchIndex === 1) {
          throw new Error('BACKEND_UNAVAILABLE: storage.maintenance.applyBatch timed out');
        }
        committed.push(batchIndex);
      },
    })).rejects.toThrow('storage.maintenance.applyBatch timed out');

    expect(committed).toEqual([0]);
    expect(persistence.hasMigration('startup-maintenance-timeout')).toBe(false);
    expect(persistence.read('startup-maintenance-timeout')).toMatchObject({
      status: 'failed',
      completedBatches: 1,
      completedAt: null,
      error: 'BACKEND_UNAVAILABLE: storage.maintenance.applyBatch timed out',
    });

    const result = await runtime.run({
      operationId: 'startup-maintenance-timeout',
      migrationId: 'startup-maintenance-timeout',
      totalBatches: 2,
      executeBatch: async ({ batchIndex }) => {
        committed.push(batchIndex);
      },
    });

    expect(committed).toEqual([0, 1]);
    expect(result).toMatchObject({
      status: 'completed',
      completedBatches: 2,
      lastMutationId: 'maintenance:startup-maintenance-timeout:batch:1',
      error: null,
    });
    expect(persistence.hasMigration('startup-maintenance-timeout')).toBe(true);
  });

  it('skips execution when migration marker already exists', async () => {
    const persistence = new MemoryMaintenancePersistence();
    persistence.markMigration('legacy-import-v1');
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);
    let calls = 0;

    const result = await runtime.run({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      totalBatches: 5,
      executeBatch: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('completed');
    expect(result.completedBatches).toBe(5);
  });

  it('applies one supplied batch and rejects out-of-order delivery', async () => {
    const persistence = new MemoryMaintenancePersistence();
    const runtime = new WorkerStorageMaintenanceOperationRuntime(persistence);

    await expect(runtime.applyBatch({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      batchIndex: 1,
      totalBatches: 2,
      executeBatch: async () => undefined,
    })).rejects.toThrow('STORAGE_MAINTENANCE_OUT_OF_ORDER');

    const first = await runtime.applyBatch({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      batchIndex: 0,
      totalBatches: 2,
      executeBatch: async () => undefined,
    });
    const duplicate = await runtime.applyBatch({
      operationId: 'legacy-import-v1',
      migrationId: 'legacy-import-v1',
      batchIndex: 0,
      totalBatches: 2,
      executeBatch: async () => {
        throw new Error('duplicate must not execute');
      },
    });

    expect(first.completedBatches).toBe(1);
    expect(duplicate.completedBatches).toBe(1);
  });
});
