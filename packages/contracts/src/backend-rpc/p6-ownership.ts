import type {
  BackendRpcMethod,
  BackendRpcMethodContract,
  P6OwnershipCommandRequest,
  P6OwnershipQueryRequest,
  P6OwnershipResult,
} from '../backend-rpc';

export const BACKEND_P6_OWNERSHIP_RPC_METHODS = [
  'p6.ownership.query',
  'p6.ownership.command',
] as const satisfies readonly BackendRpcMethod[];

export type BackendP6OwnershipRpcMethod = typeof BACKEND_P6_OWNERSHIP_RPC_METHODS[number];

export type BackendP6OwnershipRpcMethodContractMap = {
  readonly 'p6.ownership.query': BackendRpcMethodContract<
    'p6.ownership.query',
    P6OwnershipQueryRequest,
    P6OwnershipResult
  >;
  readonly 'p6.ownership.command': BackendRpcMethodContract<
    'p6.ownership.command',
    P6OwnershipCommandRequest,
    P6OwnershipResult
  >;
};

export const BACKEND_P6_OWNERSHIP_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'p6.ownership.query', family: 'p6-ownership', clientExposure: 'facade' },
  { method: 'p6.ownership.command', family: 'p6-ownership', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_P6_OWNERSHIP_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_P6_OWNERSHIP_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendP6OwnershipRpcMethodContractMap>;
