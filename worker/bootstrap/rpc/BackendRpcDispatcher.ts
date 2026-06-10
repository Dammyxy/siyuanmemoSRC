import {
  BACKEND_RPC_VERSION,
  STORAGE_ERROR_CODES,
  type BackendRpcErrorCode,
  type BackendRpcFailure,
  type BackendRpcId,
  type BackendRpcMethod,
  type BackendRpcResponse,
  type BackendRpcSuccess,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  BackendRpcHandlerRegistration,
  BackendRpcHandlerRegistry,
} from './BackendRpcRegistry';
import type {
  BackendRpcDispatchRequest,
  BackendRpcHandlerContext,
} from './BackendRpcHandlerContext';

export type BackendRpcDispatchOutcome =
  | 'success'
  | 'invalid-request'
  | 'method-not-found'
  | 'handler-error';

export interface BackendRpcDispatcherTimingEvent {
  readonly method: string | null;
  readonly family: string | null;
  readonly owner: string | null;
  readonly outcome: BackendRpcDispatchOutcome;
  readonly durationMs: number;
  readonly errorCode?: BackendRpcErrorCode;
}

export interface BackendRpcDispatcherOptions {
  readonly now?: () => number;
  readonly recordTiming?: (event: BackendRpcDispatcherTimingEvent) => void;
}

const STORAGE_ERROR_CODE_SET = new Set<string>(STORAGE_ERROR_CODES);

export class BackendRpcDispatcher<TContext extends BackendRpcHandlerContext = BackendRpcHandlerContext> {
  private readonly now: () => number;
  private readonly recordTiming: ((event: BackendRpcDispatcherTimingEvent) => void) | null;

  constructor(
    private readonly registry: BackendRpcHandlerRegistry<TContext>,
    options: BackendRpcDispatcherOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.recordTiming = options.recordTiming ?? null;
  }

  async dispatch(request: unknown, context: TContext): Promise<BackendRpcResponse> {
    const now = context.lifecycle?.now ?? this.now;
    const startedAt = now();
    const validation = readBackendRpcDispatchRequest(request);
    if (!validation.ok) {
      this.emitTiming(context, now, startedAt, null, null, 'invalid-request', 'INVALID_REQUEST');
      return buildBackendRpcError(validation.id, 'INVALID_REQUEST', 'Invalid SrsBackendWorker JSON-RPC request');
    }

    const handler = this.registry.handlersByMethod.get(validation.method);
    if (!handler) {
      this.emitTiming(context, now, startedAt, validation.method, null, 'method-not-found', 'METHOD_NOT_FOUND');
      return buildBackendRpcError(validation.id, 'METHOD_NOT_FOUND', `Unknown method: ${validation.method}`);
    }

    const dispatchRequest: BackendRpcDispatchRequest = {
      id: validation.id,
      method: validation.method,
      params: validation.params,
    };
    try {
      await context.lifecycle?.beforeHandle?.(dispatchRequest);
      const result = await handler.handle(validation.params, context);
      this.emitTiming(context, now, startedAt, validation.method, handler, 'success');
      return buildBackendRpcSuccess(validation.id, result);
    } catch (error) {
      const mapped = context.lifecycle?.mapError?.(error) ?? mapBackendRpcDispatchError(error);
      this.emitTiming(context, now, startedAt, validation.method, handler, 'handler-error', mapped.code);
      return buildBackendRpcError(validation.id, mapped.code, mapped.message);
    }
  }

  private emitTiming(
    context: TContext,
    now: () => number,
    startedAt: number,
    method: string | null,
    handler: BackendRpcHandlerRegistration<TContext> | null,
    outcome: BackendRpcDispatchOutcome,
    errorCode?: BackendRpcErrorCode,
  ): void {
    const event = {
      method,
      family: handler?.family ?? null,
      owner: handler?.owner ?? null,
      outcome,
      durationMs: Math.max(0, now() - startedAt),
      ...(errorCode ? { errorCode } : {}),
    };
    context.lifecycle?.recordTiming?.(event);
    this.recordTiming?.(event);
  }
}

export function buildBackendRpcSuccess<TResult>(
  id: BackendRpcId,
  result: TResult,
): BackendRpcSuccess<TResult> {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    result,
  };
}

export function buildBackendRpcError(
  id: BackendRpcId,
  code: BackendRpcErrorCode,
  message: string,
): BackendRpcFailure {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };
}

export function mapBackendRpcDispatchError(error: unknown): { code: BackendRpcErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const storageErrorCode = matchStorageErrorCode(message);
  if (storageErrorCode) {
    return {
      code: storageErrorCode,
      message: message.replace(new RegExp(`^${storageErrorCode}:\\s*`), ''),
    };
  }
  if (message.startsWith('INVALID_REQUEST:')) {
    return {
      code: 'INVALID_REQUEST',
      message: message.replace(/^INVALID_REQUEST:\s*/, ''),
    };
  }
  if (isBackendUnavailableMessage(message)) {
    return {
      code: 'BACKEND_UNAVAILABLE',
      message,
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

function readBackendRpcDispatchRequest(request: unknown):
  | { ok: true; id: BackendRpcId; method: BackendRpcMethod; params: unknown }
  | { ok: false; id: BackendRpcId } {
  if (!request || typeof request !== 'object') {
    return { ok: false, id: 'invalid-request' };
  }
  const candidate = request as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };
  const id = typeof candidate.id === 'number' || typeof candidate.id === 'string'
    ? candidate.id
    : 'invalid-request';
  if (candidate.jsonrpc !== BACKEND_RPC_VERSION || typeof candidate.method !== 'string' || !candidate.method) {
    return { ok: false, id };
  }
  return {
    ok: true,
    id,
    method: candidate.method as BackendRpcMethod,
    params: candidate.params,
  };
}

function matchStorageErrorCode(message: string): BackendRpcErrorCode | null {
  const candidate = message.split(':', 1)[0]?.trim();
  return candidate && STORAGE_ERROR_CODE_SET.has(candidate)
    ? candidate as BackendRpcErrorCode
    : null;
}

function isBackendUnavailableMessage(message: string): boolean {
  return message.startsWith('BACKEND_UNAVAILABLE:')
    || message.includes('BACKEND_UNAVAILABLE:')
    || message.includes('persistence bridge is unavailable')
    || message.includes('is unavailable')
    || message.includes(' unavailable ')
    || message.includes('unavailable:')
    || message.startsWith('unavailable');
}
