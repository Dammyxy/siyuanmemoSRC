import type {
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_PROGRESSIVE_RPC_METHODS = [
  'progressive.command.execute',
] as const satisfies readonly BackendRpcMethod[];

export type BackendProgressiveRpcMethod = typeof BACKEND_PROGRESSIVE_RPC_METHODS[number];

export type BackendProgressiveRpcMethodContractMap = {
  readonly 'progressive.command.execute': BackendRpcMethodContract<
    'progressive.command.execute',
    BackendProgressiveCommandExecuteRequest,
    BackendProgressiveCommandExecuteResult
  >;
};

export const BACKEND_PROGRESSIVE_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'progressive.command.execute', family: 'progressive', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_PROGRESSIVE_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_PROGRESSIVE_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendProgressiveRpcMethodContractMap>;
