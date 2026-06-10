import type {
  BackendRpcMethod,
  BackendRpcMethodContract,
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
} from '../backend-rpc';

export const BACKEND_SEMANTIC_RPC_METHODS = [
  'semantic.command.execute',
  'semantic.session.read',
  'semantic.sidebar.read',
  'semantic.browser.read',
] as const satisfies readonly BackendRpcMethod[];

export type BackendSemanticRpcMethod = typeof BACKEND_SEMANTIC_RPC_METHODS[number];

export type BackendSemanticRpcMethodContractMap = {
  readonly 'semantic.command.execute': BackendRpcMethodContract<
    'semantic.command.execute',
    BackendSemanticCommandRequest,
    BackendSemanticCommandResult
  >;
  readonly 'semantic.session.read': BackendRpcMethodContract<
    'semantic.session.read',
    BackendSemanticSessionReadRequest,
    BackendSemanticSessionReadResult
  >;
  readonly 'semantic.sidebar.read': BackendRpcMethodContract<
    'semantic.sidebar.read',
    BackendSemanticSidebarReadRequest,
    BackendSemanticSidebarReadResult
  >;
  readonly 'semantic.browser.read': BackendRpcMethodContract<
    'semantic.browser.read',
    BackendSemanticBrowserReadRequest,
    BackendSemanticBrowserReadResult
  >;
};

export const BACKEND_SEMANTIC_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'semantic.command.execute', family: 'semantic', clientExposure: 'facade' },
  { method: 'semantic.session.read', family: 'semantic', clientExposure: 'facade' },
  { method: 'semantic.sidebar.read', family: 'semantic', clientExposure: 'facade' },
  { method: 'semantic.browser.read', family: 'semantic', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_SEMANTIC_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_SEMANTIC_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendSemanticRpcMethodContractMap>;
