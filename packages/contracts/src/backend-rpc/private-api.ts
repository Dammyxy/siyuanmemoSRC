import type {
  BackendRpcMethod,
  BackendRpcMethodContract,
  PrivateApiAuditQueryRequest,
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
} from '../backend-rpc';

export const BACKEND_PRIVATE_API_RPC_METHODS = [
  'private.audit.query',
  'private.read.cards',
  'private.read.queues',
  'private.read.sessions',
  'private.command.execute',
] as const satisfies readonly BackendRpcMethod[];

export type BackendPrivateApiRpcMethod = typeof BACKEND_PRIVATE_API_RPC_METHODS[number];

export interface PrivateApiAuditQueryResult {
  ok: true;
  data: unknown[];
  diagnosticEventId: string;
  auditStatus: 'recorded';
}

export type PrivateApiCardsReadRequest = PrivateApiReadRequest & {
  method: 'private.read.cards';
};

export type PrivateApiQueuesReadRequest = PrivateApiReadRequest & {
  method: 'private.read.queues';
};

export type PrivateApiSessionsReadRequest = PrivateApiReadRequest & {
  method: 'private.read.sessions';
};

export type BackendPrivateApiRpcMethodContractMap = {
  readonly 'private.audit.query': BackendRpcMethodContract<
    'private.audit.query',
    PrivateApiAuditQueryRequest,
    PrivateApiAuditQueryResult
  >;
  readonly 'private.read.cards': BackendRpcMethodContract<
    'private.read.cards',
    PrivateApiCardsReadRequest,
    PrivateApiReadResult
  >;
  readonly 'private.read.queues': BackendRpcMethodContract<
    'private.read.queues',
    PrivateApiQueuesReadRequest,
    PrivateApiReadResult
  >;
  readonly 'private.read.sessions': BackendRpcMethodContract<
    'private.read.sessions',
    PrivateApiSessionsReadRequest,
    PrivateApiReadResult
  >;
  readonly 'private.command.execute': BackendRpcMethodContract<
    'private.command.execute',
    PrivateApiMutationRequest,
    PrivateApiMutationResult
  >;
};

export const BACKEND_PRIVATE_API_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'private.audit.query', family: 'private-api', clientExposure: 'facade' },
  { method: 'private.read.cards', family: 'private-api', clientExposure: 'facade' },
  { method: 'private.read.queues', family: 'private-api', clientExposure: 'facade' },
  { method: 'private.read.sessions', family: 'private-api', clientExposure: 'facade' },
  { method: 'private.command.execute', family: 'private-api', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_PRIVATE_API_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_PRIVATE_API_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendPrivateApiRpcMethodContractMap>;
