import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendAutoCardExecuteResult,
  type BackendDomainSyncStatusResult,
  type BackendReviewFeedbackResult,
  type BackendRpcMethod,
  type BackendSyncConflictMergeResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS,
  type BackendAutoCardRpcDatabase,
  type BackendAutoCardRpcHandlerContext,
} from '../rpc/BackendAutoCardRpcAdapter';
import {
  BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS,
  BackendReviewRpcRuntime,
  type BackendReviewRpcDatabase,
  type BackendReviewRpcHandlerContext,
} from '../rpc/BackendReviewRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';
import {
  BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS,
  type BackendSyncRpcDatabase,
  type BackendSyncRpcHandlerContext,
} from '../rpc/BackendSyncRpcAdapter';

describe('Backend Review/Sync/AutoCard RPC adapters', () => {
  it('registers migrated Review, Sync, domain-sync, and AutoCard methods outside the kernel switch owner', () => {
    expect(BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS.map((entry) => ({
      method: entry.method,
      family: entry.family,
      owner: entry.owner,
    }))).toEqual([
      { method: 'review.feedback', family: 'review', owner: 'BackendReviewRpcAdapter' },
      { method: 'review.truth.flush', family: 'review', owner: 'BackendReviewRpcAdapter' },
      { method: 'review.truth.backfill', family: 'review', owner: 'BackendReviewRpcAdapter' },
      { method: 'review.riffFeedback.execute', family: 'review', owner: 'BackendReviewRpcAdapter' },
      { method: 'review.sourceRefresh.execute', family: 'review', owner: 'BackendReviewRpcAdapter' },
    ]);
    expect(BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS.map((entry) => ({
      method: entry.method,
      family: entry.family,
      owner: entry.owner,
    }))).toEqual([
      { method: 'sync.conflict.merge', family: 'sync', owner: 'BackendSyncRpcAdapter' },
      { method: 'sync.reviewDivergence.audit', family: 'sync', owner: 'BackendSyncRpcAdapter' },
      { method: 'sync.conflict.summarize', family: 'sync', owner: 'BackendSyncRpcAdapter' },
      { method: 'sync.conflict.reload', family: 'sync', owner: 'BackendSyncRpcAdapter' },
      { method: 'domainSync.status', family: 'domain-sync', owner: 'BackendSyncRpcAdapter' },
      { method: 'domainSync.repair.preview', family: 'domain-sync', owner: 'BackendSyncRpcAdapter' },
      { method: 'domainSync.repair.apply', family: 'domain-sync', owner: 'BackendSyncRpcAdapter' },
      {
        method: 'domainSync.conflictSources.cleanupCandidates',
        family: 'domain-sync',
        owner: 'BackendSyncRpcAdapter',
      },
      { method: 'domainSync.conflictSources.cleanup', family: 'domain-sync', owner: 'BackendSyncRpcAdapter' },
    ]);
    expect(BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS.map((entry) => ({
      method: entry.method,
      family: entry.family,
      owner: entry.owner,
    }))).toEqual([
      { method: 'autocard.decision.resolve', family: 'autocard', owner: 'BackendAutoCardRpcAdapter' },
      { method: 'autocard.execute', family: 'autocard', owner: 'BackendAutoCardRpcAdapter' },
    ]);
  });

  it('routes review.feedback through the Review adapter and keeps kernel timing diagnostics', async () => {
    const database = createReviewDatabase();
    const logStep = vi.fn();
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS),
    );
    const context: BackendReviewRpcHandlerContext = {
      review: new BackendReviewRpcRuntime({ database }),
      reviewFeedbackTiming: {
        cardId: 'card-review-1',
        requestStartedAt: 40,
        logStep,
      },
      lifecycle: {
        now: () => 50,
      },
    };

    await expect(dispatch(dispatcher, context, 'review.feedback', {
      cardId: 'card-review-1',
      rating: 3,
      reviewedAt: 100,
    })).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'review.feedback',
      result: {
        cardId: 'card-review-1',
        committed: true,
        reviewedAt: 100,
        queueType: 'retrieval-practice',
        updatedCard: null,
      },
    });
    expect(database.reviewFeedback).toHaveBeenCalledWith({
      cardId: 'card-review-1',
      rating: 3,
      reviewedAt: 100,
    });
    expect(database.markReviewFeedbackOwnPersistedMainDbClean).toHaveBeenCalledTimes(1);
    expect(logStep).toHaveBeenCalledWith('handler', expect.any(Number), {});
    expect(logStep).toHaveBeenCalledWith('request-total', expect.any(Number), {});
  });

  it('keeps review truth flush fail-closed when required storage is absent', async () => {
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS),
    );
    const context: BackendReviewRpcHandlerContext = {
      review: new BackendReviewRpcRuntime({ database: createReviewDatabase() }),
    };

    await expect(dispatch(dispatcher, context, 'review.truth.flush', {
      deviceId: 'device-a',
      generationId: 'review-events-v1',
    })).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'review.truth.flush',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: review.truth.flush requires Review feedback journal store',
      },
    });
  });

  it('routes sync/domain-sync methods through the Sync adapter with preflight merge preserved', async () => {
    const database = createSyncDatabase();
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS),
    );
    const context: BackendSyncRpcHandlerContext = {
      sync: { database },
    };

    await expect(dispatch(dispatcher, context, 'sync.conflict.merge', {
      sources: [],
      mergedAt: 100,
    })).resolves.toMatchObject({
      result: {
        ok: true,
        sources: 0,
      },
    });
    await expect(dispatch(dispatcher, context, 'domainSync.status', {
      context: 'review-feedback-preflight',
      cardId: 'card-sync-1',
    })).resolves.toMatchObject({
      result: {
        ok: true,
        ledger: { operationCount: 1 },
      },
    });
    expect(database.mergeExternalDatabaseIfChanged).toHaveBeenCalledWith(undefined, {
      context: 'review-feedback-preflight',
      cardId: 'card-sync-1',
      skipMainDbRead: true,
    });
    expect(database.getDomainSyncStatusForPreflight).toHaveBeenCalledWith('review-feedback-preflight');
  });

  it('routes AutoCard execution through the AutoCard adapter and records outcome classes', async () => {
    const database = createAutoCardDatabase();
    const executeAutoCard = vi.fn(async (): Promise<BackendAutoCardExecuteResult> => ({
      status: 'created',
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS),
    );
    const context: BackendAutoCardRpcHandlerContext = {
      autoCard: {
        database,
        executeAutoCard,
      },
    };

    await expect(dispatch(dispatcher, context, 'autocard.execute', {
      envelope: {
        kind: 'planner-decision',
        blockId: 'block-1',
        content: '* item',
        source: 'symbol-listener',
        decision: {
          id: 'rule-1',
          family: 'quick',
          templateId: 'basic',
          cardType: 'item',
          mode: 'create',
          executorKind: 'quick',
          priority: 1,
        },
      },
    })).resolves.toMatchObject({
      result: {
        executed: true,
        created: 1,
        skipped: 0,
      },
    });
    expect(database.recordAutoCardExecuteOutcome).toHaveBeenCalledWith({
      status: 'created',
      created: 1,
      skipped: 0,
    });
  });

  it('keeps AutoCard execution explicitly unavailable without a host callback', async () => {
    const database = createAutoCardDatabase();
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS),
    );
    const context: BackendAutoCardRpcHandlerContext = {
      autoCard: { database },
    };

    await expect(dispatch(dispatcher, context, 'autocard.execute', {
      envelope: {
        kind: 'topic-derived',
        input: {
          sourceBlockId: 'block-1',
          sourceDocId: 'doc-1',
          parentTopicCardId: 'topic-1',
          plannerContent: 'content',
        },
      },
    })).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'autocard.execute',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker autocard.execute unavailable: execute callback is not configured',
      },
    });
    expect(database.recordAutoCardExecuteOutcome).toHaveBeenCalledWith({
      status: 'unavailable',
    });
  });
});

