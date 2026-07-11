import type {
  BackendLegacyArenaImportRecord,
  BackendLegacyReviewImportRecord,
  BackendLegacyUnifiedImportRecord,
  BackendStorageMaintenanceBatch,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  StorageLoadReason,
  UnifiedCardStore,
} from '@/core/storage/UnifiedStorageManager';
import type { IFileService } from '@/infrastructure/services/FileService';
import type { ArenaStoreData } from '@/types/arena';
import type { DrillLogV2, ReviewLog, ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';

export const INITIAL_STORAGE_IMPORT_MIGRATION_ID = 'initial-msgpack-json-import-v1';
export const NATIVE_RIFF_RETIREMENT_MIGRATION_ID = 'native-riff-persistence-retirement-v1';
export const ALGORITHM_CARD_STATE_MIGRATION_ID = 'algorithm-card-state-production-v1';
export const ALGORITHM_CARD_STATE_REPAIR_MIGRATION_ID = 'algorithm-card-state-production-repair-v2';
export const NEURAL_ROAM_ROUTE_MIGRATION_ID = 'neural-roam-route-state-v1';

const LEGACY_IMPORT_BATCH_SIZE = 128;

export type LegacyUnifiedCardStore = UnifiedCardStore & {
  riffBlacklist?: unknown;
};

type LegacyStoreLoader = (reason?: StorageLoadReason) => Promise<LegacyUnifiedCardStore>;

interface MonthlyReviewLogs {
  reviewLogs?: ReviewLog[];
  reviewLogsV2?: ReviewLogV2[];
  drillLogsV2?: DrillLogV2[];
  rescheduleLogs?: RescheduleLog[];
}

export interface LegacyStorageMigrationBackup {
  fileName: string;
  data: unknown;
}

export interface LegacyStorageMigrationOperationPlan {
  operationId: string;
  migrationId: string;
  batches: BackendStorageMaintenanceBatch[];
  backup?: LegacyStorageMigrationBackup;
}

export interface LegacyStorageMigrationOperationDescriptor {
  operationId: string;
  migrationId: string;
}

export interface LegacyStorageMaintenanceStatus {
  operationId: string;
  migrationId: string;
  required: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  completedBatches: number;
  totalBatches: number | null;
  lastMutationId: string | null;
  completedAt: number | null;
  error: string | null;
}

export interface LegacyStorageMigrationRunResult {
  requiredOperationIds: string[];
  appliedOperationIds: string[];
}

const LEGACY_STORAGE_MIGRATION_OPERATIONS = Object.freeze([
  {
    operationId: INITIAL_STORAGE_IMPORT_MIGRATION_ID,
    migrationId: INITIAL_STORAGE_IMPORT_MIGRATION_ID,
  },
  {
    operationId: NATIVE_RIFF_RETIREMENT_MIGRATION_ID,
    migrationId: NATIVE_RIFF_RETIREMENT_MIGRATION_ID,
  },
  {
    operationId: ALGORITHM_CARD_STATE_MIGRATION_ID,
    migrationId: ALGORITHM_CARD_STATE_MIGRATION_ID,
  },
  {
    operationId: ALGORITHM_CARD_STATE_REPAIR_MIGRATION_ID,
    migrationId: ALGORITHM_CARD_STATE_REPAIR_MIGRATION_ID,
  },
  {
    operationId: NEURAL_ROAM_ROUTE_MIGRATION_ID,
    migrationId: NEURAL_ROAM_ROUTE_MIGRATION_ID,
  },
] satisfies LegacyStorageMigrationOperationDescriptor[]);

export function getLegacyStorageMigrationOperationDescriptors():
LegacyStorageMigrationOperationDescriptor[] {
  return LEGACY_STORAGE_MIGRATION_OPERATIONS.map((operation) => ({ ...operation }));
}

export class LegacyStorageMigrationSourcePlanner {
  private legacyStorePromise: Promise<LegacyUnifiedCardStore> | null = null;

  constructor(
    private readonly fileService: Pick<IFileService, 'readJSON' | 'readMsgpack'>,
    private readonly legacyStoreLoader: LegacyStoreLoader,
  ) {}

  async planOperation(
    operationId: string,
    now = Date.now(),
  ): Promise<LegacyStorageMigrationOperationPlan> {
    if (operationId === INITIAL_STORAGE_IMPORT_MIGRATION_ID) {
      return this.planInitialStorageImport(now);
    }
    if (operationId === NATIVE_RIFF_RETIREMENT_MIGRATION_ID) {
      const legacyStore = await this.loadLegacyStore();
      return {
        operationId,
        migrationId: NATIVE_RIFF_RETIREMENT_MIGRATION_ID,
        batches: [{
          kind: 'native-riff-retirement',
          blockIds: normalizeStringArray(legacyStore.riffBlacklist),
          appliedAt: now,
          includeStoredBlacklist: true,
          dropLegacyTable: true,
        }],
      };
    }
    if (operationId === ALGORITHM_CARD_STATE_MIGRATION_ID) {
      return createAlgorithmOperation(
        ALGORITHM_CARD_STATE_MIGRATION_ID,
        'migration-backups/algorithm-card-state-production-v1.json',
        now,
      );
    }
    if (operationId === ALGORITHM_CARD_STATE_REPAIR_MIGRATION_ID) {
      return createAlgorithmOperation(
        ALGORITHM_CARD_STATE_REPAIR_MIGRATION_ID,
        'migration-backups/algorithm-card-state-production-repair-v2.json',
        now,
      );
    }
    if (operationId === NEURAL_ROAM_ROUTE_MIGRATION_ID) {
      return {
        operationId,
        migrationId: NEURAL_ROAM_ROUTE_MIGRATION_ID,
        batches: [{
          kind: 'neural-roam-route-migration',
          appliedAt: now,
        }],
      };
    }
    throw new Error(`INVALID_REQUEST: unknown storage migration operation ${operationId}`);
  }

  private async planInitialStorageImport(
    now: number,
  ): Promise<LegacyStorageMigrationOperationPlan> {
    const legacyStore = await this.loadLegacyStore();
    const [queueState, arenaRecords, reviewRecords] = await Promise.all([
      this.readQueueState(),
      this.readArenaRecords(),
      this.readReviewRecords(now),
    ]);
    const initialBatches: BackendStorageMaintenanceBatch[] = [
      { kind: 'legacy-storage-import-begin', appliedAt: now },
      { kind: 'legacy-unified-reset' },
      ...chunk(this.createUnifiedRecords(legacyStore), LEGACY_IMPORT_BATCH_SIZE)
        .map((records): BackendStorageMaintenanceBatch => ({
          kind: 'legacy-unified-records',
          records,
        })),
      ...chunk(queueState, LEGACY_IMPORT_BATCH_SIZE)
        .map((entries): BackendStorageMaintenanceBatch => ({
          kind: 'legacy-queue-records',
          entries,
        })),
      ...chunk(reviewRecords, LEGACY_IMPORT_BATCH_SIZE)
        .map((records): BackendStorageMaintenanceBatch => ({
          kind: 'legacy-review-records',
          records,
        })),
      ...chunk(arenaRecords, LEGACY_IMPORT_BATCH_SIZE)
        .map((records): BackendStorageMaintenanceBatch => ({
          kind: 'legacy-arena-records',
          records,
        })),
      {
        kind: 'legacy-unified-finalize',
        version: Number(legacyStore.version) || 2,
        syncMetadata: legacyStore.syncMetadata,
        appliedAt: now,
      },
    ];
    const operation: LegacyStorageMigrationOperationPlan = {
      operationId: INITIAL_STORAGE_IMPORT_MIGRATION_ID,
      migrationId: INITIAL_STORAGE_IMPORT_MIGRATION_ID,
      batches: initialBatches,
    };
    if (hasStoreContent(legacyStore)) {
      operation.backup = {
        fileName: 'migration-backups/unified-cards-initial-msgpack-json-import-v1.json',
        data: legacyStore,
      };
    }
    return operation;
  }

  private loadLegacyStore(): Promise<LegacyUnifiedCardStore> {
    this.legacyStorePromise ??= this.legacyStoreLoader('startup-load');
    return this.legacyStorePromise;
  }

  private createUnifiedRecords(store: LegacyUnifiedCardStore): BackendLegacyUnifiedImportRecord[] {
    const records: BackendLegacyUnifiedImportRecord[] = [];
    const dtoEntries = Object.entries(store.cardDTOs || {}).sort(([left], [right]) => left.localeCompare(right));
    const cardEntries = dtoEntries.length > 0
      ? dtoEntries.map(([id, dto]) => [id, store.cards?.[id] ?? null, dto] as const)
      : Object.entries(store.cards || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, card]) => [id, card, undefined] as const);
    for (const [id, card, dto] of cardEntries) {
      records.push({
        kind: 'card',
        id,
        card,
        dto,
        tombstone: store.deletedCardDTOs?.[id],
      });
    }
    for (const [id, value] of Object.entries(store.xiuyuans || {}).sort(([left], [right]) => left.localeCompare(right))) {
      records.push({ kind: 'xiuyuan', id, value });
    }
    for (const [id, value] of Object.entries(store.deletedCardDTOs || {}).sort(([left], [right]) => left.localeCompare(right))) {
      records.push({
        kind: 'card-tombstone',
        id,
        value,
        card: store.cards?.[id],
        dto: store.cardDTOs?.[id],
      });
    }
    for (const [id, value] of Object.entries(store.deletedXiuyuans || {}).sort(([left], [right]) => left.localeCompare(right))) {
      records.push({ kind: 'xiuyuan-tombstone', id, value });
    }
    return records;
  }

  private async readQueueState(): Promise<Array<[string, unknown]>> {
    const queueState = await this.fileService.readMsgpack<Record<string, unknown>>('queues.msgpack');
    return Object.entries(queueState || {}).sort(([left], [right]) => left.localeCompare(right));
  }

  private async readArenaRecords(): Promise<BackendLegacyArenaImportRecord[]> {
    const store = await this.fileService.readJSON<ArenaStoreData>('arena/store.json');
    if (!store) {
      return [];
    }
    return [
      ...(store.scores || []).map((value): BackendLegacyArenaImportRecord => ({ kind: 'score', value })),
      ...(store.matches || []).map((value): BackendLegacyArenaImportRecord => ({ kind: 'match', value })),
      ...(store.attributions || []).map((value): BackendLegacyArenaImportRecord => ({ kind: 'attribution', value })),
    ];
  }

  private async readReviewRecords(now: number): Promise<BackendLegacyReviewImportRecord[]> {
    const records: BackendLegacyReviewImportRecord[] = [];
    const currentYear = new Date(now).getFullYear();
    for (let year = currentYear - 10; year <= currentYear + 1; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const monthString = month.toString().padStart(2, '0');
        const data = await this.fileService.readJSON<MonthlyReviewLogs>(
          `review-logs/${year}-${monthString}.json`,
        );
        if (!data) {
          continue;
        }
        records.push(
          ...(data.reviewLogs || []).map((value): BackendLegacyReviewImportRecord => ({ kind: 'review', value })),
          ...(data.reviewLogsV2 || []).map((value): BackendLegacyReviewImportRecord => ({ kind: 'review-v2', value })),
          ...(data.drillLogsV2 || []).map((value): BackendLegacyReviewImportRecord => ({ kind: 'drill-v2', value })),
          ...(data.rescheduleLogs || []).map((value): BackendLegacyReviewImportRecord => ({ kind: 'reschedule', value })),
        );
      }
    }
    return records;
  }
}

export async function runPendingLegacyStorageMigrations(options: {
  planner: LegacyStorageMigrationSourcePlanner;
  readStatus(
    operation: LegacyStorageMigrationOperationDescriptor,
  ): Promise<LegacyStorageMaintenanceStatus>;
  executeBatch(request: {
    operationId: string;
    migrationId: string;
    batchIndex: number;
    totalBatches: number;
    batch: BackendStorageMaintenanceBatch;
  }): Promise<LegacyStorageMaintenanceStatus>;
  writeBackup(fileName: string, data: unknown): Promise<void>;
  now?: () => number;
}): Promise<LegacyStorageMigrationRunResult> {
  const now = options.now ?? Date.now;
  const requiredOperationIds: string[] = [];
  const appliedOperationIds: string[] = [];
  for (const descriptor of getLegacyStorageMigrationOperationDescriptors()) {
    const status = await options.readStatus(descriptor);
    if (!status.required) {
      continue;
    }
    requiredOperationIds.push(descriptor.operationId);
    const operation = await options.planner.planOperation(descriptor.operationId, now());
    if (
      status.totalBatches !== null
      && status.totalBatches !== operation.batches.length
    ) {
      throw new Error(
        `STORAGE_MAINTENANCE_CONFLICT: ${operation.operationId} totalBatches changed`,
      );
    }
    let batchIndex = Math.min(status.completedBatches, operation.batches.length);
    if (batchIndex > 0 && operation.backup) {
      await options.writeBackup(operation.backup.fileName, operation.backup.data);
    }
    while (batchIndex < operation.batches.length) {
      const result = await options.executeBatch({
        operationId: operation.operationId,
        migrationId: operation.migrationId,
        batchIndex,
        totalBatches: operation.batches.length,
        batch: operation.batches[batchIndex],
      });
      appliedOperationIds.push(operation.operationId);
      if (
        batchIndex === 0
        && operation.backup
        && result.status !== 'completed'
      ) {
        await options.writeBackup(operation.backup.fileName, operation.backup.data);
      }
      if (result.status === 'completed') {
        break;
      }
      const nextBatchIndex = Math.max(batchIndex + 1, result.completedBatches);
      if (nextBatchIndex <= batchIndex) {
        throw new Error(
          `STORAGE_MAINTENANCE_FAILED: ${operation.operationId} did not advance`,
        );
      }
      batchIndex = nextBatchIndex;
    }
  }
  return {
    requiredOperationIds,
    appliedOperationIds: Array.from(new Set(appliedOperationIds)),
  };
}

function createAlgorithmOperation(
  migrationId: string,
  backupFileName: string,
  now: number,
): LegacyStorageMigrationOperationPlan {
  return {
    operationId: migrationId,
    migrationId,
    batches: [
      {
        kind: 'algorithm-card-state-backup',
        fileName: backupFileName,
        capturedAt: now,
      },
      {
        kind: 'algorithm-card-state-backfill',
        appliedAt: now,
      },
    ],
  };
}

function hasStoreContent(store: LegacyUnifiedCardStore): boolean {
  return Object.keys(store.cards || {}).length > 0
    || Object.keys(store.cardDTOs || {}).length > 0
    || Object.keys(store.xiuyuans || {}).length > 0
    || Object.keys(store.deletedCardDTOs || {}).length > 0
    || Object.keys(store.deletedXiuyuans || {}).length > 0
    || normalizeStringArray(store.riffBlacklist).length > 0;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )).sort();
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
