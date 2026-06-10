import type {
  BackendRpcMethod,
  BackendRpcMethodContract,
  BackendXiuyuanSyncExecuteRequest,
  BackendXiuyuanSyncExecuteResult,
} from '../backend-rpc';

export const BACKEND_XIUYUAN_RPC_METHODS = [
  'xiuyuan.sync.execute',
] as const satisfies readonly BackendRpcMethod[];

export type BackendXiuyuanRpcMethod = typeof BACKEND_XIUYUAN_RPC_METHODS[number];

export type BackendXiuyuanRpcMethodContractMap = {
  readonly 'xiuyuan.sync.execute': BackendRpcMethodContract<
    'xiuyuan.sync.execute',
    BackendXiuyuanSyncExecuteRequest,
    BackendXiuyuanSyncExecuteResult
  >;
};

export const BACKEND_XIUYUAN_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'xiuyuan.sync.execute', family: 'xiuyuan', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_XIUYUAN_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_XIUYUAN_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendXiuyuanRpcMethodContractMap>;
