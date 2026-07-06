import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH,
  type BackendStorageDiagnostic,
  type BackendStorageErrorCode,
  type MessagePackTruthFamily,
} from '../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  MESSAGEPACK_TRUTH_MANIFEST_VERSION,
  MessagePackTruthValidationError,
  type MessagePackTruthRecord,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentManifest,
} from '../truth/MessagePackTruthSegmentStore';
import {
  createReconciledLegacyUnifiedCardsMigrationReceipt,
  readLegacyUnifiedCardsMigrationReceipt,
  reconcileLegacyUnifiedCardsMigrationReceipt,
  type LegacyUnifiedCardsMigrationReceiptFamily,
} from '../truth/LegacyUnifiedCardsMigrationReceipt';
import { createLogger } from '@/utils/logger';

const logger = createLogger('StorageBootstrapRuntime');

export interface WorkerStorageBootstrapOptions {
  truthDeviceId: string | null;
  cardTruthGenerationId: string;
  reviewTruthGenerationId: string;
  maxSegmentBytes?: number;
}

export interface WorkerStorageBootstrapState {
  truthAvailable: boolean;
  projectionRebuildRequired: boolean;
  projectionRebuildReason: string | null;
  truthProjectionInput: StartupTruthProjectionInput | null;
  projectionBytesBeforeStartup: Uint8Array | null;
}

export interface StartupTruthProjectionInput {
  truthRecords: MessagePackTruthRecord[];
  truthManifest: MessagePackTruthSegmentManifest;
  primaryDeviceId: string;
  primaryGenerationId: string;
}

interface TruthManifestTarget {
  family: MessagePackTruthFamily;
  deviceId: string;
  generationId: string;
}

export interface StorageBootstrapRuntimeDependencies {
  dbFile: string;
  fileService: {
    readBinary(fileName: string): Promise<Uint8Array | null>;
    hasLegacyPetalSqliteDb(): Promise<boolean>;
  };
  truthFileStore: MessagePackTruthSegmentFileStore | null;
  addStorageDiagnostic(diagnostic: BackendStorageDiagnostic): void;
  projectionRuntime?: {
    dispose(): void;
    init(): Promise<void>;
    suppressPersistedProjectionRead<T>(task: () => Promise<T>): Promise<T>;
  };
}

export class StorageBootstrapRuntime {
  private legacyPetalSqliteDbProbeComplete = false;

  constructor(private readonly deps: StorageBootstrapRuntimeDependencies) {}

  async bootstrap(options: WorkerStorageBootstrapOptions): Promise<WorkerStorageBootstrapState> {
    await this.recordIgnoredLegacyPetalSqliteDbDiagnostic();
    const projectionBytesBeforeStartup = await this.readProjectionBytesForStartupProbe();
    const truthProjectionInput = await this.readStartupTruthProjectionInput(options);
    if (truthProjectionInput) {
      await this.reconcileTruthWithoutReceipt(options, truthProjectionInput);
      return {
        truthAvailable: true,
        projectionRebuildRequired: !projectionBytesBeforeStartup,
        projectionRebuildReason: projectionBytesBeforeStartup ? 'sql-stale' : 'temp-projection-missing',
        truthProjectionInput,
        projectionBytesBeforeStartup,
      };
    }

    return {
      truthAvailable: false,
      projectionRebuildRequired: false,
      projectionRebuildReason: null,
      truthProjectionInput: null,
      projectionBytesBeforeStartup,
    };
  }

  async reinitializeTempProjectionRuntimeAfterLoadFailure(error: unknown): Promise<void> {
    if (!this.deps.projectionRuntime) {
      throw storageError(
        'PROJECTION_REBUILD_FAILED',
        `temp projection runtime reinitialization unavailable after persisted DB load failure: ${errorMessage(error)}`,
      );
    }
    await this.deps.projectionRuntime.suppressPersistedProjectionRead(async () => {
      this.deps.projectionRuntime?.dispose();
      try {
        await this.deps.projectionRuntime?.init();
      } catch (reinitError) {
        throw storageError(
          'PROJECTION_REBUILD_FAILED',
          `failed to reinitialize temp projection after persisted DB load failure: ${errorMessage(reinitError)}; original failure: ${errorMessage(error)}`,
        );
      }
    });
  }

  private async readProjectionBytesForStartupProbe(): Promise<Uint8Array | null> {
    try {
      return await this.deps.fileService.readBinary(this.deps.dbFile);
    } catch {
      return null;
    }
  }

