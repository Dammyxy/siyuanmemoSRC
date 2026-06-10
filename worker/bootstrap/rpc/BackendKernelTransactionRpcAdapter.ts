import type {
  BackendKernelTransactionAction,
  BackendKernelTransactionDequeueRequest,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueRequest,
  BackendKernelTransactionRequeueResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_KERNEL_TRANSACTION_RPC_METHODS, type BackendKernelTransactionRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendKernelTransactionRpcRuntime {
  ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> | BackendKernelTransactionIngestResult;
  dequeueKernelTransactionActions(
    maxActions?: number,
  ): Promise<BackendKernelTransactionDequeueResult> | BackendKernelTransactionDequeueResult;
  requeueKernelTransactionActions(
    actions: BackendKernelTransactionAction[],
  ): Promise<BackendKernelTransactionRequeueResult> | BackendKernelTransactionRequeueResult;
}

export interface BackendKernelTransactionRpcHandlerContext extends BackendRpcHandlerContext {
  readonly kernelTransaction: BackendKernelTransactionRpcRuntime;
}

export type BackendKernelTransactionRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendKernelTransactionRpcHandlerContext
>;

const BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendKernelTransactionRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendKernelTransactionRpcHandlerContext
  >;
} = {
  'kernel.transaction.ingest': {
    method: 'kernel.transaction.ingest',
    family: 'kernel-transaction',
    handle(params, context): Promise<BackendKernelTransactionIngestResult> | BackendKernelTransactionIngestResult {
      const named = readNamedParams<BackendKernelTransactionIngestRequest>(params);
      return context.kernelTransaction.ingestKernelTransactions(named ?? {});
    },
  },
  'kernel.transaction.dequeue': {
    method: 'kernel.transaction.dequeue',
    family: 'kernel-transaction',
    handle(params, context): Promise<BackendKernelTransactionDequeueResult> | BackendKernelTransactionDequeueResult {
      const named = readNamedParams<BackendKernelTransactionDequeueRequest>(params);
      const maxActions = Number(named?.maxActions);
      return context.kernelTransaction.dequeueKernelTransactionActions(Number.isFinite(maxActions) ? maxActions : 16);
    },
  },
  'kernel.transaction.requeue': {
    method: 'kernel.transaction.requeue',
    family: 'kernel-transaction',
    handle(params, context): Promise<BackendKernelTransactionRequeueResult> | BackendKernelTransactionRequeueResult {
      const named = readNamedParams<BackendKernelTransactionRequeueRequest>(params);
      const actions = Array.isArray(named?.actions) ? named.actions : [];
      return context.kernelTransaction.requeueKernelTransactionActions(actions);
    },
  },
};

export const BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_REGISTRATIONS: readonly BackendKernelTransactionRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_KERNEL_TRANSACTION_RPC_METHODS.map((method) => ({
      ...BACKEND_KERNEL_TRANSACTION_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendKernelTransactionRpcAdapter',
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
