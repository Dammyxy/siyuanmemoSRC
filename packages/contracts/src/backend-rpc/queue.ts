import type {
  BackendQueueStateBatchMutateRequest,
  BackendQueueStateBatchMutateResult,
  BackendQueueStateLoadAllRequest,
  BackendQueueStateLoadAllResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_QUEUE_RPC_METHODS = [
  'queue.state.loadAll',
  'queue.state.batchMutate',
] as const satisfies readonly BackendRpcMethod[];

export type BackendQueueRpcMethod = typeof BACKEND_QUEUE_RPC_METHODS[number];

export type BackendQueueRpcMethodContractMap = {
  readonly 'queue.state.loadAll': BackendRpcMethodContract<
    'queue.state.loadAll',
    BackendQueueStateLoadAllRequest,
    BackendQueueStateLoadAllResult
  >;
  readonly 'queue.state.batchMutate': BackendRpcMethodContract<
    'queue.state.batchMutate',
    BackendQueueStateBatchMutateRequest,
    BackendQueueStateBatchMutateResult
  >;
};

export const BACKEND_QUEUE_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'queue.state.loadAll', family: 'queue', clientExposure: 'facade' },
  { method: 'queue.state.batchMutate', family: 'queue', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_QUEUE_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_QUEUE_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendQueueRpcMethodContractMap>;
