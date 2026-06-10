import type {
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendHotspotJobGetRequest,
  BackendHotspotJobGetResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_HOTSPOT_RPC_METHODS = [
  'hotspot.command.submit',
  'hotspot.job.get',
] as const satisfies readonly BackendRpcMethod[];

export type BackendHotspotRpcMethod = typeof BACKEND_HOTSPOT_RPC_METHODS[number];

export type BackendHotspotRpcMethodContractMap = {
  readonly 'hotspot.command.submit': BackendRpcMethodContract<
    'hotspot.command.submit',
    BackendHotspotCommandSubmitRequest,
    BackendHotspotCommandSubmitResult
  >;
  readonly 'hotspot.job.get': BackendRpcMethodContract<
    'hotspot.job.get',
    BackendHotspotJobGetRequest,
    BackendHotspotJobGetResult
  >;
};

export const BACKEND_HOTSPOT_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'hotspot.command.submit', family: 'hotspot', clientExposure: 'facade' },
  { method: 'hotspot.job.get', family: 'hotspot', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_HOTSPOT_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_HOTSPOT_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendHotspotRpcMethodContractMap>;
