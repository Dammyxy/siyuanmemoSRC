import type {
  BackendRpcMethod,
  BackendRpcMethodContract,
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
} from '../backend-rpc';

export const BACKEND_TOPIC_DERIVED_RPC_METHODS = [
  'topic-derived.command.execute',
] as const satisfies readonly BackendRpcMethod[];

export type BackendTopicDerivedRpcMethod = typeof BACKEND_TOPIC_DERIVED_RPC_METHODS[number];

export type BackendTopicDerivedRpcMethodContractMap = {
  readonly 'topic-derived.command.execute': BackendRpcMethodContract<
    'topic-derived.command.execute',
    BackendTopicDerivedCommandExecuteRequest,
    BackendTopicDerivedCommandExecuteResult
  >;
};

export const BACKEND_TOPIC_DERIVED_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'topic-derived.command.execute', family: 'topic-derived', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_TOPIC_DERIVED_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_TOPIC_DERIVED_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendTopicDerivedRpcMethodContractMap>;
