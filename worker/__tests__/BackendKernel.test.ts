import { describe, expect, it } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { DEFAULT_SETTINGS } from '@/types/settings';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

function authorizedPrivateCapability() {
  return {
    available: true,
    reason: null,
    kernelSidecarAvailable: true,
    backendWorkerAvailable: true,
    writerAvailable: true,
    methodAllowed: true,
  };
}

describe('BackendKernel', () => {
  it('returns explicit unavailable when no persistence bridge is configured', async () => {
    const kernel = BackendKernel.createWithoutBridge();

    const loadResponse = await kernel.handle({
      id: 1,
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });

    expect(loadResponse).toEqual({
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker persistence bridge is unavailable',
      },
    });
  });

  it('loads and persists sqlite database through worker methods', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const loadResponse = await kernel.handle({
      id: 'load',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });
    expect(loadResponse).toEqual({
      id: 'load',
      jsonrpc: '2.0',
      result: {
        ok: true,
        initialized: true,
        dbFile: 'siyuanmemo.db',
      },
    });

    const persistResponse = await kernel.handle({
      id: 'persist',
      jsonrpc: '2.0',
      method: 'db.persist',
      params: [],
    });
    expect(persistResponse).toEqual({
      id: 'persist',
      jsonrpc: '2.0',
      result: {
        ok: true,
        persisted: true,
        dbFile: 'siyuanmemo.db',
      },
    });

    const statusResponse = await kernel.handle({
      id: 'status',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in statusResponse).toBe(true);
    if ('result' in statusResponse) {
      expect(statusResponse.result).toMatchObject({
        runtime: 'srs-backend-worker',
        initialized: true,
        dbFile: 'siyuanmemo.db',
        ingest: {
          queueLength: 0,
          queuedTransactions: 0,
          maxQueueLength: 256,
          actionQueueLength: 0,
          actionEnqueuedTotal: 0,
          actionDequeuedTotal: 0,
          actionRequeuedTotal: 0,
          actionRejectedTotal: 0,
          removeActionQueuedTotal: 0,
          upsertActionQueuedTotal: 0,
          autoCardActionQueuedTotal: 0,
          maxActionQueueLength: 4096,
        },
      });
    }
  });

  it('serves browser phase-2 rpc methods from worker sqlite repository', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const deckPageResponse = await kernel.handle({
      id: 'deck-page',
      jsonrpc: '2.0',
      method: 'browser.deck.page',
      params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }],
    });
    expect(deckPageResponse).toEqual({
      id: 'deck-page',
      jsonrpc: '2.0',
      result: {
        total: 0,
        cards: [],
      },
    });

    const matchedIdsResponse = await kernel.handle({
      id: 'deck-ids',
      jsonrpc: '2.0',
      method: 'browser.deck.matchedIds',
      params: [{ query: { preset: 'review' } }],
    });
    expect(matchedIdsResponse).toEqual({
      id: 'deck-ids',
      jsonrpc: '2.0',
      result: { ids: [] },
    });

    const rowsByIdsResponse = await kernel.handle({
      id: 'deck-rows',
      jsonrpc: '2.0',
      method: 'browser.deck.rowsByIds',
      params: [{ ids: ['card-1'] }],
    });
    expect(rowsByIdsResponse).toEqual({
      id: 'deck-rows',
      jsonrpc: '2.0',
      result: { cards: [] },
    });

    const statsResponse = await kernel.handle({
      id: 'stats',
      jsonrpc: '2.0',
      method: 'browser.stats',
      params: [],
    });
    expect(statsResponse).toEqual({
      id: 'stats',
      jsonrpc: '2.0',
      result: {
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        suspendedCards: 0,
        lostCards: 0,
      },
    });

    const sourceSummaryResponse = await kernel.handle({
      id: 'source-summary',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.summary',
      params: [],
    });
    expect(sourceSummaryResponse).toEqual({
      id: 'source-summary',
      jsonrpc: '2.0',
      result: {
        unknown: 0,
        stale: 0,
        missing: 0,
      },
    });

    const sourceSweepResponse = await kernel.handle({
      id: 'source-sweep',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweep',
      params: [{ request: { blockIds: ['block-1'] }, existingBlockIds: ['block-1'] }],
    });
    expect(sourceSweepResponse).toEqual({
      id: 'source-sweep',
      jsonrpc: '2.0',
      result: {
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      },
    });

    const sourceSweepHostResponse = await kernel.handle({
      id: 'source-sweep-host',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweepHost',
      params: [{ request: { blockIds: ['block-1'] } }],
    });
    expect(sourceSweepHostResponse).toEqual({
      id: 'source-sweep-host',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker host source-existence resolver is unavailable',
      },
    });

    const transactionIngestResponse = await kernel.handle({
      id: 'kernel-transaction-ingest',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'kernel-sidecar',
        transactions: [{ id: 'tx-1' }],
        receivedAt: 1,
      }],
    });
    expect(transactionIngestResponse).toEqual({
      id: 'kernel-transaction-ingest',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 1,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    const transactionDequeueResponse = await kernel.handle({
      id: 'kernel-transaction-dequeue',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 4 }],
    });
    expect(transactionDequeueResponse).toEqual({
      id: 'kernel-transaction-dequeue',
      jsonrpc: '2.0',
      result: {
        actions: [],
        remaining: 0,
      },
    });

    const autoCardDecisionResponse = await kernel.handle({
      id: 'autocard-decision-resolve',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [{
        blockId: 'block-1',
        content: 'question <> answer',
        blockType: 'p',
        resolvedCardType: 'item',
        source: 'symbol-listener',
        hasParentTopicCard: false,
      }],
    });
    expect(autoCardDecisionResponse).toMatchObject({
      id: 'autocard-decision-resolve',
      jsonrpc: '2.0',
      result: {
        candidateId: expect.any(String),
        decisionEventId: expect.any(String),
        status: 'selected',
        unavailableClass: null,
        matchedRuleIds: ['BasicDirectionRule'],
        enabledDecisions: [{
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          renderProfile: 'quick-default',
          direction: 'both',
          priority: 50,
          conflictGroup: 'single-block',
          hints: {
            isBidirectional: true,
          },
        }],
        filteredDecisions: [{
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          renderProfile: 'quick-default',
          direction: 'both',
          priority: 50,
          conflictGroup: 'single-block',
          hints: {
            isBidirectional: true,
          },
        }],
        selectedDecision: {
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          renderProfile: 'quick-default',
          direction: 'both',
          priority: 50,
          conflictGroup: 'single-block',
          hints: {
            isBidirectional: true,
          },
        },
        conflicted: false,
        strategyUsed: 'semantic-first',
        markOnlyClozeCandidate: false,
        shouldUseTopicDerivation: false,
      },
    });

    const autoCardStructuralDecisionResponse = await kernel.handle({
      id: 'autocard-decision-structural',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [{
        blockId: 'block-structural-1',
        content: '概念 >>>',
        blockType: 'i',
        resolvedCardType: 'item',
        source: 'doc-oneclick-scan',
        ruleScope: 'structural',
      }],
    });
    expect(autoCardStructuralDecisionResponse).toMatchObject({
      id: 'autocard-decision-structural',
      jsonrpc: '2.0',
      result: {
        matchedRuleIds: ['ListTemplateStructuralRule'],
        selectedDecision: {
          id: 'ListTemplateStructuralRule',
          executorKind: 'list-template-structural',
          mode: 'split-list',
        },
      },
    });

    const autoCardExecuteResponse = await kernel.handle({
      id: 'autocard-execute',
      jsonrpc: '2.0',
      method: 'autocard.execute',
      params: [{
        envelope: {
          kind: 'planner-decision',
          blockId: 'block-1',
          content: 'question <> answer',
          decision: {
            id: 'BasicDirectionRule',
            family: 'basic',
            templateId: 'builtin-bidirectional-single',
            cardType: 'item',
            mode: 'multi-face',
            executorKind: 'quick-basic',
            priority: 50,
            direction: 'both',
          },
          source: 'symbol-listener',
        },
      }],
    });
    expect(autoCardExecuteResponse).toEqual({
      id: 'autocard-execute',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker autocard.execute unavailable: execute callback is not configured',
      },
    });

    const reviewFeedbackResponse = await kernel.handle({
      id: 'review-feedback',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-1',
        rating: 3,
        queueType: 'final-drill',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      }],
    });
    expect(reviewFeedbackResponse).toEqual({
      id: 'review-feedback',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for final-drill mode/policy in current phase: formal/write-schedule',
      },
    });

    const reviewFeedbackPreviewResponse = await kernel.handle({
      id: 'review-feedback-preview',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-1',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      }],
    });
    expect(reviewFeedbackPreviewResponse).toEqual({
      id: 'review-feedback-preview',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for queueMode in current phase: filtered-preview',
      },
    });

    const reviewFeedbackFilterInvalidResponse = await kernel.handle({
      id: 'review-feedback-filter-invalid',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-1',
        rating: 3,
        queueType: 'filter-group',
        queueMode: 'filtered-rescheduling',
        commitPolicy: 'preview-only',
      }],
    });
    expect(reviewFeedbackFilterInvalidResponse).toEqual({
      id: 'review-feedback-filter-invalid',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for filter-group mode/policy in current phase: filtered-rescheduling/preview-only',
      },
    });
  });

  it('executes autocard.execute through injected callback when configured', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({
      database,
      executeAutoCard: async () => ({
        executed: true,
        created: 2,
        skipped: 1,
      }),
    });

    const response = await kernel.handle({
      id: 'autocard-execute-callback',
      jsonrpc: '2.0',
      method: 'autocard.execute',
      params: [{
        envelope: {
          kind: 'topic-derived',
          input: {
            sourceBlockId: 'block-1',
            sourceDocId: 'doc-1',
            parentTopicCardId: 'topic-1',
            plannerContent: 'Q <> A',
            decisions: [{
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-bidirectional-single',
              cardType: 'item',
              mode: 'multi-face',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'both',
            }],
          },
        },
      }],
    });

    expect(response).toEqual({
      id: 'autocard-execute-callback',
      jsonrpc: '2.0',
      result: {
        executed: true,
        created: 2,
        skipped: 1,
      },
    });
  });

  it('returns deterministic candidate identity for duplicate decision requests', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });
    const payload = {
      blockId: 'block-dup-1',
      content: 'question <> answer',
      blockType: 'p',
      resolvedCardType: 'item',
      source: 'symbol-listener',
      ruleScope: 'all',
      hasParentTopicCard: false,
    } as const;

    const first = await kernel.handle({
      id: 'autocard-decision-dup-1',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [payload],
    });
    const second = await kernel.handle({
      id: 'autocard-decision-dup-2',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [payload],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in first && 'result' in second) {
      expect(first.result.candidateId).toBe(second.result.candidateId);
      expect(first.result.status).toBe(second.result.status);
    }
  });

  it('deduplicates kernel.transaction.ingest by idempotency key', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-a' }],
        receivedAt: 10,
        idempotencyKey: 'same-key',
      }],
    });
    expect(first).toEqual({
      id: 'ingest-first',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 10,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    const second = await kernel.handle({
      id: 'ingest-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-a' }],
        receivedAt: 10,
        idempotencyKey: 'same-key',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-second',
      jsonrpc: '2.0',
      result: {
        accepted: 0,
        queued: 1,
        receivedAt: 10,
        duplicate: true,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });
  });

  it('dequeues native-riff-remove actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-remove-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'remove-action-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'removeFlashcards',
                blockIDs: ['block-a', 'block-b'],
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-remove-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-remove-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-a', 'block-b'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'remove-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('dequeues native-riff-upsert actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-upsert-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'upsert-action-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'addFlashcards',
                blockIDs: ['block-upsert-a', 'block-upsert-b'],
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-upsert-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-upsert-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-upsert',
          blockIds: ['block-upsert-a', 'block-upsert-b'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'upsert-action-key',
        }],
        remaining: 0,
      },
    });

    const status = await kernel.handle({
      id: 'status-upsert-action',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    if ('result' in status) {
      expect(status.result.ingest).toMatchObject({
        actionQueueLength: 0,
        actionEnqueuedTotal: 1,
        actionDequeuedTotal: 1,
        upsertActionQueuedTotal: 1,
      });
    }
  });

  it('dequeues auto-card-candidates actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-action-key',
        transactions: [
          {
            doOperations: [
              { action: 'insert', id: 'block-auto-1' },
              { action: 'update', id: 'block-auto-2' },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'insert', blockId: 'block-auto-1' },
            { action: 'update', blockId: 'block-auto-2' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('prefilters no-marker auto-card insert and update payloads in worker extraction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-prefilter',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-prefilter-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'insert',
                id: 'block-plain-insert',
                data: { new: { content: 'ordinary paragraph without marker' } },
              },
              {
                action: 'update',
                id: 'block-marker-update',
                data: { new: { content: 'question >> answer' } },
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-prefilter',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-prefilter',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'update', blockId: 'block-marker-update' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-prefilter-key',
        }],
        remaining: 0,
      },
    });
  });

  it('coalesces auto-card candidate operations for same block in worker extraction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-coalesce',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-coalesce-key',
        transactions: [
          {
            doOperations: [
              { action: 'insert', id: 'block-auto-c1' },
              { action: 'update', id: 'block-auto-c1' },
              { action: 'delete', id: 'block-auto-c1' },
              { action: 'insert', id: 'block-auto-c2' },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-coalesce',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-coalesce',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'insert', blockId: 'block-auto-c2' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-coalesce-key',
        }],
        remaining: 0,
      },
    });
  });

  it('coalesces mixed dequeue action batch inside worker before dispatch', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingestFirst = await kernel.handle({
      id: 'ingest-mixed-1',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'mixed-1',
        transactions: [{
          doOperations: [
            { action: 'removeFlashcards', blockIDs: ['block-rm-1'] },
            { action: 'addFlashcards', blockIDs: ['block-up-1'] },
            { action: 'insert', id: 'block-auto-x' },
          ],
        }],
      }],
    });
    expect('result' in ingestFirst).toBe(true);

    const ingestSecond = await kernel.handle({
      id: 'ingest-mixed-2',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'mixed-2',
        transactions: [{
          doOperations: [
            { action: 'removeFlashcards', blockIDs: ['block-rm-2'] },
            { action: 'addFlashcards', blockIDs: ['block-up-2'] },
            { action: 'delete', id: 'block-auto-x' },
            { action: 'update', id: 'block-auto-y' },
          ],
        }],
      }],
    });
    expect('result' in ingestSecond).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-mixed-coalesced',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 32 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-mixed-coalesced',
      jsonrpc: '2.0',
      result: {
        actions: [
          {
            type: 'native-riff-remove',
            blockIds: ['block-rm-1', 'block-rm-2'],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
          {
            type: 'native-riff-upsert',
            blockIds: ['block-up-1', 'block-up-2'],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
          {
            type: 'auto-card-candidates',
            operations: [
              { action: 'update', blockId: 'block-auto-y' },
            ],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
        ],
        remaining: 0,
      },
    });
  });

  it('supports kernel.transaction.requeue and keeps actions in queue', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const requeue = await kernel.handle({
      id: 'requeue-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.requeue',
      params: [{
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-rq-1'],
          source: 'ws-main',
          receivedAt: 1,
          idempotencyKey: 'rq-1',
        }],
      }],
    });
    expect(requeue).toEqual({
      id: 'requeue-action',
      jsonrpc: '2.0',
      result: {
        requeued: 1,
        queueLength: 1,
        maxQueueLength: 4096,
      },
    });

    const dequeue = await kernel.handle({
      id: 'dequeue-requeued-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-requeued-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-rq-1'],
          source: 'ws-main',
          receivedAt: 1,
          idempotencyKey: 'rq-1',
        }],
        remaining: 0,
      },
    });
  });

  it('restores persisted action queue snapshot across worker restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const databaseA = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelA = new BackendKernel({ database: databaseA });

    const ingest = await kernelA.handle({
      id: 'ingest-persisted-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'persisted-action-key',
        transactions: [{
          doOperations: [{ action: 'removeFlashcards', id: 'block-persist-1' }],
        }],
      }],
    });
    expect('result' in ingest).toBe(true);

    databaseA.dispose();

    const databaseB = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelB = new BackendKernel({ database: databaseB });
    const dequeue = await kernelB.handle({
      id: 'dequeue-persisted-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-persisted-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-persist-1'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'persisted-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('restores persisted ingest queue snapshot across worker restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const databaseA = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelA = new BackendKernel({ database: databaseA });

    const ingest = await kernelA.handle({
      id: 'ingest-persisted-inbox',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'persisted-inbox-key',
        transactions: [{ id: 'tx-persist-1' }],
      }],
    });
    expect(ingest).toEqual({
      id: 'ingest-persisted-inbox',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: expect.any(Number),
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    databaseA.dispose();

    const databaseB = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelB = new BackendKernel({ database: databaseB });
    const load = await kernelB.handle({
      id: 'load-persisted-inbox',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });
    expect('result' in load).toBe(true);
    const status = await kernelB.handle({
      id: 'status-persisted-inbox',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    if ('result' in status) {
      expect(status.result.ingest).toMatchObject({
        queueLength: 1,
        queuedTransactions: 1,
        acceptedTotal: 1,
      });
    }
  });

  it('returns explicit unavailable when kernel transaction ingest queue is backpressured', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 1,
    });
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-backpressure-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-1' }],
        receivedAt: 1,
        idempotencyKey: 'k1',
      }],
    });
    expect('result' in first).toBe(true);

    const second = await kernel.handle({
      id: 'ingest-backpressure-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-2' }],
        receivedAt: 2,
        idempotencyKey: 'k2',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-backpressure-second',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=1, limit=1)',
      },
    });
  });

  it('drains accepted ingest envelopes when transaction actions are dequeued', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 4,
    });
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-drain-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{
          doOperations: [{ action: 'insert', id: 'block-drain-1' }],
        }],
        receivedAt: 1,
        idempotencyKey: 'drain-first',
      }],
    });
    expect('result' in first).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-drain-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect('result' in dequeue).toBe(true);

    const second = await kernel.handle({
      id: 'ingest-drain-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{
          doOperations: [{ action: 'insert', id: 'block-drain-2' }],
        }],
        receivedAt: 2,
        idempotencyKey: 'drain-second',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-drain-second',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 2,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 1,
      },
    });
  });

  it('commits retrieval review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-review-1', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-success',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-1', rating: 3, queueType: 'retrieval-practice' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-review-1',
        committed: true,
        queueType: 'retrieval-practice',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('uses request scheduler config for review feedback scheduling', async () => {
    const reviewedAt = 1_700_200_000_000;
    const runWithRetention = async (id: string, requestRetention: number) => {
      const persistenceBridge = createInMemorySqlitePersistenceBridge();
      const database = new WorkerSqliteDatabaseService(persistenceBridge);
      await database.upsertCards([buildCard({
        id,
        due: reviewedAt - 10_000,
        lastReview: reviewedAt - 86_400_000,
        stability: 2,
        difficulty: 7,
        reps: 3,
        scheduledDays: 1,
      })]);
      const kernel = new BackendKernel({ database });
      const response = await kernel.handle({
        id: `review-feedback-${id}`,
        jsonrpc: '2.0',
        method: 'review.feedback',
        params: [{
          cardId: id,
          rating: 3,
          queueType: 'retrieval-practice',
          reviewedAt,
          scheduler: {
            defaultScheduler: 'fsrs-v6',
            fsrsParams: {
              ...DEFAULT_SETTINGS.fsrs,
              requestRetention,
              enableFuzz: false,
            },
          },
        }],
      });
      expect('result' in response).toBe(true);
      if (!('result' in response)) {
        throw new Error(response.error.message);
      }
      return response.result.updatedCard as FSRSCard;
    };

    const lowRetention = await runWithRetention('card-review-low-retention', 0.5);
    const highRetention = await runWithRetention('card-review-high-retention', 0.99);

    expect(lowRetention.scheduledDays).not.toBe(highRetention.scheduledDays);
  });

  it('commits incremental-learning review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-incremental-1', due: Date.now() - 20_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-incremental',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-incremental-1', rating: 2, queueType: 'incremental-learning' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-incremental-1',
        committed: true,
        queueType: 'incremental-learning',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('commits neural-roam formal review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-neural-1', due: Date.now() - 15_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-neural',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-neural-1', rating: 3, queueType: 'neural-roam' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-neural-1',
        committed: true,
        queueType: 'neural-roam',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('commits leech formal review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-leech-1', due: Date.now() - 18_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-leech',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-leech-1', rating: 2, queueType: 'leech' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-leech-1',
        committed: true,
        queueType: 'leech',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('supports final-drill drill-only feedback without schedule writes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-final-drill-1', due: Date.now() + 60_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-final-drill',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-final-drill-1', rating: 3, queueType: 'final-drill' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-final-drill-1',
        committed: false,
        queueType: 'final-drill',
        updatedCard: null,
      });
    }
  });

  it('supports filter-group preview-only review feedback without schedule writes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-filter-preview-1', due: Date.now() + 86_400_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-filter-preview',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-filter-preview-1',
        rating: 3,
        queueType: 'filter-group',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-filter-preview-1',
        committed: false,
        queueType: 'filter-group',
        updatedCard: null,
      });
    }
  });

  it('commits filter-group filtered-rescheduling review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-filter-reschedule-1', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-filter-reschedule',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-filter-reschedule-1',
        rating: 2,
        queueType: 'filter-group',
        queueMode: 'filtered-rescheduling',
        commitPolicy: 'write-schedule',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-filter-reschedule-1',
        committed: true,
        queueType: 'filter-group',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('reports review/queue parity diagnostics after ingest and review mutation', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-parity-1', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const ingest = await kernel.handle({
      id: 'ingest-parity',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'parity-key-1',
        transactions: [{ id: 'tx-parity-1' }],
      }],
    });
    expect('result' in ingest).toBe(true);

    const review = await kernel.handle({
      id: 'review-parity',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-parity-1', rating: 3, queueType: 'retrieval-practice' }],
    });
    expect('result' in review).toBe(true);

    const diagnostics = await kernel.handle({
      id: 'status-parity',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.ingest?.acceptedTotal).toBeGreaterThanOrEqual(1);
      expect(diagnostics.result.ingest?.queueLength).toBeGreaterThanOrEqual(1);
      expect(diagnostics.result.review?.feedbackTotal).toBeGreaterThanOrEqual(1);
    }
  });

  it('serves private read and private command methods with audit trail', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-private-1' })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const read = await kernel.handle({
      id: 'private-read-cards',
      jsonrpc: '2.0',
      method: 'private.read.cards',
      params: [{
        requestId: 'private-read-1',
        method: 'private.read.cards',
        callerIntent: 'test-private-read',
        limit: 5,
      }],
    });
    expect('result' in read).toBe(true);
    if ('result' in read) {
      expect(read.result).toMatchObject({
        ok: true,
        auditStatus: 'recorded',
      });
    }

    const mutate = await kernel.handle({
      id: 'private-command-execute',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-mutate-1',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-key-1',
        capabilityResult: authorizedPrivateCapability(),
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 20,
        },
      }],
    });
    expect('result' in mutate).toBe(true);
    if ('result' in mutate) {
      expect(mutate.result).toMatchObject({
        ok: true,
        commandId: 'private-mutate-1',
        changed: {
          blockIds: ['block-1'],
        },
        result: {
          operation: 'browser.sourceExistence.applySweepHost',
          idempotencyKey: 'private-key-1',
          committed: true,
          sweep: {
            checked: 1,
            updated: 1,
            changed: true,
            changedToMissing: false,
          },
        },
      });
    }

    const health = await kernel.handle({
      id: 'private-health',
      jsonrpc: '2.0',
      method: 'private.health',
      params: [],
    });
    expect('result' in health).toBe(true);
    if ('result' in health) {
      expect(health.result).toMatchObject({
        ok: true,
        feature: 'private-api',
      });
    }

    const diagnostics = await kernel.handle({
      id: 'private-diagnostics-status',
      jsonrpc: '2.0',
      method: 'private.diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result).toMatchObject({
        ok: true,
      });
    }

    const audit = await kernel.handle({
      id: 'private-audit-query',
      jsonrpc: '2.0',
      method: 'private.audit.query',
      params: [{
        requestId: 'private-audit-1',
        method: 'private.audit.query',
        callerIntent: 'test-private-audit',
        limit: 10,
      }],
    });
    expect('result' in audit).toBe(true);
    if ('result' in audit) {
      expect(Array.isArray(audit.result.data)).toBe(true);
      expect(audit.result.data.length).toBeGreaterThan(0);
    }
  });

  it('rejects direct private command calls without an authorized capability result', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'private-command-direct',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-direct-1',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-direct-key',
        params: { operation: 'browser.sourceExistence.applySweepHost' },
      }],
    });

    expect(response).toEqual({
      id: 'private-command-direct',
      jsonrpc: '2.0',
      error: {
        code: 'INVALID_REQUEST',
        message: 'private.command.execute requires authorized private API capability',
      },
    });
  });

  it('replays private command result for duplicate idempotency keys', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.upsertCards([buildCard({ id: 'card-private-replay', blockId: 'block-1' })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });
    const capabilityResult = authorizedPrivateCapability();

    const first = await kernel.handle({
      id: 'private-command-first',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-first',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-same-key',
        capabilityResult,
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 20,
        },
      }],
    });
    const second = await kernel.handle({
      id: 'private-command-second',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-second',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-same-key',
        capabilityResult,
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 30,
        },
      }],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in second) {
      expect(second.result.commandId).toBe('private-first');
      expect(second.result.changed).toMatchObject({
        blockIds: ['block-1'],
      });
      expect(second.result.result).toMatchObject({
        idempotencyKey: 'private-same-key',
        committed: true,
      });
    }
  });

  it('rejects unsupported private command operations', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'private-command-unknown',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-unknown',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-unknown-key',
        capabilityResult: authorizedPrivateCapability(),
        params: { operation: 'unknown.operation' },
      }],
    });

    expect(response).toEqual({
      id: 'private-command-unknown',
      jsonrpc: '2.0',
      error: {
        code: 'INVALID_REQUEST',
        message: 'unsupported private.command.execute operation: unknown.operation',
      },
    });
  });

  it('answers P6 ownership query and command contracts instead of METHOD_NOT_FOUND', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const query = await kernel.handle({
      id: 'p6-query',
      jsonrpc: '2.0',
      method: 'p6.ownership.query',
      params: [{
        requestId: 'p6-query-1',
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        payload: { blockId: 'block-1' },
      }],
    });
    const command = await kernel.handle({
      id: 'p6-command',
      jsonrpc: '2.0',
      method: 'p6.ownership.command',
      params: [{
        requestId: 'p6-command-1',
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        idempotencyKey: 'p6-command-key',
        payload: { blockId: 'block-1' },
      }],
    });

    expect('result' in query).toBe(true);
    if ('result' in query) {
      expect(query.result).toMatchObject({
        ok: true,
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        owner: 'compatibility-read',
        status: 'completed',
        unavailableClass: null,
      });
      expect(query.result.diagnosticEventId).toContain('p6-ownership:dialog-manager:read-block-meta');
    }
    expect('result' in command).toBe(true);
    if ('result' in command) {
      expect(command.result).toMatchObject({
        ok: true,
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        owner: 'writer-relay',
        status: 'completed',
        unavailableClass: null,
      });
      expect(command.result.diagnosticEventId).toContain('p6-ownership:autocard-scanner:execute-side-effect');
    }
  });
});
