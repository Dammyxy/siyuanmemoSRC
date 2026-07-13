import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

describe('BackendKernel', () => {
  it('keeps Review domain sync status read-only during startup recovery', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.load({
      startupIdentityDisposition: {
        version: 1,
        status: 'read-only-recovery-required',
        writable: false,
        retryable: false,
        deviceId: 'device-temp-local',
        identityEpoch: null,
        source: 'temp-local',
        reason: 'Truth Device Identity source is not verified for startup truth mutation: temp-local',
      },
    });
    const mergeExternalDatabaseIfChanged = vi.spyOn(database, 'mergeExternalDatabaseIfChanged');
    const kernel = new BackendKernel({ database });

    await expect(kernel.handle({
      id: 'domain-sync-review-preflight-read-only-recovery',
      jsonrpc: '2.0',
      method: 'domainSync.status',
      params: [{
        context: 'review-feedback-preflight',
        cardId: 'card-1',
      }],
    })).resolves.toMatchObject({
      result: {
        ok: true,
        sanity: { status: 'clean' },
      },
    });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();
  });

  it('keeps manual domain sync diagnostics read-only during startup recovery', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.load({
      startupIdentityDisposition: {
        version: 1,
        status: 'read-only-recovery-required',
        writable: false,
        retryable: false,
        deviceId: 'device-temp-local',
        identityEpoch: null,
        source: 'temp-local',
        reason: 'Truth Device Identity source is not verified for startup truth mutation: temp-local',
      },
    });
    const mergeExternalDatabaseIfChanged = vi.spyOn(database, 'mergeExternalDatabaseIfChanged');
    const kernel = new BackendKernel({ database });

    await expect(kernel.handle({
      id: 'domain-sync-status-read-only-recovery',
      jsonrpc: '2.0',
      method: 'domainSync.status',
      params: [{}],
    })).resolves.toMatchObject({
      result: {
        ok: true,
        sanity: { status: 'clean' },
      },
    });
    await expect(kernel.handle({
      id: 'domain-sync-repair-preview-read-only-recovery',
      jsonrpc: '2.0',
      method: 'domainSync.repair.preview',
      params: [{}],
    })).resolves.toMatchObject({
      result: { ok: true },
    });
    await expect(kernel.handle({
      id: 'domain-sync-cleanup-candidates-read-only-recovery',
      jsonrpc: '2.0',
      method: 'domainSync.conflictSources.cleanupCandidates',
      params: [{}],
    })).resolves.toMatchObject({
      result: { ok: true },
    });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();
  });

  it('allows queue state read during read-only recovery without storage-refresh preflight', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.load({
      startupIdentityDisposition: {
        version: 1,
        status: 'read-only-recovery-required',
        writable: false,
        retryable: false,
        deviceId: 'device-temp-local',
        identityEpoch: null,
        source: 'temp-local',
        reason: 'Truth Device Identity source is not verified for startup truth mutation: temp-local',
      },
    });
    const mergeExternalDatabaseIfChanged = vi.spyOn(database, 'mergeExternalDatabaseIfChanged');
    const kernel = new BackendKernel({ database });

    await expect(kernel.handle({
      id: 'queue-state-load-read-only-recovery',
      jsonrpc: '2.0',
      method: 'queue.state.loadAll',
      params: [{}],
    })).resolves.toMatchObject({
      result: {
        values: {},
      },
    });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();

    await expect(kernel.handle({
      id: 'queue-state-mutate-read-only-recovery',
      jsonrpc: '2.0',
      method: 'queue.state.batchMutate',
      params: [{
        mutationId: 'queue:read-only-recovery',
        mutations: [{
          operation: 'set',
          key: 'retrievalPracticeQueue',
          value: { ids: ['card-1'] },
        }],
      }],
    })).resolves.toMatchObject({
      error: {
        code: 'STORAGE_RECOVERY_REQUIRED',
        message: expect.stringContaining('Truth Device Identity source is not verified'),
      },
    });
  });

  it('keeps storage maintenance status off storage-refresh preflight while applyBatch keeps it', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const mergeExternalDatabaseIfChanged = vi.spyOn(database, 'mergeExternalDatabaseIfChanged').mockResolvedValue({
      changed: false,
      mergedCards: 0,
      mergedReviewEvents: 0,
      ignoredCards: 0,
      ignoredReviewEvents: 0,
      importedOperations: 0,
      ignoredOperations: 0,
      skippedSourceReasons: {},
      sanityStatus: 'clean',
      sourceIds: [],
      skippedSources: [],
      diagnostics: { reviewCardDivergences: [] },
      mainDbReadSkipped: false,
      mainDbReadSkipReason: null,
      conflictSourceCount: 0,
      nonEmptyConflictSourceCount: 0,
    });
    vi.spyOn(database, 'getStorageMaintenanceStatus').mockImplementation(async (request) => ({
        operationId: request.operationId,
        migrationId: request.migrationId,
        required: false,
        status: 'completed',
        completedBatches: 1,
        totalBatches: 1,
        lastMutationId: null,
        completedAt: 1,
        error: null,
    }));
    const applyStorageMaintenanceBatch = vi.spyOn(database, 'applyStorageMaintenanceBatch').mockImplementation(async (request) => ({
        operationId: request.operationId,
        migrationId: request.migrationId,
        status: 'completed',
        completedBatches: request.totalBatches,
        totalBatches: request.totalBatches,
        lastMutationId: `maintenance:${request.operationId}:batch:${request.batchIndex}`,
        completedAt: 2,
        error: null,
    }));
    const kernel = new BackendKernel({ database });

    await expect(kernel.handle({
      id: 'maintenance-status',
      jsonrpc: '2.0',
      method: 'storage.maintenance.status',
      params: [{
        operationId: 'startup-storage-maintenance-v1:schedule:scope',
        migrationId: 'startup-storage-maintenance-v1:schedule',
      }],
    })).resolves.toMatchObject({
      result: {
        operationId: 'startup-storage-maintenance-v1:schedule:scope',
        status: 'completed',
      },
    });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();

    await expect(kernel.handle({
      id: 'maintenance-apply',
      jsonrpc: '2.0',
      method: 'storage.maintenance.applyBatch',
      params: [{
        operationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-after',
        migrationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-after',
        batchIndex: 0,
        totalBatches: 1,
        batch: {
          kind: 'startup-maintenance-receipt',
          appliedAt: 2,
          receiptVersion: 'startup-storage-maintenance-receipt-v2',
          maintenanceKind: 'startup-storage-maintenance',
          preSuccessFrontier: {
            pluginInstallationId: 'plugin-A',
            identityEpoch: 'epoch-A',
            inputVersion: 'startup-maintenance-input-v1',
            frontierHash: 'frontier-before',
            recoveryStatus: null,
            journalSequenceFrontier: null,
            truthCoverageFrontier: null,
            externalInputDirtyGeneration: 0,
            pendingExternalMerge: false,
          },
          postSuccessFrontier: {
            pluginInstallationId: 'plugin-A',
            identityEpoch: 'epoch-A',
            inputVersion: 'startup-maintenance-input-v1',
            frontierHash: 'frontier-after',
            recoveryStatus: null,
            journalSequenceFrontier: null,
            truthCoverageFrontier: null,
            externalInputDirtyGeneration: 0,
            pendingExternalMerge: false,
          },
        },
      }],
    })).resolves.toMatchObject({
      result: {
        operationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:startup-maintenance-input-v1:frontier-after',
        status: 'completed',
      },
    });
    expect(mergeExternalDatabaseIfChanged).toHaveBeenCalledTimes(1);
    expect(mergeExternalDatabaseIfChanged.mock.invocationCallOrder[0]).toBeLessThan(
      applyStorageMaintenanceBatch.mock.invocationCallOrder[0],
    );
  });

  it('keeps db.load and db.reload identity resolution ahead of storage-refresh preflight', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const mergeExternalDatabaseIfChanged = vi.spyOn(database, 'mergeExternalDatabaseIfChanged');
    const kernel = new BackendKernel({ database });

    await expect(kernel.handle({
      id: 'load-with-identity',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [{
        truthDeviceId: 'truth-device-load',
        identityEpoch: 'epoch-load',
        reviewTruthGenerationId: 'review-events-v1',
      }],
    })).resolves.toMatchObject({
      id: 'load-with-identity',
      jsonrpc: '2.0',
      result: {
        ok: true,
        initialized: true,
      },
    });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();
    await expect(database.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        available: true,
        deviceId: 'truth-device-load',
        identityEpoch: 'epoch-load',
      },
    });

    await expect(kernel.handle({
      id: 'reload-with-identity',
      jsonrpc: '2.0',
      method: 'db.reload',
      params: [{
        truthDeviceId: 'truth-device-reload',
        identityEpoch: 'epoch-reload',
        reviewTruthGenerationId: 'review-events-v1',
      }],
    })).resolves.toMatchObject({
      id: 'reload-with-identity',
      jsonrpc: '2.0',
      result: {
        ok: true,
        reloaded: true,
      },
    });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();
    await expect(database.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        available: true,
        deviceId: 'truth-device-reload',
        identityEpoch: 'epoch-reload',
      },
    });
  });

  it('rejects Review truth mutations without identity epoch through the kernel dispatcher', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await expect(kernel.handle({
      id: 'load-with-identity',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [{
        truthDeviceId: 'truth-device-load',
        identityEpoch: 'epoch-load',
        reviewTruthGenerationId: 'review-events-v1',
      }],
    })).resolves.toMatchObject({
      result: {
        ok: true,
        initialized: true,
      },
    });

    await expect(kernel.handle({
      id: 'flush-without-epoch',
      jsonrpc: '2.0',
      method: 'review.truth.flush',
      params: [{
        deviceId: 'truth-device-load',
        generationId: 'review-events-v1',
      }],
    })).resolves.toMatchObject({
      error: {
        code: 'TRUTH_DEVICE_ID_UNAVAILABLE',
        message: 'review.truth.flush requires matching deviceId and identityEpoch',
      },
    });

    await expect(kernel.handle({
      id: 'backfill-without-epoch',
      jsonrpc: '2.0',
      method: 'review.truth.backfill',
      params: [{
        deviceId: 'truth-device-load',
        generationId: 'review-events-v1',
      }],
    })).resolves.toMatchObject({
      error: {
        code: 'TRUTH_DEVICE_ID_UNAVAILABLE',
        message: 'review.truth.backfill requires matching deviceId and identityEpoch',
      },
    });
  });

  it('wires the registry dispatcher with shared worker dependencies', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const health = await kernel.handle({
      id: 'kernel-smoke-health',
      jsonrpc: '2.0',
      method: 'system.health',
      params: [],
    });
    const diagnostics = await kernel.handle({
      id: 'kernel-smoke-diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    const missing = await kernel.handle({
      id: 'kernel-smoke-missing',
      jsonrpc: '2.0',
      method: 'method.missing' as never,
      params: [],
    });

    expect(health).toEqual({
      id: 'kernel-smoke-health',
      jsonrpc: '2.0',
      result: {
        ok: true,
        runtime: 'srs-backend-worker',
        initialized: false,
      },
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.runtime).toBe('srs-backend-worker');
      expect(diagnostics.result.review).toMatchObject({
        truthFlush: {
          family: 'review-events',
          storage: 'unavailable',
          last: null,
        },
      });
      expect(diagnostics.result.storage).toMatchObject({
        identity: {
          available: false,
          deviceId: null,
          identityEpoch: null,
        },
        receipts: {
          stageCounts: {
            failed: null,
            journaled: 0,
            'truth-committed': 0,
          },
        },
        promotion: {
          available: false,
          pendingMutationCount: 0,
        },
        coverage: {
          available: false,
          truthCoverageFrontier: 0,
          uncoveredMutationCount: 0,
          lag: 0,
        },
        inventory: {
          version: 1,
          metrics: expect.arrayContaining([
            expect.objectContaining({
              family: 'sqlite-delta',
              files: 0,
              bytes: 0,
            }),
          ]),
        },
        budget: {
          version: 1,
          level: 'normal',
        },
        reconciliation: {
          status: 'never-run',
          projectionRebuilt: false,
        },
        disabledCapabilities: expect.arrayContaining([
          'storage-mutations',
          'truth-promotion',
          'truth-compaction',
          'truth-reconciliation',
        ]),
      });
    }
    expect(missing).toEqual({
      id: 'kernel-smoke-missing',
      jsonrpc: '2.0',
      error: {
        code: 'METHOD_NOT_FOUND',
        message: 'Unknown method: method.missing',
      },
    });
  });
});
