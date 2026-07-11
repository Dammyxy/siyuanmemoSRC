import {
  STORAGE_INVENTORY_RECORD_VERSION,
  type StorageInventoryMetric,
  type StorageInventoryRecord,
} from '../../packages/contracts/src/backend-rpc';
import type { SqliteDeltaStorageInventory } from '../../src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint';
import type { MessagePackTruthSegmentFileStore } from '../truth/MessagePackTruthSegmentStore';
import type { WorkerTruthPromotionDiagnostics } from '../truth/WorkerTruthPromotionModule';
import {
  classifyWorkerStoragePressure,
  type WorkerStorageBudgetPolicy,
} from './WorkerStoragePressureClassifier';

interface WorkerStorageInventoryOptions {
  truthFileStore: MessagePackTruthSegmentFileStore | null;
  deviceId: string | null;
  identityEpoch: string | null;
  readSqliteDeltaInventory(): Promise<SqliteDeltaStorageInventory | null>;
  readProjectionBytes(): Promise<Uint8Array | null>;
  readPromotionDiagnostics(): Promise<WorkerTruthPromotionDiagnostics | null>;
  budgetPolicies?: readonly WorkerStorageBudgetPolicy[];
  now?: () => number;
}

interface TruthGenerationSummary {
  generationId: string;
  updatedAt: number;
}

interface MutableTruthMetric {
  family: string;
  deviceId: string;
  segmentByPath: Map<string, { byteSize: number; closedAt: number }>;
  generations: TruthGenerationSummary[];
  currentGenerationId: string | null;
  previousGenerationId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  const normalized = Math.floor(Number(value) || 0);
  return Math.max(0, normalized);
}

function nonEmptyString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function metricKey(family: string, deviceId: string): string {
  return `${family}\n${deviceId}`;
}

export class WorkerStorageInventory {
  private readonly now: () => number;

  constructor(private readonly options: WorkerStorageInventoryOptions) {
    this.now = options.now ?? Date.now;
  }

  async collect(): Promise<StorageInventoryRecord> {
    const measuredAt = this.now();
    const [truthMetrics, deltaInventory, projectionBytes, promotionDiagnostics] = await Promise.all([
      this.collectTruthMetrics(measuredAt),
      this.options.readSqliteDeltaInventory(),
      this.options.readProjectionBytes(),
      this.options.readPromotionDiagnostics(),
    ]);
    const rawMetrics = [
      ...truthMetrics,
      ...(deltaInventory
        ? [this.createDeltaMetric(deltaInventory, promotionDiagnostics?.pendingMutationCount ?? 0, measuredAt)]
        : []),
      ...(projectionBytes
        ? [this.createProjectionMetric(projectionBytes.byteLength)]
        : []),
    ].sort((left, right) => (
      left.family.localeCompare(right.family)
      || String(left.deviceId).localeCompare(String(right.deviceId))
    ));
    const pressure = classifyWorkerStoragePressure(
      rawMetrics,
      measuredAt,
      this.options.budgetPolicies,
    );
    const pressureByKey = new Map(pressure.metrics.map((metric) => [
      metricKey(metric.family, metric.deviceId ?? ''),
      metric.level,
    ]));
    const metrics = rawMetrics.map((metric): StorageInventoryMetric => ({
      ...metric,
      compactionStatus: metric.compactionStatus === 'idle'
        && pressureByKey.get(metricKey(metric.family, metric.deviceId ?? '')) !== 'normal'
        ? 'eligible'
        : metric.compactionStatus,
    }));
    return {
      version: STORAGE_INVENTORY_RECORD_VERSION,
      measuredAt,
      metrics,
      pressure,
    };
  }

  private createDeltaMetric(
    inventory: SqliteDeltaStorageInventory,
    uncoveredMutationCount: number,
    measuredAt: number,
  ): StorageInventoryMetric {
    return {
      family: 'sqlite-delta',
      deviceId: this.options.deviceId,
      identityEpoch: this.options.identityEpoch,
      files: inventory.files,
      bytes: inventory.bytes,
      oldestAgeMs: inventory.oldestCreatedAt === null
        ? null
        : Math.max(0, measuredAt - inventory.oldestCreatedAt),
      generationCount: 0,
      currentGenerationId: null,
      previousGenerationId: null,
      uncoveredMutationCount,
      compactionStatus: uncoveredMutationCount > 0 ? 'blocked-uncovered' : 'idle',
    };
  }

