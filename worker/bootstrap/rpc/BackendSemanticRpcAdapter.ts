import type {
  BackendRpcHandlerAdapter,
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_SEMANTIC_RPC_METHODS, type BackendSemanticRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendSemanticRpcRuntime {
  executeCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> | BackendSemanticCommandResult;
  readSession(request: BackendSemanticSessionReadRequest): BackendSemanticSessionReadResult;
  readSidebar(request: BackendSemanticSidebarReadRequest): BackendSemanticSidebarReadResult;
  readBrowser(request: BackendSemanticBrowserReadRequest): BackendSemanticBrowserReadResult;
}

export interface BackendSemanticRpcHandlerContext extends BackendRpcHandlerContext {
  readonly semantic: BackendSemanticRpcRuntime;
}

export type BackendSemanticRpcHandlerRegistration = BackendRpcHandlerRegistration<BackendSemanticRpcHandlerContext>;

const BACKEND_SEMANTIC_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendSemanticRpcMethod]: BackendRpcHandlerAdapter<unknown, unknown, BackendSemanticRpcHandlerContext>;
} = {
  'semantic.command.execute': {
    method: 'semantic.command.execute',
    family: 'semantic',
    handle(params, context): Promise<BackendSemanticCommandResult> | BackendSemanticCommandResult {
      return context.semantic.executeCommand(
        readRequiredNamedParams(params, 'semantic.command.execute requires named params'),
      );
    },
  },
  'semantic.session.read': {
    method: 'semantic.session.read',
    family: 'semantic',
    handle(params, context): BackendSemanticSessionReadResult {
      return context.semantic.readSession(
        readRequiredNamedParams(params, 'semantic.session.read requires named params'),
      );
    },
  },
  'semantic.sidebar.read': {
    method: 'semantic.sidebar.read',
    family: 'semantic',
    handle(params, context): BackendSemanticSidebarReadResult {
      return context.semantic.readSidebar(
        readRequiredNamedParams(params, 'semantic.sidebar.read requires named params'),
      );
    },
  },
  'semantic.browser.read': {
    method: 'semantic.browser.read',
    family: 'semantic',
    handle(params, context): BackendSemanticBrowserReadResult {
      return context.semantic.readBrowser(
        readRequiredNamedParams(params, 'semantic.browser.read requires named params'),
      );
    },
  },
};

export const BACKEND_SEMANTIC_RPC_HANDLER_REGISTRATIONS: readonly BackendSemanticRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_SEMANTIC_RPC_METHODS.map((method) => ({
      ...BACKEND_SEMANTIC_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendSemanticRpcAdapter',
    })),
  );

function readNamedParams<TParams extends object>(params: unknown): TParams | null {
  if (!params) {
    return null;
  }
  if (Array.isArray(params)) {
    const [first] = params;
    if (!first || typeof first !== 'object') {
      return null;
    }
    return first as TParams;
  }
  if (typeof params === 'object') {
    return params as TParams;
  }
  return null;
}

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return named;
}
