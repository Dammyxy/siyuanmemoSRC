import { describe, expect, it, vi } from 'vitest';
import type { SqliteDeltaDiagnostics } from '@/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint';
import type {
  BackendReviewFeedbackJournalDiagnostics,
  BackendReviewFeedbackQueueImpact,
  BackendReviewFeedbackQueueImpactEntry,
  BackendReviewFeedbackResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  ReviewFeedbackStorageEnvelope,
  resolveReviewFeedbackSqlProjectionStatus,
} from '../ReviewFeedbackStorageEnvelope';

const REVIEWED_AT = 1_779_188_200_000;

function createResult(overrides: Partial<BackendReviewFeedbackResult> = {}): BackendReviewFeedbackResult {
  return {
    cardId: 'card-1',
    committed: true,
    reviewedAt: REVIEWED_AT,
    queueType: 'IncrementalLearning',
    updatedCard: null,
    idempotencyKey: 'review:card-1:1',
    queueImpact: createQueueImpact({ hotPatchable: true }),
    ...overrides,
  };
}

function createJournalDiagnostics(
  overrides: Partial<BackendReviewFeedbackJournalDiagnostics> = {},
): BackendReviewFeedbackJournalDiagnostics {
  return {
    fileName: 'review-feedback-journal.v1',
    storage: 'non-siyuan',
    version: 1,
    entryCount: 1,
    pendingCount: 0,
    pendingBytes: 0,
    oldestPendingAt: null,
    oldestPendingAgeMs: null,
    appliedInMemoryCount: 0,
    lastWrite: {
      ok: true,
      at: REVIEWED_AT,
      entryId: 'entry-a',
      status: 'projection-applied',
      pendingCount: 0,
      pendingBytes: 0,
      error: null,
    },
    lastReplay: null,
    lastCheckpoint: null,
    ...overrides,
  };
}

function createSqliteDeltaDiagnostics(
  overrides: Partial<SqliteDeltaDiagnostics> = {},
): SqliteDeltaDiagnostics {
  return {
    fileName: 'sqlite-delta-log.v2.json',
    version: 2,
    registeredTables: [],
    durableReplayTables: [],
    derivedCacheTables: [],
    pendingCount: 0,
    pendingBytes: 0,
    affectedTables: [],
    deltaWritesTotal: 0,
    checkpointWritesTotal: 1,
    checkpointOnlyTotal: 0,
    replayedEntriesTotal: 0,
    lastWrite: null,
    lastReplay: null,
    lastCheckpoint: {
      ok: true,
      at: REVIEWED_AT + 1,
      classification: 'checkpoint',
      cause: 'review.feedback',
      initiator: 'review.feedback',
      projectionGeneration: 7,
      hotPath: true,
      byteLength: 123,
      error: null,
    },
    ...overrides,
  };
}

function createQueueImpact(
  overrides: Partial<BackendReviewFeedbackQueueImpact> = {},
  entryOverrides: Partial<BackendReviewFeedbackQueueImpactEntry> = {},
): BackendReviewFeedbackQueueImpact {
  const hotPatchable = overrides.hotPatchable ?? entryOverrides.hotPatchable ?? false;
  const refreshRequired = overrides.refreshRequired ?? entryOverrides.refreshRequired ?? false;
  return {
    hotPatchable,
    refreshRequired,
    affectedQueues: [
      {
        queueType: 'IncrementalLearning',
        policyHash: 'policy-a',
        generation: 7,
        requestedGeneration: 7,
        currentGeneration: 7,
        outcome: hotPatchable ? 'patch-applied' : refreshRequired ? 'refresh-required' : undefined,
        unavailableReason: null,
        deferred: null,
        hotPatchable,
        refreshRequired,
        reason: 'review-feedback',
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: 7,
        counters: null,
        ...entryOverrides,
      },
    ],
    ...overrides,
  };
}

