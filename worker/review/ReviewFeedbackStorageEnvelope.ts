import type {
  SqliteDeltaDiagnostics,
  SqliteDeltaHotPathDiagnostics,
} from '@/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint';
import type {
  BackendReviewFeedbackJournalDiagnostics,
  BackendReviewFeedbackResult,
  BackendReviewFeedbackStorageState,
} from '../../packages/contracts/src/backend-rpc';

export interface ReviewFeedbackStorageEnvelopeDependencies {
  readJournalDiagnostics(): Promise<BackendReviewFeedbackJournalDiagnostics>;
  readSqliteDeltaDiagnostics?: () => Promise<SqliteDeltaDiagnostics>;
  readSqliteDeltaHotPathDiagnostics?: () => Promise<SqliteDeltaHotPathDiagnostics | null>;
}

export interface ReviewFeedbackStorageEnvelopeInput {
  result: BackendReviewFeedbackResult;
  journalEntryId: string | null;
}

export class ReviewFeedbackStorageEnvelope {
  constructor(private readonly deps: ReviewFeedbackStorageEnvelopeDependencies) {}

  async build(input: ReviewFeedbackStorageEnvelopeInput): Promise<BackendReviewFeedbackStorageState> {
    const journal = await this.deps.readJournalDiagnostics();
    const sqliteDelta = await this.tryReadSqliteDeltaDiagnostics();
    const checkpoint = sqliteDelta.diagnostics?.lastCheckpoint ?? null;
    const lastDeltaWrite = sqliteDelta.diagnostics?.lastWrite ?? null;
    const queueImpact = input.result.queueImpact ?? null;
    const pendingCount = typeof journal.pendingCount === 'number' ? journal.pendingCount : null;
    const hotPathCheckpoint = checkpoint?.hotPath === true;
    const hotPathDelta = lastDeltaWrite?.hotPath === true
      && lastDeltaWrite.ok === true
      && lastDeltaWrite.classification === 'delta';
    const checkpointStatus = sqliteDelta.error
      ? 'unknown'
      : hotPathCheckpoint
      ? (checkpoint?.ok === true ? 'checkpointed' : 'failed')
      : hotPathDelta
      ? 'delta-recorded'
      : 'not-run';
    const localIntentStatus = input.result.committed
      ? (journal.storage === 'non-siyuan' ? 'recorded' : 'unavailable')
      : 'not-required';

    return {
      localIntent: {
        status: localIntentStatus,
        durable: localIntentStatus === 'recorded',
        storage: journal.storage ?? 'unavailable',
        entryId: input.journalEntryId ?? journal.lastWrite?.entryId ?? null,
        idempotencyKey: input.result.idempotencyKey ?? null,
        journalStatus: input.journalEntryId
          ? 'projection-applied'
          : journal.lastWrite?.status ?? null,
        pendingCount,
        pendingBytes: typeof journal.pendingBytes === 'number' ? journal.pendingBytes : null,
        error: journal.lastWrite?.error ?? null,
      },
      truthFlush: {
        status: pendingCount && pendingCount > 0 ? 'pending' : 'not-required',
        family: 'review-events',
        syncVisible: false,
        pendingCount,
        oldestPendingAgeMs: journal.oldestPendingAgeMs ?? null,
        lastError: null,
      },
      sqlProjection: {
        status: resolveReviewFeedbackSqlProjectionStatus(queueImpact),
        hotPatchable: queueImpact?.hotPatchable === true,
        refreshRequired: queueImpact?.refreshRequired === true,
        affectedQueueCount: queueImpact?.affectedQueues.length ?? 0,
        projectionGeneration: resolveProjectionGeneration(queueImpact),
      },
      sqlCheckpoint: {
        status: checkpointStatus,
        hotPath: hotPathCheckpoint || hotPathDelta,
        cause: hotPathCheckpoint ? checkpoint?.cause ?? null : hotPathDelta ? lastDeltaWrite?.cause ?? null : null,
        initiator: hotPathCheckpoint ? checkpoint?.initiator ?? null : hotPathDelta ? lastDeltaWrite?.initiator ?? null : null,
        projectionGeneration: hotPathCheckpoint
          ? checkpoint?.projectionGeneration ?? null
          : hotPathDelta
          ? lastDeltaWrite?.projectionGeneration ?? null
          : null,
        byteLength: hotPathCheckpoint ? checkpoint?.byteLength ?? null : hotPathDelta ? lastDeltaWrite?.pendingBytes ?? null : null,
        error: sqliteDelta.error ?? (hotPathCheckpoint ? checkpoint?.error ?? null : hotPathDelta ? lastDeltaWrite?.error ?? null : null),
      },
    };
  }

  private async tryReadSqliteDeltaDiagnostics(): Promise<{
    diagnostics: SqliteDeltaHotPathDiagnostics | null;
    error: string | null;
  }> {
    try {
      if (this.deps.readSqliteDeltaHotPathDiagnostics) {
        return {
          diagnostics: await this.deps.readSqliteDeltaHotPathDiagnostics(),
          error: null,
        };
      }
      if (!this.deps.readSqliteDeltaDiagnostics) {
        return {
          diagnostics: null,
          error: null,
        };
      }
      return {
        diagnostics: await this.deps.readSqliteDeltaDiagnostics(),
        error: null,
      };
    } catch (error) {
      return {
        diagnostics: null,
        error: errorMessage(error),
      };
    }
  }
}

export function resolveReviewFeedbackSqlProjectionStatus(
  queueImpact: BackendReviewFeedbackResult['queueImpact'] | null | undefined,
): BackendReviewFeedbackStorageState['sqlProjection']['status'] {
  if (!queueImpact) {
    return 'not-applicable';
  }
  if (queueImpact.refreshRequired) {
    return 'refresh-required';
  }
  if (queueImpact.hotPatchable) {
    return 'patched';
  }
  const outcomes = queueImpact.affectedQueues.map((entry) => entry.outcome);
  if (outcomes.includes('unavailable')) {
    return 'unavailable';
  }
  if (outcomes.includes('deferred')) {
    return 'deferred';
  }
  return 'not-applicable';
}

function resolveProjectionGeneration(
  queueImpact: BackendReviewFeedbackResult['queueImpact'] | null | undefined,
): number | null {
  return queueImpact?.affectedQueues
    .map((entry) => entry.currentGeneration ?? entry.generation ?? entry.counterGeneration ?? null)
    .find((generation): generation is number => typeof generation === 'number' && Number.isFinite(generation))
    ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
