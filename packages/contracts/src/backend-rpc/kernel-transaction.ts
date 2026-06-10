import type {
  BackendKernelTransactionDequeueRequest,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueRequest,
  BackendKernelTransactionRequeueResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_KERNEL_TRANSACTION_RPC_METHODS = [
  'kernel.transaction.ingest',
  'kernel.transaction.dequeue',
  'kernel.transaction.requeue',
] as const satisfies readonly BackendRpcMethod[];

export type BackendKernelTransactionRpcMethod = typeof BACKEND_KERNEL_TRANSACTION_RPC_METHODS[number];

export type BackendKernelTransactionRpcMethodContractMap = {
  readonly 'kernel.transaction.ingest': BackendRpcMethodContract<
    'kernel.transaction.ingest',
    BackendKernelTransactionIngestRequest,
    BackendKernelTransactionIngestResult
  >;
  readonly 'kernel.transaction.dequeue': BackendRpcMethodContract<
    'kernel.transaction.dequeue',
    BackendKernelTransactionDequeueRequest,
    BackendKernelTransactionDequeueResult
  >;
  readonly 'kernel.transaction.requeue': BackendRpcMethodContract<
    'kernel.transaction.requeue',
    BackendKernelTransactionRequeueRequest,
    BackendKernelTransactionRequeueResult
  >;
};

export const BACKEND_KERNEL_TRANSACTION_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'kernel.transaction.ingest', family: 'kernel-transaction', clientExposure: 'facade' },
  { method: 'kernel.transaction.dequeue', family: 'kernel-transaction', clientExposure: 'facade' },
  { method: 'kernel.transaction.requeue', family: 'kernel-transaction', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_KERNEL_TRANSACTION_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_KERNEL_TRANSACTION_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendKernelTransactionRpcMethodContractMap>;
