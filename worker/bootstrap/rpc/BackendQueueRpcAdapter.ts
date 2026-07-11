import type {
  BackendQueueStateBatchMutateRequest,
  BackendQueueStateBatchMutateResult,
  BackendQueueStateLoadAllResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_QUEUE_RPC_METHODS,
  type BackendQueueRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendQueueRpcDatabase {
  loadQueueState(): Promise<Record<string, unknown>>;
  commitQueueStateBatch(
    request: BackendQueueStateBatchMutateRequest,
  ): Promise<BackendQueueStateBatchMutateResult>;
}

export class BackendQueueRpcRuntime {
  constructor(private readonly options: { database: BackendQueueRpcDatabase }) {}

  async handleLoadAll(): Promise<BackendQueueStateLoadAllResult> {
    return {
      values: await this.options.database.loadQueueState(),
    };
  }

  handleBatchMutate(params: unknown): Promise<BackendQueueStateBatchMutateResult> {
    const request = readRequiredNamedParams<BackendQueueStateBatchMutateRequest>(
      params,
      'queue.state.batchMutate requires named params',
    );
    if (!String(request.mutationId || '').trim()) {
      throw new Error('INVALID_REQUEST: queue.state.batchMutate requires mutationId');
    }
    if (!Array.isArray(request.mutations) || request.mutations.length === 0) {
      throw new Error('INVALID_REQUEST: queue.state.batchMutate requires mutations');
    }
    return this.options.database.commitQueueStateBatch(request);
  }
}

export interface BackendQueueRpcHandlerContext extends BackendRpcHandlerContext {
  readonly queue: BackendQueueRpcRuntime;
}

export type BackendQueueRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendQueueRpcHandlerContext
>;

const BACKEND_QUEUE_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendQueueRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendQueueRpcHandlerContext
  >;
} = {
  'queue.state.loadAll': {
    method: 'queue.state.loadAll',
    family: 'queue',
    handle(_params, context): Promise<BackendQueueStateLoadAllResult> {
      return context.queue.handleLoadAll();
    },
  },
  'queue.state.batchMutate': {
    method: 'queue.state.batchMutate',
    family: 'queue',
    handle(params, context): Promise<BackendQueueStateBatchMutateResult> {
      return context.queue.handleBatchMutate(params);
    },
  },
};

export const BACKEND_QUEUE_RPC_HANDLER_REGISTRATIONS: readonly BackendQueueRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_QUEUE_RPC_METHODS.map((method) => ({
      ...BACKEND_QUEUE_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendQueueRpcAdapter',
    })),
  );

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const candidate = Array.isArray(params) ? params[0] : params;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return candidate as TParams;
}
