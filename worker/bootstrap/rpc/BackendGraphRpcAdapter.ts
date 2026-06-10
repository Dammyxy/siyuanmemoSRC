import type {
  BackendGraphQueryRequest,
  BackendGraphQueryResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_GRAPH_RPC_METHODS, type BackendGraphRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendGraphRpcRuntime {
  query(request: BackendGraphQueryRequest): Promise<BackendGraphQueryResult> | BackendGraphQueryResult;
}

export interface BackendGraphRpcHandlerContext extends BackendRpcHandlerContext {
  readonly graph: BackendGraphRpcRuntime;
}

export type BackendGraphRpcHandlerRegistration = BackendRpcHandlerRegistration<BackendGraphRpcHandlerContext>;

const BACKEND_GRAPH_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendGraphRpcMethod]: BackendRpcHandlerAdapter<unknown, unknown, BackendGraphRpcHandlerContext>;
} = {
  'graph.query': {
    method: 'graph.query',
    family: 'graph',
    handle(params, context): Promise<BackendGraphQueryResult> | BackendGraphQueryResult {
      return context.graph.query(readRequiredNamedParams(params, 'graph.query requires named params'));
    },
  },
};

export const BACKEND_GRAPH_RPC_HANDLER_REGISTRATIONS: readonly BackendGraphRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_GRAPH_RPC_METHODS.map((method) => ({
      ...BACKEND_GRAPH_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendGraphRpcAdapter',
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
