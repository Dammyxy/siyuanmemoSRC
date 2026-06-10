import type {
  BackendRpcHandlerAdapter,
  BackendTopicDerivedCommandExecuteRequest,
  BackendTopicDerivedCommandExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_TOPIC_DERIVED_RPC_METHODS,
  type BackendTopicDerivedRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export type BackendTopicDerivedCommandExecutor = (
  request: BackendTopicDerivedCommandExecuteRequest,
) => Promise<BackendTopicDerivedCommandExecuteResult> | BackendTopicDerivedCommandExecuteResult;

export interface BackendTopicDerivedRpcRuntime {
  execute(request: BackendTopicDerivedCommandExecuteRequest): Promise<BackendTopicDerivedCommandExecuteResult> | BackendTopicDerivedCommandExecuteResult;
}

export interface BackendTopicDerivedRpcHandlerContext extends BackendRpcHandlerContext {
  readonly topicDerived: BackendTopicDerivedRpcRuntime;
}

export type BackendTopicDerivedRpcHandlerRegistration = BackendRpcHandlerRegistration<BackendTopicDerivedRpcHandlerContext>;

export class BackendTopicDerivedCommandRuntime implements BackendTopicDerivedRpcRuntime {
  private readonly resultsByIdempotencyKey = new Map<string, BackendTopicDerivedCommandExecuteResult>();
  private readonly now: () => number;

  constructor(
    private readonly executor?: BackendTopicDerivedCommandExecutor,
    options: { readonly now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  async execute(request: BackendTopicDerivedCommandExecuteRequest): Promise<BackendTopicDerivedCommandExecuteResult> {
    const idempotencyKey = normalizeString(request.idempotencyKey);
    const cached = this.resultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      return cached.status === 'completed' ? { ...cached, status: 'duplicate' } : cached;
    }
    if (!this.executor) {
      return this.createUnavailable(request, 'topic-derived.command.execute host effect unavailable');
    }
    const result = await this.executor(request);
    this.resultsByIdempotencyKey.set(request.idempotencyKey, result);
    return result;
  }

  private createUnavailable(
    request: BackendTopicDerivedCommandExecuteRequest,
    reason: string,
  ): BackendTopicDerivedCommandExecuteResult {
    const now = this.now();
    return {
      status: 'unavailable',
      commandId: normalizeString(request.commandId),
      idempotencyKey: normalizeString(request.idempotencyKey),
      operation: 'create-from-topic-source',
      unavailableClass: 'BACKEND_UNAVAILABLE',
      reason,
      recoverable: true,
      audit: { created: 0, skipped: 0, nativeRiffRegistered: 0 },
      rollback: { attempted: false, status: 'not-needed' },
      progress: { state: 'unavailable', currentStep: 'unavailable', updatedAt: now },
      diagnostics: {
        diagnosticEventId: `topic-derived:${normalizeString(request.commandId) || 'unknown'}:${now}`,
        family: 'topic-derived.command',
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

const BACKEND_TOPIC_DERIVED_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendTopicDerivedRpcMethod]: BackendRpcHandlerAdapter<unknown, unknown, BackendTopicDerivedRpcHandlerContext>;
} = {
  'topic-derived.command.execute': {
    method: 'topic-derived.command.execute',
    family: 'topic-derived',
    handle(params, context): Promise<BackendTopicDerivedCommandExecuteResult> | BackendTopicDerivedCommandExecuteResult {
      return context.topicDerived.execute(
        readRequiredNamedParams(params, 'topic-derived.command.execute requires named params'),
      );
    },
  },
};

export const BACKEND_TOPIC_DERIVED_RPC_HANDLER_REGISTRATIONS: readonly BackendTopicDerivedRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_TOPIC_DERIVED_RPC_METHODS.map((method) => ({
      ...BACKEND_TOPIC_DERIVED_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendTopicDerivedRpcAdapter',
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
