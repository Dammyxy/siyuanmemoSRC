import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendQueueProjectionReplaceResult,
  type BackendQueueProjectionRowsByIdsResult,
  type BackendQueueProjectionSnapshotResult,
  type BackendStorageProjectionRebuildResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../../truth/MessagePackTruthSegmentStore';
import {
  BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS,
  type BackendQueueProjectionRpcDatabase,
  type BackendQueueProjectionRpcHandlerContext,
} from '../rpc/BackendQueueProjectionRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('BackendQueueProjectionRpcAdapter', () => {
  it('serves queue projection snapshot, rowsByIds, and replace through the family adapter', async () => {
    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext();

    await expect(dispatchQueueProjection(dispatcher, context, 'queue.projection.snapshot', {
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
    })).resolves.toMatchObject({
      result: {
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 2,
        status: 'ready',
      },
    });
    expect(context.queueProjection.database.queueProjectionSnapshot).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
    });

    await expect(dispatchQueueProjection(dispatcher, context, 'queue.projection.rowsByIds', {
      queueType: 'retrieval-practice',
      ids: ['card-1'],
    })).resolves.toMatchObject({
      result: {
        queueType: 'retrieval-practice',
        status: 'ready',
        cards: [{ id: 'card-1' }],
      },
    });
    expect(context.queueProjection.database.queueProjectionRowsByIds).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      ids: ['card-1'],
    });

    await expect(dispatchQueueProjection(dispatcher, context, 'queue.projection.replace', {
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 3,
      rows: [],
    })).resolves.toMatchObject({
      result: {
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        status: 'ready',
        rows: 0,
      },
    });
    expect(context.queueProjection.database.replaceQueueProjection).toHaveBeenCalledWith({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 3,
      rows: [],
    });
  });

  it('keeps named-param validation explicit for queue projection methods', async () => {
    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext();

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-snapshot',
      method: 'queue.projection.snapshot',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'queue.projection.snapshot requires named params',
      },
    });
    expect(context.queueProjection.database.queueProjectionSnapshot).not.toHaveBeenCalled();
  });

  it('preserves explicit storage projection rebuild unavailable behavior when truth store is absent', async () => {
    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext({ truthFileStore: undefined });

    await expect(dispatchQueueProjection(dispatcher, context, 'storage.projection.rebuild', {
      rebuildId: 'rebuild-no-truth-store',
      cause: 'sql-missing',
      families: ['cards'],
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
    })).resolves.toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: storage.projection.rebuild requires truth segment file store',
      },
    });
    expect(context.queueProjection.database.rebuildSqlProjections).not.toHaveBeenCalled();
  });

  it('replays truth records, reads source blocks, and delegates storage projection rebuild to worker database authority', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    await createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    }).appendRecords([{
      family: 'card-memory-facts',
      schemaVersion: 1,
      type: 'card-memory.created.v1',
      idempotencyKey: 'card:create:card-1',
      logicalTime: 10,
      recordedAt: 10,
      source: { cardId: 'card-1', blockId: 'block-1' },
      memory: { schedulerOwner: 'fsrs-v6', memoryHash: 'memory-1' },
    }]);

    const dispatcher = createQueueProjectionDispatcher();
    const context = createQueueProjectionContext({
      truthFileStore: fileStore,
      resolveNeuralGraphQuery: vi.fn(async (request) => ({
        status: 'found',
        blockId: request.blockId,
        data: { markdown: 'source block' },
        error: null,
      })),
    });

    await expect(dispatchQueueProjection(dispatcher, context, 'storage.projection.rebuild', {
      rebuildId: 'rebuild-cards',
      cause: 'sql-deleted',
      families: ['cards'],
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
    })).resolves.toMatchObject({
      result: {
        status: 'ready',
        rebuildId: 'rebuild-cards',
        rowsRead: 1,
        sourceReadCount: 1,
      },
    });

    expect(context.queueProjection.resolveNeuralGraphQuery).toHaveBeenCalledWith({
      operation: 'fetchBlockData',
      blockId: 'block-1',
    });
    expect(context.queueProjection.database.rebuildSqlProjections).toHaveBeenCalledWith(
      expect.objectContaining({
        rebuildId: 'rebuild-cards',
        cause: 'sql-deleted',
        families: ['cards'],
        deviceId: 'device-A',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
        truthRecords: [expect.objectContaining({
          family: 'card-memory-facts',
          idempotencyKey: 'card:create:card-1',
        })],
        sourceReads: [{
          blockId: 'block-1',
          status: 'found',
          found: true,
          data: { markdown: 'source block' },
          error: null,
        }],
      }),
    );
  });
});

function createQueueProjectionDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchQueueProjection(
  dispatcher: BackendRpcDispatcher<BackendQueueProjectionRpcHandlerContext>,
  context: BackendQueueProjectionRpcHandlerContext,
  method: typeof BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createQueueProjectionContext(
  overrides: Partial<BackendQueueProjectionRpcHandlerContext['queueProjection']> = {},
): BackendQueueProjectionRpcHandlerContext {
  return {
    queueProjection: {
      database: createQueueProjectionDatabase(),
      truthFileStore: new MemoryTruthSegmentFileStore(),
      ...overrides,
    },
  };
}

function createQueueProjectionDatabase(): BackendQueueProjectionRpcDatabase {
  return {
    queueProjectionSnapshot: vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
      status: 'ready',
      rows: [],
      counters: null,
      freshness: null,
      cacheState: 'ready-empty',
    } satisfies BackendQueueProjectionSnapshotResult)),
    queueProjectionRowsByIds: vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 2,
      status: 'ready',
      rows: [],
      cards: [{ id: 'card-1' }],
      freshness: null,
      cacheState: 'ready-populated',
    } satisfies BackendQueueProjectionRowsByIdsResult)),
    replaceQueueProjection: vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: 'policy-a',
      generation: 3,
      status: 'ready',
      rows: 0,
      counters: {
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        version: 1,
        remaining: 0,
        due: 0,
        total: 0,
        buckets: {},
        updatedAt: 100,
      },
    } satisfies BackendQueueProjectionReplaceResult)),
    rebuildSqlProjections: vi.fn(async (request) => ({
      status: 'ready',
      at: 100,
      rebuildId: String(request.rebuildId || 'rebuild'),
      cause: String(request.cause || 'manual'),
      projectionGeneration: 1,
      rowsRead: request.truthRecords.length,
      rowsWritten: request.truthRecords.length,
      sourceReadCount: request.sourceReads.length,
      missingSourceIds: [],
      families: request.families.map((family) => ({
        family,
        status: 'ready',
        unavailableReason: null,
        projectionGeneration: 1,
        rowsRead: request.truthRecords.length,
        rowsWritten: request.truthRecords.length,
        sourceReadCount: request.sourceReads.length,
        missingSourceIds: [],
        error: null,
      })),
      error: null,
    } satisfies BackendStorageProjectionRebuildResult)),
  };
}

class MemoryTruthSegmentFileStore implements MessagePackTruthSegmentFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [
      ...Array.from(this.jsonFiles.keys()),
      ...Array.from(this.binaryFiles.keys()),
    ].filter((path) => path.startsWith(prefix));
  }
}