  private async recordIgnoredLegacyPetalSqliteDbDiagnostic(): Promise<void> {
    if (this.legacyPetalSqliteDbProbeComplete) {
      return;
    }
    this.legacyPetalSqliteDbProbeComplete = true;
    let exists = false;
    try {
      exists = await this.deps.fileService.hasLegacyPetalSqliteDb();
    } catch (error) {
      logger.warn('[SiYuanMemo][StorageBootstrapRuntime] ignored legacy petal DB probe failed', {
        path: SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH,
        error: errorMessage(error),
      });
      return;
    }
    if (!exists) {
      return;
    }
    this.deps.addStorageDiagnostic({
      kind: 'legacy-petal-db-ignored',
      severity: 'warning',
      at: Date.now(),
      message: 'Legacy petal siyuanmemo.db exists but is ignored; temp projection uses workspace temp and truth remains authoritative.',
      path: SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH,
      details: {
        action: 'ignored',
        read: false,
        migrated: false,
        deleted: false,
        written: false,
      },
    });
  }

  private async readStartupTruthProjectionInput(
    options: WorkerStorageBootstrapOptions,
  ): Promise<StartupTruthProjectionInput | null> {
    if (!this.deps.truthFileStore) {
      return null;
    }

    const targets = await this.discoverStartupTruthManifestTargets(options);
    const manifests: MessagePackTruthSegmentManifest[] = [];
    const truthRecords: MessagePackTruthRecord[] = [];
    let primaryDeviceId = options.truthDeviceId;
    let primaryGenerationId = options.cardTruthGenerationId;

    for (const target of targets) {
      const truthStore = createMessagePackTruthSegmentStore({
        fileStore: this.deps.truthFileStore,
        family: target.family,
        deviceId: target.deviceId,
        generationId: target.generationId,
        schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
        maxSegmentBytes: options.maxSegmentBytes,
      });
      try {
        const replay = await truthStore.replayRecords({
          dedupeByIdempotencyKey: target.family === 'review-events',
        });
        if (
          replay.manifest.segments.length === 0
          && replay.manifest.updatedAt === 0
          && replay.records.length === 0
        ) {
          continue;
        }
        manifests.push(replay.manifest);
        truthRecords.push(...replay.records);
        primaryDeviceId ||= replay.manifest.deviceId;
        if (target.family === 'card-memory-facts') {
          primaryGenerationId = replay.manifest.generationId;
        }
      } catch (error) {
        if (error instanceof MessagePackTruthValidationError) {
          throw storageError('TRUTH_VALIDATION_FAILED', error.message);
        }
        throw error;
      }
    }

    if (manifests.length === 0) {
      return null;
    }

    const truthManifest = mergeStartupTruthManifests(manifests, {
      primaryDeviceId: primaryDeviceId ?? manifests[0].deviceId,
      primaryGenerationId,
    });
    return {
      truthRecords,
      truthManifest,
      primaryDeviceId: primaryDeviceId ?? manifests[0].deviceId,
      primaryGenerationId,
    };
  }

  private async discoverStartupTruthManifestTargets(
    options: WorkerStorageBootstrapOptions,
  ): Promise<TruthManifestTarget[]> {
    const targets: TruthManifestTarget[] = [];
    const defaultDeviceId = normalizeString(options.truthDeviceId);
    if (defaultDeviceId) {
      targets.push(
        {
          family: 'card-memory-facts',
          deviceId: defaultDeviceId,
          generationId: options.cardTruthGenerationId,
        },
        {
          family: 'review-events',
          deviceId: defaultDeviceId,
          generationId: options.reviewTruthGenerationId,
        },
      );
    }

    if (this.deps.truthFileStore?.listFiles) {
      for (const family of ['card-memory-facts', 'review-events'] as const) {
        try {
          const paths = await this.deps.truthFileStore.listFiles(`truth/${family}`);
          for (const path of paths) {
            const target = parseTruthManifestTarget(path, family);
            if (target) {
              targets.push(target);
            }
          }
        } catch {
          continue;
        }
      }
    }

    return dedupeTruthManifestTargets(targets);
  }

