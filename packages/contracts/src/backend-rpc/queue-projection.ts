import type {
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
  BackendStorageProjectionRebuildRequest,
  BackendStorageProjectionRebuildResult,
} from '../backend-rpc';

export const BACKEND_QUEUE_PROJECTION_RPC_METHODS = [
  'storage.projection.rebuild',
  'queue.projection.snapshot',
  'queue.projection.rowsByIds',
  'queue.projection.replace',
] as const satisfies readonly BackendRpcMethod[];

export type BackendQueueProjectionRpcMethod = typeof BACKEND_QUEUE_PROJECTION_RPC_METHODS[number];

export type BackendQueueProjectionRpcMethodContractMap = {
  readonly 'storage.projection.rebuild': BackendRpcMethodContract<
    'storage.projection.rebuild',
    BackendStorageProjectionRebuildRequest,
    BackendStorageProjectionRebuildResult
  >;
  readonly 'queue.projection.snapshot': BackendRpcMethodContract<
    'queue.projection.snapshot',
    BackendQueueProjectionSnapshotRequest,
    BackendQueueProjectionSnapshotResult
  >;
  readonly 'queue.projection.rowsByIds': BackendRpcMethodContract<
    'queue.projection.rowsByIds',
    BackendQueueProjectionRowsByIdsRequest,
    BackendQueueProjectionRowsByIdsResult
  >;
  readonly 'queue.projection.replace': BackendRpcMethodContract<
    'queue.projection.replace',
    BackendQueueProjectionReplaceRequest,
    BackendQueueProjectionReplaceResult
  >;
};

export const BACKEND_QUEUE_PROJECTION_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'storage.projection.rebuild', family: 'queue-projection', clientExposure: 'facade' },
  { method: 'queue.projection.snapshot', family: 'queue-projection', clientExposure: 'facade' },
  { method: 'queue.projection.rowsByIds', family: 'queue-projection', clientExposure: 'facade' },
  { method: 'queue.projection.replace', family: 'queue-projection', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_QUEUE_PROJECTION_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_QUEUE_PROJECTION_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendQueueProjectionRpcMethodContractMap>;
