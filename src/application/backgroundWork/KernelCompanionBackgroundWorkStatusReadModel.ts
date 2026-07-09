import type {
  KernelCompanionBackgroundWorkDiagnostics,
  KernelCompanionBackgroundWorkKind,
  KernelCompanionBackgroundWorkRecord,
  KernelCompanionBackgroundWorkRegistryInterface,
  KernelCompanionBackgroundWorkState,
} from './KernelCompanionBackgroundWorkRegistry';

export type KernelCompanionBackgroundWorkStatusDiagnosticValue = string | number | boolean | null;

export interface KernelCompanionBackgroundWorkStatusJob {
  jobId: string;
  kind: KernelCompanionBackgroundWorkKind;
  state: KernelCompanionBackgroundWorkState;
  reason: string | null;
  submittedAt: number;
  updatedAt: number;
  startedAt: number | null;
  terminalAt: number | null;
  attemptCount: number;
  diagnostics: Record<string, KernelCompanionBackgroundWorkStatusDiagnosticValue>;
  lastError: string | null;
}

export interface KernelCompanionBackgroundWorkStatusReadOptions {
  kind?: KernelCompanionBackgroundWorkKind;
}

export interface KernelCompanionBackgroundWorkStatusReadModelInterface {
  list(options?: KernelCompanionBackgroundWorkStatusReadOptions): KernelCompanionBackgroundWorkStatusJob[];
  get(jobId: string): KernelCompanionBackgroundWorkStatusJob | null;
}

const REDACTED_DIAGNOSTIC_VALUE = '[redacted]';

const WORK_KIND_SAFE_DIAGNOSTICS: Record<KernelCompanionBackgroundWorkKind, ReadonlySet<string>> = {
  'review-truth-backfill': new Set([
    'reason',
    'pendingRows',
    'batchLimit',
    'plannedBatches',
    'maxBatches',
    'batchesAttempted',
    'sqlRowsRead',
    'recordsWritten',
    'idempotencyDuplicateSkipped',
    'deferredBatches',
    'unavailable',
  ]),
  'kernel-transaction-action-polling': new Set([
    'reason',
    'mode',
    'writerRelayRequired',
    'maxActionsPerPoll',
    'status',
    'actionCount',
    'remainingActions',
    'pendingAutoCardBlocks',
    'pendingUpsertBlockCount',
    'upsertInFlight',
    'emptyPollStreak',
    'unavailable',
  ]),
  'xiuyuan-startup-sync': new Set([
    'reason',
    'syncType',
    'source',
    'persistIdleCheckpoint',
    'status',
    'latestCompletedPhase',
    'addedCount',
    'updatedCount',
    'deletedCount',
    'skippedCount',
    'detectedCount',
    'blacklistCleanedCount',
    'unavailable',
  ]),
};

const CONTENT_BEARING_DIAGNOSTIC_KEY_PATTERN = /(?:content|body|payload|sql|query|card|block|hosteffect|request|response|html|markdown|text)/i;

export class KernelCompanionBackgroundWorkStatusReadModel
implements KernelCompanionBackgroundWorkStatusReadModelInterface {
  constructor(private readonly registry: Pick<KernelCompanionBackgroundWorkRegistryInterface, 'status'>) {}

  list(options: KernelCompanionBackgroundWorkStatusReadOptions = {}): KernelCompanionBackgroundWorkStatusJob[] {
    return this.registry.status()
      .filter((job) => !options.kind || job.kind === options.kind)
      .map(normalizeStatusJob)
      .sort(compareStatusJobs);
  }

  get(jobId: string): KernelCompanionBackgroundWorkStatusJob | null {
    const job = this.registry.status(jobId);
    return job ? normalizeStatusJob(job) : null;
  }
}

function normalizeStatusJob(job: KernelCompanionBackgroundWorkRecord): KernelCompanionBackgroundWorkStatusJob {
  const diagnostics = normalizeDiagnostics(job.kind, job.diagnostics);
  return {
    jobId: job.jobId,
    kind: job.kind,
    state: job.state,
    reason: job.reason ?? readStringDiagnostic(diagnostics.reason),
    submittedAt: job.submittedAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    terminalAt: job.completedAt,
    attemptCount: job.attemptCount,
    diagnostics,
    lastError: job.lastError,
  };
}

function compareStatusJobs(
  left: KernelCompanionBackgroundWorkStatusJob,
  right: KernelCompanionBackgroundWorkStatusJob,
): number {
  return right.updatedAt - left.updatedAt
    || right.submittedAt - left.submittedAt
    || left.jobId.localeCompare(right.jobId);
}

function normalizeDiagnostics(
  kind: KernelCompanionBackgroundWorkKind,
  diagnostics: KernelCompanionBackgroundWorkDiagnostics,
): Record<string, KernelCompanionBackgroundWorkStatusDiagnosticValue> {
  const safeKeys = WORK_KIND_SAFE_DIAGNOSTICS[kind];
  const normalized: Record<string, KernelCompanionBackgroundWorkStatusDiagnosticValue> = {};
  for (const [key, value] of Object.entries(diagnostics ?? {})) {
    if (safeKeys.has(key)) {
      normalized[key] = normalizeKnownDiagnosticValue(value);
      continue;
    }
    if (isSafeDiagnosticScalar(value) && !CONTENT_BEARING_DIAGNOSTIC_KEY_PATTERN.test(key)) {
      normalized[key] = value;
      continue;
    }
    normalized[key] = REDACTED_DIAGNOSTIC_VALUE;
  }
  return normalized;
}

function normalizeKnownDiagnosticValue(value: unknown): KernelCompanionBackgroundWorkStatusDiagnosticValue {
  return isSafeDiagnosticScalar(value) ? value : REDACTED_DIAGNOSTIC_VALUE;
}

function isSafeDiagnosticScalar(value: unknown): value is KernelCompanionBackgroundWorkStatusDiagnosticValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function readStringDiagnostic(value: KernelCompanionBackgroundWorkStatusDiagnosticValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
