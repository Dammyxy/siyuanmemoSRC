import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendDiagnosticsStatusResult,
} from '../../../packages/contracts/src/backend-rpc';
import { BackendKernel } from '../BackendKernel';
import {
  BACKEND_CORE_RPC_HANDLER_REGISTRATIONS,
  type BackendCoreRpcHandlerContext,
} from '../rpc/BackendCoreRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';
import { WorkerSqliteDatabaseService } from '../../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';

const SQLITE_DELTA_V2_MANIFEST = 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json';

describe('BackendCoreRpcAdapter', () => {
  it('serves system/db/diagnostics/private health methods through the core family adapter', async () => {
    const diagnostics = createDiagnosticsStatus();
    const context: BackendCoreRpcHandlerContext = {
      core: {
        database: {
          getStatus: () => ({ initialized: true }),
          load: vi.fn(async () => ({
            ok: true,
            initialized: true,
            dbFile: 'siyuanmemo.db',
            readiness: {
              status: 'ready' as const,
              projectionReadable: true,
              writable: true,
              recovery: null,
            },
            deferredWork: [{
              version: 1 as const,
              kind: 'startup-storage-maintenance' as const,
              owner: 'application-context' as const,
              phase: 'post-ready' as const,
              reason: 'db.load',
              safeToDefer: true as const,
              statusReference: {
                kind: 'kernel-companion-background-work' as const,
                workKind: 'startup-storage-maintenance' as const,
              },
              frontier: {
                pluginInstallationId: null,
                identityEpoch: null,
                inputVersion: 'startup-maintenance-input-v1',
                frontierHash: null,
                recoveryStatus: null,
                journalSequenceFrontier: null,
                truthCoverageFrontier: null,
                externalInputDirtyGeneration: 0,
                pendingExternalMerge: false,
              },
            }],
            projectionSnapshot: {
              version: 2,
              xiuyuans: {},
              cards: {},
              cardDTOs: {},
              deletedCardDTOs: {},
              deletedXiuyuans: {},
            },
          })),
          reloadFromDisk: vi.fn(async () => ({
            ok: true,
            reloaded: true,
            dbFile: 'siyuanmemo.db',
            readiness: {
              status: 'ready' as const,
              projectionReadable: true,
              writable: true,
              recovery: null,
            },
            deferredWork: [{
              version: 1 as const,
              kind: 'startup-storage-maintenance' as const,
              owner: 'application-context' as const,
              phase: 'post-ready' as const,
              reason: 'db.reload',
              safeToDefer: true as const,
              statusReference: {
                kind: 'kernel-companion-background-work' as const,
                workKind: 'startup-storage-maintenance' as const,
              },
              frontier: {
                pluginInstallationId: null,
                identityEpoch: null,
                inputVersion: 'startup-maintenance-input-v1',
                frontierHash: null,
                recoveryStatus: null,
                journalSequenceFrontier: null,
                truthCoverageFrontier: null,
                externalInputDirtyGeneration: 0,
                pendingExternalMerge: false,
              },
            }],
          })),
          getStorageMaintenanceStatus: vi.fn(async (request) => ({
            operationId: request.operationId,
            migrationId: request.migrationId,
            required: false,
            status: 'completed' as const,
            completedBatches: 0,
            totalBatches: null,
            lastMutationId: null,
            completedAt: 100,
            error: null,
          })),
          applyStorageMaintenanceBatch: vi.fn(async (request) => ({
            operationId: request.operationId,
            migrationId: request.migrationId,
            status: 'completed' as const,
            completedBatches: request.totalBatches,
            totalBatches: request.totalBatches,
            lastMutationId: `maintenance:${request.operationId}:batch:${request.batchIndex}`,
            completedAt: 100,
            error: null,
          })),
        },
        readDiagnosticsStatus: vi.fn(async () => diagnostics),
        getPrivateAuditEventCount: () => 3,
      },
    };
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_CORE_RPC_HANDLER_REGISTRATIONS),
    );

    await expect(dispatchCore(dispatcher, context, 'system.health')).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'system.health',
      result: {
        ok: true,
        runtime: 'srs-backend-worker',
        initialized: true,
      },
    });
    await expect(dispatchCore(dispatcher, context, 'db.load', [])).resolves.toMatchObject({
      result: {
        ok: true,
        initialized: true,
        dbFile: 'siyuanmemo.db',
        readiness: {
          status: 'ready',
          projectionReadable: true,
          writable: true,
        },
        deferredWork: [{
          kind: 'startup-storage-maintenance',
          owner: 'application-context',
          statusReference: {
            kind: 'kernel-companion-background-work',
            workKind: 'startup-storage-maintenance',
          },
        }],
      },
    });
    await expect(dispatchCore(dispatcher, context, 'db.reload', [])).resolves.toMatchObject({
      result: {
        ok: true,
        reloaded: true,
        dbFile: 'siyuanmemo.db',
        readiness: {
          status: 'ready',
          projectionReadable: true,
          writable: true,
        },
        deferredWork: [{
          kind: 'startup-storage-maintenance',
          owner: 'application-context',
          reason: 'db.reload',
          statusReference: {
            kind: 'kernel-companion-background-work',
            workKind: 'startup-storage-maintenance',
          },
        }],
      },
    });
    await expect(dispatchCore(
      dispatcher,
      context,
      'storage.maintenance.status',
      {
        operationId: 'test-maintenance',
        migrationId: 'test-maintenance',
      },
    )).resolves.toMatchObject({
      result: {
        operationId: 'test-maintenance',
        required: false,
        status: 'completed',
      },
    });
    await expect(dispatchCore(
      dispatcher,
      context,
      'storage.maintenance.applyBatch',
      {
        operationId: 'test-maintenance',
        migrationId: 'test-maintenance',
        batchIndex: 0,
        totalBatches: 1,
        batch: {
          kind: 'algorithm-card-state-backfill',
          appliedAt: 100,
        },
      },
    )).resolves.toMatchObject({
      result: {
        operationId: 'test-maintenance',
        status: 'completed',
        completedBatches: 1,
      },
    });
    await expect(dispatchCore(dispatcher, context, 'diagnostics.status')).resolves.toMatchObject({
      result: diagnostics,
    });
    await expect(dispatchCore(dispatcher, context, 'private.health')).resolves.toMatchObject({
      result: {
        ok: true,
        runtime: 'srs-backend-worker',
        feature: 'private-api',
      },
    });
    await expect(dispatchCore(dispatcher, context, 'private.diagnostics.status')).resolves.toMatchObject({
      result: {
        ok: true,
        runtime: 'srs-backend-worker',
        status: diagnostics,
        auditEvents: 3,
      },
    });
  });

  it('returns explicit unavailable when core db methods lack a persistence bridge', async () => {
    const kernel = BackendKernel.createWithoutBridge();

    const loadResponse = await kernel.handle({
      id: 1,
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });

    expect(loadResponse).toEqual({
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker persistence bridge is unavailable',
      },
    });
  });

  it('loads and reports sqlite diagnostics through core family methods', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const loadResponse = await kernel.handle({
      id: 'load',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });
    expect(loadResponse).toMatchObject({
      id: 'load',
      jsonrpc: '2.0',
      result: {
        ok: true,
        initialized: true,
        dbFile: 'siyuanmemo.db',
        projectionSnapshot: {
          version: 2,
          cards: {},
          xiuyuans: {},
        },
      },
    });

    const statusResponse = await kernel.handle({
      id: 'status',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in statusResponse).toBe(true);
    if ('result' in statusResponse) {
      expect(statusResponse.result).toMatchObject({
        runtime: 'srs-backend-worker',
        initialized: true,
        dbFile: 'siyuanmemo.db',
        ingest: {
          queueLength: 0,
          queuedTransactions: 0,
          maxQueueLength: 256,
          actionQueueLength: 0,
          actionEnqueuedTotal: 0,
          actionDequeuedTotal: 0,
          actionRequeuedTotal: 0,
          actionRejectedTotal: 0,
          removeActionQueuedTotal: 0,
          upsertActionQueuedTotal: 0,
          autoCardActionQueuedTotal: 0,
          maxActionQueueLength: 4096,
        },
        storage: {
          sqliteDelta: {
            fileName: SQLITE_DELTA_V2_MANIFEST,
            pendingCount: 0,
          },
        },
      });
    }
  });

  it('unwraps JSON-RPC positional params before passing db.load identity into the database', async () => {
    const load = vi.fn(async () => ({
      ok: true,
      initialized: true,
      dbFile: 'siyuanmemo.db',
      readiness: {
        status: 'ready' as const,
        projectionReadable: true,
        writable: true,
        recovery: null,
      },
      deferredWork: [],
      projectionSnapshot: {
        version: 2,
        xiuyuans: {},
        cards: {},
        cardDTOs: {},
        deletedCardDTOs: {},
        deletedXiuyuans: {},
      },
    }));
    const context: BackendCoreRpcHandlerContext = {
      core: {
        database: {
          getStatus: () => ({ initialized: false }),
          load,
          reloadFromDisk: vi.fn(async () => ({
            ok: true,
            reloaded: true,
            dbFile: 'siyuanmemo.db',
          })),
          getStorageMaintenanceStatus: vi.fn(),
          applyStorageMaintenanceBatch: vi.fn(),
        },
        readDiagnosticsStatus: vi.fn(async () => createDiagnosticsStatus()),
        getPrivateAuditEventCount: () => 0,
      },
    };
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_CORE_RPC_HANDLER_REGISTRATIONS),
    );

    await dispatchCore(dispatcher, context, 'db.load', [{
      truthDeviceId: 'truth-device-1',
      identityEpoch: 'epoch-1',
      reviewTruthGenerationId: 'review-events-v1',
    }]);

    expect(load).toHaveBeenCalledWith(expect.objectContaining({
      truthDeviceId: 'truth-device-1',
      identityEpoch: 'epoch-1',
      reviewTruthGenerationId: 'review-events-v1',
    }));
  });

  it('unwraps JSON-RPC positional params before passing db.reload identity into the database', async () => {
    const reloadFromDisk = vi.fn(async () => ({
      ok: true,
      reloaded: true,
      dbFile: 'siyuanmemo.db',
      readiness: {
        status: 'ready' as const,
        projectionReadable: true,
        writable: true,
        recovery: null,
      },
      deferredWork: [],
    }));
    const context: BackendCoreRpcHandlerContext = {
      core: {
        database: {
          getStatus: () => ({ initialized: true }),
          load: vi.fn(async () => ({
            ok: true,
            initialized: true,
            dbFile: 'siyuanmemo.db',
            readiness: {
              status: 'ready' as const,
              projectionReadable: true,
              writable: true,
              recovery: null,
            },
            deferredWork: [],
            projectionSnapshot: {
              version: 2,
              xiuyuans: {},
              cards: {},
              cardDTOs: {},
              deletedCardDTOs: {},
              deletedXiuyuans: {},
            },
          })),
          reloadFromDisk,
          getStorageMaintenanceStatus: vi.fn(),
          applyStorageMaintenanceBatch: vi.fn(),
        },
        readDiagnosticsStatus: vi.fn(async () => createDiagnosticsStatus()),
        getPrivateAuditEventCount: () => 0,
      },
    };
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_CORE_RPC_HANDLER_REGISTRATIONS),
    );

    await dispatchCore(dispatcher, context, 'db.reload', [{
      truthDeviceId: 'truth-device-reload',
      identityEpoch: 'epoch-reload',
      cardTruthGenerationId: 'card-memory-facts-v2',
    }]);

    expect(reloadFromDisk).toHaveBeenCalledWith(expect.objectContaining({
      truthDeviceId: 'truth-device-reload',
      identityEpoch: 'epoch-reload',
      cardTruthGenerationId: 'card-memory-facts-v2',
    }));
  });

  it.each([
    { method: 'db.load' as const, params: { truthDeviceId: 'legacy-direct-shape' }, message: 'db.load expects positional [request] params' },
    { method: 'db.load' as const, params: ['not-an-object'], message: 'db.load request must be an object' },
    { method: 'db.load' as const, params: [{ truthDeviceId: 123 }], message: 'db.load request.truthDeviceId must be string or null' },
    { method: 'db.reload' as const, params: { truthDeviceId: 'legacy-direct-shape' }, message: 'db.reload expects positional [request] params' },
    { method: 'db.reload' as const, params: [['nested-array']], message: 'db.reload request must be an object' },
    { method: 'db.reload' as const, params: [{ truthSchemaVersion: '1' }], message: 'db.reload request.truthSchemaVersion must be finite number or null' },
  ])('rejects malformed $method params explicitly', async ({ method, params, message }) => {
    const load = vi.fn();
    const reloadFromDisk = vi.fn();
    const context: BackendCoreRpcHandlerContext = {
      core: {
        database: {
          getStatus: () => ({ initialized: false }),
          load,
          reloadFromDisk,
          getStorageMaintenanceStatus: vi.fn(),
          applyStorageMaintenanceBatch: vi.fn(),
        },
        readDiagnosticsStatus: vi.fn(async () => createDiagnosticsStatus()),
        getPrivateAuditEventCount: () => 0,
      },
    };
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_CORE_RPC_HANDLER_REGISTRATIONS),
    );

    await expect(dispatchCore(dispatcher, context, method, params)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message,
      },
    });
    expect(load).not.toHaveBeenCalled();
    expect(reloadFromDisk).not.toHaveBeenCalled();
  });

  it('lets db.load initialize the backend with mutation identity before storage preflight', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const loadResponse = await kernel.handle({
      id: 'load-with-identity',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [{
        truthDeviceId: 'truth-device-1',
        identityEpoch: 'epoch-1',
        reviewTruthGenerationId: 'review-events-v1',
      }],
    });

    expect(loadResponse).toMatchObject({
      id: 'load-with-identity',
      jsonrpc: '2.0',
      result: {
        ok: true,
        initialized: true,
      },
    });
    await expect(database.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        available: true,
        deviceId: 'truth-device-1',
        identityEpoch: 'epoch-1',
      },
    });
  });
});

function dispatchCore(
  dispatcher: BackendRpcDispatcher<BackendCoreRpcHandlerContext>,
  context: BackendCoreRpcHandlerContext,
  method: typeof BACKEND_CORE_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params,
  }, context);
}

function createDiagnosticsStatus(): BackendDiagnosticsStatusResult {
  return {
    runtime: 'srs-backend-worker',
    initialized: true,
    dbFile: 'siyuanmemo.db',
    ingest: {
      queueLength: 0,
      queuedTransactions: 0,
      maxQueueLength: 0,
      actionQueueLength: 0,
      actionEnqueuedTotal: 0,
      actionDequeuedTotal: 0,
      actionRequeuedTotal: 0,
      actionRejectedTotal: 0,
      removeActionQueuedTotal: 0,
      upsertActionQueuedTotal: 0,
      autoCardActionQueuedTotal: 0,
      maxActionQueueLength: 0,
    },
    autoCard: {
      executeTotal: 0,
      executeCreatedTotal: 0,
      executeSkippedTotal: 0,
      executeUnavailableTotal: 0,
      executeFailedTotal: 0,
    },
    review: {
      feedbackTotal: 0,
      feedbackCommittedTotal: 0,
      feedbackPreviewTotal: 0,
      feedbackUnavailableTotal: 0,
      journal: {
        storage: 'memory',
        entryCount: 0,
        pendingCount: 0,
        pendingBytes: 0,
        updatedAt: 0,
        writeFailures: 0,
        replayFailures: 0,
        checkpointFailures: 0,
      },
      truthFlush: {
        family: 'review-events',
        storage: 'unavailable',
        last: null,
      },
      truthBackfill: {
        family: 'review-events',
        source: 'review_events',
        storage: 'unavailable',
        pendingSqlRows: null,
        pendingSqlRowsCheckedAt: null,
        syncVisible: false,
        last: null,
        lastError: null,
      },
    },
    storage: {
      sqliteDelta: {
        fileName: 'sqlite-delta-log.v2.manifest.json',
        pendingCount: 0,
        pendingBytes: 0,
        lastWrite: null,
        lastReplay: null,
        lastCheckpoint: null,
        writeFailures: 0,
        replayFailures: 0,
        checkpointFailures: 0,
      },
    },
    ai: {
      sessionCreateTotal: 0,
      sessionUpdateTotal: 0,
      sessionCancelTotal: 0,
      streamStartTotal: 0,
      streamCancelTotal: 0,
      jobCreatedTotal: 0,
      jobCompletedTotal: 0,
      jobCanceledTotal: 0,
      jobTimeoutTotal: 0,
      jobFailedTotal: 0,
    },
    hotspot: {
      submittedTotal: 0,
      unavailableTotal: 0,
      failedTotal: 0,
      completedTotal: 0,
    },
    preRequestMerge: {
      latest: null,
      history: [],
    },
    domainSync: {
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
        checkedAt: 0,
        duplicateOperationIds: [],
        duplicateProcessedKeys: [],
        orphanProcessedKeys: [],
        pendingOperationCount: 0,
        committedOperationCount: 0,
        failedOperationCount: 0,
      },
      repair: {
        repairable: false,
        needsDirection: false,
        previewAvailable: false,
      },
    },
  };
}