function dispatch<TContext>(
  dispatcher: BackendRpcDispatcher<TContext>,
  context: TContext,
  method: BackendRpcMethod,
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}

function createReviewDatabase(): BackendReviewRpcDatabase {
  return {
    reviewFeedback: vi.fn(async (request): Promise<BackendReviewFeedbackResult> => ({
      cardId: request.cardId,
      committed: true,
      reviewedAt: request.reviewedAt ?? 100,
      queueType: request.queueType ?? 'retrieval-practice',
      updatedCard: null,
    })),
    invalidateReviewFeedbackMainDbFastSkip: vi.fn(),
    mergeExternalDatabaseIfChanged: vi.fn(async () => ({})),
    markReviewFeedbackOwnPersistedMainDbClean: vi.fn(),
    getReviewFeedbackJournalStore: vi.fn(() => null),
    listReviewEventsForTruthBackfill: vi.fn(async () => []),
    patchReviewTruthBackfillProjectionRefs: vi.fn(async () => undefined),
    countReviewEventsPendingTruthBackfill: vi.fn(async () => 0),
    updateSourceExistence: vi.fn(async () => undefined),
  };
}

function createSyncDatabase(): BackendSyncRpcDatabase {
  return {
    mergeSyncConflictDatabases: vi.fn(async (): Promise<BackendSyncConflictMergeResult> => ({
      ok: true,
      sources: 0,
      mergedReviewEvents: 0,
      ignoredReviewEvents: 0,
      mergedCards: 0,
      ignoredCards: 0,
      skippedSources: [],
      diagnostics: {
        reviewCardDivergences: [],
      },
    })),
    auditReviewSyncDivergence: vi.fn(async () => ({
      ok: true as const,
      checkedCards: 0,
      divergences: [],
      truncated: false,
    })),
    summarizeSyncConflictDatabases: vi.fn(async () => ({
      ok: true as const,
      sources: [],
      skippedSources: [],
    })),
    reloadFromDisk: vi.fn(async () => ({
      ok: true as const,
      initialized: true,
      dbFile: 'siyuanmemo.db',
    })),
    mergeExternalDatabaseIfChanged: vi.fn(async () => ({})),
    getDomainSyncStatus: vi.fn(async () => createDomainSyncStatus(0)),
    getDomainSyncStatusForPreflight: vi.fn(async () => createDomainSyncStatus(1)),
    previewDomainSyncRepair: vi.fn(async () => ({
      ok: true as const,
      planId: 'plan-1',
      repairableDivergences: [],
      destructive: false,
      requiresConfirmation: false,
    })),
    applyDomainSyncRepair: vi.fn(async () => ({
      ok: true as const,
      planId: 'plan-1',
      applied: [],
      skipped: [],
    })),
    listDomainSyncConflictSourceCleanupCandidates: vi.fn(async () => ({
      ok: true as const,
      candidates: [],
    })),
    cleanupDomainSyncConflictSources: vi.fn(async () => ({
      ok: true as const,
      removed: [],
      skipped: [],
    })),
  };
}

