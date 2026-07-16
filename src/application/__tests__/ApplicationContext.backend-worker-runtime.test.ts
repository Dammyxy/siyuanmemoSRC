import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import {
  IntegrationRuntimeAccess,
  ProgressiveRuntimeAccess,
} from '@/application/runtime-access';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import type { IFileService } from '@/infrastructure/services/FileService';
import type {
  KernelCompanionBackgroundWorkSubmitRequest,
  KernelCompanionStoragePressureRecoveryDiagnostics,
} from '@/application/backgroundWork/KernelCompanionBackgroundWorkRegistry';
import type {
  BackendDeferredStartupWorkDescriptor,
  BackendStoragePressureRecoveryResult,
} from '../../../packages/contracts/src/backend-rpc';

function readApplicationContextSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/ApplicationContext.ts'), 'utf8');
}

function readIndexSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
}

function readBackendRuntimeFactorySource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/factories/createApplicationBackendRuntimeBundle.ts'), 'utf8');
}

function readTruthDeviceIdentitySource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/factories/truthDeviceIdentity.ts'), 'utf8');
}

function createRuntimeAccessFixture() {
  return {
    progressiveRuntimeAccess: new ProgressiveRuntimeAccess(),
    integrationRuntimeAccess: new IntegrationRuntimeAccess(),
    bootstrapCallbackPorts: [],
  };
}

function createStoragePressureRecoveryDescriptor(
  overrides: Partial<BackendDeferredStartupWorkDescriptor> = {},
): BackendDeferredStartupWorkDescriptor {
  return {
    version: 1,
    kind: 'storage-pressure-recovery',
    owner: 'application-context',
    phase: 'post-ready',
    reason: 'db.load',
    safeToDefer: true,
    statusReference: {
      kind: 'kernel-companion-background-work',
      workKind: 'storage-pressure-recovery',
    },
    frontier: {
      pluginInstallationId: 'plugin-A',
      identityEpoch: 'epoch-A',
      inputVersion: 'startup-maintenance-input-v1',
      frontierHash: 'frontier-A',
      recoveryStatus: 'ready',
      journalSequenceFrontier: 17,
      truthCoverageFrontier: 0,
      externalInputDirtyGeneration: 0,
      pendingExternalMerge: false,
    },
    ...overrides,
  };
}

