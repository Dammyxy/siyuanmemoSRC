import type {
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendAutoCardExecuteBatchRequest,
  BackendAutoCardExecuteBatchResult,
  BackendAutoCardExecuteRequest,
  BackendAutoCardExecuteResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_AUTOCARD_RPC_METHODS = [
  'autocard.decision.resolve',
  'autocard.execute',
  'autocard.executeBatch',
] as const satisfies readonly BackendRpcMethod[];

export type BackendAutoCardRpcMethod = typeof BACKEND_AUTOCARD_RPC_METHODS[number];

export type BackendAutoCardRpcMethodContractMap = {
  readonly 'autocard.decision.resolve': BackendRpcMethodContract<
    'autocard.decision.resolve',
    BackendAutoCardDecisionResolveRequest,
    BackendAutoCardDecisionResolveResult
  >;
  readonly 'autocard.execute': BackendRpcMethodContract<
    'autocard.execute',
    BackendAutoCardExecuteRequest,
    BackendAutoCardExecuteResult
  >;
  readonly 'autocard.executeBatch': BackendRpcMethodContract<
    'autocard.executeBatch',
    BackendAutoCardExecuteBatchRequest,
    BackendAutoCardExecuteBatchResult
  >;
};

export const BACKEND_AUTOCARD_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'autocard.decision.resolve', family: 'autocard', clientExposure: 'facade' },
  { method: 'autocard.execute', family: 'autocard', clientExposure: 'facade' },
  { method: 'autocard.executeBatch', family: 'autocard', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_AUTOCARD_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_AUTOCARD_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendAutoCardRpcMethodContractMap>;
