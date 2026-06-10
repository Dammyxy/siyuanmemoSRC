import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendDiagnosticsStatusResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_CORE_RPC_HANDLER_REGISTRATIONS,
  type BackendCoreRpcHandlerContext,
} from '../rpc/BackendCoreRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

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
          })),
          persist: vi.fn(async () => ({
            ok: true,
            persisted: true,
            dbFile: 'siyuanmemo.db',
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
    await expect(dispatchCore(dispatcher, context, 'db.persist')).resolves.toMatchObject({
      result: { ok: true, persisted: true, dbFile: 'siyuanmemo.db' },
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
});

function dispatchCore(
  dispatcher: BackendRpcDispatcher<BackendCoreRpcHandlerContext>,
  context: BackendCoreRpcHandlerContext,
  method: typeof BACKEND_CORE_RPC_HANDLER_REGISTRATIONS[number]['method'],
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
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
