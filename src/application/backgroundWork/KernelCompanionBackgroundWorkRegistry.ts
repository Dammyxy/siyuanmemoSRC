export type KernelCompanionBackgroundWorkKind =
  | 'review-truth-backfill'
  | 'kernel-transaction-action-polling'
  | 'xiuyuan-startup-sync';

export type KernelCompanionBackgroundWorkState =
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'deferred'
  | 'canceled';

export interface KernelCompanionReviewTruthBackfillDiagnostics {
  reason?: string;
  pendingRows?: number;
  batchLimit?: number;
  plannedBatches?: number;
  maxBatches?: number;
  batchesAttempted?: number;
  sqlRowsRead?: number;
  recordsWritten?: number;
  idempotencyDuplicateSkipped?: number;
  repairRequiredEventIds?: string[];
  backfilledEventIds?: string[];
  duplicateEventIds?: string[];
  segmentPaths?: string[];
  deferredBatches?: number;
  unavailable?: boolean;
  [key: string]: unknown;
}

export interface KernelCompanionTransactionActionPollingDiagnostics {
  reason?: string;
  mode?: 'writer' | 'follower' | 'none';
  writerRelayRequired?: boolean;
  maxActionsPerPoll?: number;
  status?: string;
  actionCount?: number;
  remainingActions?: number;
  pendingAutoCardBlocks?: number;
  pendingUpsertBlockCount?: number;
  upsertInFlight?: boolean;
  emptyPollStreak?: number;
  unavailable?: boolean;
  [key: string]: unknown;
}

export interface KernelCompanionXiuyuanStartupSyncDiagnostics {
  reason?: string;
  syncType?: 'full' | 'incremental';
  source?: 'startup';
  persistIdleCheckpoint?: boolean;
  status?: 'submitted' | 'completed' | 'failed' | 'canceled';
  latestCompletedPhase?: 'scan' | 'plan' | 'apply' | 'checkpoint';
  addedCount?: number;
  updatedCount?: number;
  deletedCount?: number;
  skippedCount?: number;
  detectedCount?: number;
  blacklistCleanedCount?: number;
  unavailable?: boolean;
  [key: string]: unknown;
}

export type KernelCompanionBackgroundWorkDiagnostics =
  | KernelCompanionReviewTruthBackfillDiagnostics
  | KernelCompanionTransactionActionPollingDiagnostics
  | KernelCompanionXiuyuanStartupSyncDiagnostics
  | Record<string, unknown>;

export interface KernelCompanionBackgroundWorkRecord<
  TDiagnostics extends KernelCompanionBackgroundWorkDiagnostics = KernelCompanionBackgroundWorkDiagnostics,
> {
  jobId: string;
  kind: KernelCompanionBackgroundWorkKind;
  state: KernelCompanionBackgroundWorkState;
  reason: string | null;
  submittedAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  attemptCount: number;
  diagnostics: TDiagnostics;
  lastError: string | null;
}

export interface KernelCompanionBackgroundWorkRunContext {
  jobId: string;
  kind: KernelCompanionBackgroundWorkKind;
  isCanceled: () => boolean;
}

export interface KernelCompanionBackgroundWorkHandlerResult<
  TDiagnostics extends KernelCompanionBackgroundWorkDiagnostics = KernelCompanionBackgroundWorkDiagnostics,
> {
  state?: Extract<KernelCompanionBackgroundWorkState, 'completed' | 'failed' | 'deferred' | 'canceled'>;
  reason?: string | null;
  diagnostics?: Partial<TDiagnostics>;
  error?: string | null;
}

export interface KernelCompanionBackgroundWorkSubmitRequest<
  TDiagnostics extends KernelCompanionBackgroundWorkDiagnostics = KernelCompanionBackgroundWorkDiagnostics,
> {
  kind: KernelCompanionBackgroundWorkKind;
  diagnostics?: TDiagnostics;
  run: (
    context: KernelCompanionBackgroundWorkRunContext,
  ) => Promise<KernelCompanionBackgroundWorkHandlerResult<TDiagnostics> | void>;
}

export interface KernelCompanionBackgroundWorkSubmitResult {
  accepted: boolean;
  job: KernelCompanionBackgroundWorkRecord;
}

export interface KernelCompanionBackgroundWorkRegistryInterface {
  submit<TDiagnostics extends KernelCompanionBackgroundWorkDiagnostics>(
    request: KernelCompanionBackgroundWorkSubmitRequest<TDiagnostics>,
  ): KernelCompanionBackgroundWorkSubmitResult;
  status(): KernelCompanionBackgroundWorkRecord[];
  status(jobId: string): KernelCompanionBackgroundWorkRecord | null;
  cancel(jobId: string, reason?: string): KernelCompanionBackgroundWorkRecord | null;
  defer(jobId: string, reason?: string, diagnostics?: Record<string, unknown>): KernelCompanionBackgroundWorkRecord | null;
  shutdown(reason?: string): KernelCompanionBackgroundWorkRecord[];
}

export interface KernelCompanionBackgroundWorkRegistryOptions {
  now?: () => number;
  schedule?: (run: () => void) => void;
}

type StoredHandler = (
  context: KernelCompanionBackgroundWorkRunContext,
) => Promise<KernelCompanionBackgroundWorkHandlerResult | void>;

const TERMINAL_STATES = new Set<KernelCompanionBackgroundWorkState>([
  'completed',
  'failed',
  'deferred',
  'canceled',
]);

export class KernelCompanionBackgroundWorkRegistry implements KernelCompanionBackgroundWorkRegistryInterface {
  private readonly now: () => number;
  private readonly scheduleRun: (run: () => void) => void;
  private readonly jobs = new Map<string, KernelCompanionBackgroundWorkRecord>();
  private readonly handlers = new Map<string, StoredHandler>();
  private nextId = 0;
  private shutdownStarted = false;
  private shutdownReason = 'registry-shutdown';

  constructor(options: KernelCompanionBackgroundWorkRegistryOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.scheduleRun = options.schedule ?? ((run) => {
      setTimeout(run, 0);
    });
  }

  submit<TDiagnostics extends KernelCompanionBackgroundWorkDiagnostics>(
    request: KernelCompanionBackgroundWorkSubmitRequest<TDiagnostics>,
  ): KernelCompanionBackgroundWorkSubmitResult {
    if (this.shutdownStarted) {
      const job = this.createJob(request.kind, {
        ...(request.diagnostics ?? {}),
        unavailable: true,
      }, 'deferred', this.shutdownReason);
      job.lastError = 'BACKGROUND_WORK_REGISTRY_SHUTDOWN';
      return {
        accepted: false,
        job: this.cloneJob(job),
      };
    }

    const job = this.createJob(request.kind, request.diagnostics ?? {} as TDiagnostics, 'accepted', null);
    this.handlers.set(job.jobId, request.run as StoredHandler);
    this.scheduleRun(() => {
      void this.start(job.jobId);
    });
    return {
      accepted: true,
      job: this.cloneJob(job),
    };
  }

  status(): KernelCompanionBackgroundWorkRecord[];
  status(jobId: string): KernelCompanionBackgroundWorkRecord | null;
  status(jobId?: string): KernelCompanionBackgroundWorkRecord[] | KernelCompanionBackgroundWorkRecord | null {
    if (typeof jobId === 'string') {
      const job = this.jobs.get(jobId);
      return job ? this.cloneJob(job) : null;
    }
    return Array.from(this.jobs.values(), (job) => this.cloneJob(job));
  }

