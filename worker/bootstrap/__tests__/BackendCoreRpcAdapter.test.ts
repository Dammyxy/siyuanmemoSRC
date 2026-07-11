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
    await expect(dispatchCore(dispatcher, context, 'db.load')).resolves.toMatchObject({
      result: { ok: true, initialized: true, dbFile: 'siyuanmemo.db' },
    });
    await expect(dispatchCore(dispatcher, context, 'db.reload')).resolves.toMatchObject({
      result: { ok: true, reloaded: true, dbFile: 'siyuanmemo.db' },
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
