import type {
  BackendQueueStateBatchMutateRequest,
  BackendQueueStateBatchMutateResult,
  BackendQueueStateLoadAllResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendQueueClientFacet {
  queueStateLoadAll(): Promise<BackendQueueStateLoadAllResult>;
  queueStateBatchMutate(
    request: BackendQueueStateBatchMutateRequest,
  ): Promise<BackendQueueStateBatchMutateResult>;
}

export class BackendQueueRpcClient implements BackendQueueClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  queueStateLoadAll(): Promise<BackendQueueStateLoadAllResult> {
    return this.rpcCaller.call<BackendQueueStateLoadAllResult>(
      'queue.state.loadAll',
      {},
    );
  }

  queueStateBatchMutate(
    request: BackendQueueStateBatchMutateRequest,
  ): Promise<BackendQueueStateBatchMutateResult> {
    return this.rpcCaller.call<BackendQueueStateBatchMutateResult>(
      'queue.state.batchMutate',
      request,
    );
  }
}