function createStoragePressureRecoveryResult(
  overrides: Partial<BackendStoragePressureRecoveryResult> = {},
): BackendStoragePressureRecoveryResult {
  return {
    ok: true,
    phase: 'completed',
    adoption: { status: 'noop', adoptedEntryCount: 0, unsupportedEntries: [] },
    promotion: { batchCount: 0, truthCoverageFrontier: 17 },
    deltaCompaction: {
      status: 'compacted',
      candidateEntryCount: 0,
      reclaimableEntryCount: 0,
      retainedEntryCount: 0,
    },
    orphanCleanup: {
      status: 'completed',
      deletedFiles: [],
      failedFiles: [],
      remainingOrphanFileCount: 0,
      remainingOrphanBytes: 0,
    },
    inventory: {
      version: 1,
      measuredAt: 100,
      metrics: [],
      pressure: {
        version: 1,
        measuredAt: 100,
        level: 'normal',
        metrics: [],
        blockingMutationGrowth: false,
        code: null,
        reason: null,
      },
    },
    error: null,
    ...overrides,
  };
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
    expect(factorySource).not.toContain("schedulePendingReviewTruthFlush('startup')");
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

    expect(factorySource).toContain('resolveTruthDeviceIdentity({');
    expect(factorySource).toContain('localStore: options.fileService');
    expect(factorySource).toContain('identityStore: new IndexedDbTruthDeviceIdentityStore()');
    expect(factorySource).toContain('hostFingerprint: (options.resolveSiyuanSystemId ?? resolveSiyuanSystemId)()');
    expect(factorySource).toContain('STORAGE_RECOVERY_REQUIRED');
    expect(identitySource).toContain("TRUTH_DEVICE_IDENTITY_STORAGE_KEY = 'siyuanmemo.truth.identity.v2'");
    expect(identitySource).toContain("TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.truth.deviceId.v1'");
    expect(identitySource).toContain("LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1'");
    expect(identitySource).toContain("TRUTH_DEVICE_ID_LOCAL_STATE_PATH = 'truth-device-id.v1.json'");
    expect(identitySource).not.toContain("const REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1'");
  });

  it('hydrates renderer memory from the Worker projection without renderer sqlite composition', () => {
    const contextSource = readApplicationContextSource();

    expect(contextSource).not.toContain('createSqlProjectionFileService(fileService)');
    expect(contextSource).not.toContain('new SqliteDatabaseService(');
    expect(contextSource).not.toContain('new SqlUnifiedStorageRepository(');
    expect(contextSource).not.toContain('sqlPersistence');
    expect(contextSource).not.toContain('unifiedStorageManager.save(');
    expect(contextSource).not.toContain('persistDatabase(');
    expect(contextSource).toContain('const loadResult = await srsBackendClient.loadDatabase();');
    expect(contextSource).toContain('return loadResult.projectionSnapshot as UnifiedCardStore;');
    expect(contextSource).toContain(
      'unifiedStorageManager.setReadPersistenceCallbacks(unifiedLoad, unifiedDeltaPersistence);',
    );
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
    expect(contextSource).toContain("kind: 'progressive-excerpt-completion-repair'");
    expect(contextSource).toContain('this.srsBackendClient?.getBackgroundWorkRegistry()');
    expect(contextSource).toContain('this.progressiveExcerptCompletionRepairJobId = submitResult.job.jobId;');
    expect(contextSource).toContain('this.getProgressiveExcerptCompletionService().repairBatch({ limit: 20 })');
    expect(transactionMethodSource).not.toContain('ProgressiveExcerptCompletion');
    expect(transactionMethodSource).not.toContain('repairBatch');
  });

  it('keeps plugin ready transition after handlers and then hands off post-ready startup maintenance', () => {
    const indexSource = readIndexSource();
    const contextSource = readApplicationContextSource();
    const coordinatorSource = contextSource.slice(
      contextSource.indexOf('startPostReadyStartupMaintenance('),
      contextSource.indexOf('\n  async reloadBackendDatabaseAfterReady('),
    );
    const registerHandlersIndex = indexSource.indexOf("measureRuntimePerformance('startup', 'plugin.register-runtime-handlers'");
    const initializedIndex = indexSource.indexOf('this.isInitialized = true;', registerHandlersIndex);
    const resolveIndex = indexSource.indexOf('this.contextReady.resolve(context);', registerHandlersIndex);
    const handoffIndex = indexSource.indexOf("context.startPostReadyStartupMaintenance('plugin.onload-ready');", registerHandlersIndex);
    const catchIndex = indexSource.indexOf('} catch (err) {', registerHandlersIndex);
    const catchSource = indexSource.slice(catchIndex, indexSource.indexOf('\n    }', catchIndex));

    expect(registerHandlersIndex).toBeGreaterThan(0);
    expect(initializedIndex).toBeGreaterThan(registerHandlersIndex);
    expect(resolveIndex).toBeGreaterThan(registerHandlersIndex);
    expect(handoffIndex).toBeGreaterThan(resolveIndex);
    expect(catchIndex).toBeGreaterThan(handoffIndex);
    expect(catchSource).toContain('this.contextReady.reject(err);');
    expect(catchSource).not.toContain('startPostReadyStartupMaintenance');
    expect(contextSource).toContain('startPostReadyStartupMaintenance(');
    expect(contextSource).toContain('descriptors?: readonly BackendDeferredStartupWorkDescriptor[]');
    expect(contextSource).toContain("kind: 'startup-storage-maintenance'");
    expect(contextSource).toContain('deferredDescriptorCount: deferredDescriptors.length');
    expect(contextSource).toContain('createStartupMaintenanceReceiptScope(');
    expect(contextSource).toContain('receiptScopeAvailable: receiptScope !== null');
    expect(contextSource).toContain('runStartupWorkerStorageMaintenance({');
    expect(contextSource).toContain('ownedPhaseCount: 2');
    expect(contextSource).toContain("scheduleNormalizationPhase: 'completed'");
    expect(contextSource).toContain("orphanCardRepairPhase: 'completed'");
    expect(coordinatorSource).not.toContain('schedulePendingReviewTruthFlush');
    expect(coordinatorSource).not.toContain('reviewTruthMaintenanceScheduled');
  });

  it('does not run startup storage maintenance inside ApplicationContext.create', () => {
    const contextSource = readApplicationContextSource();
    const createSource = contextSource.slice(
      contextSource.indexOf('static async create(config: ApplicationConfig): Promise<ApplicationContext>'),
      contextSource.indexOf('\n  startPostReadyStartupMaintenance('),
    );

    expect(createSource).not.toContain("worker-storage-maintenance',");
    expect(createSource).not.toContain('await measureRuntimePerformance(\n      \'startup\',\n      \'worker-storage-maintenance\'');
    expect(createSource).toContain('context.postReadyStartupMaintenance = (receiptScope) => runStartupWorkerStorageMaintenance({');
    expect(createSource).toContain('receiptScope,');
    expect(createSource).toContain('recordStartupDeferredWorkDescriptors(startupDeferredWorkDescriptors, loadResult)');
    expect(createSource).toContain('context.pendingStartupDeferredWorkDescriptors = startupDeferredWorkDescriptors');
  });

  it('skips startup storage migration mutations when backend readiness is read-only', () => {
    const contextSource = readApplicationContextSource();
    const factorySource = readBackendRuntimeFactorySource();
    const createSource = contextSource.slice(
      contextSource.indexOf('static async create(config: ApplicationConfig): Promise<ApplicationContext>'),
      contextSource.indexOf('\n  startPostReadyStartupMaintenance('),
    );
    const migrationGateSource = createSource.slice(
      createSource.indexOf('const startupReadiness = initialLoadResult?.readiness ?? null;'),
      createSource.indexOf('const unifiedLoad = async (): Promise<UnifiedCardStore>'),
    );

    expect(factorySource).toContain('initialLoadResult = await srsBackendClient.loadDatabase();');
    expect(contextSource).toContain('initialLoadResult,');
    expect(createSource).toContain('recordStartupDeferredWorkDescriptors(startupDeferredWorkDescriptors, initialLoadResult);');
    expect(migrationGateSource).toContain('const canRunStartupStorageMigrations = !startupReadiness');
    expect(migrationGateSource).toContain("startupReadiness.status === 'ready'");
    expect(migrationGateSource).toContain('startupReadiness.writable === true');
    expect(migrationGateSource).toContain('runPendingLegacyStorageMigrations({');
    expect(migrationGateSource).toContain('executeBatch: executeStorageMaintenanceBatch');
    expect(migrationGateSource).toContain('skipped startup storage migrations because backend readiness is read-only');
  });

  it('routes hard storage-pressure readiness to a post-ready recovery descriptor', () => {
    const workerSource = readFileSync(
      resolve(process.cwd(), 'worker/db/SqliteDatabaseService.ts'),
      'utf8',
    );
    const descriptorSource = workerSource.slice(
      workerSource.indexOf('private createDeferredStartupWorkDescriptors('),
      workerSource.indexOf('\n  async persist(): Promise', workerSource.indexOf('private createDeferredStartupWorkDescriptors(')),
    );
    const coordinatorSource = readApplicationContextSource().slice(
      readApplicationContextSource().indexOf('startPostReadyStartupMaintenance('),
      readApplicationContextSource().indexOf('\n  async reloadBackendDatabaseAfterReady('),
    );

    expect(descriptorSource).toContain("if (readiness.status === 'read-only-storage-pressure')");
    expect(descriptorSource).toContain("kind: 'storage-pressure-recovery'");
    expect(descriptorSource).toContain("workKind: 'storage-pressure-recovery'");
    expect(descriptorSource).toContain('if (readiness.status !== \'ready\')');
    expect(descriptorSource).toContain('return [];');
    expect(descriptorSource).toContain("kind: 'startup-storage-maintenance'");
    expect(coordinatorSource).toContain('const hasStartupMaintenance = hasStartupStorageMaintenanceDescriptor(deferredDescriptors);');
    expect(coordinatorSource).toContain('const hasTruthPromotion = hasTruthPromotionDescriptor(deferredDescriptors);');
    expect(coordinatorSource).toContain('const hasStoragePressureRecovery = hasStoragePressureRecoveryDescriptor(deferredDescriptors);');
    expect(coordinatorSource).toContain('if (!hasStartupMaintenance && !hasTruthPromotion && !hasStoragePressureRecovery)');
    expect(coordinatorSource).toContain('this.submitPostReadyStoragePressureRecovery(reason, deferredDescriptors, registry)');
    expect(coordinatorSource).toContain('if (!hasStartupMaintenance)');
    expect(coordinatorSource).toContain('return storagePressureRecoveryJobId ?? truthPromotionJobId;');
  });

  it('keeps startup transaction websocket instrumentation bound to diagnostics imports', () => {
    const contextSource = readApplicationContextSource();
    const diagnosticsImportEnd = contextSource.indexOf("from '@/utils/runtimePerformanceDiagnostics'");
    const diagnosticsImportStart = contextSource.lastIndexOf('import {', diagnosticsImportEnd);
    const diagnosticsImportSource = contextSource.slice(diagnosticsImportStart, diagnosticsImportEnd);
    const transactionStart = contextSource.indexOf('async updateTransactionWebSocketService(): Promise<void>');
    const nextMethodStart = contextSource.indexOf('\n  async ', transactionStart + 1);
    const transactionMethodSource = contextSource.slice(transactionStart, nextMethodStart);

    expect(transactionMethodSource).toContain(
      "startRuntimePerformanceSpan('startup', 'transaction-websocket-service.configure')",
    );
    expect(diagnosticsImportSource).toContain('startRuntimePerformanceSpan');
  });

  it('routes post-ready reload deferred descriptors through the startup maintenance coordinator', () => {
    const contextSource = readApplicationContextSource();
    const reloadMethodSource = contextSource.slice(
      contextSource.indexOf('async reloadBackendDatabaseAfterReady('),
      contextSource.indexOf('private consumePendingStartupDeferredWorkDescriptors()'),
    );

    expect(reloadMethodSource).toContain('const reloadResult = await srsBackendClient.reloadDatabase();');
    expect(reloadMethodSource).toContain('this.startPostReadyStartupMaintenance(reason, reloadResult.deferredWork ?? []);');
    expect(contextSource).toContain('async reloadBackendDatabaseAfterReady(reason = \'post-ready-reload\'): Promise<BackendDbReloadResult>');
  });

  it('keeps startup maintenance mutations behind writer relay and election seams', () => {
    const contextSource = readApplicationContextSource();
    const factorySource = readBackendRuntimeFactorySource();
    const storageMaintenanceSource = contextSource.slice(
      contextSource.indexOf('const executeStorageMaintenanceBatch = async'),
      contextSource.indexOf('const executeStorageMaintenanceStatus = async'),
    );
    const scheduleMaintenanceSource = contextSource.slice(
      contextSource.indexOf('const executeCardScheduleBatch = async'),
      contextSource.indexOf('const schedulerCardUpdater = new WorkerCardScheduleUpdateAdapter'),
    );
    const backendLoadSource = factorySource.slice(
      factorySource.indexOf('if (backendMigrationRuntimePolicy.capabilities.backendWorkerAvailable)'),
      factorySource.indexOf('if (srsBackendClient && backendMigrationRuntimePolicy.capabilities.writerRelayRuntimeEnabled)'),
    );

    expect(factorySource).toContain('writerCommandHandler: (command) => options.executeWriterRelayCommand(');
    expect(factorySource).toContain("frontendInstanceRuntime?.getMode() === 'writer'");
    expect(backendLoadSource).toContain('await srsBackendClient.loadDatabase();');
    expect(backendLoadSource).not.toContain('new FrontendInstanceRuntime');
    expect(contextSource).not.toContain('new BackendKernel');
    expect(contextSource).not.toContain("from '../../worker/db/SqliteDatabaseService'");

    const storageWriterMode = storageMaintenanceSource.indexOf("frontendInstanceRuntime.getMode() === 'writer'");
    const storageEnsureWritable = storageMaintenanceSource.indexOf('await frontendInstanceRuntime.ensureWritable();', storageWriterMode);
    const storageDirectMutation = storageMaintenanceSource.indexOf(
      'return srsBackendClient.applyStorageMaintenanceBatch(request);',
      storageEnsureWritable,
    );
    const storageFollowerRelay = storageMaintenanceSource.indexOf(
      'return followerCommandClient.submitAndWait<BackendStorageMaintenanceApplyBatchResult>({',
      storageDirectMutation,
    );
    expect(storageWriterMode).toBeGreaterThan(0);
    expect(storageEnsureWritable).toBeGreaterThan(storageWriterMode);
    expect(storageDirectMutation).toBeGreaterThan(storageEnsureWritable);
    expect(storageFollowerRelay).toBeGreaterThan(storageDirectMutation);
    expect(storageMaintenanceSource).toContain("method: 'storage.maintenance.applyBatch'");
    expect(storageStatusSource).toContain('return srsBackendClient.storageMaintenanceStatus(request);');
    expect(storageStatusSource).toContain('submitAndWait<BackendStorageMaintenanceStatusResult>');
    expect(storageStatusSource).toContain("method: 'storage.maintenance.status'");

    const scheduleWriterMode = scheduleMaintenanceSource.indexOf("frontendInstanceRuntime.getMode() === 'writer'");
    const scheduleEnsureWritable = scheduleMaintenanceSource.indexOf('await frontendInstanceRuntime.ensureWritable();', scheduleWriterMode);
    const scheduleDirectMutation = scheduleMaintenanceSource.indexOf(
      'return srsBackendClient.cardScheduleBatchUpdate(request);',
      scheduleEnsureWritable,
    );
    const scheduleFollowerRelay = scheduleMaintenanceSource.indexOf(
      'return followerCommandClient.submitAndWait<BackendCardScheduleBatchUpdateResult>({',
      scheduleDirectMutation,
    );
    expect(scheduleWriterMode).toBeGreaterThan(0);
    expect(scheduleEnsureWritable).toBeGreaterThan(scheduleWriterMode);
    expect(scheduleDirectMutation).toBeGreaterThan(scheduleEnsureWritable);
    expect(scheduleFollowerRelay).toBeGreaterThan(scheduleDirectMutation);
    expect(scheduleMaintenanceSource).toContain("method: 'card.schedule.batchUpdate'");
  });

  it('coalesces repeated startup handoff before submitting duplicate mutation jobs', () => {
    const submit = vi.fn((request: { kind: string; diagnostics?: Record<string, unknown> }) => ({
      accepted: true,
      job: {
        jobId: 'startup-storage-maintenance-1',
        kind: request.kind,
        state: 'accepted',
        reason: null,
        submittedAt: 1,
        updatedAt: 1,
        startedAt: null,
        completedAt: null,
        attemptCount: 0,
        diagnostics: request.diagnostics ?? {},
        lastError: null,
      },
    }));
    const runMaintenance = vi.fn(async () => ({
      operationId: 'startup-storage-maintenance-v1',
      phaseClassifications: {
        scheduleNormalization: 'deferred-safe',
        orphanCardRepair: 'deferred-safe',
      },
      schedule: {
        migratedLegacySchedulerCount: 0,
        normalizedMalformedScheduleCount: 0,
        affectedCardCount: 0,
        completedBatches: 0,
        totalBatches: 0,
      },
      orphanRepair: {
        discoveredCardCount: 0,
        repairedCardCount: 0,
        completedBatches: 0,
        totalBatches: 0,
      },
    }));
    const srsBackendClient = {
      getBackgroundWorkRegistry: () => ({ submit }),
      schedulePendingReviewTruthFlush: vi.fn(async () => false),
    };
    const frontendInstanceRuntime = {
      getInstanceId: () => 'runtime-A',
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
      ...createRuntimeAccessFixture(),
      srsBackendClient,
      frontendInstanceRuntime,
      backendMigrationRuntimePolicy: runtimePolicy,
    });
    (context as unknown as {
      postReadyStartupMaintenance: typeof runMaintenance;
    }).postReadyStartupMaintenance = runMaintenance;
    const descriptor = {
      kind: 'startup-storage-maintenance',
      version: 1,
      owner: 'application-context',
      phase: 'post-ready',
      reason: 'db.load',
      safeToDefer: true,
      statusReference: {
        kind: 'kernel-companion-background-work',
        workKind: 'startup-storage-maintenance',
      },
      frontier: {
        pluginInstallationId: 'plugin-A',
        identityEpoch: 'epoch-A',
        inputVersion: 'startup-maintenance-input-v1',
        frontierHash: 'frontier-A',
        externalInputDirtyGeneration: 0,
        pendingExternalMerge: false,
      },
    } as never;

    const firstJobId = context.startPostReadyStartupMaintenance('plugin.onload-ready', [descriptor]);
    const secondJobId = context.startPostReadyStartupMaintenance('post-ready-reload', [descriptor]);

    expect(firstJobId).toBe('startup-storage-maintenance-1');
    expect(secondJobId).toBe(firstJobId);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(runMaintenance).not.toHaveBeenCalled();
    expect(submit.mock.calls[0][0]).toMatchObject({
      kind: 'startup-storage-maintenance',
      dedupeKey: 'startup-background-work-lifecycle-v1:startup-storage-maintenance:application-context:post-ready:runtime-A:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-A:0:external-merge-clean:recovery-none',
      diagnostics: {
        reason: 'plugin.onload-ready',
        deferredDescriptorCount: 1,
        deferredDescriptorKinds: 'startup-storage-maintenance',
        receiptScopeAvailable: true,
        lifecycleDedupeKeyAvailable: true,
      },
    });
    expect(srsBackendClient.schedulePendingReviewTruthFlush).not.toHaveBeenCalled();
  });

  it('routes startup truth-promotion descriptors to background tracking without storage maintenance scan', () => {
    const submit = vi.fn();
    const runMaintenance = vi.fn(async () => ({
      operationId: 'startup-storage-maintenance-v1',
      phaseClassifications: {
        scheduleNormalization: 'deferred-safe',
        orphanCardRepair: 'deferred-safe',
      },
      schedule: {
        migratedLegacySchedulerCount: 0,
        normalizedMalformedScheduleCount: 0,
        affectedCardCount: 0,
        completedBatches: 0,
        totalBatches: 0,
      },
      orphanRepair: {
        discoveredCardCount: 0,
        repairedCardCount: 0,
        completedBatches: 0,
        totalBatches: 0,
      },
    }));
    const scheduleTruthPromotionTracking = vi.fn(() => 'truth-promotion-1');
    const srsBackendClient = {
      getBackgroundWorkRegistry: () => ({ submit }),
      scheduleTruthPromotionTracking,
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
      ...createRuntimeAccessFixture(),
      srsBackendClient,
      backendMigrationRuntimePolicy: runtimePolicy,
    });
    (context as unknown as {
      postReadyStartupMaintenance: typeof runMaintenance;
    }).postReadyStartupMaintenance = runMaintenance;
    const descriptor = {
      kind: 'truth-promotion',
      version: 1,
      owner: 'application-context',
      phase: 'post-ready',
      reason: 'db.load',
      safeToDefer: true,
      statusReference: {
        kind: 'kernel-companion-background-work',
        workKind: 'truth-promotion',
      },
      frontier: {
        pluginInstallationId: 'plugin-A',
        identityEpoch: 'epoch-A',
        inputVersion: 'startup-maintenance-input-v1',
        frontierHash: 'frontier-A',
        externalInputDirtyGeneration: 0,
        pendingExternalMerge: false,
      },
    } as never;

    const jobId = context.startPostReadyStartupMaintenance('plugin.onload-ready', [descriptor]);

    expect(jobId).toBe('truth-promotion-1');
    expect(scheduleTruthPromotionTracking).toHaveBeenCalledWith('plugin.onload-ready');
    expect(submit).not.toHaveBeenCalled();
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('deduplicates storage-pressure recovery and resumes after an interrupted cleanup checkpoint', async () => {
    const submitted: Array<KernelCompanionBackgroundWorkSubmitRequest<KernelCompanionStoragePressureRecoveryDiagnostics>> = [];
    const submit = vi.fn((
      request: KernelCompanionBackgroundWorkSubmitRequest<KernelCompanionStoragePressureRecoveryDiagnostics>,
    ) => {
      submitted.push(request);
      return {
        accepted: true,
        coalesced: false,
        skipped: false,
        job: {
          jobId: 'storage-pressure-recovery-1',
          kind: request.kind,
          dedupeKey: request.dedupeKey ?? null,
          state: 'accepted' as const,
          reason: null,
          submittedAt: 1,
          updatedAt: 1,
          startedAt: null,
          completedAt: null,
          attemptCount: 0,
          coalescedSubmissionCount: 0,
          skippedSubmissionCount: 0,
          diagnostics: request.diagnostics ?? {},
          lastError: null,
        },
      };
    });
    const recover = vi.fn()
      .mockRejectedValueOnce(new Error(
        'sqlite-delta-segment-cleanup-failed: delete verification interrupted',
      ))
      .mockResolvedValueOnce(createStoragePressureRecoveryResult({
        phase: 'cleaning-orphans',
        orphanCleanup: {
          status: 'partial',
          deletedFiles: [{ path: 'sqlite-delta/v2/orphan-1.msgpack' }],
          failedFiles: [],
          remainingOrphanFileCount: 2,
          remainingOrphanBytes: 2048,
        },
      }))
      .mockResolvedValueOnce(createStoragePressureRecoveryResult({
        phase: 'cleaning-orphans',
        orphanCleanup: {
          status: 'partial',
          deletedFiles: [{ path: 'sqlite-delta/v2/orphan-2.msgpack' }],
          failedFiles: [],
          remainingOrphanFileCount: 1,
          remainingOrphanBytes: 1024,
        },
      }))
      .mockResolvedValueOnce(createStoragePressureRecoveryResult({
        phase: 'completed',
        inventory: {
          version: 1,
          measuredAt: 200,
          metrics: [],
          pressure: {
            version: 1,
            measuredAt: 200,
            level: 'normal',
            metrics: [],
            blockingMutationGrowth: false,
            code: null,
            reason: null,
          },
        },
      }));
    const srsBackendClient = {
      getBackgroundWorkRegistry: () => ({ submit }),
      scheduleTruthPromotionTracking: vi.fn(),
    };
    const frontendInstanceRuntime = {
      getInstanceId: () => 'runtime-A',
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
      ...createRuntimeAccessFixture(),
      srsBackendClient,
      frontendInstanceRuntime,
      backendMigrationRuntimePolicy: runtimePolicy,
    });
    (context as unknown as {
      postReadyStoragePressureRecovery: typeof recover;
    }).postReadyStoragePressureRecovery = recover;
    const descriptor = createStoragePressureRecoveryDescriptor();

    const firstJobId = context.startPostReadyStartupMaintenance('plugin.onload-ready', [descriptor]);
    const secondJobId = context.startPostReadyStartupMaintenance('post-ready-reload', [descriptor]);
    const result = await submitted[0]!.run({
      jobId: firstJobId!,
      kind: 'storage-pressure-recovery',
      isCanceled: () => false,
    });

    expect(firstJobId).toBe('storage-pressure-recovery-1');
    expect(secondJobId).toBe(firstJobId);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submitted[0]).toMatchObject({
      kind: 'storage-pressure-recovery',
      dedupeKey: 'storage-pressure-recovery-lifecycle-v1:storage-pressure-recovery:application-context:post-ready:runtime-A:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-A:0:external-merge-clean:ready',
      diagnostics: {
        reason: 'plugin.onload-ready',
        phase: 'planning',
        descriptorReason: 'db.load',
        deferredDescriptorCount: 1,
        lifecycleDedupeKeyAvailable: true,
      },
    });
    expect(result).toMatchObject({
      state: 'completed',
      diagnostics: {
        reason: 'plugin.onload-ready',
        phase: 'completed',
        batchIndex: 3,
        maxBatches: 16,
        remainingOrphanFileCount: 0,
        pressureLevel: 'normal',
      },
    });
    expect(recover).toHaveBeenCalledTimes(3);
    expect(recover).toHaveBeenCalledWith({
      maxCleanupFiles: 64,
      maxCleanupBytes: 16 * 1024 * 1024,
    });
  });

  it('classifies storage-pressure recovery batch caps as deferred and deterministic errors as failed', async () => {
    const createContextWithRecovery = (
      recover: () => Promise<BackendStoragePressureRecoveryResult>,
    ): {
      context: ApplicationContext;
      submitted: Array<KernelCompanionBackgroundWorkSubmitRequest<KernelCompanionStoragePressureRecoveryDiagnostics>>;
    } => {
      const submitted: Array<KernelCompanionBackgroundWorkSubmitRequest<KernelCompanionStoragePressureRecoveryDiagnostics>> = [];
      const submit = vi.fn((
        request: KernelCompanionBackgroundWorkSubmitRequest<KernelCompanionStoragePressureRecoveryDiagnostics>,
      ) => {
        submitted.push(request);
        return {
          accepted: true,
          coalesced: false,
          skipped: false,
          job: {
            jobId: `storage-pressure-recovery-${submitted.length}`,
            kind: request.kind,
            dedupeKey: request.dedupeKey ?? null,
            state: 'accepted' as const,
            reason: null,
            submittedAt: 1,
            updatedAt: 1,
            startedAt: null,
            completedAt: null,
            attemptCount: 0,
            coalescedSubmissionCount: 0,
            skippedSubmissionCount: 0,
            diagnostics: request.diagnostics ?? {},
            lastError: null,
          },
        };
      });
      const srsBackendClient = {
        getBackgroundWorkRegistry: () => ({ submit }),
        scheduleTruthPromotionTracking: vi.fn(),
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
        ...createRuntimeAccessFixture(),
        srsBackendClient,
        backendMigrationRuntimePolicy: runtimePolicy,
      });
      (context as unknown as {
        postReadyStoragePressureRecovery: typeof recover;
      }).postReadyStoragePressureRecovery = recover;
      return { context, submitted };
    };
    const cleaning = vi.fn(async () => createStoragePressureRecoveryResult({
      phase: 'cleaning-orphans',
      orphanCleanup: {
        status: 'partial',
        deletedFiles: [],
        failedFiles: [],
        remainingOrphanFileCount: 99,
        remainingOrphanBytes: 99_000,
      },
    }));
    const deferredContext = createContextWithRecovery(cleaning);
    const deferredJobId = deferredContext.context.startPostReadyStartupMaintenance(
      'plugin.onload-ready',
      [createStoragePressureRecoveryDescriptor()],
    );
    const deferred = await deferredContext.submitted[0]!.run({
      jobId: deferredJobId!,
      kind: 'storage-pressure-recovery',
      isCanceled: () => false,
    });

    expect(deferred).toMatchObject({
      state: 'deferred',
      reason: 'storage-pressure-recovery-batch-cap',
      diagnostics: {
        phase: 'cleaning-orphans',
        batchIndex: 16,
        maxBatches: 16,
        remainingOrphanFileCount: 99,
      },
    });
    expect(cleaning).toHaveBeenCalledTimes(16);

    const failedRecovery = vi.fn(async () => createStoragePressureRecoveryResult({
      ok: false,
      phase: 'adopting',
      adoption: { status: 'blocked', unsupportedEntries: [{ entryId: 'legacy-1' }] },
      error: 'legacy-delta-adoption-blocked',
      inventory: {
        version: 1,
        measuredAt: 300,
        metrics: [],
        pressure: {
          version: 1,
          measuredAt: 300,
          level: 'hard',
          metrics: [],
          blockingMutationGrowth: true,
          code: 'STORAGE_PRESSURE',
          reason: 'unsupported-evidence',
        },
      },
    }));
    const failedContext = createContextWithRecovery(failedRecovery);
    const failedJobId = failedContext.context.startPostReadyStartupMaintenance(
      'plugin.onload-ready',
      [createStoragePressureRecoveryDescriptor()],
    );
    const failed = await failedContext.submitted[0]!.run({
      jobId: failedJobId!,
      kind: 'storage-pressure-recovery',
      isCanceled: () => false,
    });

    expect(failed).toMatchObject({
      state: 'failed',
      reason: 'legacy-delta-adoption-blocked',
      error: 'legacy-delta-adoption-blocked',
      diagnostics: {
        phase: 'failed',
        errorCode: 'legacy-delta-adoption-blocked',
        unsupportedEntryCount: 1,
        pressureLevel: 'hard',
      },
    });
    expect(failedRecovery).toHaveBeenCalledTimes(1);
  });

  it('defines startup lifecycle dedupe key without persisting ephemeral runtime id into receipts', () => {
    const contextSource = readApplicationContextSource();
    const registrySource = readFileSync(
      resolve(process.cwd(), 'src/application/backgroundWork/KernelCompanionBackgroundWorkRegistry.ts'),
      'utf8',
    );
    const workerSource = readFileSync(resolve(process.cwd(), 'worker/db/SqliteDatabaseService.ts'), 'utf8');
    const receiptSource = readFileSync(resolve(process.cwd(), 'src/application/services/StartupWorkerStorageMaintenance.ts'), 'utf8');

    expect(registrySource).toContain('dedupeKey: string | null;');
    expect(registrySource).toContain('dedupeKey?: string | null;');
    expect(contextSource).toContain('createStartupMaintenanceLifecycleDedupeKey(');
    expect(contextSource).toContain('this.frontendInstanceRuntime?.getInstanceId() ?? null');
    expect(contextSource).toContain("'startup-background-work-lifecycle-v1'");
    expect(contextSource).toContain('frontier.pluginInstallationId');
    expect(contextSource).toContain('frontier.identityEpoch');
    expect(contextSource).toContain('frontier.inputVersion');
    expect(contextSource).toContain('frontier.frontierHash');
    expect(contextSource).toContain('dedupeKey: lifecycleDedupeKey');
    expect(workerSource).toContain('createStartupMaintenanceFrontier(readiness)');
    expect(receiptSource).not.toContain('runtimeInstanceId');
    expect(receiptSource).not.toContain('runtime-A');
  });

  it('does not start passive Native Riff sync or full-sync timers', () => {
    const contextSource = readApplicationContextSource();

    expect(contextSource).not.toContain("'hybrid-sync-service.start'");
    expect(contextSource).not.toContain('hybridSyncService!.start()');
    expect(contextSource).not.toContain('fullSyncTimer');
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
      ...createRuntimeAccessFixture(),
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
      ...createRuntimeAccessFixture(),
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

  it('routes AutoCard backend execution through the scoped runtime guard', () => {
    const contextSource = readApplicationContextSource();

    expect(contextSource).toContain('return context.runAutoCardBackendExecution(');
    expect(contextSource).toContain('autoCardHandler.executeEnvelopeFromBackend(request)');
    expect(contextSource).toContain('autoCardHandler.executeBatchFromBackend(request)');
    expect(contextSource).toContain('this.autoCardBackendExecutionDepth > 0');
    expect(contextSource).toContain('this.autoCardBackendExecutionHandlerScopes.length > 0');
  });

  it('keeps the Xiuyuan factory independent of backend runtime locators', () => {
    const contextSource = readApplicationContextSource();
    const factorySource = readFileSync(
      resolve(process.cwd(), 'src/application/factories/createAutoCardKernelXiuyuanServiceBundle.ts'),
      'utf8',
    );

    expect(contextSource).toContain('createAutoCardKernelXiuyuanServiceBundle({');
    expect(factorySource).toContain('getUnifiedStorage: () => UnifiedStorageManager');
    expect(factorySource).not.toContain('SrsBackendClient');
    expect(factorySource).not.toContain('getBackgroundWorkRegistry');
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
        prepareForUnload: vi.fn(),
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
        ...createRuntimeAccessFixture(),
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
      expect(frontendInstanceRuntime.prepareForUnload).toHaveBeenCalledTimes(1);
      expect(frontendInstanceRuntime.dispose).toHaveBeenCalledTimes(1);
      expect(srsBackendClient.dispose).toHaveBeenCalledTimes(1);
      expect(srsBackendTransport.dispose).toHaveBeenCalledTimes(1);
      expect(context.getSrsBackendClient()).toBeNull();
      expect(context.getFrontendInstanceRuntime()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not wait indefinitely when Review truth unload maintenance hangs', async () => {
    vi.useFakeTimers();
    try {
      const srsBackendClient = {
        dispose: vi.fn(),
        flushReviewTruthBeforeUnload: vi.fn(() => new Promise<boolean>(() => {})),
      };
      const srsBackendTransport = {
        dispose: vi.fn(),
      };
      const frontendInstanceRuntime = {
        prepareForUnload: vi.fn(),
        dispose: vi.fn(async () => undefined),
        getMode: () => 'writer',
        getInstanceId: () => 'instance-hanging-review-truth',
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
        ...createRuntimeAccessFixture(),
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
      expect(srsBackendClient.flushReviewTruthBeforeUnload).toHaveBeenCalledTimes(1);
      expect(frontendInstanceRuntime.prepareForUnload).toHaveBeenCalledTimes(1);
      expect(frontendInstanceRuntime.dispose).toHaveBeenCalledTimes(1);
      expect(srsBackendClient.dispose).toHaveBeenCalledTimes(1);
      expect(srsBackendTransport.dispose).toHaveBeenCalledTimes(1);
      expect(context.getSrsBackendClient()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes Review truth before quiescing the frontend runtime on unload', async () => {
    const calls: string[] = [];
    const srsBackendClient = {
      dispose: vi.fn(() => calls.push('backend-client.dispose')),
      flushReviewTruthBeforeUnload: vi.fn(async () => {
        calls.push('review-truth.flush');
        return true;
      }),
    };
    const srsBackendTransport = {
      dispose: vi.fn(() => calls.push('backend-transport.dispose')),
    };
    const frontendInstanceRuntime = {
      prepareForUnload: vi.fn(() => calls.push('frontend-runtime.prepareForUnload')),
      dispose: vi.fn(async () => {
        calls.push('frontend-runtime.dispose');
      }),
      getMode: () => 'writer',
      getInstanceId: () => 'instance-review-truth-flush',
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
      ...createRuntimeAccessFixture(),
      srsBackendClient,
      srsBackendTransport,
      frontendInstanceRuntime,
      backendMigrationRuntimePolicy: runtimePolicy,
    });

    await context.dispose({ persistStorage: false });

    expect(calls).toContain('review-truth.flush');
    expect(calls).toContain('frontend-runtime.prepareForUnload');
    expect(calls.indexOf('review-truth.flush')).toBeLessThan(calls.indexOf('frontend-runtime.prepareForUnload'));
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
        ...createRuntimeAccessFixture(),
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
      ...createRuntimeAccessFixture(),
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
      ...createRuntimeAccessFixture(),
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
      ...createRuntimeAccessFixture(),
      sqlPersistence: {
        database,
      },
    });

    await context.dispose({ persistStorage: false });

    expect(fileService.writeBinary).not.toHaveBeenCalled();
  });
});
