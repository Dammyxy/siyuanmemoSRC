import type {
  BackendAiPromptExecuteRequest,
  BackendAiPromptExecuteResult,
  BackendAiSessionCancelRequest,
  BackendAiSessionCreateRequest,
  BackendAiSessionGetRequest,
  BackendAiSessionResult,
  BackendAiSessionUpdateRequest,
  BackendAiStreamCancelRequest,
  BackendAiStreamResult,
  BackendAiStreamStartRequest,
  BackendAiToolJobApprovalRequest,
  BackendAiToolJobExecuteRequest,
  BackendAiToolJobResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_AI_RPC_METHODS = [
  'ai.session.create',
  'ai.session.get',
  'ai.session.update',
  'ai.session.cancel',
  'ai.prompt.execute',
  'ai.tool.job.execute',
  'ai.tool.job.approval',
  'ai.stream.start',
  'ai.stream.cancel',
] as const satisfies readonly BackendRpcMethod[];

export type BackendAiRpcMethod = typeof BACKEND_AI_RPC_METHODS[number];

export type BackendAiRpcMethodContractMap = {
  readonly 'ai.session.create': BackendRpcMethodContract<
    'ai.session.create',
    BackendAiSessionCreateRequest,
    BackendAiSessionResult
  >;
  readonly 'ai.session.get': BackendRpcMethodContract<
    'ai.session.get',
    BackendAiSessionGetRequest,
    BackendAiSessionResult
  >;
  readonly 'ai.session.update': BackendRpcMethodContract<
    'ai.session.update',
    BackendAiSessionUpdateRequest,
    BackendAiSessionResult
  >;
  readonly 'ai.session.cancel': BackendRpcMethodContract<
    'ai.session.cancel',
    BackendAiSessionCancelRequest,
    BackendAiSessionResult
  >;
  readonly 'ai.prompt.execute': BackendRpcMethodContract<
    'ai.prompt.execute',
    BackendAiPromptExecuteRequest,
    BackendAiPromptExecuteResult
  >;
  readonly 'ai.tool.job.execute': BackendRpcMethodContract<
    'ai.tool.job.execute',
    BackendAiToolJobExecuteRequest,
    BackendAiToolJobResult
  >;
  readonly 'ai.tool.job.approval': BackendRpcMethodContract<
    'ai.tool.job.approval',
    BackendAiToolJobApprovalRequest,
    BackendAiToolJobResult
  >;
  readonly 'ai.stream.start': BackendRpcMethodContract<
    'ai.stream.start',
    BackendAiStreamStartRequest,
    BackendAiStreamResult
  >;
  readonly 'ai.stream.cancel': BackendRpcMethodContract<
    'ai.stream.cancel',
    BackendAiStreamCancelRequest,
    BackendAiStreamResult
  >;
};

export const BACKEND_AI_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'ai.session.create', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.session.get', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.session.update', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.session.cancel', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.prompt.execute', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.tool.job.execute', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.tool.job.approval', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.stream.start', family: 'ai', clientExposure: 'facade' },
  { method: 'ai.stream.cancel', family: 'ai', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_AI_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_AI_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendAiRpcMethodContractMap>;
