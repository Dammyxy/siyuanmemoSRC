import type {
  StorageInventoryMetric,
  StorageInventoryRecord,
  StoragePressureLevel,
} from '../../packages/contracts/src/backend-rpc';
import type { SqliteDeltaAppendObservation } from '../../src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint';
import {
  classifyWorkerStoragePressure,
  type WorkerStorageBudgetPolicy,
} from './WorkerStoragePressureClassifier';

export type WorkerStoragePressureAdmissionDecision = {
  kind: 'allow' | 'refresh-background' | 'verify-synchronously' | 'unavailable';
  level: StoragePressureLevel | null;
  exact: boolean;
};

interface WorkerStoragePressureAdmissionOptions {
  collectExactInventory(): Promise<StorageInventoryRecord>;
  budgetPolicies?: readonly WorkerStorageBudgetPolicy[];
  now?: () => number;
}

type PendingObservation = {
  revision: number;
  value: SqliteDeltaAppendObservation;
};

function metricKey(metric: { family: string; deviceId: string | null }): string {
  return `${metric.family}\n${metric.deviceId ?? ''}`;
}

function sortMetrics(metrics: StorageInventoryMetric[]): StorageInventoryMetric[] {
  return metrics.slice().sort((left, right) => metricKey(left).localeCompare(metricKey(right)));
}

export class WorkerStoragePressureAdmissionModule {
  private readonly now: () => number;
  private inventory: StorageInventoryRecord | null = null;
  private exact = false;
  private refreshRun: Promise<StorageInventoryRecord> | null = null;
  private blockingReason: string | null = null;
  private observationRevision = 0;
  private pendingObservations: PendingObservation[] = [];
  private lifecycleRevision = 0;

  constructor(private readonly options: WorkerStoragePressureAdmissionOptions) {
    this.now = options.now ?? Date.now;
  }

  isReady(): boolean {
    return this.inventory !== null;
  }

  decide(): WorkerStoragePressureAdmissionDecision {
    if (!this.inventory) {
      return { kind: 'unavailable', level: null, exact: false };
    }
    const level = this.inventory.pressure.level;
    if (level === 'normal') {
      return { kind: 'allow', level, exact: this.exact };
    }
    if (level === 'soft' || level === 'high') {
      return { kind: 'refresh-background', level, exact: this.exact };
    }
    return { kind: 'verify-synchronously', level, exact: this.exact };
  }

  currentInventory(): StorageInventoryRecord | null {
    return this.inventory ? structuredClone(this.decorate(this.inventory)) : null;
  }

  blockReason(): string | null {
    return this.blockingReason;
  }

  block(reason: string): void {
    this.blockingReason = String(reason || '').trim() || 'hard storage pressure remains after maintenance';
  }

  reset(): void {
    this.lifecycleRevision += 1;
    this.inventory = null;
    this.exact = false;
    this.refreshRun = null;
    this.blockingReason = null;
    this.observationRevision = 0;
    this.pendingObservations = [];
  }

  seedInventory(inventory: StorageInventoryRecord, exact: boolean): void {
    this.inventory = structuredClone(inventory);
    this.exact = exact;
    if (this.inventory.pressure.level !== 'hard') {
      this.blockingReason = null;
    } else {
      this.blockingReason = this.inventory.pressure.reason
        ?? 'hard storage pressure observed during startup';
    }
  }

  refreshExact(): Promise<StorageInventoryRecord> {
    if (this.refreshRun) {
      return this.refreshRun;
    }
    const startingRevision = this.observationRevision;
    const startingLifecycleRevision = this.lifecycleRevision;
    const refresh = this.options.collectExactInventory()
      .then((collected) => {
        if (startingLifecycleRevision !== this.lifecycleRevision) {
          return structuredClone(collected);
        }
        this.inventory = structuredClone(collected);
        this.exact = true;
        const observations = this.pendingObservations
          .filter((item) => item.revision > startingRevision)
          .sort((left, right) => left.revision - right.revision);
        for (const observation of observations) {
          this.applyObservation(observation.value);
        }
        this.pendingObservations = this.pendingObservations
          .filter((item) => item.revision > this.observationRevision);
        if (this.inventory.pressure.level !== 'hard') {
          this.blockingReason = null;
        }
        return structuredClone(this.decorate(this.inventory));
      })
      .finally(() => {
        if (this.refreshRun === refresh) {
          this.refreshRun = null;
        }
      });
    this.refreshRun = refresh;
    return refresh;
  }

  observeJournaledDelta(observation: SqliteDeltaAppendObservation): void {
    this.observationRevision += 1;
    if (this.refreshRun) {
      this.pendingObservations.push({
        revision: this.observationRevision,
        value: structuredClone(observation),
      });
    }
    if (this.inventory) {
      this.applyObservation(observation);
    }
  }

  private applyObservation(observation: SqliteDeltaAppendObservation): void {
    if (!this.inventory) {
      return;
    }
    const measuredAt = this.now();
    const previousDelta = this.inventory.metrics.find((metric) => metric.family === 'sqlite-delta');
    const previousProjection = this.inventory.metrics.find(
      (metric) => metric.family === 'temporary-sqlite-projection',
    );
    const deviceId = previousDelta?.deviceId ?? previousProjection?.deviceId ?? null;
    const identityEpoch = previousDelta?.identityEpoch ?? previousProjection?.identityEpoch ?? null;
    const deltaMetric: StorageInventoryMetric = {
      family: 'sqlite-delta',
      deviceId,
      identityEpoch,
      files: Math.max(0, Math.floor(observation.files)),
      bytes: Math.max(0, Math.floor(observation.bytes)),
      oldestAgeMs: observation.oldestCreatedAt === null
        ? null
        : Math.max(0, measuredAt - observation.oldestCreatedAt),
      generationCount: 0,
      currentGenerationId: null,
      previousGenerationId: null,
      uncoveredMutationCount: Math.max(
        previousDelta?.uncoveredMutationCount ?? 0,
        Math.max(0, Math.floor(observation.entries)),
      ),
      compactionStatus: observation.entries > 0 ? 'blocked-uncovered' : 'idle',
    };
    const projectionMetric: StorageInventoryMetric = {
      family: 'temporary-sqlite-projection',
      deviceId,
      identityEpoch,
      files: 1,
      bytes: Math.max(0, Math.floor(
        (previousProjection?.bytes ?? 0) + Math.max(0, observation.entryByteEstimate),
      )),
      oldestAgeMs: null,
      generationCount: 0,
      currentGenerationId: null,
      previousGenerationId: null,
      uncoveredMutationCount: 0,
      compactionStatus: 'not-applicable',
    };
    const metrics = sortMetrics([
      ...this.inventory.metrics.filter((metric) => (
        metric.family !== 'sqlite-delta'
        && metric.family !== 'temporary-sqlite-projection'
      )),
      deltaMetric,
      projectionMetric,
    ]);
    const pressure = classifyWorkerStoragePressure(
      metrics,
      measuredAt,
      this.options.budgetPolicies,
    );
    const levelByMetric = new Map(pressure.metrics.map((metric) => [metricKey(metric), metric.level]));
    this.inventory = {
      version: this.inventory.version,
      measuredAt,
      metrics: metrics.map((metric) => ({
        ...metric,
        compactionStatus: metric.compactionStatus === 'idle'
          && levelByMetric.get(metricKey(metric)) !== 'normal'
          ? 'eligible'
          : metric.compactionStatus,
      })),
      pressure,
    };
    this.exact = false;
  }

  private decorate(inventory: StorageInventoryRecord): StorageInventoryRecord {
    if (inventory.pressure.level !== 'hard' || !this.blockingReason) {
      return inventory;
    }
    return {
      ...inventory,
      pressure: {
        ...inventory.pressure,
        blockingMutationGrowth: true,
        code: 'STORAGE_PRESSURE',
        reason: this.blockingReason,
      },
    };
  }
}