  cancel(jobId: string, reason = 'canceled'): KernelCompanionBackgroundWorkRecord | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    if (!TERMINAL_STATES.has(job.state)) {
      this.transition(job, 'canceled', { reason });
    }
    return this.cloneJob(job);
  }

  defer(
    jobId: string,
    reason = 'deferred',
    diagnostics: Record<string, unknown> = {},
  ): KernelCompanionBackgroundWorkRecord | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    if (!TERMINAL_STATES.has(job.state)) {
      this.transition(job, 'deferred', { reason, diagnostics });
    }
    return this.cloneJob(job);
  }

  shutdown(reason = 'registry-shutdown'): KernelCompanionBackgroundWorkRecord[] {
    if (!this.shutdownStarted) {
      this.shutdownStarted = true;
      this.shutdownReason = reason;
      for (const job of this.jobs.values()) {
        if (job.state === 'accepted') {
          this.transition(job, 'deferred', { reason });
        } else if (job.state === 'running') {
          this.transition(job, 'canceled', { reason });
        }
      }
    }
    return this.status();
  }

  private async start(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    const handler = this.handlers.get(jobId);
    if (!job || !handler) {
      return;
    }
    if (this.shutdownStarted) {
      if (job.state === 'accepted') {
        this.transition(job, 'deferred', { reason: this.shutdownReason });
      }
      this.handlers.delete(jobId);
      return;
    }
    if (job.state !== 'accepted') {
      this.handlers.delete(jobId);
      return;
    }

    this.transition(job, 'running');
    job.startedAt = job.updatedAt;
    job.attemptCount += 1;

    try {
      const result = await handler({
        jobId,
        kind: job.kind,
        isCanceled: () => {
          const current = this.jobs.get(jobId);
          return !current || current.state === 'canceled' || current.state === 'deferred' || this.shutdownStarted;
        },
      });
      const current = this.jobs.get(jobId);
      if (!current || current.state !== 'running') {
        return;
      }
      const terminalState = result?.state ?? 'completed';
      this.transition(current, terminalState, {
        reason: result?.reason ?? null,
        diagnostics: result?.diagnostics,
        error: result?.error ?? null,
      });
    } catch (error) {
      const current = this.jobs.get(jobId);
      if (!current || current.state !== 'running') {
        return;
      }
      this.transition(current, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.handlers.delete(jobId);
    }
  }

  private createJob<TDiagnostics extends KernelCompanionBackgroundWorkDiagnostics>(
    kind: KernelCompanionBackgroundWorkKind,
    diagnostics: TDiagnostics,
    state: KernelCompanionBackgroundWorkState,
    reason: string | null,
  ): KernelCompanionBackgroundWorkRecord<TDiagnostics> {
    const at = this.now();
    const job: KernelCompanionBackgroundWorkRecord<TDiagnostics> = {
      jobId: `${kind}-${this.nextId += 1}`,
      kind,
      state,
      reason,
      submittedAt: at,
      updatedAt: at,
      startedAt: null,
      completedAt: TERMINAL_STATES.has(state) ? at : null,
      attemptCount: 0,
      diagnostics,
      lastError: null,
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  private transition(
    job: KernelCompanionBackgroundWorkRecord,
    state: KernelCompanionBackgroundWorkState,
    update: {
      reason?: string | null;
      diagnostics?: Partial<KernelCompanionBackgroundWorkDiagnostics>;
      error?: string | null;
    } = {},
  ): void {
    job.state = state;
    job.updatedAt = this.now();
    if (update.reason !== undefined) {
      job.reason = update.reason;
    }
    if (update.diagnostics) {
      job.diagnostics = {
        ...job.diagnostics,
        ...update.diagnostics,
      };
    }
    if (update.error !== undefined) {
      job.lastError = update.error;
    }
    if (state === 'failed' && update.error && !job.lastError) {
      job.lastError = update.error;
    }
    if (TERMINAL_STATES.has(state)) {
      job.completedAt = job.updatedAt;
    }
  }

  private cloneJob(job: KernelCompanionBackgroundWorkRecord): KernelCompanionBackgroundWorkRecord {
    return {
      ...job,
      diagnostics: {
        ...job.diagnostics,
      },
    };
  }
}
