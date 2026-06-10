import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type BackendNeuralGraphQueryRequest,
  type BackendNeuralGraphQueryResult,
  type BackendQueueProjectionReplaceRequest,
  type BackendQueueProjectionReplaceResult,
  type BackendQueueProjectionRowsByIdsRequest,
  type BackendQueueProjectionRowsByIdsResult,
  type BackendQueueProjectionSnapshotRequest,
  type BackendQueueProjectionSnapshotResult,
  type BackendRpcHandlerAdapter,
  type BackendStorageProjectionRebuildRequest,
  type BackendStorageProjectionRebuildResult,
  type MessagePackTruthFamily,
  type MessagePackTruthRecord,
  type SqlProjectionFamily,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_QUEUE_PROJECTION_RPC_METHODS, type BackendQueueProjectionRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  MESSAGEPACK_TRUTH_MANIFEST_VERSION,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentManifest,
} from '../../truth/MessagePackTruthSegmentStore';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

interface ProjectionRebuildSourceRead {
  blockId: string;
  status: string;
  found: boolean;
  error: string | null;
  data?: unknown;
}

type BackendQueueProjectionRebuildInput = Omit<
  BackendStorageProjectionRebuildRequest,
  'schemaVersion'
> & {
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  truthRecords: MessagePackTruthRecord[];
  truthManifest: MessagePackTruthSegmentManifest;
  sourceReads: ProjectionRebuildSourceRead[];
};

export interface BackendQueueProjectionRpcDatabase {
  queueProjectionSnapshot(
    request: BackendQueueProjectionSnapshotRequest,
  ): Promise<BackendQueueProjectionSnapshotResult> | BackendQueueProjectionSnapshotResult;
  queueProjectionRowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> | BackendQueueProjectionRowsByIdsResult;
  replaceQueueProjection(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> | BackendQueueProjectionReplaceResult;
  rebuildSqlProjections(
    request: BackendQueueProjectionRebuildInput,
  ): Promise<BackendStorageProjectionRebuildResult> | BackendStorageProjectionRebuildResult;
}

export interface BackendQueueProjectionRpcRuntime {
  readonly database: BackendQueueProjectionRpcDatabase;
  readonly truthFileStore?: MessagePackTruthSegmentFileStore;
  resolveNeuralGraphQuery?(
    request: BackendNeuralGraphQueryRequest,
  ): Promise<BackendNeuralGraphQueryResult> | BackendNeuralGraphQueryResult;
}

export interface BackendQueueProjectionRpcHandlerContext extends BackendRpcHandlerContext {
  readonly queueProjection: BackendQueueProjectionRpcRuntime;
}

export type BackendQueueProjectionRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendQueueProjectionRpcHandlerContext
>;

const BACKEND_QUEUE_PROJECTION_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendQueueProjectionRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendQueueProjectionRpcHandlerContext
  >;
} = {
  'storage.projection.rebuild': {
    method: 'storage.projection.rebuild',
    family: 'queue-projection',
    handle(params, context): Promise<BackendStorageProjectionRebuildResult> {
      return rebuildStorageProjection(params, context.queueProjection);
    },
  },
  'queue.projection.snapshot': {
    method: 'queue.projection.snapshot',
    family: 'queue-projection',
    handle(params, context): Promise<BackendQueueProjectionSnapshotResult> | BackendQueueProjectionSnapshotResult {
      const named = readRequiredNamedParams<BackendQueueProjectionSnapshotRequest>(
        params,
        'queue.projection.snapshot requires named params',
      );
      return context.queueProjection.database.queueProjectionSnapshot(named);
    },
  },
  'queue.projection.rowsByIds': {
    method: 'queue.projection.rowsByIds',
    family: 'queue-projection',
    handle(params, context): Promise<BackendQueueProjectionRowsByIdsResult> | BackendQueueProjectionRowsByIdsResult {
      const named = readRequiredNamedParams<BackendQueueProjectionRowsByIdsRequest>(
        params,
        'queue.projection.rowsByIds requires named params',
      );
      return context.queueProjection.database.queueProjectionRowsByIds(named);
    },
  },
  'queue.projection.replace': {
    method: 'queue.projection.replace',
    family: 'queue-projection',
    handle(params, context): Promise<BackendQueueProjectionReplaceResult> | BackendQueueProjectionReplaceResult {
      const named = readRequiredNamedParams<BackendQueueProjectionReplaceRequest>(
        params,
        'queue.projection.replace requires named params',
      );
      return context.queueProjection.database.replaceQueueProjection(named);
    },
  },
};