  private async reconcileTruthWithoutReceipt(
    options: WorkerStorageBootstrapOptions,
    truthProjectionInput: StartupTruthProjectionInput,
  ): Promise<void> {
    if (!this.deps.truthFileStore) {
      return;
    }
    const existingReceipt = await readLegacyUnifiedCardsMigrationReceipt(this.deps.truthFileStore);
    if (existingReceipt) {
      return;
    }
    if (!options.truthDeviceId) {
      throw storageError(
        'TRUTH_DEVICE_ID_UNAVAILABLE',
        'truth-without-receipt reconciliation requires truth-wide persistent local device id',
      );
    }
    const reconciledReceipt = createReconciledLegacyUnifiedCardsMigrationReceipt({
      reconciledAt: Date.now(),
      localDeviceId: options.truthDeviceId,
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      families: buildReconciledMigrationReceiptFamilies(truthProjectionInput.truthManifest),
      diagnostics: [{
        kind: 'truth-without-receipt',
        severity: 'warning',
        message: 'Truth manifests existed without the legacy migration receipt; startup trusted truth and wrote a reconciled receipt.',
        details: {
          projectionDeviceId: truthProjectionInput.primaryDeviceId,
          projectionGenerationId: truthProjectionInput.primaryGenerationId,
        },
      }],
    });
    const result = await reconcileLegacyUnifiedCardsMigrationReceipt(this.deps.truthFileStore, {
      truthExists: true,
      reconciledReceipt,
    });
    if (result.wroteReceipt) {
      logger.warn('[SiYuanMemo][StorageBootstrapRuntime] reconciled MessagePack truth without legacy migration receipt', {
        receiptStatus: result.receipt.status,
        families: result.receipt.families.map((family) => ({
          family: family.family,
          generationId: family.generationId,
          recordCount: family.recordCount,
        })),
      });
    }
  }
}

function storageError(code: BackendStorageErrorCode, message: string): Error & { code: BackendStorageErrorCode } {
  const error = new Error(`${code}: ${message}`) as Error & { code: BackendStorageErrorCode };
  error.name = 'BackendStorageError';
  error.code = code;
  return error;
}

function buildReconciledMigrationReceiptFamilies(
  manifest: MessagePackTruthSegmentManifest,
): LegacyUnifiedCardsMigrationReceiptFamily[] {
  const byKey = new Map<string, LegacyUnifiedCardsMigrationReceiptFamily>();
  for (const segment of manifest.segments) {
    const family = segment.family;
    if (family !== 'card-memory-facts' && family !== 'review-events') {
      continue;
    }
    const key = `${family}\n${segment.generationId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.recordCount += Math.max(0, Number(segment.recordCount) || 0);
      existing.segmentRefs.push(segment.path);
      continue;
    }
    byKey.set(key, {
      family,
      generationId: segment.generationId,
      recordCount: Math.max(0, Number(segment.recordCount) || 0),
      segmentRefs: [segment.path],
    });
  }
  const families = [...byKey.values()];
  if (families.length === 0) {
    throw storageError(
      'LEGACY_MIGRATION_FAILED',
      'truth-without-receipt reconciliation found no supported truth family segments',
    );
  }
  return families;
}

function mergeStartupTruthManifests(
  manifests: MessagePackTruthSegmentManifest[],
  input: {
    primaryDeviceId: string;
    primaryGenerationId: string;
  },
): MessagePackTruthSegmentManifest {
  if (manifests.length === 1) {
    return manifests[0];
  }
  const updatedAt = manifests.reduce((max, manifest) => Math.max(max, Number(manifest.updatedAt) || 0), 0);
  return {
    version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
    path: 'startup-projection-rebuild:merged',
    family: 'startup-projection-rebuild',
    deviceId: input.primaryDeviceId,
    generationId: input.primaryGenerationId,
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    segments: manifests.flatMap((manifest) => manifest.segments),
    updatedAt,
  };
}

function parseTruthManifestTarget(
  path: unknown,
  expectedFamily?: MessagePackTruthFamily,
): TruthManifestTarget | null {
  const normalized = normalizeString(path).replace(/\\/g, '/');
  const match = /^truth\/([^/]+)\/([^/]+)\/device-([^/]+)\/manifest\.v1\.json$/.exec(normalized);
  if (!match) {
    return null;
  }
  const family = match[1] as MessagePackTruthFamily;
  if (expectedFamily && family !== expectedFamily) {
    return null;
  }
  if (family !== 'card-memory-facts' && family !== 'review-events') {
    return null;
  }
  return {
    family,
    generationId: match[2],
    deviceId: match[3],
  };
}

function dedupeTruthManifestTargets(targets: TruthManifestTarget[]): TruthManifestTarget[] {
  const seen = new Set<string>();
  const result: TruthManifestTarget[] = [];
  for (const target of targets) {
    const key = `${target.family}\n${target.generationId}\n${target.deviceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(target);
  }
  return result;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
