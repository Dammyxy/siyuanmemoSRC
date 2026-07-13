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
  dedupeKeyDigest: string | null;
  coalescedSubmissionCount: number;
  skippedSubmissionCount: number;
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
  'startup-storage-maintenance': new Set([
    'reason',
    'deferredDescriptorCount',
    'deferredDescriptorKinds',
    'operationId',
    'ownedPhaseCount',
    'scheduleNormalizationPhase',
    'scheduleAffectedCardCount',
    'scheduleCompletedBatches',
    'orphanCardRepairPhase',
    'orphanDiscoveredCardCount',
    'orphanRepairedCardCount',
    'orphanCompletedBatches',
    'childJobId',
    'childWorkKind',
    'childState',
    'waitingForChild',
    'receiptScopeAvailable',
    'lifecycleDedupeKeyAvailable',
    'unavailable',
  ]),
  'storage-pressure-recovery': new Set([
    'reason',
    'phase',
    'descriptorReason',
    'batchIndex',
    'maxBatches',
    'adoptedEntryCount',
    'unsupportedEntryCount',
    'firstJournalSequence',
    'lastJournalSequence',
    'promotionBatchCount',
    'truthCoverageFrontier',
    'candidateEntryCount',
    'reclaimableEntryCount',
    'retainedEntryCount',
    'deletedFileCount',
    'failedFileCount',
    'remainingOrphanFileCount',
    'remainingOrphanBytes',
    'pressureLevel',
    'pressureReason',
    'errorCode',
    'deferredDescriptorCount',
    'lifecycleDedupeKeyAvailable',
    'unavailable',
  ]),
  'progressive-excerpt-completion-repair': new Set([
    'reason',
    'delayMs',
    'repairedCount',
    'completedCount',
    'failedCount',
    'unavailable',
  ]),
  'review-truth-flush': new Set([
    'reason',
    'delayMs',
    'queued',
    'flushed',
    'unavailable',
  ]),
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
  'truth-promotion': new Set([
    'reason',
    'available',
    'active',
    'shutdownStarted',
    'pendingMutationCount',
    'oldestPendingAgeMs',
    'journalSequenceFrontier',
    'truthCoverageFrontier',
    'retryReason',
    'lastSuccessfulPromotionAt',
    'pollsAttempted',
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
};

const STRICT_WORK_KIND_SAFE_DIAGNOSTICS = new Set<KernelCompanionBackgroundWorkKind>([
  'startup-storage-maintenance',
  'storage-pressure-recovery',
]);

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
    dedupeKeyDigest: job.dedupeKey ? digestDedupeKey(job.dedupeKey) : null,
    coalescedSubmissionCount: job.coalescedSubmissionCount,
    skippedSubmissionCount: job.skippedSubmissionCount,
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
    if (STRICT_WORK_KIND_SAFE_DIAGNOSTICS.has(kind)) {
      normalized[key] = REDACTED_DIAGNOSTIC_VALUE;
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

function digestDedupeKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
