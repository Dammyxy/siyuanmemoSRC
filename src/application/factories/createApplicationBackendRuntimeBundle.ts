import { SrsBackendClient, type SrsBackendTransport } from '@/application/clients/SrsBackendClient';
import {
  BrowserSrsBackendWorkerTransport,
  type BrowserSrsBackendWorkerDiagnostics,
  type BrowserSrsBackendWorkerHostEffects,
} from '@/application/clients/BrowserSrsBackendWorkerTransport';
import {
  FrontendInstanceRuntime,
  type FrontendInstanceRuntimeOptions,
} from '@/application/clients/FrontendInstanceRuntime';
import { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import { KernelTruthDeviceIdentityInitializationFence } from '@/application/clients/KernelTruthDeviceIdentityInitializationFence';
import {
  collectBackendMigrationRuntimeEnv,
  resolveBackendMigrationRuntimePolicy,
  type BackendMigrationRuntimePolicy,
  type RuntimeEnv,
} from '@/application/backendMigration/runtimePolicy';
import { FileService } from '@/infrastructure/services/FileService';
import { IndexedDbTruthDeviceIdentityCache } from '@/infrastructure/persistence/identity/IndexedDbTruthDeviceIdentityCache';
import {
  LocalStorageTruthDeviceIdentityCache,
  TempLocalTruthDeviceIdentityCache,
} from '@/infrastructure/persistence/identity/BrowserTruthDeviceIdentityCaches';
import { SiyuanConfTruthDeviceIdentityAuthorityStore } from '@/infrastructure/persistence/identity/SiyuanConfTruthDeviceIdentityAuthorityStore';
import { SiyuanTruthDeviceIdentityEvidenceProbe } from '@/infrastructure/persistence/identity/SiyuanTruthDeviceIdentityEvidenceProbe';
import { SiyuanKernelCompanionAdapter } from '@/infrastructure/siyuan/SiyuanKernelCompanionAdapter';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import { ForeignEpochAuthorityPublicationCoordinator } from '@/application/services/ForeignEpochAuthorityPublicationCoordinator';
import {
  resolveTruthDeviceIdentity,
  type TruthDeviceIdentityResolution,
} from '@/application/factories/truthDeviceIdentity';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { NeuralRoamNodeTypeResolverPort } from '@/core/queue/domain/ports';
import type { NeuralRoamCardFacts } from '@/core/queue/neural/NeuralRoamCardFacts';
import { createLogger } from '@/utils/logger';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';
import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type BackendDbLoadResult,
  type BackendStartupIdentityDisposition,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  SqlitePersistenceBridge,
  SqlitePersistenceHostEffectMetadata,
} from '../../../worker/db/SqlitePersistenceBridge';

const logger = createLogger('ApplicationContext');
const REVIEW_TRUTH_GENERATION_ID = `review-events-v${MESSAGEPACK_TRUTH_SCHEMA_VERSION}`;
const SQLITE_PROJECTION_DB_FILE = 'siyuanmemo.db';

export type ApplicationBackendRuntimeTransport = SrsBackendTransport & {
  dispose?: () => void;
  getDiagnostics?: () => BrowserSrsBackendWorkerDiagnostics;
};

export type ApplicationBackendWriterRelayCommand = Parameters<
  NonNullable<FrontendInstanceRuntimeOptions['writerCommandHandler']>
>[0];

export interface ApplicationBackendRuntimeBundle {
  srsBackendClient: SrsBackendClient | null;
  srsBackendTransport: ApplicationBackendRuntimeTransport | null;
  frontendInstanceRuntime: FrontendInstanceRuntime | null;
  followerCommandClient: FollowerCommandClient | null;
  kernelSidecarClient: KernelSidecarClient;
  backendMigrationRuntimePolicy: BackendMigrationRuntimePolicy;
  backendStartupError: string | null;
  initialLoadResult: BackendDbLoadResult | null;
}

type NeuralRoamGraphQueryHost = {
  query: NonNullable<BrowserSrsBackendWorkerHostEffects['resolveNeuralGraphQuery']>;
};

interface NeuralRoamGraphQueryFactoryDeps {
  nodeTypeResolver: NeuralRoamNodeTypeResolverPort;
  cardFacts: NeuralRoamCardFacts;
}

export interface CreateApplicationBackendRuntimeBundleOptions {
  config: {
    plugin: unknown;
    frontendKind?: string;
  };
  fileService: FileService;
  unifiedDataSourceManager: UnifiedDataSourceManager;
  executeAutoCard: NonNullable<BrowserSrsBackendWorkerHostEffects['executeAutoCard']>;
  executeAutoCardBatch?: BrowserSrsBackendWorkerHostEffects['executeAutoCardBatch'];
  executeProgressiveCommand?: BrowserSrsBackendWorkerHostEffects['executeProgressiveCommand'];
  executeTopicDerivedCommand?: BrowserSrsBackendWorkerHostEffects['executeTopicDerivedCommand'];
  executeWriterRelayCommand: (
    backendClient: SrsBackendClient,
    command: ApplicationBackendWriterRelayCommand,
    hooks?: {
      onKernelTransactionIngested?: () => void;
      executeAgentTool?: (request: Record<string, unknown>) => Promise<unknown>;
    },
  ) => Promise<unknown>;
  executeAgentTool?: (request: Record<string, unknown>) => Promise<unknown>;
  notifyKernelTransactionIngested?: () => void;
  kernelSidecarClient?: KernelSidecarClient;
  createBlockExistenceSiyuanPort: () => Pick<QuerySiyuanPort, 'sql'>;
  createNeuralRoamGraphQuery: (deps: NeuralRoamGraphQueryFactoryDeps) => NeuralRoamGraphQueryHost;
  resolveKernelWriterLeaseInstanceId?: () => string | undefined;
  resolveKernelWriterLeaseTtlMs?: () => number | undefined;
  resolveSiyuanBackendContainer?: () => string;
  resolveSiyuanSystemId?: () => string | null;
  resolveWindowLocationHref?: () => string;
  resolveNavigatorUserAgent?: () => string;
  resolveDocumentBodyClass?: () => string;
  readViteEnv?: () => RuntimeEnv;
  readProcessEnv?: () => RuntimeEnv;
}