export const BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS: readonly BackendQueueProjectionRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_QUEUE_PROJECTION_RPC_METHODS.map((method) => ({
      ...BACKEND_QUEUE_PROJECTION_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendQueueProjectionRpcAdapter',
    })),
  );

function readNamedParams<TParams extends object>(params: unknown): TParams | null {
  if (!params) {
    return null;
  }
  if (Array.isArray(params)) {
    const [first] = params;
    if (!first || typeof first !== 'object') {
      return null;
    }
    return first as TParams;
  }
  if (typeof params === 'object') {
    return params as TParams;
  }
  return null;
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return named;
}

async function rebuildStorageProjection(
  params: unknown,
  runtime: BackendQueueProjectionRpcRuntime,
): Promise<BackendStorageProjectionRebuildResult> {
  const named = readRequiredNamedParams<BackendStorageProjectionRebuildRequest>(
    params,
    'storage.projection.rebuild requires named params',
  );
  if (!Array.isArray(named.families) || named.families.length === 0) {
    throw new Error('INVALID_REQUEST: storage.projection.rebuild requires at least one projection family');
  }
  if (!runtime.truthFileStore) {
    throw new Error('BACKEND_UNAVAILABLE: storage.projection.rebuild requires truth segment file store');
  }
  const deviceId = String(named.deviceId || '').trim();
  const generationId = String(named.generationId || '').trim();
  if (!deviceId) {
    throw new Error('TRUTH_DEVICE_ID_UNAVAILABLE: storage.projection.rebuild requires truth-wide persistent local device id');
  }
  if (!generationId) {
    throw new Error('INVALID_REQUEST: storage.projection.rebuild requires generationId');
  }

  const schemaVersion = Math.max(1, Math.floor(Number(named.schemaVersion) || MESSAGEPACK_TRUTH_SCHEMA_VERSION));
  const maxSegmentBytes = Math.max(256, Math.floor(Number(named.maxSegmentBytes) || 1024 * 1024));
  const truthFamilies = uniqueStrings(
    named.families.flatMap((family) => projectionTruthFamilies(family)),
  ) as MessagePackTruthFamily[];
  if (truthFamilies.length === 0) {
    return runtime.database.rebuildSqlProjections({
      ...named,
      deviceId,
      generationId,
      schemaVersion,
      truthRecords: [],
      truthManifest: mergeProjectionTruthManifests([], { generationId, schemaVersion }),
      sourceReads: [],
    });
  }

  const truthRecords: MessagePackTruthRecord[] = [];
  const truthManifests: MessagePackTruthSegmentManifest[] = [];
  try {
    for (const family of truthFamilies) {
      const truthStore = createMessagePackTruthSegmentStore({
        fileStore: runtime.truthFileStore,
        family,
        deviceId,
        generationId,
        schemaVersion,
        maxSegmentBytes,
      });
      const replay = await truthStore.replayRecords({ dedupeByIdempotencyKey: true });
      truthRecords.push(...replay.records as MessagePackTruthRecord[]);
      truthManifests.push(replay.manifest);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildProjectionRebuildUnavailableResult({
      request: named,
      reason: 'validation-failed',
      message,
    });
  }

  const requestedReviewIndexes = named.families.includes('review-event-indexes');
  const requestedCards = named.families.includes('cards');
  const sourceBlockIds = requestedReviewIndexes || requestedCards
    ? uniqueStrings(
      truthRecords
        .filter((record) => isRecord(record) && (
          (requestedReviewIndexes && record.family === 'review-events')
          || (requestedCards && (
            record.family === 'card-memory-facts'
            || (record.family === 'review-events' && record.type === 'review.feedback.v2' && isRecord(record.afterCard))
          ))
        ))
        .map((record) => readProjectionTruthSourceBlockId(record)),
    )
    : [];
  if (sourceBlockIds.length > 0 && !runtime.resolveNeuralGraphQuery) {
    return buildProjectionRebuildUnavailableResult({
      request: named,
      reason: 'source-reader-unavailable',
      message: 'storage.projection.rebuild requires SiYuan source reader for source-bound records',
      rowsRead: truthRecords.length,
    });
  }

  const sourceReads: ProjectionRebuildSourceRead[] = [];
  for (const blockId of sourceBlockIds) {
    try {
      const result = await runtime.resolveNeuralGraphQuery!({
        operation: 'fetchBlockData',
        blockId,
      });
      sourceReads.push({
        blockId,
        status: result.status,
        found: result.status === 'found' && result.data !== null,
        data: result.data ?? null,
        error: result.error ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildProjectionRebuildUnavailableResult({
        request: named,
        reason: 'source-reader-unavailable',
        message,
        rowsRead: truthRecords.length,
        sourceReadCount: sourceReads.length,
      });
    }
  }

  return runtime.database.rebuildSqlProjections({
    ...named,
    deviceId,
    generationId,
    schemaVersion,
    truthRecords,
    truthManifest: mergeProjectionTruthManifests(truthManifests, { generationId, schemaVersion }),
    sourceReads,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readProjectionTruthSourceBlockId(record: Record<string, unknown>): string | null {
  const source = isRecord(record.source) ? record.source : null;
  const candidate = String(
    source?.blockId
      ?? source?.sourceBlockId
      ?? record.blockId
      ?? record.sourceBlockId
      ?? '',
  ).trim();
  return candidate || null;
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function projectionTruthFamilies(family: SqlProjectionFamily): MessagePackTruthFamily[] {
  if (family === 'review-event-indexes') {
    return ['review-events'];
  }
  if (family === 'cards') {
    return ['card-memory-facts', 'review-events'];
  }
  return [];
}

function mergeProjectionTruthManifests(
  manifests: MessagePackTruthSegmentManifest[],
  input: { generationId: string; schemaVersion: number },
): MessagePackTruthSegmentManifest {
  if (manifests.length === 1) {
    return manifests[0];
  }
  const updatedAt = manifests.reduce((max, manifest) => Math.max(max, Number(manifest.updatedAt) || 0), 0);
  return {
    version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
    path: 'projection-rebuild:merged',
    family: 'projection-rebuild',
    deviceId: 'projection-rebuild',
    generationId: input.generationId,
    schemaVersion: input.schemaVersion,
    segments: manifests.flatMap((manifest) => manifest.segments),
    updatedAt,
  };
}

function buildProjectionRebuildUnavailableResult(input: {
  request: BackendStorageProjectionRebuildRequest;
  reason: 'source-reader-unavailable' | 'validation-failed' | 'invalid-request';
  message: string;
  rowsRead?: number;
  sourceReadCount?: number;
  missingSourceIds?: string[];
}): BackendStorageProjectionRebuildResult {
  const at = Date.now();
  const rebuildId = String(input.request.rebuildId || '').trim() || `projection-rebuild:${at}`;
  const cause = String(input.request.cause || '').trim() || 'manual';
  const families = Array.isArray(input.request.families) ? input.request.families : [];
  const status = input.reason === 'validation-failed' ? 'repair-required' : 'unavailable';
  return {
    status,
    at,
    rebuildId,
    cause,
    projectionGeneration: 0,
    rowsRead: Math.max(0, Math.floor(Number(input.rowsRead || 0))),
    rowsWritten: 0,
    sourceReadCount: Math.max(0, Math.floor(Number(input.sourceReadCount || 0))),
    missingSourceIds: input.missingSourceIds ?? [],
    families: families.map((family) => ({
      family,
      status,
      unavailableReason: input.reason,
      projectionGeneration: 0,
      rowsRead: Math.max(0, Math.floor(Number(input.rowsRead || 0))),
      rowsWritten: 0,
      sourceReadCount: Math.max(0, Math.floor(Number(input.sourceReadCount || 0))),
      missingSourceIds: input.missingSourceIds ?? [],
      error: input.message,
    })),
    error: input.message,
  };
}
