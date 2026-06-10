import type {
  BackendAiJobCancelRequest,
  BackendAiJobGetRequest,
  BackendAiJobResult,
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
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendHotspotJobGetRequest,
  BackendHotspotJobGetResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_AI_RPC_METHODS,
  BACKEND_HOTSPOT_RPC_METHODS,
  BACKEND_JOB_RPC_METHODS,
  type BackendAiRpcMethod,
  type BackendHotspotRpcMethod,
  type BackendJobRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type { BackendRpcHandlerRegistration } from './BackendRpcRegistry';

export interface BackendAiJobRpcRuntime {
  createSession(request: BackendAiSessionCreateRequest): BackendAiSessionResult;
  getSession(request: BackendAiSessionGetRequest): BackendAiSessionResult;
  updateSession(request: BackendAiSessionUpdateRequest): BackendAiSessionResult;
  cancelSession(request: BackendAiSessionCancelRequest): BackendAiSessionResult;
  executePrompt(request: BackendAiPromptExecuteRequest): Promise<BackendAiPromptExecuteResult> | BackendAiPromptExecuteResult;
  executeToolJob(request: BackendAiToolJobExecuteRequest): BackendAiToolJobResult;
  approveToolJob(request: BackendAiToolJobApprovalRequest): BackendAiToolJobResult;
  startStream(request: BackendAiStreamStartRequest): BackendAiStreamResult;
  cancelStream(request: BackendAiStreamCancelRequest): BackendAiStreamResult;
  getJob(request: BackendAiJobGetRequest): BackendAiJobResult;
  cancelJob(request: BackendAiJobCancelRequest): BackendAiJobResult;
}

export interface BackendHotspotRpcRuntime {
  submit(request: BackendHotspotCommandSubmitRequest): BackendHotspotCommandSubmitResult;
  get(request: BackendHotspotJobGetRequest): BackendHotspotJobGetResult;
}

export interface BackendAiJobHotspotRpcHandlerContext extends BackendRpcHandlerContext {
  readonly ai: BackendAiJobRpcRuntime;
  readonly hotspot: BackendHotspotRpcRuntime;
}

export type BackendAiJobHotspotRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendAiJobHotspotRpcHandlerContext
>;

export class BackendAiToolJobRuntime {
  private readonly resultsByIdempotencyKey = new Map<string, BackendAiToolJobResult>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  execute(request: BackendAiToolJobExecuteRequest): BackendAiToolJobResult {
    const idempotencyKey = normalizeString(request.idempotencyKey);
    const cached = this.resultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      return cached.status === 'completed' ? { ...cached, status: 'duplicate' } : cached;
    }

    const now = this.now();
    const requiresApproval = request.requiresApproval === true && request.approvalState !== 'approved';
    const writeKind = request.writeIntent?.kind ?? 'none';
    const result: BackendAiToolJobResult = {
      status: requiresApproval ? 'waiting-for-user-approval' : 'completed',
      jobId: String(request.jobId || ''),
      sessionId: String(request.sessionId || ''),
      commandId: String(request.commandId || ''),
      phase: requiresApproval ? 'approval-wait' : (writeKind === 'none' ? 'terminal' : 'write-preparation'),
      reason: requiresApproval ? 'approval required before generated flashcard write' : null,
      progress: {
        state: requiresApproval ? 'waiting-for-user-approval' : 'succeeded',
        currentStep: requiresApproval ? 'approval-wait' : 'terminal',
        completedUnits: requiresApproval ? 0 : 1,
        totalUnits: 1,
        updatedAt: now,
      },
      diagnostics: {
        diagnosticEventId: `ai-tool-job:${String(request.commandId || 'unknown')}:${now}`,
        family: 'ai.tool-job',
        commandId: String(request.commandId || ''),
        timing: {
          submittedAt: now,
          deadlineAt: request.deadlineAt ?? null,
          completedAt: requiresApproval ? null : now,
        },
        counters: {
          writeIntentCount: writeKind === 'none' ? 0 : 1,
        },
        errorCategory: null,
      },
    };
    this.resultsByIdempotencyKey.set(idempotencyKey, result);
    return result;
  }

  approve(request: BackendAiToolJobApprovalRequest): BackendAiToolJobResult {
    const now = this.now();
    const status = request.decision === 'approved' ? 'completed' : request.decision;
    const result: BackendAiToolJobResult = {
      status,
      jobId: String(request.jobId || ''),
      sessionId: String(request.sessionId || ''),
      commandId: String(request.commandId || ''),
      phase: 'terminal',
      reason: request.decision === 'approved' ? null : `approval ${request.decision}`,
      progress: {
        state: request.decision === 'approved' ? 'succeeded' : request.decision === 'canceled' ? 'canceled' : 'validation-failed',
        currentStep: 'approval-decision',
        completedUnits: 1,
        totalUnits: 1,
        updatedAt: now,
      },
      diagnostics: {
        diagnosticEventId: `ai-tool-approval:${String(request.commandId || 'unknown')}:${now}`,
        family: 'ai.tool-job',
        commandId: String(request.commandId || ''),
        timing: {
          submittedAt: request.decidedAt || now,
          completedAt: now,
        },
        errorCategory: request.decision === 'approved' ? null : 'VALIDATION_FAILED',
      },
    };
    this.resultsByIdempotencyKey.set(normalizeString(request.idempotencyKey), result);
    return result;
  }
}

const BACKEND_AI_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendAiRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendAiJobHotspotRpcHandlerContext
  >;
} = {
  'ai.session.create': {
    method: 'ai.session.create',
    family: 'ai',
    handle(params, context): BackendAiSessionResult {
      return context.ai.createSession(readRequiredNamedParams(params, 'ai.session.create requires named params'));
    },
  },
  'ai.session.get': {
    method: 'ai.session.get',
    family: 'ai',
    handle(params, context): BackendAiSessionResult {
      return context.ai.getSession(readRequiredNamedParams(params, 'ai.session.get requires named params'));
    },
  },
  'ai.session.update': {
    method: 'ai.session.update',
    family: 'ai',
    handle(params, context): BackendAiSessionResult {
      return context.ai.updateSession(readRequiredNamedParams(params, 'ai.session.update requires named params'));
    },
  },
  'ai.session.cancel': {
    method: 'ai.session.cancel',
    family: 'ai',
    handle(params, context): BackendAiSessionResult {
      return context.ai.cancelSession(readRequiredNamedParams(params, 'ai.session.cancel requires named params'));
    },
  },
  'ai.prompt.execute': {
    method: 'ai.prompt.execute',
    family: 'ai',
    handle(params, context): Promise<BackendAiPromptExecuteResult> | BackendAiPromptExecuteResult {
      return context.ai.executePrompt(readRequiredNamedParams(params, 'ai.prompt.execute requires named params'));
    },
  },
  'ai.tool.job.execute': {
    method: 'ai.tool.job.execute',
    family: 'ai',
    handle(params, context): BackendAiToolJobResult {
      return context.ai.executeToolJob(readRequiredNamedParams(
        params,
        'ai.tool.job.execute requires named params',
        'INVALID_REQUEST',
      ));
    },
  },
  'ai.tool.job.approval': {
    method: 'ai.tool.job.approval',
    family: 'ai',
    handle(params, context): BackendAiToolJobResult {
      return context.ai.approveToolJob(readRequiredNamedParams(
        params,
        'ai.tool.job.approval requires named params',
        'INVALID_REQUEST',
      ));
    },
  },
  'ai.stream.start': {
    method: 'ai.stream.start',
    family: 'ai',
    handle(params, context): BackendAiStreamResult {
      return context.ai.startStream(readRequiredNamedParams(params, 'ai.stream.start requires named params'));
    },
  },
  'ai.stream.cancel': {
    method: 'ai.stream.cancel',
    family: 'ai',
    handle(params, context): BackendAiStreamResult {
      return context.ai.cancelStream(readRequiredNamedParams(params, 'ai.stream.cancel requires named params'));
    },
  },
};

const BACKEND_JOB_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendJobRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendAiJobHotspotRpcHandlerContext
  >;
} = {
  'job.get': {
    method: 'job.get',
    family: 'job',
    handle(params, context): BackendAiJobResult {
      return context.ai.getJob(readRequiredNamedParams(params, 'job.get requires named params'));
    },
  },
  'job.cancel': {
    method: 'job.cancel',
    family: 'job',
    handle(params, context): BackendAiJobResult {
      return context.ai.cancelJob(readRequiredNamedParams(params, 'job.cancel requires named params'));
    },
  },
};

const BACKEND_HOTSPOT_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendHotspotRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendAiJobHotspotRpcHandlerContext
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

export const BACKEND_AI_JOB_HOTSPOT_RPC_HANDLER_REGISTRATIONS: readonly BackendAiJobHotspotRpcHandlerRegistration[] =
  Object.freeze([
    ...BACKEND_AI_RPC_METHODS.map((method) => ({
      ...BACKEND_AI_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendAiJobHotspotRpcAdapter',
    })),
    ...BACKEND_JOB_RPC_METHODS.map((method) => ({
      ...BACKEND_JOB_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendAiJobHotspotRpcAdapter',
    })),
    ...BACKEND_HOTSPOT_RPC_METHODS.map((method) => ({
      ...BACKEND_HOTSPOT_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendAiJobHotspotRpcAdapter',
    })),
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

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}
