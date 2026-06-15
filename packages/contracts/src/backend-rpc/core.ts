import type {
  BackendDbLoadRequest,
  BackendDbLoadResult,
  BackendDbPersistResult,
  BackendDiagnosticsStatusResult,
  BackendHealthResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_CORE_RPC_METHODS = [
  'system.health',
  'db.load',
  'db.persist',
  'diagnostics.status',
  'private.health',
  'private.diagnostics.status',
] as const satisfies readonly BackendRpcMethod[];

export type BackendCoreRpcMethod = typeof BACKEND_CORE_RPC_METHODS[number];

export interface BackendPrivateHealthResult {
  ok: true;
  runtime: 'srs-backend-worker';
  feature: 'private-api';
}

export interface BackendPrivateDiagnosticsStatusResult {
  ok: true;
  runtime: 'srs-backend-worker';
  status: BackendDiagnosticsStatusResult;
  auditEvents: number;
}

export type BackendCoreRpcMethodContractMap = {
  readonly 'system.health': BackendRpcMethodContract<'system.health', void, BackendHealthResult>;
  readonly 'db.load': BackendRpcMethodContract<'db.load', BackendDbLoadRequest | void, BackendDbLoadResult>;
  readonly 'db.persist': BackendRpcMethodContract<'db.persist', void, BackendDbPersistResult>;
  readonly 'diagnostics.status': BackendRpcMethodContract<'diagnostics.status', void, BackendDiagnosticsStatusResult>;
  readonly 'private.health': BackendRpcMethodContract<'private.health', void, BackendPrivateHealthResult>;
  readonly 'private.diagnostics.status': BackendRpcMethodContract<
    'private.diagnostics.status',
    void,
    BackendPrivateDiagnosticsStatusResult
  >;
};

export const BACKEND_CORE_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'system.health', family: 'core', clientExposure: 'facade' },
  { method: 'db.load', family: 'core', clientExposure: 'facade' },
  { method: 'db.persist', family: 'core', clientExposure: 'facade' },
  { method: 'diagnostics.status', family: 'core', clientExposure: 'facade' },
  { method: 'private.health', family: 'core', clientExposure: 'facade' },
  { method: 'private.diagnostics.status', family: 'core', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_CORE_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_CORE_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendCoreRpcMethodContractMap>;
