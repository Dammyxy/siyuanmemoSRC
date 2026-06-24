import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import type { IFileService } from '@/infrastructure/services/FileService';

function readApplicationContextSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/ApplicationContext.ts'), 'utf8');
}

function readBackendRuntimeFactorySource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/factories/createApplicationBackendRuntimeBundle.ts'), 'utf8');
}

function readTruthDeviceIdentitySource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/factories/truthDeviceIdentity.ts'), 'utf8');
}

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  writeBinary = vi.fn(async (fileName: string, bytes: Uint8Array) => {
    this.binary.set(fileName, new Uint8Array(bytes));
  });

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }
}

describe('ApplicationContext backend worker runtime boundary', () => {
  it('delegates browser Worker transport construction to a typed backend runtime bundle', () => {
    const contextSource = readApplicationContextSource();
    const factorySource = readBackendRuntimeFactorySource();

    expect(contextSource).toContain('createApplicationBackendRuntimeBundle');
    expect(contextSource).not.toContain('new BrowserSrsBackendWorkerTransport');
    expect(factorySource).toContain('export interface CreateApplicationBackendRuntimeBundleOptions');
    expect(factorySource).toContain('config: {');
    expect(factorySource).toContain('fileService: FileService');
    expect(factorySource).toContain('unifiedDataSourceManager: UnifiedDataSourceManager');
    expect(factorySource).toContain('executeWriterRelayCommand');
    expect(factorySource).not.toContain("from '@/application/ApplicationContext'");
    expect(factorySource).toContain('BrowserSrsBackendWorkerTransport');
    expect(factorySource).toContain("from '@/application/clients/BrowserSrsBackendWorkerTransport'");
    expect(factorySource).toContain('new BrowserSrsBackendWorkerTransport');
    expect(factorySource).toContain("schedulePendingReviewTruthFlush('startup')");
    expect(factorySource).not.toContain('new BackendKernel');
    expect(factorySource).not.toContain("from '../../worker/bootstrap/BackendKernel'");
    expect(factorySource).not.toContain("from '../../worker/db/SqliteDatabaseService'");
  });

  it('passes backend Worker health diagnostics into the frontend writer runtime', () => {
    const source = readBackendRuntimeFactorySource();

    expect(source).toContain('backendWorkerHealth: () =>');
    expect(source).toContain('srsBackendTransport?.getDiagnostics?.()');
    expect(source).toContain("diagnostics.health === 'healthy'");
    expect(source).toContain("diagnostics.health === 'starting'");
  });

  it('uses a truth-wide local device identity key for MessagePack truth writes', () => {
    const factorySource = readBackendRuntimeFactorySource();
    const identitySource = readTruthDeviceIdentitySource();

    expect(factorySource).toContain('resolveTruthDeviceIdentity({ localStore: options.fileService })');
    expect(factorySource).toContain('TRUTH_DEVICE_ID_UNAVAILABLE');
    expect(identitySource).toContain("TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.truth.deviceId.v1'");
    expect(identitySource).toContain("LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1'");
    expect(identitySource).toContain("TRUTH_DEVICE_ID_LOCAL_STATE_PATH = 'truth-device-id.v1.json'");
    expect(identitySource).not.toContain("const REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1'");
  });

  it('constructs renderer sqlite projection on the temp DB adapter without implicit startup checkpointing', () => {
    const contextSource = readApplicationContextSource();

    expect(contextSource).toContain('createSqlProjectionFileService(fileService)');
    expect(contextSource).toContain('fileService.readTempProjectionBinary(fileName)');
    expect(contextSource).toContain('fileService.writeTempProjectionBinary(fileName, bytes, options)');
    expect(contextSource).toContain('new SqliteDatabaseService(sqlFileService, SQLITE_DB_FILE, {');
    expect(contextSource).toContain('persistOnInit: false');
    expect(contextSource).toContain('enableDeltaPersistence: true');
    expect(contextSource).toContain("checkpointStorageClass: 'volatile-projection'");
  });

  it('routes backend Worker sqlite projection effects to temp while keeping truth effects on plugin storage', () => {
    const source = readBackendRuntimeFactorySource();
    const workerSource = readFileSync(resolve(process.cwd(), 'worker/db/SqliteDatabaseService.ts'), 'utf8');

    expect(source).toContain('path === SQLITE_PROJECTION_DB_FILE');
    expect(source).toContain('fileService.readTempProjectionBinary(path)');
    expect(source).toContain('fileService.writeTempProjectionBinary(path, bytes)');
    expect(source).toContain('truthFileStore');
    expect(source).toContain('return fileService.readBinary(path)');
    expect(source).toContain('await fileService.writeBinary(path, bytes)');
    expect(workerSource).toContain("checkpointStorageClass: 'volatile-projection'");
  });

  it('runs progressive excerpt completion startup repair after ready without transaction fanout repair', () => {
    const contextSource = readApplicationContextSource();
    const readyIndex = contextSource.indexOf('[ApplicationContext] ✅ ApplicationContext created successfully');
    const scheduleIndex = contextSource.indexOf('context.scheduleProgressiveExcerptCompletionStartupRepair();');
    const transactionStart = contextSource.indexOf('async updateTransactionWebSocketService(): Promise<void>');
    const nextMethodStart = contextSource.indexOf('\n  async ', transactionStart + 1);
    const transactionMethodSource = contextSource.slice(transactionStart, nextMethodStart);

    expect(scheduleIndex).toBeGreaterThan(readyIndex);
    expect(contextSource).toContain('this.progressiveExcerptCompletionRepairTimer = setTimeout(() =>');
    expect(contextSource).toContain('this.getProgressiveExcerptCompletionService().repairBatch({ limit: 20 })');
    expect(transactionMethodSource).not.toContain('ProgressiveExcerptCompletion');
    expect(transactionMethodSource).not.toContain('repairBatch');
  });

  it('does not write siyuanmemo.db during renderer sqlite startup fixture initialization', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });

    await database.init();

    expect(fileService.writeBinary).not.toHaveBeenCalled();
    database.dispose();
  });

  it('keeps public backend runtime accessors and disposal compatible with bundle services', async () => {
    const srsBackendClient = { marker: 'backend-client' };
    const srsBackendTransport = {
      dispose: vi.fn(),
    };
    const frontendInstanceRuntime = {
      dispose: vi.fn(async () => undefined),
      getMode: () => 'writer',
      getInstanceId: () => 'instance-1',
    };
    const followerCommandClient = { marker: 'follower-command-client' };
    const kernelSidecarClient = { marker: 'kernel-sidecar-client' };
    const runtimePolicy = {
      flags: {
        backendWorker: true,
        writerLeaseGuard: true,
        autoCardDecisionRelay: true,
        kernelTransactionIngest: true,
        privateApi: true,
        aiBackendRuntime: true,
      },
      capabilities: {
        backendWorkerAvailable: true,
        writerRelayRuntimeEnabled: true,
        writerRelayRequiredForBackendWrites: true,
        reviewFeedbackWriteEnabled: true,
        autoCardExecuteWriteEnabled: true,
        autoCardDecisionBackendEnabled: true,
        kernelTransactionIngestEnabled: true,
        privateApiReadEnabled: true,
        privateApiMutationEnabled: true,
        aiBackendSessionEnabled: true,
      },
      behavior: {},
    };
    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      srsBackendClient,
      srsBackendTransport,
      frontendInstanceRuntime,
      followerCommandClient,
      kernelSidecarClient,
      backendMigrationRuntimePolicy: runtimePolicy,
    });

    expect(context.getSrsBackendClient()).toBe(srsBackendClient);
    expect(context.getFrontendInstanceRuntime()).toBe(frontendInstanceRuntime);
    expect(context.getFollowerCommandClient()).toBe(followerCommandClient);
    expect(context.getKernelSidecarClient()).toBe(kernelSidecarClient);
    expect(context.getBackendMigrationRuntimePolicy()).toBe(runtimePolicy);

    await context.dispose({ persistStorage: false });

    expect(frontendInstanceRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(srsBackendTransport.dispose).toHaveBeenCalledTimes(1);
    expect(context.getSrsBackendClient()).toBeNull();
    expect(context.getFrontendInstanceRuntime()).toBeNull();
    expect(context.getFollowerCommandClient()).toBeNull();
  });

  it('scopes temporary AutoCard backend execution handlers for one-click scans', async () => {
    const runtimePolicy = {
      flags: {
        backendWorker: true,
        writerLeaseGuard: true,
        autoCardDecisionRelay: true,
        kernelTransactionIngest: true,
        privateApi: true,
        aiBackendRuntime: true,
      },
      capabilities: {
        backendWorkerAvailable: true,
        writerRelayRuntimeEnabled: true,
        writerRelayRequiredForBackendWrites: true,
        reviewFeedbackWriteEnabled: true,
        autoCardExecuteWriteEnabled: true,
        autoCardDecisionBackendEnabled: true,
        kernelTransactionIngestEnabled: true,
        privateApiReadEnabled: true,
        privateApiMutationEnabled: true,
        aiBackendSessionEnabled: true,
      },
      behavior: {},
    };
    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      kernelSidecarClient: { marker: 'kernel-sidecar-client' },
      backendMigrationRuntimePolicy: runtimePolicy,
    });
    const activeHandler = { name: 'active-handler' } as never;
    const tempHandler = { name: 'temp-handler' } as never;
    (context as unknown as { autoCardHandler?: unknown }).autoCardHandler = activeHandler;

    let handlerDuringScope: unknown;
    await context.runWithAutoCardBackendExecutionHandler(tempHandler, async () => {
      handlerDuringScope = (context as unknown as {
        getAutoCardBackendExecutionHandler: () => unknown;
      }).getAutoCardBackendExecutionHandler();
    });

    expect(handlerDuringScope).toBe(tempHandler);
    expect((context as unknown as {
      getAutoCardBackendExecutionHandler: () => unknown;
    }).getAutoCardBackendExecutionHandler()).toBe(activeHandler);
  });

  it('defers native Riff upsert sync while AutoCard backend execution is active', () => {
    const contextSource = readApplicationContextSource();

    expect(contextSource).toContain('runAutoCardBackendExecution(() => autoCardHandler.executeEnvelopeFromBackend(request))');
    expect(contextSource).toContain('runAutoCardBackendExecution(() => autoCardHandler.executeBatchFromBackend(request))');
    expect(contextSource).toContain('deferNativeRiffUpsertWhile: () => this.isAutoCardBackendExecutionInProgress()');
    expect(contextSource).toContain('this.autoCardBackendExecutionDepth > 0');
  });

  it('does not leave backend Worker transport alive when frontend runtime dispose hangs during unload', async () => {
    vi.useFakeTimers();
    try {
      const srsBackendClient = {
        dispose: vi.fn(),
        flushReviewTruthBeforeUnload: vi.fn(async () => false),
      };
      const srsBackendTransport = {
        dispose: vi.fn(),
      };
      const frontendInstanceRuntime = {
        dispose: vi.fn(() => new Promise<void>(() => {})),
        getMode: () => 'writer',
        getInstanceId: () => 'instance-hanging-dispose',
      };
      const runtimePolicy = {
        flags: {
          backendWorker: true,
          writerLeaseGuard: true,
          autoCardDecisionRelay: true,
          kernelTransactionIngest: true,
          privateApi: true,
          aiBackendRuntime: true,
        },
        capabilities: {
          backendWorkerAvailable: true,
          writerRelayRuntimeEnabled: true,
          writerRelayRequiredForBackendWrites: true,
          reviewFeedbackWriteEnabled: true,
          autoCardExecuteWriteEnabled: true,
          autoCardDecisionBackendEnabled: true,
          kernelTransactionIngestEnabled: true,
          privateApiReadEnabled: true,
          privateApiMutationEnabled: true,
          aiBackendSessionEnabled: true,
        },
        behavior: {},
      };
      const TestableApplicationContext = ApplicationContext as unknown as new (
        config: unknown,
        services: unknown,
      ) => ApplicationContext;
      const context = new TestableApplicationContext({
        plugin: { name: 'test-plugin', app: {} },
        i18n: {},
      }, {
        storageManager: {},
        unifiedStorageManager: { save: vi.fn() },
        schedulerRouter: {},
        rescheduleService: {},
        unifiedDataSourceManager: {},
        blockMenuHandler: {},
        srsBackendClient,
        srsBackendTransport,
        frontendInstanceRuntime,
        backendMigrationRuntimePolicy: runtimePolicy,
      });

      const disposeCompleted = vi.fn();
      void context.dispose({ persistStorage: false }).then(disposeCompleted);

      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();

      expect(disposeCompleted).toHaveBeenCalledTimes(1);
      expect(frontendInstanceRuntime.dispose).toHaveBeenCalledTimes(1);
      expect(srsBackendClient.dispose).toHaveBeenCalledTimes(1);
      expect(srsBackendTransport.dispose).toHaveBeenCalledTimes(1);
      expect(context.getSrsBackendClient()).toBeNull();
      expect(context.getFrontendInstanceRuntime()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues disposing later services when one service dispose hangs', async () => {
    vi.useFakeTimers();
    try {
      const disposedAfterHangingService = vi.fn();
      const TestableApplicationContext = ApplicationContext as unknown as new (
        config: unknown,
        services: unknown,
      ) => ApplicationContext;
      const context = new TestableApplicationContext({
        plugin: { name: 'test-plugin', app: {} },
        i18n: {},
      }, {
        storageManager: {},
        unifiedStorageManager: { save: vi.fn() },
        schedulerRouter: {
          dispose: disposedAfterHangingService,
        },
        rescheduleService: {},
        unifiedDataSourceManager: {
          dispose: vi.fn(() => new Promise<void>(() => {})),
        },
        blockMenuHandler: {},
      });

      const disposeCompleted = vi.fn();
      void context.dispose({ persistStorage: false }).then(disposeCompleted);

      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();

      expect(disposeCompleted).toHaveBeenCalledTimes(1);
      expect(disposedAfterHangingService).toHaveBeenCalledTimes(1);
      expect(context.isDisposed()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes follower domain sync diagnostics reads through writer relay runtime', async () => {
    const domainSyncStatus = vi.fn(async () => {
      throw new Error('follower must not read local domain sync status');
    });
    const domainSyncRepairPreview = vi.fn(async () => {
      throw new Error('follower must not create local repair preview');
    });
    const domainSyncConflictSourceCleanupCandidates = vi.fn(async () => {
      throw new Error('follower must not read local cleanup candidates');
    });
    const statusResult = {
      ok: true,
      ledger: {
        operationCount: 0,
        newestOperationAt: null,
        operationTypes: {},
      },
      processedSources: {
        recent: [],
        skipped: [],
        totalProcessed: 0,
        totalSkipped: 0,
      },
      sanity: {
        status: 'clean',
        checkedAt: 1,
        ledgerOperationCount: 0,
        pendingImportCount: 0,
        processedSourceCount: 0,
        skippedSourceCount: 0,
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
        reasonCounts: {},
        affectedCardIds: [],
        truncated: false,
      },
      repair: {
        available: false,
        repairableDivergenceCount: 0,
        latestPlanId: null,
      },
    };
    const previewResult = {
      ok: true,
      planId: 'writer-plan',
      status: 'no-repair',
      createdAt: 1,
      affectedCardCount: 0,
      evidence: [],
      plannedMutations: [],
      unrepairableReasons: [],
      schedulerEvidence: {
        schedulerType: null,
        configHash: null,
        capturedAt: 1,
      },
      truncated: false,
      limit: 50,
    };
    const candidatesResult = {
      ok: true,
      sanityStatus: 'clean',
      candidates: [],
    };
    const submitAndWait = vi.fn(async (request: { method: string }) => {
      if (request.method === 'domainSync.status') {
        return statusResult;
      }
      if (request.method === 'domainSync.repair.preview') {
        return previewResult;
      }
      if (request.method === 'domainSync.conflictSources.cleanupCandidates') {
        return candidatesResult;
      }
      throw new Error(`unexpected method ${request.method}`);
    });
    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      srsBackendClient: {
        domainSyncStatus,
        domainSyncRepairPreview,
        domainSyncRepairApply: vi.fn(),
        domainSyncConflictSourcesCleanup: vi.fn(),
        domainSyncConflictSourceCleanupCandidates,
      },
      frontendInstanceRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'follower-domain-sync',
      },
      followerCommandClient: {
        submitAndWait,
      },
    });

    await expect(context.readDomainSyncDiagnostics({ context: 'read-only-preflight' })).resolves.toBe(statusResult);
    await expect(context.previewDomainSyncRepair({ limit: 10 })).resolves.toBe(previewResult);
    await expect(context.listDomainSyncConflictSourceCleanupCandidates()).resolves.toBe(candidatesResult);

    expect(domainSyncStatus).not.toHaveBeenCalled();
    expect(domainSyncRepairPreview).not.toHaveBeenCalled();
    expect(domainSyncConflictSourceCleanupCandidates).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'follower-domain-sync',
      method: 'domainSync.status',
      params: { context: 'read-only-preflight' },
    });
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'follower-domain-sync',
      method: 'domainSync.repair.preview',
      params: { limit: 10 },
    });
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'follower-domain-sync',
      method: 'domainSync.conflictSources.cleanupCandidates',
      params: {},
    });
  });

  it('does not rewrite a clean sqlite database during dispose when storage persistence is disabled', async () => {
    const fileService = new MemorySqliteFileService();
    const seeded = new SqliteDatabaseService(fileService);
    await seeded.init();
    const writesAfterSeed = fileService.writeBinary.mock.calls.length;
    seeded.dispose();

    const cleanDatabase = new SqliteDatabaseService(fileService);
    await cleanDatabase.init();
    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      sqlPersistence: {
        database: cleanDatabase,
      },
    });

    await context.dispose({ persistStorage: false });

    expect(fileService.writeBinary).toHaveBeenCalledTimes(writesAfterSeed);
  });

  it('does not checkpoint a dirty renderer sqlite projection during normal dispose', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.writeBinary.mockClear();

    await database.runTransaction('dirty-renderer-projection', (db) => {
      db.run('CREATE TABLE renderer_dispose_checkpoint_guard (id TEXT PRIMARY KEY)');
      db.run('INSERT INTO renderer_dispose_checkpoint_guard (id) VALUES (?)', ['dirty']);
    }, { persist: false });

    expect(fileService.writeBinary).not.toHaveBeenCalled();

    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      sqlPersistence: {
        database,
      },
    });

    await context.dispose({ persistStorage: false });

    expect(fileService.writeBinary).not.toHaveBeenCalled();
  });
});
