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
import {
  collectBackendMigrationRuntimeEnv,
  resolveBackendMigrationRuntimePolicy,
  type BackendMigrationRuntimePolicy,
  type RuntimeEnv,
} from '@/application/backendMigration/runtimePolicy';
import { FileService } from '@/infrastructure/services/FileService';
import { SiyuanKernelCompanionAdapter } from '@/infrastructure/siyuan/SiyuanKernelCompanionAdapter';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { AINetworkProxyPort } from '@/application/ports/AINetworkProxyPort';
import type { NeuralRoamNodeTypeResolverPort } from '@/core/queue/domain/ports';
import type { NeuralRoamCardFacts } from '@/core/queue/neural/NeuralRoamCardFacts';
import { XiuyuanSyncSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter';
import { createLogger } from '@/utils/logger';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';
import type {
  BackendXiuyuanNativeRiffBlockFacts,
  BackendXiuyuanRiffReadAuditRequest,
  BackendXiuyuanRiffReadAuditResult,
} from '../../../packages/contracts/src/backend-rpc';
import { MESSAGEPACK_TRUTH_SCHEMA_VERSION } from '../../../packages/contracts/src/backend-rpc';
import type { SqlitePersistenceBridge } from '../../../worker/db/SqlitePersistenceBridge';

const logger = createLogger('ApplicationContext');
const TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.truth.deviceId.v1';
const LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1';
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
  executeProgressiveCommand?: BrowserSrsBackendWorkerHostEffects['executeProgressiveCommand'];
  executeTopicDerivedCommand?: BrowserSrsBackendWorkerHostEffects['executeTopicDerivedCommand'];
  executeReviewRiffFeedback?: BrowserSrsBackendWorkerHostEffects['executeReviewRiffFeedback'];
  executeWriterRelayCommand: (
    backendClient: SrsBackendClient,
    command: ApplicationBackendWriterRelayCommand,
    hooks?: {
      onKernelTransactionIngested?: () => void;
    },
  ) => Promise<unknown>;
  notifyKernelTransactionIngested?: () => void;
  kernelSidecarClient?: KernelSidecarClient;
  createBlockExistenceSiyuanPort: () => Pick<BrowserSiyuanPort, 'sql'>;
  createNeuralRoamGraphQuery: (deps: NeuralRoamGraphQueryFactoryDeps) => NeuralRoamGraphQueryHost;
  createAiNetworkProxy: (kernelSidecarClient: KernelSidecarClient) => Pick<AINetworkProxyPort, 'execute'>;
  resolveKernelWriterLeaseInstanceId?: () => string | undefined;
  resolveKernelWriterLeaseTtlMs?: () => number | undefined;
  resolveSiyuanBackendContainer?: () => string;
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

  if (backendMigrationRuntimePolicy.capabilities.backendWorkerAvailable) {
    try {
      await measureRuntimePerformance('startup', 'backend-worker.bootstrap', async () => {
        const bridge = createWorkerPersistenceBridge(options.fileService);
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
        const aiNetworkProxy = options.createAiNetworkProxy(kernelSidecarClient);
        srsBackendTransport = new BrowserSrsBackendWorkerTransport({
          hostEffects: {
            readBinary: (path) => bridge.readBinary(path),
            writeBinary: (path, bytes) => bridge.writeBinary(path, bytes),
            readJSON: <T>(path: string) => bridge.readJSON?.<T>(path) ?? Promise.resolve(null),
            writeJSON: (path, value) => {
              if (!bridge.writeJSON) {
                return Promise.reject(new Error(`SrsBackendWorker JSON persistence unavailable for ${path}`));
              }
              return bridge.writeJSON(path, value);
            },
            readTruthBinary: (path) => bridge.truthFileStore?.readBinary(path) ?? bridge.readBinary(path),
            writeTruthBinary: (path, bytes) => bridge.truthFileStore?.writeBinary(path, bytes) ?? bridge.writeBinary(path, bytes),
            readTruthJSON: <T>(path: string) => bridge.truthFileStore?.readJSON<T>(path) ?? bridge.readJSON?.<T>(path) ?? Promise.resolve(null),
            writeTruthJSON: (path, value) => {
              if (bridge.truthFileStore) {
                return bridge.truthFileStore.writeJSON(path, value);
              }
              if (!bridge.writeJSON) {
                return Promise.reject(new Error(`SrsBackendWorker truth JSON persistence unavailable for ${path}`));
              }
              return bridge.writeJSON(path, value);
            },
            listTruthFiles: (prefix) => bridge.truthFileStore?.listFiles?.(prefix) ?? Promise.resolve([]),
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
            readXiuyuanRiffFacts: (request) => readXiuyuanRiffFactsViaApprovedAdapter(request),
            executeAutoCard: options.executeAutoCard,
            executeProgressiveCommand: options.executeProgressiveCommand,
            executeTopicDerivedCommand: options.executeTopicDerivedCommand,
            executeReviewRiffFeedback: options.executeReviewRiffFeedback,
            executeAiPrompt: async (request, context) => aiNetworkProxy.execute({
              ...request,
              streamId: context.streamId,
              sessionId: context.sessionId,
              jobId: context.jobId,
            }),
          },
        });
        const truthDeviceId = resolveTruthDeviceId();
        if (!truthDeviceId) {
          logger.warn('[ApplicationContext] TRUTH_DEVICE_ID_UNAVAILABLE: MessagePack truth writes are unavailable because local device identity is not persistent');
        }
        srsBackendClient = new SrsBackendClient(srsBackendTransport, {
          reviewTruthFlush: truthDeviceId
            ? {
                deviceId: truthDeviceId,
                generationId: REVIEW_TRUTH_GENERATION_ID,
                schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
              }
            : null,
        });
        if (truthDeviceId) {
          void srsBackendClient.schedulePendingReviewTruthFlush('startup');
        }
      });
      logger.info('[ApplicationContext] ✅ SRS backend browser Worker transport bootstrap enabled by feature flag');
    } catch (error) {
      srsBackendTransport?.dispose?.();
      srsBackendTransport = null;
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
  };
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
  };
  return {
    truthFileStore,
    readBinary: async (path: string) => {
      if (path === SQLITE_PROJECTION_DB_FILE) {
        return fileService.readTempProjectionBinary(path);
      }
      return fileService.readBinary(path);
    },
    writeBinary: async (path: string, bytes: Uint8Array) => {
      if (path === SQLITE_PROJECTION_DB_FILE) {
        await fileService.writeTempProjectionBinary(path, bytes);
        return;
      }
      await fileService.writeBinary(path, bytes);
    },
    readJSON: <T>(path: string) => fileService.readJSON<T>(path),
    writeJSON: (path: string, value: unknown) => fileService.writeJSON(path, value),
    readSyncConflictDatabaseSources: () => fileService.readSyncConflictDatabaseSources(),
    cleanupSyncConflictDatabaseSources: (sourceIds: string[]) => fileService.cleanupSyncConflictDatabaseSources(sourceIds),
  };
}

function isMessagePackTruthIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.trim())
    && !value.trim().includes('..');
}

function createTruthDeviceId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const randomId = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `device-${randomId}`;
}

function resolveTruthDeviceId(): string | null {
  try {
    const storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
    if (!storage) {
      return null;
    }
    const stored = storage.getItem(TRUTH_DEVICE_ID_STORAGE_KEY);
    if (isMessagePackTruthIdentity(stored)) {
      return stored.trim();
    }
    const legacyStored = storage.getItem(LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY);
    if (isMessagePackTruthIdentity(legacyStored)) {
      const migrated = legacyStored.trim();
      storage.setItem(TRUTH_DEVICE_ID_STORAGE_KEY, migrated);
      return migrated;
    }
    const next = createTruthDeviceId();
    storage.setItem(TRUTH_DEVICE_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

async function resolveExistingBlockIdsViaSiyuan(
  siyuanApi: Pick<BrowserSiyuanPort, 'sql'>,
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

function normalizeRiffFactBlock(block: {
  id?: unknown;
  content?: unknown;
  ial?: Record<string, string>;
  riffCardID?: unknown;
  riffCardId?: unknown;
  riffCard?: BackendXiuyuanNativeRiffBlockFacts['riffCard'];
}): BackendXiuyuanNativeRiffBlockFacts {
  return {
    id: normalizeBackendString(block.id),
    content: String(block.content ?? ''),
    ial: block.ial && typeof block.ial === 'object' ? block.ial : undefined,
    riffCardID: normalizeOptionalBackendString(block.riffCardID),
    riffCardId: normalizeOptionalBackendString(block.riffCardId),
    riffCard: block.riffCard,
  };
}

async function readXiuyuanRiffFactsViaApprovedAdapter(
  request: BackendXiuyuanRiffReadAuditRequest,
): Promise<BackendXiuyuanRiffReadAuditResult> {
  const requestId = normalizeBackendString(request.requestId) || `riff-read-${Date.now()}`;
  const deckId = normalizeBackendString(request.deckId);
  const mode = request.mode === 'incremental' || request.mode === 'full' || request.mode === 'audit'
    ? request.mode
    : 'audit';
  const adapter = new XiuyuanSyncSiyuanAdapter();
  try {
    const scope = request.scope ?? {};
    const rawBlocks = mode === 'incremental'
      ? await adapter.getRiffNewCards(deckId, Number.isFinite(Number(request.since)) ? Number(request.since) : undefined)
      : await adapter.getRiffCards(deckId, {
        dueOnly: scope.dueOnly === true,
        notebook: normalizeOptionalBackendString(scope.notebook),
        rootID: normalizeOptionalBackendString(scope.rootId),
        includeNew: scope.includeNew !== false,
      });
    const blockIdScope = new Set(
      (Array.isArray(scope.blockIds) ? scope.blockIds : [])
        .map(normalizeBackendString)
        .filter(Boolean),
    );
    const scopedBlocks = blockIdScope.size > 0
      ? rawBlocks.filter((block) => blockIdScope.has(normalizeBackendString(block.id)))
      : rawBlocks;
    const blocks = scopedBlocks.map(normalizeRiffFactBlock);
    const normalizedBlockCount = blocks.filter((block) => block.id && normalizeBackendString(block.content)).length;
    const malformedBlockCount = blocks.length - normalizedBlockCount;
    return {
      status: 'ready',
      requestId,
      mode,
      deckId,
      readAt: Date.now(),
      blocks,
      diagnostics: {
        source: 'renderer-host-effect',
        blockCount: blocks.length,
        normalizedBlockCount,
        malformedBlockCount,
        truncated: false,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'native Riff read failed');
    return {
      status: 'unavailable',
      requestId,
      mode,
      deckId,
      unavailableClass: 'UPSTREAM_SIYUAN_UNAVAILABLE',
      reason: message,
      recoverable: true,
      blocks: [],
      diagnostics: {
        source: 'renderer-host-effect',
        blockCount: 0,
        normalizedBlockCount: 0,
        malformedBlockCount: 0,
        truncated: false,
        errorCategory: 'UPSTREAM_SIYUAN_UNAVAILABLE',
      },
    };
  }
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