describe('ReviewFeedbackStorageEnvelope', () => {
  it('builds committed storage state from journal and SQLite delta diagnostics', async () => {
    const envelope = new ReviewFeedbackStorageEnvelope({
      readJournalDiagnostics: vi.fn(async () => createJournalDiagnostics()),
      readSqliteDeltaDiagnostics: vi.fn(async () => createSqliteDeltaDiagnostics()),
    });

    const storage = await envelope.build({
      result: createResult(),
      journalEntryId: 'entry-a',
    });

    expect(storage.localIntent).toMatchObject({
      status: 'recorded',
      durable: true,
      storage: 'non-siyuan',
      entryId: 'entry-a',
      idempotencyKey: 'review:card-1:1',
      journalStatus: 'projection-applied',
      pendingCount: 0,
      pendingBytes: 0,
      error: null,
    });
    expect(storage.truthFlush).toMatchObject({
      status: 'not-required',
      family: 'review-events',
      syncVisible: false,
      pendingCount: 0,
      oldestPendingAgeMs: null,
      lastError: null,
    });
    expect(storage.sqlProjection).toMatchObject({
      status: 'patched',
      hotPatchable: true,
      refreshRequired: false,
      affectedQueueCount: 1,
      projectionGeneration: 7,
    });
    expect(storage.sqlCheckpoint).toMatchObject({
      status: 'checkpointed',
      hotPath: true,
      cause: 'review.feedback',
      initiator: 'review.feedback',
      projectionGeneration: 7,
      byteLength: 123,
      error: null,
    });
  });

  it('reports pending truth flush from journal diagnostics', async () => {
    const envelope = new ReviewFeedbackStorageEnvelope({
      readJournalDiagnostics: vi.fn(async () => createJournalDiagnostics({
        pendingCount: 2,
        pendingBytes: 456,
        oldestPendingAgeMs: 12_000,
      })),
      readSqliteDeltaDiagnostics: vi.fn(async () => createSqliteDeltaDiagnostics({ lastCheckpoint: null })),
    });

    const storage = await envelope.build({
      result: createResult({ queueImpact: null }),
      journalEntryId: null,
    });

    expect(storage.localIntent).toMatchObject({
      status: 'recorded',
      durable: true,
      entryId: 'entry-a',
      pendingCount: 2,
      pendingBytes: 456,
    });
    expect(storage.truthFlush).toMatchObject({
      status: 'pending',
      pendingCount: 2,
      oldestPendingAgeMs: 12_000,
    });
    expect(storage.sqlCheckpoint).toMatchObject({
      status: 'not-run',
      hotPath: false,
    });
  });

  it('treats committed journal plus unapplied SQL delta as durable when no hot checkpoint ran', async () => {
    const envelope = new ReviewFeedbackStorageEnvelope({
      readJournalDiagnostics: vi.fn(async () => createJournalDiagnostics()),
      readSqliteDeltaDiagnostics: vi.fn(async () => createSqliteDeltaDiagnostics({
        pendingCount: 3,
        pendingBytes: 789,
        deltaWritesTotal: 3,
        checkpointWritesTotal: 0,
        lastWrite: {
          ok: true,
          at: REVIEWED_AT + 2,
          classification: 'delta',
          label: 'review.feedback',
          cause: 'review.feedback',
          initiator: 'review.feedback',
          projectionGeneration: 7,
          hotPath: true,
          pendingCount: 3,
          pendingBytes: 789,
          affectedTables: ['cards', 'review_events'],
          skippedDerivedTables: [],
          skippedDerivedChangeCount: 0,
          deltaEntryId: 'delta-entry-a',
          deltaEntriesWritten: 1,
          checkpointStorageClass: 'volatile-projection',
          error: null,
        },
        lastCheckpoint: null,
      })),
    });

    const storage = await envelope.build({
      result: createResult(),
      journalEntryId: 'entry-a',
    });

    expect(storage.sqlCheckpoint).toMatchObject({
      status: 'delta-recorded',
      hotPath: true,
      cause: 'review.feedback',
      initiator: 'review.feedback',
      projectionGeneration: 7,
      byteLength: 789,
      error: null,
    });
  });

  it('maps queue impact outcomes to SQL projection status', () => {
    expect(resolveReviewFeedbackSqlProjectionStatus(createQueueImpact({ hotPatchable: true }))).toBe('patched');
    expect(resolveReviewFeedbackSqlProjectionStatus(createQueueImpact({ refreshRequired: true }))).toBe('refresh-required');
    expect(resolveReviewFeedbackSqlProjectionStatus(createQueueImpact(
      {},
      { outcome: 'unavailable', hotPatchable: false, refreshRequired: false },
    ))).toBe('unavailable');
    expect(resolveReviewFeedbackSqlProjectionStatus(createQueueImpact(
      {},
      { outcome: 'deferred', hotPatchable: false, refreshRequired: false },
    ))).toBe('deferred');
    expect(resolveReviewFeedbackSqlProjectionStatus(null)).toBe('not-applicable');
  });

  it('reports unknown SQL checkpoint when SQLite delta diagnostics fail', async () => {
    const envelope = new ReviewFeedbackStorageEnvelope({
      readJournalDiagnostics: vi.fn(async () => createJournalDiagnostics()),
      readSqliteDeltaDiagnostics: vi.fn(async () => {
        throw new Error('delta unavailable');
      }),
    });

    const storage = await envelope.build({
      result: createResult(),
      journalEntryId: 'entry-a',
    });

    expect(storage.sqlCheckpoint).toMatchObject({
      status: 'unknown',
      hotPath: false,
      cause: null,
      initiator: null,
      projectionGeneration: null,
      byteLength: null,
      error: 'delta unavailable',
    });
  });
});
