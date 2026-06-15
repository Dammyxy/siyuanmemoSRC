import type {
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendHotspotJobGetRequest,
  BackendHotspotJobGetResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_HOTSPOT_RPC_METHODS,
  type BackendHotspotRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendHotspotRpcRuntime {
  submit(request: BackendHotspotCommandSubmitRequest): BackendHotspotCommandSubmitResult;
  get(request: BackendHotspotJobGetRequest): BackendHotspotJobGetResult;
}

export interface BackendHotspotRpcHandlerContext extends BackendRpcHandlerContext {
  readonly hotspot: BackendHotspotRpcRuntime;
}

export type BackendHotspotRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendHotspotRpcHandlerContext
>;

const BACKEND_HOTSPOT_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendHotspotRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendHotspotRpcHandlerContext
  >;
} = {
  'hotspot.command.submit': {
    method: 'hotspot.command.submit',
    family: 'hotspot',
    handle(params, context): BackendHotspotCommandSubmitResult {
      return context.hotspot.submit(readRequiredNamedParams(
        params,
        'hotspot.command.submit requires named params',
        'INVALID_REQUEST',
      ));
    },
  },
  'hotspot.job.get': {
    method: 'hotspot.job.get',
    family: 'hotspot',
    handle(params, context): BackendHotspotJobGetResult {
      return context.hotspot.get(readRequiredNamedParams(
        params,
        'hotspot.job.get requires named params',
        'INVALID_REQUEST',
      ));
    },
  },
};

export const BACKEND_HOTSPOT_RPC_HANDLER_REGISTRATIONS: readonly BackendHotspotRpcHandlerRegistration[] =
  Object.freeze(BACKEND_HOTSPOT_RPC_METHODS.map((method) => ({
    ...BACKEND_HOTSPOT_RPC_HANDLER_ADAPTERS[method],
    owner: 'BackendHotspotRpcAdapter',
  })));

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

function readRequiredNamedParams<TParams extends object>(
  params: unknown,
  message: string,
  code?: 'INVALID_REQUEST',
): TParams {
  const named = readNamedParams<TParams>(params);
  if (!named || typeof named !== 'object') {
    throw new Error(code ? `${code}: ${message}` : message);
  }
  return named;
}