export async function createApplicationBackendRuntimeBundle(
  options: CreateApplicationBackendRuntimeBundleOptions,
): Promise<ApplicationBackendRuntimeBundle> {
  const kernelSidecarClient = options.kernelSidecarClient
    ?? new KernelSidecarClient(new SiyuanKernelCompanionAdapter());
  const siyuanBackendContainer = (options.resolveSiyuanBackendContainer ?? resolveSiyuanBackendContainer)();
  const pluginRuntimeSurface = options.config.plugin as { isBrowser?: boolean; isMobile?: boolean };
  const backendMigrationRuntimePolicy = resolveBackendMigrationRuntimePolicy(
    collectBackendMigrationRuntimeEnv(
      (options.readViteEnv ?? readViteEnv)(),
      (options.readProcessEnv ?? readProcessEnv)(),
    ),
    {
      backendContainer: siyuanBackendContainer,
      frontendKind: options.config.frontendKind,
      isMobile: pluginRuntimeSurface.isMobile,
      locationHref: (options.resolveWindowLocationHref ?? resolveWindowLocationHref)(),
      userAgent: (options.resolveNavigatorUserAgent ?? resolveNavigatorUserAgent)(),
      bodyClass: (options.resolveDocumentBodyClass ?? resolveDocumentBodyClass)(),
    },
  );
  logger.info('[ApplicationContext] Backend migration runtime policy resolved', {
    flags: backendMigrationRuntimePolicy.flags,
    capabilities: backendMigrationRuntimePolicy.capabilities,
  });

  let srsBackendClient: SrsBackendClient | null = null;
  let srsBackendTransport: ApplicationBackendRuntimeTransport | null = null;
  let frontendInstanceRuntime: FrontendInstanceRuntime | null = null;
  let followerCommandClient: FollowerCommandClient | null = null;
  let backendStartupError: string | null = null;
  let initialLoadResult: BackendDbLoadResult | null = null;

  if (backendMigrationRuntimePolicy.capabilities.backendWorkerAvailable) {
    try {
      await measureRuntimePerformance('startup', 'backend-worker.bootstrap', async () => {
        const bridge = createWorkerPersistenceBridge(options.fileService);
        const identityAuthority = new SiyuanConfTruthDeviceIdentityAuthorityStore(options.fileService);
        const identityCaches = [
          new IndexedDbTruthDeviceIdentityCache(),
          new LocalStorageTruthDeviceIdentityCache(),
          new TempLocalTruthDeviceIdentityCache(options.fileService),
        ];
        const identityInitializationFence = new KernelTruthDeviceIdentityInitializationFence(kernelSidecarClient, {
          instanceId: options.resolveKernelWriterLeaseInstanceId?.(),
        });
        const authorityPublicationCoordinator = new ForeignEpochAuthorityPublicationCoordinator({
          authority: identityAuthority,
          caches: identityCaches,
          initializationFence: identityInitializationFence,
          ensureActiveWriter: async () => {
            if (!backendMigrationRuntimePolicy.capabilities.writerRelayRequiredForBackendWrites) return;
            if (!frontendInstanceRuntime) {
              throw new Error('BACKEND_UNAVAILABLE: authority recovery requires active writer runtime');
            }
            await frontendInstanceRuntime.ensureWritable();
          },
        });
        const browserSiyuanApi = options.createBlockExistenceSiyuanPort();
        const neuralRoamGraphQuery = options.createNeuralRoamGraphQuery({
          nodeTypeResolver: {
            resolveNodeType: (blockId) => options.unifiedDataSourceManager.resolveNeuralRoamNodeType(blockId),
          },
          cardFacts: {
            resolveNodeType: (blockId) => options.unifiedDataSourceManager.resolveNeuralRoamNodeType(blockId),
            resolvePriority: (blockId) => options.unifiedDataSourceManager.resolveNeuralRoamNodePriority(blockId),
          },
        });
        srsBackendTransport = new BrowserSrsBackendWorkerTransport({
          hostEffects: {
            readBinary: (path, metadata) => bridge.readBinary(path, metadata),
            writeBinary: (path, bytes, metadata) => bridge.writeBinary(path, bytes, metadata),
            readJSON: <T>(path: string, metadata?: SqlitePersistenceHostEffectMetadata) => bridge.readJSON?.<T>(path, metadata) ?? Promise.resolve(null),
            writeJSON: (path, value, metadata) => {
              if (!bridge.writeJSON) {
                return Promise.reject(new Error(`SrsBackendWorker JSON persistence unavailable for ${path}`));
              }
              return bridge.writeJSON(path, value, metadata);
            },
            listFiles: bridge.listFiles
              ? (prefix) => bridge.listFiles!(prefix)
              : undefined,
            deleteFile: bridge.deleteFile
              ? (path) => bridge.deleteFile!(path)
              : undefined,
            readTruthBinary: (path, metadata) => bridge.truthFileStore?.readBinary(path) ?? bridge.readBinary(path, metadata),
            writeTruthBinary: (path, bytes, metadata) => bridge.truthFileStore?.writeBinary(path, bytes) ?? bridge.writeBinary(path, bytes, metadata),
            readTruthJSON: <T>(path: string, metadata?: SqlitePersistenceHostEffectMetadata) => bridge.truthFileStore?.readJSON<T>(path) ?? bridge.readJSON?.<T>(path, metadata) ?? Promise.resolve(null),
            writeTruthJSON: (path, value, metadata) => {
              if (bridge.truthFileStore) {
                return bridge.truthFileStore.writeJSON(path, value);
              }
              if (!bridge.writeJSON) {
                return Promise.reject(new Error(`SrsBackendWorker truth JSON persistence unavailable for ${path}`));
              }
              return bridge.writeJSON(path, value, metadata);
            },
            listTruthFiles: (prefix) => bridge.truthFileStore?.listFiles?.(prefix) ?? Promise.resolve([]),
            deleteTruthFile: (path) => {
              if (bridge.truthFileStore?.deleteFile) {
                return bridge.truthFileStore.deleteFile(path);
              }
              if (!bridge.deleteFile) {
                return Promise.reject(new Error(`SrsBackendWorker truth delete unavailable for ${path}`));
              }
              return bridge.deleteFile(path);
            },
            readIdentityRecoveryEvidence: () => authorityPublicationCoordinator.readEvidence(),
            ensureRecoveryActiveWriter: (input) => authorityPublicationCoordinator.ensureRecoveryActiveWriter(input),
            publishCertifiedAuthority: (input) => authorityPublicationCoordinator.publishCertifiedIntent(input),
            hasLegacyPetalSqliteDb: () => bridge.hasLegacyPetalSqliteDb?.() ?? Promise.resolve(false),
            readSyncConflictDatabaseSources: () => bridge.readSyncConflictDatabaseSources?.() ?? Promise.resolve([]),
            cleanupSyncConflictDatabaseSources: (sourceIds) => bridge.cleanupSyncConflictDatabaseSources?.(sourceIds) ?? Promise.resolve({
              cleaned: [],
              skipped: sourceIds.map((sourceId) => ({ sourceId, reason: 'cleanup host effect unavailable' })),
              failed: [],
            }),
            resolveExistingBlockIds: (blockIds: string[]) => resolveExistingBlockIdsViaSiyuan(
              browserSiyuanApi,
              blockIds,
            ),
            resolveNeuralGraphQuery: (request) => neuralRoamGraphQuery.query(request),
            executeAutoCard: options.executeAutoCard,
            executeAutoCardBatch: options.executeAutoCardBatch,
            executeProgressiveCommand: options.executeProgressiveCommand,
            executeTopicDerivedCommand: options.executeTopicDerivedCommand,
          },
        });
        const truthDeviceIdentity = await resolveTruthDeviceIdentity({
          authority: identityAuthority,
          caches: identityCaches,
          evidenceProbe: new SiyuanTruthDeviceIdentityEvidenceProbe(options.fileService),
          initializationFence: identityInitializationFence,
          hostFingerprint: (options.resolveSiyuanSystemId ?? resolveSiyuanSystemId)(),
        });
        const startupIdentityDisposition = createStartupIdentityDisposition(truthDeviceIdentity);
        if (!startupIdentityDisposition.writable) {
          logger.warn('[ApplicationContext] STORAGE_RECOVERY_REQUIRED: MessagePack truth writes are unavailable because startup identity disposition is not writable', {
            source: truthDeviceIdentity.source,
            localStatePath: truthDeviceIdentity.localStatePath,
            deviceId: truthDeviceIdentity.deviceId,
            identityEpoch: truthDeviceIdentity.identityEpoch ?? null,
            disposition: startupIdentityDisposition.status,
            retryable: startupIdentityDisposition.retryable,
            error: truthDeviceIdentity.error,
          });
        } else {
          logger.info('[ApplicationContext] MessagePack truth device identity ready', {
            source: truthDeviceIdentity.source,
            localStatePath: truthDeviceIdentity.localStatePath,
            deviceId: startupIdentityDisposition.deviceId,
            identityEpoch: startupIdentityDisposition.identityEpoch,
          });
        }
        srsBackendClient = new SrsBackendClient(srsBackendTransport, {
          startupIdentityDisposition,
          reviewTruthDevice: truthDeviceIdentity,
          reviewTruthFlush: startupIdentityDisposition.writable
            ? {
                deviceId: startupIdentityDisposition.deviceId!,
                identityEpoch: startupIdentityDisposition.identityEpoch!,
                generationId: REVIEW_TRUTH_GENERATION_ID,
                schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
              }
            : null,
          canWriteReviewTruth: () => (
            !backendMigrationRuntimePolicy.capabilities.writerRelayRequiredForBackendWrites
            || frontendInstanceRuntime?.getMode() === 'writer'
          ),
        });
        initialLoadResult = await srsBackendClient.loadDatabase();
      });
      logger.info('[ApplicationContext] ✅ SRS backend browser Worker transport bootstrap enabled by feature flag');
    } catch (error) {
      srsBackendTransport?.dispose?.();
      srsBackendTransport = null;
      srsBackendClient?.dispose?.();
      srsBackendClient = null;
      backendStartupError = formatBackendStartupError(error);
      logger.error('[ApplicationContext] Failed to bootstrap SRS backend browser Worker transport; backend runtime remains unavailable:', error);
    }
  }

  if (srsBackendClient && backendMigrationRuntimePolicy.capabilities.writerRelayRuntimeEnabled) {
    try {
      const backendClient = srsBackendClient;
      await measureRuntimePerformance('startup', 'frontend-instance-runtime.start', async () => {
        frontendInstanceRuntime = new FrontendInstanceRuntime(kernelSidecarClient, {
          instanceId: options.resolveKernelWriterLeaseInstanceId?.(),
          leaseTtlMs: options.resolveKernelWriterLeaseTtlMs?.(),
          backendContainer: siyuanBackendContainer,
          frontendKind: options.config.frontendKind,
          isBrowser: pluginRuntimeSurface.isBrowser,
          isMobile: pluginRuntimeSurface.isMobile,
          backendWorkerHealth: () => {
            const diagnostics = srsBackendTransport?.getDiagnostics?.();
            if (!diagnostics) {
              return { healthy: false, reason: 'diagnostics-unavailable' };
            }
            const healthy = diagnostics.health === 'healthy' || diagnostics.health === 'starting';
            return {
              healthy,
              reason: healthy
                ? null
                : diagnostics.lastTerminalError || diagnostics.health,
              diagnostics,
            };
          },
          writerCommandHandler: (command) => options.executeWriterRelayCommand(
            backendClient,
            command,
            {
              onKernelTransactionIngested: options.notifyKernelTransactionIngested,
              executeAgentTool: options.executeAgentTool,
            },
          ),
        });
        followerCommandClient = new FollowerCommandClient(kernelSidecarClient);
        await frontendInstanceRuntime.start();
      });
      logger.info('[ApplicationContext] ✅ Frontend instance runtime started for kernel writer lease', {
        instanceId: frontendInstanceRuntime.getInstanceId(),
        runtimeScopeId: frontendInstanceRuntime.getRuntimeScopeId(),
        mode: frontendInstanceRuntime.getMode(),
      });
    } catch (error) {
      frontendInstanceRuntime = null;
      followerCommandClient = null;
      logger.warn('[ApplicationContext] Frontend instance runtime unavailable; backend write families fail closed with explicit unavailable', error);
    }
  }

  return {
    srsBackendClient,
    srsBackendTransport,
    frontendInstanceRuntime,
    followerCommandClient,
    kernelSidecarClient,
    backendMigrationRuntimePolicy,
    backendStartupError,
    initialLoadResult,
  };
}

function createStartupIdentityDisposition(
  resolution: TruthDeviceIdentityResolution,
): BackendStartupIdentityDisposition {
  const deviceId = normalizeOptionalBackendString(resolution.deviceId) ?? null;
  const identityEpoch = normalizeOptionalBackendString(resolution.identityEpoch) ?? null;
  if (
    deviceId
    && identityEpoch
    && resolution.status === 'verified'
  ) {
    return {
      version: 1,
      status: 'verified',
      writable: true,
      retryable: false,
      deviceId,
      identityEpoch,
      source: resolution.source,
      reason: null,
    };
  }
  if (resolution.status === 'authority-unavailable') {
    return {
      version: 1,
      status: 'read-only-authority-unavailable',
      writable: false,
      retryable: true,
      deviceId,
      identityEpoch,
      source: resolution.source,
      reason: `IDENTITY_AUTHORITY_UNAVAILABLE: ${resolution.error ?? 'identity authority unavailable'}`,
    };
  }
  return {
    version: 1,
    status: 'read-only-recovery-required',
    writable: false,
    retryable: false,
    deviceId,
    identityEpoch,
    source: resolution.source,
    reason: resolution.error
      ?? `Truth Device Identity source is not verified for startup truth mutation: ${resolution.source}`,
  };
}

function formatBackendStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'unknown backend startup error');
}

function sqliteHostEffectDiagnostics(
  metadata?: SqlitePersistenceHostEffectMetadata | null,
): { diagnostics: Record<string, unknown> } | undefined {
  const diagnostics: Record<string, unknown> = {};
  if (metadata?.purpose) {
    diagnostics.sqliteDeltaPurpose = metadata.purpose;
  }
  if (metadata?.substep) {
    diagnostics.sqliteDeltaSubstep = metadata.substep;
  }
  return Object.keys(diagnostics).length > 0 ? { diagnostics } : undefined;
}

function createWorkerPersistenceBridge(fileService: FileService): SqlitePersistenceBridge {
  const truthFileStore = {
    readBinary: async (path: string) => {
      if (!fileService.readBinary) {
        return null;
      }
      return fileService.readBinary(path);
    },
    writeBinary: async (path: string, bytes: Uint8Array) => {
      if (!fileService.writeBinary) {
        throw new Error('FileService.writeBinary is unavailable');
      }
      await fileService.writeBinary(path, bytes);
    },
    readJSON: <T>(path: string) => fileService.readJSON<T>(path),
    writeJSON: (path: string, value: unknown) => fileService.writeJSON(path, value),
    listFiles: (prefix: string) => fileService.listFiles(prefix),
    deleteFile: (path: string) => fileService.deleteFile(path),
  };
  return {
    truthFileStore,
    readBinary: async (path: string) => {
      if (path === SQLITE_PROJECTION_DB_FILE) {
        return fileService.readTempProjectionBinary(path);
      }
      return fileService.readBinary(path);
    },
    writeBinary: async (path: string, bytes: Uint8Array, metadata?: SqlitePersistenceHostEffectMetadata) => {
      if (path === SQLITE_PROJECTION_DB_FILE) {
        await fileService.writeTempProjectionBinary(path, bytes, sqliteHostEffectDiagnostics(metadata));
        return;
      }
      await fileService.writeBinary(path, bytes, sqliteHostEffectDiagnostics(metadata));
    },
    listFiles: (prefix: string) => fileService.listFileEntries(prefix),
    deleteFile: async (path: string) => {
      await fileService.deleteFile(path);
      if (await fileService.readBinary(path)) {
        throw new Error(`FileService.deleteFile did not remove ${path}`);
      }
    },
    hasLegacyPetalSqliteDb: () => fileService.hasLegacyPetalSqliteDb(),
    readJSON: <T>(path: string) => fileService.readJSON<T>(path),
    writeJSON: (path: string, value: unknown) => fileService.writeJSON(path, value),
    readSyncConflictDatabaseSources: () => fileService.readSyncConflictDatabaseSources(),
    cleanupSyncConflictDatabaseSources: (sourceIds: string[]) => fileService.cleanupSyncConflictDatabaseSources(sourceIds),
  };
}

async function resolveExistingBlockIdsViaSiyuan(
  siyuanApi: Pick<QuerySiyuanPort, 'sql'>,
  blockIds: string[],
): Promise<string[]> {
  const normalized = Array.from(new Set(
    blockIds.map((blockId) => String(blockId || '').trim()).filter(Boolean),
  ));
  if (normalized.length === 0) {
    return [];
  }

  const existing: string[] = [];
  const batchSize = 500;
  for (let index = 0; index < normalized.length; index += batchSize) {
    const batch = normalized.slice(index, index + batchSize);
    const sql = `
      SELECT id
      FROM blocks
      WHERE id IN (${batch.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})
    `;
    const rows = await siyuanApi.sql<{ id?: unknown }>(sql);
    for (const row of rows) {
      const id = String(row.id || '').trim();
      if (id) {
        existing.push(id);
      }
    }
  }

  return Array.from(new Set(existing));
}

function normalizeBackendString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeOptionalBackendString(value: unknown): string | undefined {
  const normalized = normalizeBackendString(value);
  return normalized || undefined;
}

function readViteEnv(): RuntimeEnv {
  return typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env as RuntimeEnv
    : {};
}

function readProcessEnv(): RuntimeEnv {
  return typeof process !== 'undefined' && process.env
    ? process.env as RuntimeEnv
    : {};
}

function resolveSiyuanBackendContainer(): string {
  try {
    const system = (globalThis as unknown as {
      window?: {
        siyuan?: {
          config?: {
            system?: {
              container?: unknown;
            };
          };
        };
      };
    }).window?.siyuan?.config?.system;
    const container = String(system?.container || '').trim();
    return container || 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolveSiyuanSystemId(): string | null {
  try {
    const system = (globalThis as unknown as {
      window?: {
        siyuan?: {
          config?: {
            system?: {
              id?: unknown;
            };
          };
        };
      };
    }).window?.siyuan?.config?.system;
    const systemId = String(system?.id || '').trim();
    return systemId || null;
  } catch {
    return null;
  }
}

function resolveWindowLocationHref(): string {
  try {
    const runtime = globalThis as unknown as { window?: { location?: { href?: unknown } } };
    return String(runtime.window?.location?.href || '');
  } catch {
    return '';
  }
}

function resolveNavigatorUserAgent(): string {
  try {
    const runtime = globalThis as unknown as { navigator?: { userAgent?: unknown } };
    return String(runtime.navigator?.userAgent || '');
  } catch {
    return '';
  }
}

function resolveDocumentBodyClass(): string {
  try {
    const runtime = globalThis as unknown as { document?: { body?: { className?: unknown } } };
    return String(runtime.document?.body?.className || '');
  } catch {
    return '';
  }
}
