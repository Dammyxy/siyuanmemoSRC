import type {
  BackendProgressiveCommandExecuteRequest,
  BackendProgressiveCommandExecuteResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BACKEND_PROGRESSIVE_RPC_METHODS, type BackendProgressiveRpcMethod } from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export type BackendProgressiveCommandExecutor = (
  request: BackendProgressiveCommandExecuteRequest,
) => Promise<BackendProgressiveCommandExecuteResult> | BackendProgressiveCommandExecuteResult;

export interface BackendProgressiveRpcRuntime {
  execute(request: BackendProgressiveCommandExecuteRequest): Promise<BackendProgressiveCommandExecuteResult> | BackendProgressiveCommandExecuteResult;
}

export interface BackendProgressiveRpcHandlerContext extends BackendRpcHandlerContext {
  readonly progressive: BackendProgressiveRpcRuntime;
}

export type BackendProgressiveRpcHandlerRegistration = BackendRpcHandlerRegistration<BackendProgressiveRpcHandlerContext>;

export class BackendProgressiveCommandRuntime implements BackendProgressiveRpcRuntime {
  private readonly resultsByIdempotencyKey = new Map<string, BackendProgressiveCommandExecuteResult>();
  private readonly now: () => number;

  constructor(
    private readonly executor?: BackendProgressiveCommandExecutor,
    options: { readonly now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  async execute(request: BackendProgressiveCommandExecuteRequest): Promise<BackendProgressiveCommandExecuteResult> {
    const idempotencyKey = normalizeString(request.idempotencyKey);
    const cached = this.resultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      return cached.status === 'completed' ? { ...cached, status: 'duplicate' } : cached;
    }
    if (!this.executor) {
      return this.createUnavailable(request, 'progressive.command.execute host effect unavailable');
    }
    const result = await this.executor(request);
    this.resultsByIdempotencyKey.set(request.idempotencyKey, result);
    return result;
  }

  private createUnavailable(
    request: BackendProgressiveCommandExecuteRequest,
    reason: string,
  ): BackendProgressiveCommandExecuteResult {
    const now = this.now();
    return {
      status: 'unavailable',
      commandId: normalizeString(request.commandId),
      idempotencyKey: normalizeString(request.idempotencyKey),
      operation: request.operation,
      unavailableClass: 'BACKEND_UNAVAILABLE',
      reason,
      recoverable: true,
      rollback: { attempted: false, status: 'not-needed' },
      progress: { state: 'unavailable', currentStep: 'unavailable', updatedAt: now },
      diagnostics: {
        diagnosticEventId: `progressive:${normalizeString(request.commandId) || 'unknown'}:${now}`,
        family: 'progressive.command',
        commandId: normalizeString(request.commandId),
        timing: {
          submittedAt: Number(request.requestedAt) || now,
          deadlineAt: Number.isFinite(Number(request.deadlineAt)) ? Number(request.deadlineAt) : null,
          completedAt: now,
        },
        errorCategory: 'BACKEND_UNAVAILABLE',
      },
    };
  }
}

const BACKEND_PROGRESSIVE_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendProgressiveRpcMethod]: BackendRpcHandlerAdapter<unknown, unknown, BackendProgressiveRpcHandlerContext>;
} = {
  'progressive.command.execute': {
    method: 'progressive.command.execute',
    family: 'progressive',
    handle(params, context): Promise<BackendProgressiveCommandExecuteResult> | BackendProgressiveCommandExecuteResult {
      return context.progressive.execute(
        readRequiredNamedParams(params, 'progressive.command.execute requires named params'),
      );
    },
  },
};

export const BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS: readonly BackendProgressiveRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_PROGRESSIVE_RPC_METHODS.map((method) => ({
      ...BACKEND_PROGRESSIVE_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendProgressiveRpcAdapter',
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

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}
