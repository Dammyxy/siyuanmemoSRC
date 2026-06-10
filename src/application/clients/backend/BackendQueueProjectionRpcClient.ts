import type {
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendStorageProjectionRebuildRequest,
  BackendStorageProjectionRebuildResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendQueueProjectionClientFacet {
  queueProjectionSnapshot(request: BackendQueueProjectionSnapshotRequest): Promise<BackendQueueProjectionSnapshotResult>;
  queueProjectionRowsByIds(request: BackendQueueProjectionRowsByIdsRequest): Promise<BackendQueueProjectionRowsByIdsResult>;
  queueProjectionReplace(request: BackendQueueProjectionReplaceRequest): Promise<BackendQueueProjectionReplaceResult>;
  storageProjectionRebuild(request: BackendStorageProjectionRebuildRequest): Promise<BackendStorageProjectionRebuildResult>;
}

export class BackendQueueProjectionRpcClient implements BackendQueueProjectionClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  queueProjectionSnapshot(request: BackendQueueProjectionSnapshotRequest): Promise<BackendQueueProjectionSnapshotResult> {
    return this.rpcCaller.call<BackendQueueProjectionSnapshotResult>('queue.projection.snapshot', request);
  }

  queueProjectionRowsByIds(request: BackendQueueProjectionRowsByIdsRequest): Promise<BackendQueueProjectionRowsByIdsResult> {
    return this.rpcCaller.call<BackendQueueProjectionRowsByIdsResult>('queue.projection.rowsByIds', request);
  }

  queueProjectionReplace(request: BackendQueueProjectionReplaceRequest): Promise<BackendQueueProjectionReplaceResult> {
    return this.rpcCaller.call<BackendQueueProjectionReplaceResult>('queue.projection.replace', request);
  }

  storageProjectionRebuild(request: BackendStorageProjectionRebuildRequest): Promise<BackendStorageProjectionRebuildResult> {
    return this.rpcCaller.call<BackendStorageProjectionRebuildResult>('storage.projection.rebuild', request);
  }
}
