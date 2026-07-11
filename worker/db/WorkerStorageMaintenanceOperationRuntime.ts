export const WORKER_STORAGE_MAINTENANCE_OPERATION_VERSION = 1 as const;

export type WorkerStorageMaintenanceOperationStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface WorkerStorageMaintenanceOperationRecord {
  version: typeof WORKER_STORAGE_MAINTENANCE_OPERATION_VERSION;
  operationId: string;
  migrationId: string;
  status: WorkerStorageMaintenanceOperationStatus;
  completedBatches: number;
  totalBatches: number;
  lastMutationId: string | null;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  error: string | null;
}

export interface WorkerStorageMaintenanceOperationStatusRecord {
  operationId: string;
  migrationId: string;
  required: boolean;
  status: WorkerStorageMaintenanceOperationStatus;
  completedBatches: number;
  totalBatches: number | null;
  lastMutationId: string | null;
  completedAt: number | null;
  error: string | null;
}

export interface WorkerStorageMaintenancePersistence {
  read(operationId: string): WorkerStorageMaintenanceOperationRecord | null;
  write(record: WorkerStorageMaintenanceOperationRecord): void | Promise<void>;
  hasMigration(migrationId: string): boolean;
  markMigration(migrationId: string, appliedAt?: number): void | Promise<void>;
  commitBatch?(
    record: WorkerStorageMaintenanceOperationRecord,
    executeBatch: () => void | Promise<void>,
    appliedAt: number | null,
  ): void | Promise<void>;
}

export interface WorkerStorageMaintenanceSqlDatabase {
  run(sql: string, params?: unknown[]): unknown;
  getOne<T>(sql: string, params?: unknown[]): T | undefined;
  hasMigration(migrationId: string): boolean;
  markMigration(migrationId: string, appliedAt?: number): void;
  runTransaction<T>(
    label: string,
    writer: () => T | Promise<T>,
    options?: { persist?: boolean },
  ): Promise<T>;
}

export class SqliteWorkerStorageMaintenancePersistence
implements WorkerStorageMaintenancePersistence {
  constructor(private readonly database: WorkerStorageMaintenanceSqlDatabase) {}

  ensureSchema(): void {
    this.database.run(`
      CREATE TABLE IF NOT EXISTS storage_maintenance_operations (
        operation_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        migration_id TEXT NOT NULL,
        status TEXT NOT NULL,
        completed_batches INTEGER NOT NULL,
        total_batches INTEGER NOT NULL,
        last_mutation_id TEXT,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        error TEXT
      )
    `);
  }

  read(operationId: string): WorkerStorageMaintenanceOperationRecord | null {
    const row = this.database.getOne<{
      operation_id: string;
      version: number;
      migration_id: string;
      status: WorkerStorageMaintenanceOperationStatus;
      completed_batches: number;
      total_batches: number;
      last_mutation_id: string | null;
      started_at: number;
      updated_at: number;
      completed_at: number | null;
      error: string | null;
    }>(
      `SELECT operation_id, version, migration_id, status, completed_batches,
              total_batches, last_mutation_id, started_at, updated_at,
              completed_at, error
         FROM storage_maintenance_operations
        WHERE operation_id = ?
        LIMIT 1`,
      [operationId],
    );
    if (!row) {
      return null;
    }
    if (row.version !== WORKER_STORAGE_MAINTENANCE_OPERATION_VERSION) {
      throw new Error(
        `STORAGE_MAINTENANCE_UNSUPPORTED_VERSION: ${row.operation_id} version ${row.version}`,
      );
    }
    return {
      version: WORKER_STORAGE_MAINTENANCE_OPERATION_VERSION,
      operationId: row.operation_id,
      migrationId: row.migration_id,
      status: row.status,
      completedBatches: row.completed_batches,
      totalBatches: row.total_batches,
      lastMutationId: row.last_mutation_id,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      error: row.error,
    };
  }

  async write(record: WorkerStorageMaintenanceOperationRecord): Promise<void> {
    await this.database.runTransaction('storage.maintenance.progress', () => {
      this.writeInCurrentTransaction(record);
    }, { persist: true });
  }

  hasMigration(migrationId: string): boolean {
    return this.database.hasMigration(migrationId);
  }

  markMigration(migrationId: string, appliedAt?: number): void {
    this.database.markMigration(migrationId, appliedAt);
  }

  async commitBatch(
    record: WorkerStorageMaintenanceOperationRecord,
    executeBatch: () => void | Promise<void>,
    appliedAt: number | null,
  ): Promise<void> {
    await this.database.runTransaction('storage.maintenance.batch', async () => {
      await executeBatch();
      this.writeInCurrentTransaction(record);
      if (appliedAt !== null) {
        this.database.markMigration(record.migrationId, appliedAt);
      }
    }, { persist: true });
  }

  private writeInCurrentTransaction(record: WorkerStorageMaintenanceOperationRecord): void {
    this.database.run(
      `INSERT OR REPLACE INTO storage_maintenance_operations (
        operation_id, version, migration_id, status, completed_batches,
        total_batches, last_mutation_id, started_at, updated_at, completed_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.operationId,
        record.version,
        record.migrationId,
        record.status,
        record.completedBatches,
        record.totalBatches,
        record.lastMutationId,
        record.startedAt,
        record.updatedAt,
        record.completedAt,
        record.error,
      ],
    );
  }
}

export interface WorkerStorageMaintenanceBatchContext {
  operationId: string;
  migrationId: string;
  batchIndex: number;
  totalBatches: number;
  mutationId: string;
}

export interface WorkerStorageMaintenanceRunOptions {
  operationId: string;
  migrationId: string;
  totalBatches: number;
  executeBatch(context: WorkerStorageMaintenanceBatchContext): void | Promise<void>;
  now?: () => number;
}

export interface WorkerStorageMaintenanceApplyBatchOptions
extends Omit<WorkerStorageMaintenanceRunOptions, 'executeBatch'> {
  batchIndex: number;
  executeBatch(context: WorkerStorageMaintenanceBatchContext): void | Promise<void>;
}

export class WorkerStorageMaintenanceOperationRuntime {
  constructor(private readonly persistence: WorkerStorageMaintenancePersistence) {}

  status(options: {
    operationId: string;
    migrationId: string;
  }): WorkerStorageMaintenanceOperationStatusRecord {
    const operationId = requireIdentifier(options.operationId, 'operationId');
    const migrationId = requireIdentifier(options.migrationId, 'migrationId');
    const existing = this.persistence.read(operationId);
    if (existing && existing.migrationId !== migrationId) {
      throw new Error(`STORAGE_MAINTENANCE_CONFLICT: ${operationId} migrationId changed`);
    }
    if (this.persistence.hasMigration(migrationId)) {
      return {
        operationId,
        migrationId,
        required: false,
        status: 'completed',
        completedBatches: existing?.totalBatches ?? 0,
        totalBatches: existing?.totalBatches ?? null,
        lastMutationId: existing?.lastMutationId ?? null,
        completedAt: existing?.completedAt ?? null,
        error: null,
      };
    }
    if (existing) {
      return {
        operationId,
        migrationId,
        required: true,
        status: existing.status,
        completedBatches: existing.completedBatches,
        totalBatches: existing.totalBatches,
        lastMutationId: existing.lastMutationId,
        completedAt: existing.completedAt,
        error: existing.error,
      };
    }
    return {
      operationId,
      migrationId,
      required: true,
      status: 'pending',
      completedBatches: 0,
      totalBatches: null,
      lastMutationId: null,
      completedAt: null,
      error: null,
    };
  }

  async run(
    options: WorkerStorageMaintenanceRunOptions,
  ): Promise<WorkerStorageMaintenanceOperationRecord> {
    let record = this.readOrCreateRecord(options);
    if (this.persistence.hasMigration(record.migrationId)) {
      return record.status === 'completed'
        ? record
        : completedRecord(record, options.now ?? Date.now);
    }
    for (
      let batchIndex = record.completedBatches;
      batchIndex < record.totalBatches;
      batchIndex += 1
    ) {
      record = await this.applyBatch({
        ...options,
        batchIndex,
      });
    }
    return record;
  }

  async applyBatch(
    options: WorkerStorageMaintenanceApplyBatchOptions,
  ): Promise<WorkerStorageMaintenanceOperationRecord> {
    const now = options.now ?? Date.now;
    const current = this.readOrCreateRecord(options);
    const batchIndex = normalizeBatchIndex(options.batchIndex, current.totalBatches);
    if (this.persistence.hasMigration(current.migrationId)) {
      return current.status === 'completed' ? current : completedRecord(current, now);
    }
    if (batchIndex < current.completedBatches) {
      return current;
    }
    if (batchIndex > current.completedBatches) {
      throw new Error(
        `STORAGE_MAINTENANCE_OUT_OF_ORDER: ${current.operationId} expected batch ${current.completedBatches}, received ${batchIndex}`,
      );
    }

    const mutationId = createMaintenanceMutationId(current.operationId, batchIndex);
    const completedAt = batchIndex + 1 === current.totalBatches ? now() : null;
    const next: WorkerStorageMaintenanceOperationRecord = {
      ...current,
      status: completedAt === null ? 'running' : 'completed',
      completedBatches: batchIndex + 1,
      lastMutationId: mutationId,
      updatedAt: completedAt ?? now(),
      completedAt,
      error: null,
    };
    const context: WorkerStorageMaintenanceBatchContext = {
      operationId: current.operationId,
      migrationId: current.migrationId,
      batchIndex,
      totalBatches: current.totalBatches,
      mutationId,
    };
    try {
      if (this.persistence.commitBatch) {
        await this.persistence.commitBatch(
          next,
          () => options.executeBatch(context),
          completedAt,
        );
      } else {
        await options.executeBatch(context);
        await this.persistence.write(next);
        if (completedAt !== null) {
          await this.persistence.markMigration(current.migrationId, completedAt);
        }
      }
      return next;
    } catch (error) {
      await this.persistence.write({
        ...current,
        status: 'failed',
        lastMutationId: mutationId,
        updatedAt: now(),
        completedAt: null,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private readOrCreateRecord(
    options: Pick<
      WorkerStorageMaintenanceRunOptions,
      'operationId' | 'migrationId' | 'totalBatches' | 'now'
    >,
  ): WorkerStorageMaintenanceOperationRecord {
    const operationId = requireIdentifier(options.operationId, 'operationId');
    const migrationId = requireIdentifier(options.migrationId, 'migrationId');
    const totalBatches = normalizeBatchCount(options.totalBatches);
    const now = options.now ?? Date.now;
    const existing = this.persistence.read(operationId);
    if (existing && existing.migrationId !== migrationId) {
      throw new Error(`STORAGE_MAINTENANCE_CONFLICT: ${operationId} migrationId changed`);
    }
    if (existing && existing.totalBatches !== totalBatches) {
      throw new Error(`STORAGE_MAINTENANCE_CONFLICT: ${operationId} totalBatches changed`);
    }
    return existing ?? {
      version: WORKER_STORAGE_MAINTENANCE_OPERATION_VERSION,
      operationId,
      migrationId,
      status: 'pending',
      completedBatches: 0,
      totalBatches,
      lastMutationId: null,
      startedAt: now(),
      updatedAt: now(),
      completedAt: null,
      error: null,
    };
  }
}

export function createMaintenanceMutationId(operationId: string, batchIndex: number): string {
  return `maintenance:${operationId}:batch:${batchIndex}`;
}

function completedRecord(
  record: WorkerStorageMaintenanceOperationRecord,
  now: () => number,
): WorkerStorageMaintenanceOperationRecord {
  const completedAt = record.completedAt ?? now();
  return {
    ...record,
    status: 'completed',
    completedBatches: record.totalBatches,
    updatedAt: completedAt,
    completedAt,
    error: null,
  };
}

function requireIdentifier(value: string, field: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`INVALID_REQUEST: storage maintenance requires ${field}`);
  }
  return normalized;
}

function normalizeBatchCount(value: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error('INVALID_REQUEST: storage maintenance totalBatches must be positive');
  }
  return normalized;
}

function normalizeBatchIndex(value: number, totalBatches: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0 || normalized >= totalBatches) {
    throw new Error('INVALID_REQUEST: storage maintenance batchIndex is out of range');
  }
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