function createDomainSyncStatus(operationCount: number): BackendDomainSyncStatusResult {
  return {
    ok: true,
    ledger: {
      operationCount,
      newestOperationAt: null,
      operationTypes: {},
    },
    processedSources: {
      recent: [],
      skipped: [],
      totalProcessed: 0,
      totalSkipped: 0,
    },
    sanity: {
      status: 'clean',
      checkedAt: 0,
      duplicateOperationIds: [],
      duplicateProcessedKeys: [],
      orphanProcessedKeys: [],
      pendingOperationCount: 0,
      committedOperationCount: 0,
      failedOperationCount: 0,
    },
    repair: {
      available: true,
      repairableDivergenceCount: 0,
      latestPlanId: null,
    },
  };
}

function createAutoCardDatabase(): BackendAutoCardRpcDatabase {
  return {
    resolveAutoCardDecision: vi.fn(async (request) => ({
      candidateId: request.candidateId ?? 'candidate-1',
      decisionEventId: 'decision-1',
      status: 'no-op' as const,
      unavailableClass: null,
      matchedRuleIds: [],
      enabledDecisions: [],
      filteredDecisions: [],
      selectedDecision: null,
      conflicted: false,
      strategyUsed: 'skip' as const,
      markOnlyClozeCandidate: false,
      shouldUseTopicDerivation: false,
    })),
    recordAutoCardExecuteOutcome: vi.fn(),
  };
}
