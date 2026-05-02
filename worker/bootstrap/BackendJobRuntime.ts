import type {
  BackendAiJobCancelRequest,
  BackendAiJobGetRequest,
  BackendAiJobRecord,
  BackendAiJobResult,
  BackendAiSessionCancelRequest,
  BackendAiSessionCreateRequest,
  BackendAiSessionGetRequest,
  BackendAiSessionRecord,
  BackendAiSessionResult,
  BackendAiSessionUpdateRequest,
  BackendAiStreamCancelRequest,
  BackendAiStreamResult,
  BackendAiStreamStartRequest,
} from '../../packages/contracts/src/backend-rpc';

type RuntimeDeps = {
  now?: () => number;
  onSessionCreate?: () => void;
  onSessionUpdate?: () => void;
  onSessionCancel?: () => void;
  onStreamStart?: () => void;
  onStreamCancel?: () => void;
  onJobCreated?: () => void;
  onJobCompleted?: () => void;
  onJobCanceled?: () => void;
  onJobTimeout?: () => void;
  onJobFailed?: () => void;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function createDiagnosticId(prefix: string, now: number): string {
  return `${prefix}:${now}:${Math.random().toString(36).slice(2, 8)}`;
}

export class BackendJobRuntime {
  private readonly sessions = new Map<string, BackendAiSessionRecord>();
  private readonly jobs = new Map<string, BackendAiJobRecord>();
  private readonly now: () => number;

  constructor(private readonly deps: RuntimeDeps = {}) {
    this.now = deps.now || (() => Date.now());
  }

  createSession(request: BackendAiSessionCreateRequest): BackendAiSessionResult {
    const sessionId = normalizeString(request.sessionId);
    const surfaceId = normalizeString(request.surfaceId);
    if (!sessionId || !surfaceId) {
      throw new Error('INVALID_REQUEST: ai.session.create requires sessionId and surfaceId');
    }
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return {
        ok: true,
        session: { ...existing },
      };
    }
    const now = this.now();
    const session: BackendAiSessionRecord = {
      sessionId,
      surfaceId,
      reviewSessionId: normalizeString(request.reviewSessionId) || null,
      owner: request.owner || 'backend',
      skillId: normalizeString(request.skillId) || null,
      providerId: normalizeString(request.providerId) || null,
      modelId: normalizeString(request.modelId) || null,
      state: 'active',
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
      lastError: null,
      diagnosticEventId: createDiagnosticId('ai-session-create', now),
    };
    this.sessions.set(sessionId, session);
    this.deps.onSessionCreate?.();
    return {
      ok: true,
      session: { ...session },
    };
  }

  getSession(request: BackendAiSessionGetRequest): BackendAiSessionResult {
    const sessionId = normalizeString(request.sessionId);
    if (!sessionId) {
      throw new Error('INVALID_REQUEST: ai.session.get requires sessionId');
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`BACKEND_UNAVAILABLE: ai.session unavailable (${sessionId})`);
    }
    return {
      ok: true,
      session: { ...session },
    };
  }

  updateSession(request: BackendAiSessionUpdateRequest): BackendAiSessionResult {
    const sessionId = normalizeString(request.sessionId);
    if (!sessionId) {
      throw new Error('INVALID_REQUEST: ai.session.update requires sessionId');
    }
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`BACKEND_UNAVAILABLE: ai.session unavailable (${sessionId})`);
    }
    const now = this.now();
    const next: BackendAiSessionRecord = {
      ...current,
      state: request.state || current.state,
      skillId: request.skillId === undefined ? current.skillId : (normalizeString(request.skillId) || null),
      providerId: request.providerId === undefined ? current.providerId : (normalizeString(request.providerId) || null),
      modelId: request.modelId === undefined ? current.modelId : (normalizeString(request.modelId) || null),
      expiresAt: request.expiresAt === undefined ? current.expiresAt : (request.expiresAt == null ? null : Number(request.expiresAt)),
      lastError: request.lastError === undefined ? current.lastError : (normalizeString(request.lastError) || null),
      updatedAt: now,
      diagnosticEventId: createDiagnosticId('ai-session-update', now),
    };
    this.sessions.set(sessionId, next);
    this.deps.onSessionUpdate?.();
    return {
      ok: true,
      session: { ...next },
    };
  }

  cancelSession(request: BackendAiSessionCancelRequest): BackendAiSessionResult {
    const sessionId = normalizeString(request.sessionId);
    if (!sessionId) {
      throw new Error('INVALID_REQUEST: ai.session.cancel requires sessionId');
    }
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`BACKEND_UNAVAILABLE: ai.session unavailable (${sessionId})`);
    }
    const now = this.now();
    const next: BackendAiSessionRecord = {
      ...current,
      state: 'canceled',
      updatedAt: now,
      lastError: normalizeString(request.reason) || null,
      diagnosticEventId: createDiagnosticId('ai-session-cancel', now),
    };
    this.sessions.set(sessionId, next);
    this.deps.onSessionCancel?.();
    return {
      ok: true,
      session: { ...next },
    };
  }

  startStream(request: BackendAiStreamStartRequest): BackendAiStreamResult {
    const streamId = normalizeString(request.streamId);
    const sessionId = normalizeString(request.sessionId);
    const jobId = normalizeString(request.jobId);
    if (!streamId || !sessionId || !jobId) {
      throw new Error('INVALID_REQUEST: ai.stream.start requires streamId/sessionId/jobId');
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`BACKEND_UNAVAILABLE: ai.stream.start unavailable (session=${sessionId})`);
    }
    const now = this.now();
    const timeoutMs = Number(request.timeoutMs || 0);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 10) {
      const timeoutJob = this.upsertJob({
        jobId,
        owner: 'backend',
        idempotencyKey: normalizeString(request.idempotencyKey) || `job:${jobId}`,
        state: 'timeout',
        progress: 100,
        startedAt: now,
        updatedAt: now,
        deadlineAt: now,
        retryPolicy: 'none',
        result: null,
        error: 'timeout',
      });
      void timeoutJob;
      this.deps.onJobTimeout?.();
      return {
        ok: true,
        streamId,
        sessionId,
        jobId,
        state: 'timeout',
        diagnosticEventId: createDiagnosticId('ai-stream-timeout', now),
      };
    }
    this.sessions.set(sessionId, {
      ...session,
      state: 'streaming',
      updatedAt: now,
      diagnosticEventId: createDiagnosticId('ai-session-streaming', now),
    });
    this.upsertJob({
      jobId,
      kind: 'ai-stream',
      owner: 'backend',
      idempotencyKey: normalizeString(request.idempotencyKey) || `job:${jobId}`,
      state: 'running',
      progress: 10,
      startedAt: now,
      updatedAt: now,
      deadlineAt: Number.isFinite(timeoutMs) && timeoutMs > 0 ? now + Math.floor(timeoutMs) : null,
      retryPolicy: 'none',
      result: null,
      error: null,
    });
    this.deps.onStreamStart?.();
    this.deps.onJobCreated?.();
    return {
      ok: true,
      streamId,
      sessionId,
      jobId,
      state: 'started',
      diagnosticEventId: createDiagnosticId('ai-stream-start', now),
    };
  }

  cancelStream(request: BackendAiStreamCancelRequest): BackendAiStreamResult {
    const streamId = normalizeString(request.streamId);
    const sessionId = normalizeString(request.sessionId);
    const jobId = normalizeString(request.jobId);
    if (!streamId || !sessionId || !jobId) {
      throw new Error('INVALID_REQUEST: ai.stream.cancel requires streamId/sessionId/jobId');
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`BACKEND_UNAVAILABLE: ai.stream.cancel unavailable (session=${sessionId})`);
    }
    const now = this.now();
    this.sessions.set(sessionId, {
      ...session,
      state: 'canceled',
      updatedAt: now,
      lastError: normalizeString(request.reason) || null,
      diagnosticEventId: createDiagnosticId('ai-stream-cancel-session', now),
    });
    const currentJob = this.jobs.get(jobId);
    if (currentJob) {
      this.jobs.set(jobId, {
        ...currentJob,
        state: 'canceled',
        progress: 100,
        updatedAt: now,
        error: normalizeString(request.reason) || null,
      });
      this.deps.onJobCanceled?.();
    }
    this.deps.onStreamCancel?.();
    return {
      ok: true,
      streamId,
      sessionId,
      jobId,
      state: 'canceled',
      diagnosticEventId: createDiagnosticId('ai-stream-cancel', now),
    };
  }

  getJob(request: BackendAiJobGetRequest): BackendAiJobResult {
    const jobId = normalizeString(request.jobId);
    if (!jobId) {
      throw new Error('INVALID_REQUEST: job.get requires jobId');
    }
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`BACKEND_UNAVAILABLE: job unavailable (${jobId})`);
    }
    return {
      ok: true,
      job: { ...job },
    };
  }

  cancelJob(request: BackendAiJobCancelRequest): BackendAiJobResult {
    const jobId = normalizeString(request.jobId);
    if (!jobId) {
      throw new Error('INVALID_REQUEST: job.cancel requires jobId');
    }
    const current = this.jobs.get(jobId);
    if (!current) {
      throw new Error(`BACKEND_UNAVAILABLE: job unavailable (${jobId})`);
    }
    const now = this.now();
    const next: BackendAiJobRecord = {
      ...current,
      state: 'canceled',
      progress: 100,
      updatedAt: now,
      error: normalizeString(request.reason) || current.error,
    };
    this.jobs.set(jobId, next);
    this.deps.onJobCanceled?.();
    return {
      ok: true,
      job: { ...next },
    };
  }

  completeJob(jobId: string, result: unknown): void {
    const normalized = normalizeString(jobId);
    if (!normalized) {
      return;
    }
    const current = this.jobs.get(normalized);
    if (!current) {
      return;
    }
    this.jobs.set(normalized, {
      ...current,
      state: 'completed',
      progress: 100,
      result,
      updatedAt: this.now(),
      error: null,
    });
    this.deps.onJobCompleted?.();
  }

  failJob(jobId: string, error: string): void {
    const normalized = normalizeString(jobId);
    if (!normalized) {
      return;
    }
    const current = this.jobs.get(normalized);
    if (!current) {
      return;
    }
    this.jobs.set(normalized, {
      ...current,
      state: 'failed',
      updatedAt: this.now(),
      error: normalizeString(error) || 'failed',
    });
    this.deps.onJobFailed?.();
  }

  private upsertJob(job: BackendAiJobRecord): BackendAiJobRecord {
    const current = this.jobs.get(job.jobId);
    const next: BackendAiJobRecord = {
      ...current,
      ...job,
    };
    this.jobs.set(job.jobId, next);
    return next;
  }
}
