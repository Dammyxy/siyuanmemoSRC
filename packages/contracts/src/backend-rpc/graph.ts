import type {
  BackendGraphQueryRequest,
  BackendGraphQueryResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_GRAPH_RPC_METHODS = [
  'graph.query',
] as const satisfies readonly BackendRpcMethod[];

export type BackendGraphRpcMethod = typeof BACKEND_GRAPH_RPC_METHODS[number];

export type BackendGraphRpcMethodContractMap = {
  readonly 'graph.query': BackendRpcMethodContract<
    'graph.query',
    BackendGraphQueryRequest,
    BackendGraphQueryResult
  >;
};

export const BACKEND_GRAPH_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'graph.query', family: 'graph', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_GRAPH_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_GRAPH_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendGraphRpcMethodContractMap>;
