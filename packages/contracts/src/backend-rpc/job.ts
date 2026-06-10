import type {
  BackendAiJobCancelRequest,
  BackendAiJobGetRequest,
  BackendAiJobResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_JOB_RPC_METHODS = [
  'job.get',
  'job.cancel',
] as const satisfies readonly BackendRpcMethod[];

export type BackendJobRpcMethod = typeof BACKEND_JOB_RPC_METHODS[number];

export type BackendJobRpcMethodContractMap = {
  readonly 'job.get': BackendRpcMethodContract<'job.get', BackendAiJobGetRequest, BackendAiJobResult>;
  readonly 'job.cancel': BackendRpcMethodContract<'job.cancel', BackendAiJobCancelRequest, BackendAiJobResult>;
};

export const BACKEND_JOB_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'job.get', family: 'job', clientExposure: 'facade' },
  { method: 'job.cancel', family: 'job', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_JOB_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_JOB_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendJobRpcMethodContractMap>;
