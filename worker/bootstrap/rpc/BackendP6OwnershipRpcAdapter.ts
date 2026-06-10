import type {
  BackendRpcHandlerAdapter,
  P6OwnershipCommandRequest,
  P6OwnershipOperation,
  P6OwnershipQueryRequest,
  P6OwnershipResult,
  P6OwnershipSurface,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_P6_OWNERSHIP_RPC_METHODS,
  type BackendP6OwnershipRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendP6OwnershipRpcRuntime {
  query(request: P6OwnershipQueryRequest): P6OwnershipResult;
  command(request: P6OwnershipCommandRequest): P6OwnershipResult;
}

export interface BackendP6OwnershipRpcHandlerContext extends BackendRpcHandlerContext {
  readonly p6Ownership: BackendP6OwnershipRpcRuntime;
}

export type BackendP6OwnershipRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendP6OwnershipRpcHandlerContext
>;

export class BackendP6OwnershipRuntime implements BackendP6OwnershipRpcRuntime {
  query(request: P6OwnershipQueryRequest): P6OwnershipResult {
    const surface = normalizeString(request.surface) as P6OwnershipSurface;
    const operation = normalizeString(request.operation) as P6OwnershipOperation;
    if (!P6_OWNERSHIP_SURFACES.has(surface)) {
      throw new Error(`INVALID_REQUEST: p6.ownership.query unsupported surface: ${surface || '<missing>'}`);
    }
    if (!P6_OWNERSHIP_QUERY_OPERATIONS.has(operation)) {
      throw new Error(`INVALID_REQUEST: p6.ownership.query unsupported operation: ${operation || '<missing>'}`);
    }
    return {
      ok: true,
      surface,
      operation,
      owner: 'compatibility-read',
      status: 'completed',
      unavailableClass: null,
      diagnosticEventId: `p6-ownership:${surface}:${operation}:${normalizeString(request.requestId) || Date.now()}`,
      data: request.payload ?? {},
    };
  }

  command(request: P6OwnershipCommandRequest): P6OwnershipResult {
    const surface = normalizeString(request.surface) as P6OwnershipSurface;
    const operation = normalizeString(request.operation) as P6OwnershipOperation;
    const idempotencyKey = normalizeString(request.idempotencyKey);
    if (!P6_OWNERSHIP_SURFACES.has(surface)) {
      throw new Error(`INVALID_REQUEST: p6.ownership.command unsupported surface: ${surface || '<missing>'}`);
    }
    if (operation !== 'execute-side-effect') {
      throw new Error(`INVALID_REQUEST: p6.ownership.command unsupported operation: ${operation || '<missing>'}`);
    }
    if (!idempotencyKey) {
      throw new Error('INVALID_REQUEST: p6.ownership.command requires idempotencyKey');
    }
    return {
      ok: true,
      surface,
      operation,
      owner: 'writer-relay',
      status: 'completed',
      unavailableClass: null,
      diagnosticEventId: `p6-ownership:${surface}:${operation}:${normalizeString(request.requestId) || idempotencyKey}`,
      data: request.payload ?? {},
    };
  }
}

const BACKEND_P6_OWNERSHIP_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendP6OwnershipRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendP6OwnershipRpcHandlerContext
  >;
} = {
  'p6.ownership.query': {
    method: 'p6.ownership.query',
    family: 'p6-ownership',
    handle(params, context): P6OwnershipResult {
      return context.p6Ownership.query(
        readRequiredNamedParams(params, 'p6.ownership.query requires named params'),
      );
    },
  },
  'p6.ownership.command': {
    method: 'p6.ownership.command',
    family: 'p6-ownership',
    handle(params, context): P6OwnershipResult {
      return context.p6Ownership.command(
        readRequiredNamedParams(params, 'p6.ownership.command requires named params'),
      );
    },
  },
};

export const BACKEND_P6_OWNERSHIP_RPC_HANDLER_REGISTRATIONS: readonly BackendP6OwnershipRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_P6_OWNERSHIP_RPC_METHODS.map((method) => ({
      ...BACKEND_P6_OWNERSHIP_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendP6OwnershipRpcAdapter',
    })),
  );

const P6_OWNERSHIP_SURFACES = new Set<P6OwnershipSurface>([
  'xiuyuan',
  'progressive',
  'topic-derived',
  'autocard-scanner',
  'block-menu',
  'dialog-manager',
  'data-access-facade',
]);

const P6_OWNERSHIP_QUERY_OPERATIONS = new Set<P6OwnershipOperation>([
  'scan-candidates',
  'resolve-list-children',
  'resolve-concept',
  'read-block-meta',
  'read-block-content',
  'read-card-context',
]);

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

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}
