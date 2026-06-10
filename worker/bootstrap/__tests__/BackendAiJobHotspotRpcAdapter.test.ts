import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendAiPromptExecuteResult,
  type BackendAiJobRecord,
  type BackendAiJobResult,
  type BackendAiSessionRecord,
  type BackendAiSessionResult,
  type BackendAiStreamResult,
  type BackendHotspotCommandEnvelope,
  type BackendHotspotCommandSubmitResult,
  type BackendHotspotJobGetResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_AI_JOB_HOTSPOT_RPC_HANDLER_REGISTRATIONS,
  BackendAiToolJobRuntime,
  type BackendAiJobHotspotRpcHandlerContext,
} from '../rpc/BackendAiJobHotspotRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('BackendAiJobHotspotRpcAdapter', () => {
  it('delegates AI session, stream, and job methods to the AI runtime', async () => {
    const dispatcher = createAiJobHotspotDispatcher();
    const context = createAiJobHotspotContext();

    await expect(dispatchAiJobHotspot(dispatcher, context, 'ai.session.create', {
      sessionId: 'session-1',
      surfaceId: 'standalone-dialog',
    })).resolves.toMatchObject({
      result: {
        ok: true,
        session: {
          sessionId: 'session-1',
          state: 'active',
        },
      },
    });
    expect(context.ai.createSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      surfaceId: 'standalone-dialog',
    });

    await expect(dispatchAiJobHotspot(dispatcher, context, 'ai.stream.start', {
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
    })).resolves.toMatchObject({
      result: {
        ok: true,
        streamId: 'stream-1',
        sessionId: 'session-1',
        jobId: 'job-1',
        state: 'started',
      },
    });
    expect(context.ai.startStream).toHaveBeenCalledWith({
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
    });

    await expect(dispatchAiJobHotspot(dispatcher, context, 'job.get', {
      jobId: 'job-1',
    })).resolves.toMatchObject({
      result: {
        ok: true,
        job: {
          jobId: 'job-1',
          state: 'running',
        },
      },
    });
    expect(context.ai.getJob).toHaveBeenCalledWith({ jobId: 'job-1' });
  });

  it('keeps AI tool job idempotency and approval state in the AI family runtime', async () => {
    const dispatcher = createAiJobHotspotDispatcher();
    const toolJobs = new BackendAiToolJobRuntime(() => 1000);
    const context = createAiJobHotspotContext({
      executeToolJob: vi.fn((request) => toolJobs.execute(request)),
      approveToolJob: vi.fn((request) => toolJobs.approve(request)),
    });

    const request = {
      jobId: 'tool-job-1',
      sessionId: 'session-1',
      commandId: 'command-1',
      idempotencyKey: 'idem-tool-1',
      toolName: 'flashcard-writer',
      requiresApproval: false,
      approvalState: 'approved',
      writeIntent: { kind: 'none' },
    } as const;
    await expect(dispatchAiJobHotspot(dispatcher, context, 'ai.tool.job.execute', request)).resolves.toMatchObject({
      result: {
        status: 'completed',
        jobId: 'tool-job-1',
        phase: 'terminal',
        diagnostics: {
          diagnosticEventId: 'ai-tool-job:command-1:1000',
        },
      },
    });
    await expect(dispatchAiJobHotspot(dispatcher, context, 'ai.tool.job.execute', request)).resolves.toMatchObject({
      result: {
        status: 'duplicate',
        jobId: 'tool-job-1',
      },
    });

    await expect(dispatchAiJobHotspot(dispatcher, context, 'ai.tool.job.approval', {
      jobId: 'tool-job-2',
      sessionId: 'session-1',
      commandId: 'command-2',
      idempotencyKey: 'idem-tool-2',
      decision: 'rejected',
      decidedAt: 900,
    })).resolves.toMatchObject({
      result: {
        status: 'rejected',
        reason: 'approval rejected',
        diagnostics: {
          errorCategory: 'VALIDATION_FAILED',
        },
      },
    });
  });

  it('routes hotspot submit/get through the hotspot runtime and keeps invalid params explicit', async () => {
    const dispatcher = createAiJobHotspotDispatcher();
    const context = createAiJobHotspotContext();

    await expect(dispatchAiJobHotspot(dispatcher, context, 'hotspot.command.submit', {
      envelope: createHotspotEnvelope(),
    })).resolves.toMatchObject({
      result: {
        ok: true,
        accepted: true,
        family: 'ai.tool-job',
        commandId: 'hotspot-1',
        idempotencyKey: 'hotspot-idem-1',
      },
    });
    expect(context.hotspot.submit).toHaveBeenCalledWith({
      envelope: createHotspotEnvelope(),
    });

    await expect(dispatchAiJobHotspot(dispatcher, context, 'hotspot.job.get', {
      family: 'ai.tool-job',
      commandId: 'hotspot-1',
    })).resolves.toMatchObject({
      result: {
        ok: true,
        accepted: true,
        family: 'ai.tool-job',
        commandId: 'hotspot-1',
      },
    });
    expect(context.hotspot.get).toHaveBeenCalledWith({
      family: 'ai.tool-job',
      commandId: 'hotspot-1',
    });

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'invalid-hotspot',
      method: 'hotspot.command.submit',
      params: [],
    }, context)).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        message: 'hotspot.command.submit requires named params',
      },
    });
  });
});

function createAiJobHotspotDispatcher() {
  return new BackendRpcDispatcher(
    createBackendRpcHandlerRegistry(BACKEND_AI_JOB_HOTSPOT_RPC_HANDLER_REGISTRATIONS),
  );
}