  private createProjectionMetric(bytes: number): StorageInventoryMetric {
    return {
      family: 'temporary-sqlite-projection',
      deviceId: this.options.deviceId,
      identityEpoch: this.options.identityEpoch,
      files: 1,
      bytes,
      oldestAgeMs: null,
      generationCount: 0,
      currentGenerationId: null,
      previousGenerationId: null,
      uncoveredMutationCount: 0,
      compactionStatus: 'not-applicable',
    };
  }

  private async collectTruthMetrics(measuredAt: number): Promise<StorageInventoryMetric[]> {
    const fileStore = this.options.truthFileStore;
    if (!fileStore?.listFiles) {
      return [];
    }
    const paths = Array.from(new Set(await fileStore.listFiles('truth/')))
      .map((path) => String(path || '').replace(/\\/g, '/').trim())
      .filter(Boolean)
      .sort();
    const byFamilyDevice = new Map<string, MutableTruthMetric>();

    for (const path of paths.filter((candidate) => candidate.endsWith('/manifest.v1.json'))) {
      const manifest = await fileStore.readJSON<unknown>(path);
      if (!isRecord(manifest) || Number(manifest.version) !== 1 || !Array.isArray(manifest.segments)) {
        continue;
      }
      const family = nonEmptyString(manifest.family);
      const deviceId = nonEmptyString(manifest.deviceId);
      const generationId = nonEmptyString(manifest.generationId);
      if (!family || !deviceId || !generationId) {
        continue;
      }
      const key = metricKey(family, deviceId);
      const metric = byFamilyDevice.get(key) ?? {
        family,
        deviceId,
        segmentByPath: new Map(),
        generations: [],
        currentGenerationId: null,
        previousGenerationId: null,
      };
      metric.generations.push({
        generationId,
        updatedAt: nonNegativeInteger(manifest.updatedAt),
      });
      for (const candidate of manifest.segments) {
        if (!isRecord(candidate)) {
          continue;
        }
        const segmentPath = nonEmptyString(candidate.path);
        if (!segmentPath) {
          continue;
        }
        metric.segmentByPath.set(segmentPath, {
          byteSize: nonNegativeInteger(candidate.byteSize),
          closedAt: nonNegativeInteger(candidate.closedAt),
        });
      }
      byFamilyDevice.set(key, metric);
    }

    for (const path of paths.filter((candidate) => candidate.endsWith('/generation-fence.v1.json'))) {
      const fence = await fileStore.readJSON<unknown>(path);
      if (!isRecord(fence) || Number(fence.version) !== 1) {
        continue;
      }
      const family = nonEmptyString(fence.family);
      const deviceId = nonEmptyString(fence.deviceId);
      if (!family || !deviceId) {
        continue;
      }
      const metric = byFamilyDevice.get(metricKey(family, deviceId));
      if (!metric) {
        continue;
      }
      metric.currentGenerationId = isRecord(fence.current)
        ? nonEmptyString(fence.current.generationId)
        : null;
      metric.previousGenerationId = isRecord(fence.previous)
        ? nonEmptyString(fence.previous.generationId)
        : null;
    }

    return Array.from(byFamilyDevice.values())
      .map((metric): StorageInventoryMetric => {
        const segments = Array.from(metric.segmentByPath.values());
        const oldestClosedAt = segments.reduce<number | null>(
          (oldest, segment) => segment.closedAt > 0 && (oldest === null || segment.closedAt < oldest)
            ? segment.closedAt
            : oldest,
          null,
        );
        const generations = metric.generations
          .slice()
          .sort((left, right) => right.updatedAt - left.updatedAt || right.generationId.localeCompare(left.generationId));
        return {
          family: metric.family,
          deviceId: metric.deviceId,
          identityEpoch: this.options.deviceId !== null && metric.deviceId === this.options.deviceId
            ? this.options.identityEpoch
            : null,
          files: segments.length,
          bytes: segments.reduce((total, segment) => total + segment.byteSize, 0),
          oldestAgeMs: oldestClosedAt === null ? null : Math.max(0, measuredAt - oldestClosedAt),
          generationCount: new Set(metric.generations.map((generation) => generation.generationId)).size,
          currentGenerationId: metric.currentGenerationId ?? generations[0]?.generationId ?? null,
          previousGenerationId: metric.previousGenerationId,
          uncoveredMutationCount: 0,
          compactionStatus: 'idle',
        };
      })
      .sort((left, right) => (
        left.family.localeCompare(right.family)
        || String(left.deviceId).localeCompare(String(right.deviceId))
      ));
  }
}