function dispatchAiJobHotspot(
  dispatcher: BackendRpcDispatcher<BackendAiJobHotspotRpcHandlerContext>,
  context: BackendAiJobHotspotRpcHandlerContext,
  method: typeof BACKEND_AI_JOB_HOTSPOT_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createAiJobHotspotContext(
  aiOverrides: Partial<BackendAiJobHotspotRpcHandlerContext['ai']> = {},
): BackendAiJobHotspotRpcHandlerContext {
  const hotspotResults = new Map<string, ReturnType<typeof createHotspotSubmitResult>>();
  return {
    ai: {
      createSession: vi.fn((request) => createSessionResult(request.sessionId, 'active')),
      getSession: vi.fn((request) => createSessionResult(request.sessionId, 'active')),
      updateSession: vi.fn((request) => createSessionResult(request.sessionId, request.state ?? 'active')),
      cancelSession: vi.fn((request) => createSessionResult(request.sessionId, 'canceled')),
      executePrompt: vi.fn(async (request): Promise<BackendAiPromptExecuteResult> => ({
        ok: true,
        sessionId: request.sessionId,
        streamId: request.streamId,
        jobId: request.jobId,
        state: 'completed',
        unavailableClass: null,
        diagnosticEventId: 'ai-prompt-completed:test',
      })),
      executeToolJob: vi.fn(() => createToolJobResult('completed')),
      approveToolJob: vi.fn(() => createToolJobResult('completed')),
      startStream: vi.fn((request) => ({
        ok: true,
        streamId: request.streamId,
        sessionId: request.sessionId,
        jobId: request.jobId,
        state: 'started',
        diagnosticEventId: 'ai-stream-start:test',
      } satisfies BackendAiStreamResult)),
      cancelStream: vi.fn((request) => ({
        ok: true,
        streamId: request.streamId,
        sessionId: request.sessionId,
        jobId: request.jobId,
        state: 'canceled',
        diagnosticEventId: 'ai-stream-cancel:test',
      } satisfies BackendAiStreamResult)),
      getJob: vi.fn((request) => createJobResult(request.jobId, 'running')),
      cancelJob: vi.fn((request) => createJobResult(request.jobId, 'canceled')),
      ...aiOverrides,
    },
    hotspot: {
      submit: vi.fn((request) => {
        const result = createHotspotSubmitResult(request.envelope);
        hotspotResults.set(request.envelope.commandId, result);
        return result;
      }),
      get: vi.fn((request): BackendHotspotJobGetResult => hotspotResults.get(request.commandId) ?? ({
        ok: false,
        family: request.family,
        commandId: request.commandId,
        state: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
        reason: 'hotspot command state unavailable',
        recoverable: true,
      })),
    },
  };
}

function createSessionResult(
  sessionId: string,
  state: BackendAiSessionRecord['state'],
): BackendAiSessionResult {
  return {
    ok: true,
    session: {
      sessionId,
      surfaceId: 'standalone-dialog',
      reviewSessionId: null,
      owner: 'backend',
      skillId: null,
      providerId: null,
      modelId: null,
      state,
      createdAt: 100,
      updatedAt: 100,
      expiresAt: null,
      lastError: null,
      diagnosticEventId: `ai-session:${sessionId}`,
    },
  };
}

function createJobResult(
  jobId: string,
  state: BackendAiJobRecord['state'],
): BackendAiJobResult {
  return {
    ok: true,
    job: {
      jobId,
      kind: 'ai-stream',
      owner: 'backend',
      idempotencyKey: `job:${jobId}`,
      state,
      progress: state === 'running' ? 10 : 100,
      startedAt: 100,
      updatedAt: 100,
      deadlineAt: null,
      retryPolicy: 'none',
      result: null,
      error: null,
    },
  };
}

function createToolJobResult(status: 'completed' | 'waiting-for-user-approval') {
  return {
    status,
    jobId: 'tool-job',
    sessionId: 'session-1',
    commandId: 'command-1',
    phase: status === 'completed' ? 'terminal' : 'approval-wait',
    reason: null,
    progress: {
      state: status === 'completed' ? 'succeeded' : 'waiting-for-user-approval',
      currentStep: 'terminal',
      completedUnits: 1,
      totalUnits: 1,
      updatedAt: 100,
    },
    diagnostics: {
      diagnosticEventId: 'ai-tool-job:test',
      family: 'ai.tool-job',
      commandId: 'command-1',
      errorCategory: null,
    },
  } as const;
}

function createHotspotEnvelope(): BackendHotspotCommandEnvelope {
  return {
    family: 'ai.tool-job',
    commandId: 'hotspot-1',
    idempotencyKey: 'hotspot-idem-1',
    caller: {
      instanceId: 'worker-1',
      runtimeRole: 'worker',
      surface: 'ai-workbench',
    },
    writerExpectation: {
      mode: 'not-required',
      relayAllowed: false,
    },
    deadlineAt: 200,
    submittedAt: 100,
    payload: { tool: 'flashcard-writer' },
  };
}

function createHotspotSubmitResult(envelope: BackendHotspotCommandEnvelope): BackendHotspotCommandSubmitResult {
  return {
    ok: true,
    accepted: true,
    family: envelope.family,
    commandId: envelope.commandId,
    idempotencyKey: envelope.idempotencyKey,
    state: 'accepted',
    progress: {
      state: 'accepted',
      currentStep: 'accepted',
      completedUnits: 0,
      totalUnits: null,
      updatedAt: 100,
    },
    diagnostics: {
      diagnosticEventId: `hotspot:${envelope.commandId}`,
      family: envelope.family,
      commandId: envelope.commandId,
      errorCategory: null,
    },
  } as const;
}
