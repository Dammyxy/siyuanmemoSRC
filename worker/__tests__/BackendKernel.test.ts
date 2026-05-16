import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
} from '../../packages/contracts/src/backend-rpc';

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

async function seedQueueProjection(database: WorkerSqliteDatabaseService, input: {
  queueType?: string;
  policyHash?: string;
  generation?: number;
  rows: FSRSCard[];
  updatedAt?: number;
}): Promise<void> {
  const queueType = input.queueType ?? 'retrieval-practice';
  const policyHash = input.policyHash ?? 'policy-a';
  const generation = input.generation ?? 1;
  const updatedAt = input.updatedAt ?? 1_700_000_100_000;
  await database.runTransaction('seed.queue-projection', (db) => {
    db.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [queueType, policyHash, generation, 'ready', null, updatedAt, '{}'],
    );
    db.run(
      `INSERT OR REPLACE INTO queue_projection_counters
        (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        queueType,
        policyHash,
        generation,
        generation,
        input.rows.length,
        input.rows.length,
        input.rows.length,
        JSON.stringify({
          all: input.rows.length,
          item: input.rows.filter((card) => card.type === CardType.Item).length,
          descriptor: input.rows.filter((card) => card.type === CardType.Descriptor).length,
          topic: input.rows.filter((card) => card.type === CardType.Topic).length,
          concept: input.rows.filter((card) => card.type === CardType.Concept).length,
        }),
        updatedAt,
      ],
    );
    for (const [index, card] of input.rows.entries()) {
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
           priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queueType,
          card.id,
          card.id,
          card.blockId,
          null,
          'review-due',
          card.due,
          card.due <= updatedAt ? 'overdue' : 'due',
          card.priority ?? 50,
          `${String(index + 1).padStart(9, '0')}:${card.id}`,
          index + 1,
          policyHash,
          generation,
          JSON.stringify({ cardType: card.type, rowId: card.id }),
          updatedAt,
        ],
      );
    }
  });
}

async function seedNeuralRoamHyperspaceSource(
  database: WorkerSqliteDatabaseService,
  sourceId = 'neural-source-1',
  storageKey = 'neuralRoamQueue',
): Promise<void> {
  await database.setQueueStateValue(storageKey, {
    version: 8,
    engineMode: 'hyperspace',
    orbit: {
      seedPool: [],
      anchorPool: [],
      session: {},
    },
    hyperspace: {
      sourcePool: [{
        nodeId: sourceId,
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: 1_700_000_000_000,
        visitedAt: 0,
        nodePreview: 'Neural source',
      }],
      anchorPool: [],
      session: {
        displayPath: [],
        displayPathEventIds: [],
        currentPathIndex: -1,
        navigationMode: 'source',
        bookmarkPathIndex: null,
        history: [],
        currentLeadSource: null,
        currentLeadSourceEventId: null,
        branchRootNodeId: null,
        currentSessionId: null,
        visitedBlocks: [],
        frontier: [],
        exhaustedSources: [],
      },
    },
    pendingAssociatedReviewCardIds: [],
    seenAssociatedReviewCardIds: [],
  });
}

function createNeuralGraphResolver(
  dataByBlockId: Record<string, { id: string; content: string; type: string; parent_id?: string; root_id?: string }>,
) {
  return vi.fn(async (
    request: BackendNeuralGraphQueryRequest,
  ): Promise<BackendNeuralGraphQueryResult> => {
    if (request.operation === 'fetchBlockData') {
      const block = dataByBlockId[request.blockId];
      return block
        ? { status: 'found', blockId: request.blockId, data: block, error: null }
        : { status: 'known-missing', blockId: request.blockId, data: null, error: null };
    }
    if (request.operation === 'isConceptCard') {
      return {
        status: 'found',
        blockId: request.blockId,
        data: request.blockId.includes('source'),
        error: null,
      };
    }
    if (request.operation === 'fetchNodePriority') {
      return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
    }
    return { status: 'found', blockId: request.blockId, data: [], error: null };
  });
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

  it('serves projection-backed queue snapshots and row hydration from worker projection storage', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardA = buildCard({
      id: 'projection-card-a',
      blockId: 'projection-block-a',
      due: 1_700_000_000_000,
      priority: 20,
      meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
    });
    const cardB = buildCard({
      id: 'projection-card-b',
      blockId: 'projection-block-b',
      due: 1_700_000_100_000,
      priority: 80,
      meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
    });
    await database.upsertCards([cardA, cardB]);
    await seedQueueProjection(database, {
      generation: 3,
      rows: [cardB, cardA],
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'retrieval-practice' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        status: 'ready',
        counters: {
          generation: 3,
          remaining: 2,
        },
      });
      expect(snapshot.result.rows.map((row: { fsrsCardId: string; queueIndex?: number }) => ({
        fsrsCardId: row.fsrsCardId,
        queueIndex: row.queueIndex,
      }))).toEqual([
        { fsrsCardId: 'projection-card-b', queueIndex: 1 },
        { fsrsCardId: 'projection-card-a', queueIndex: 2 },
      ]);
    }

    const rowsByIds = await kernel.handle({
      id: 'projection-rows-by-ids',
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{ queueType: 'retrieval-practice', ids: ['projection-card-a', 'projection-card-b'] }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        'projection-card-a',
        'projection-card-b',
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-card-a',
        'projection-card-b',
      ]);
    }
  });

  it('filters known missing source rows from projection snapshot and row hydration', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const activeCard = buildCard({
      id: 'projection-active-card',
      blockId: 'projection-active-block',
      due: 1_700_000_000_000,
    });
    const missingCard = buildCard({
      id: 'projection-missing-card',
      blockId: 'projection-missing-block',
      due: 1_700_000_000_000,
    });
    const unknownCard = buildCard({
      id: 'projection-unknown-card',
      blockId: 'projection-unknown-block',
      due: 1_700_000_000_000,
    });
    await database.upsertCards([activeCard, missingCard, unknownCard]);
    await database.updateSourceExistence([
      { blockId: activeCard.blockId, exists: true },
      { blockId: missingCard.blockId, exists: false },
    ], 1_700_000_100_000);
    await seedQueueProjection(database, {
      queueType: 'incremental-learning',
      generation: 9,
      rows: [activeCard, missingCard, unknownCard],
      updatedAt: 1_700_000_100_000,
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-active-source-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'incremental-learning' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-active-card',
        'projection-unknown-card',
      ]);
      expect(snapshot.result.counters).toMatchObject({
        remaining: 2,
        total: 2,
      });
    }

    const rowsByIds = await kernel.handle({
      id: 'projection-active-source-rows-by-ids',
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{
        queueType: 'incremental-learning',
        ids: ['projection-active-card', 'projection-missing-card', 'projection-unknown-card'],
      }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        'projection-active-card',
        'projection-unknown-card',
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-active-card',
        'projection-unknown-card',
      ]);
    }
  });

  it('invalidates projection generations when source existence changes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-invalidated-card',
      blockId: 'projection-invalidated-block',
      due: 1_700_000_000_000,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'final-drill',
      generation: 3,
      rows: [card],
      updatedAt: 1_700_000_100_000,
    });
    await database.updateSourceExistence([
      { blockId: card.blockId, exists: false },
    ], 1_700_000_200_000);
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-invalidated-source-change',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'final-drill' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'final-drill',
        status: 'invalidated',
        rows: [],
      });
    }
  });

  it('replaces missing queue projection generation through explicit backend materialization', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-rebuild-card',
      blockId: 'projection-rebuild-block',
      due: 1_700_000_000_000,
      priority: 42,
      meta: { content: 'projection rebuild', rootId: 'doc-rebuild', deckId: 'deck-rebuild' },
    });
    await database.upsertCards([card]);
    const kernel = new BackendKernel({ database });

    const before = await kernel.handle({
      id: 'projection-replace-before',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'leech' }],
    });
    expect('result' in before).toBe(true);
    if ('result' in before) {
      expect(before.result).toMatchObject({
        queueType: 'leech',
        status: 'unavailable',
        generation: null,
      });
    }

    const replace = await kernel.handle({
      id: 'projection-replace',
      jsonrpc: '2.0',
      method: 'queue.projection.replace' as never,
      params: [{
        queueType: 'leech',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        rows: [{
          queueType: 'leech',
          rowId: card.id,
          cardId: card.id,
          blockId: card.blockId,
          deckId: 'deck-rebuild',
          membershipReason: 'materialized-strategy',
          dueAt: card.due,
          dueBucket: 'overdue',
          priorityScore: card.priority,
          sortKey: `000000001:${card.id}`,
          queueIndexHint: 1,
          policyHash: 'materialized-leech-v1',
          sourceGeneration: 1,
          payload: { queueKind: 'leech', source: 'application-materialized' },
          updatedAt: 1_700_000_100_000,
        }],
        reason: 'snapshot-refresh',
      }],
    });
    expect('result' in replace).toBe(true);
    if ('result' in replace) {
      expect(replace.result).toMatchObject({
        queueType: 'leech',
        status: 'ready',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        rows: 1,
        counters: {
          remaining: 1,
          total: 1,
        },
      });
    }

    const after = await kernel.handle({
      id: 'projection-replace-after',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'leech' }],
    });
    expect('result' in after).toBe(true);
    if ('result' in after) {
      expect(after.result).toMatchObject({
        queueType: 'leech',
        status: 'ready',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        counters: {
          remaining: 1,
          total: 1,
        },
      });
      expect(after.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-rebuild-card',
      ]);
    }
  });

  it.each([
    'filter-group',
    'final-drill',
    'leech',
    'neural-roam',
  ])('serves deferred queue projection snapshots and row hydration from worker storage for %s', async (queueType) => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardA = buildCard({
      id: `${queueType}-projection-card-a`,
      blockId: `${queueType}-projection-block-a`,
      due: 1_700_000_000_000,
      priority: 20,
      meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
    });
    const cardB = buildCard({
      id: `${queueType}-projection-card-b`,
      blockId: `${queueType}-projection-block-b`,
      due: 1_700_000_100_000,
      priority: 80,
      meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
    });
    await database.upsertCards([cardA, cardB]);
    await seedQueueProjection(database, {
      queueType,
      generation: 7,
      rows: [cardB, cardA],
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: `${queueType}-projection-snapshot`,
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType,
        policyHash: 'policy-a',
        generation: 7,
        status: 'ready',
        counters: {
          generation: 7,
          remaining: 2,
        },
      });
      expect(snapshot.result.rows.map((row: { fsrsCardId: string; queueIndex?: number }) => ({
        fsrsCardId: row.fsrsCardId,
        queueIndex: row.queueIndex,
      }))).toEqual([
        { fsrsCardId: `${queueType}-projection-card-b`, queueIndex: 1 },
        { fsrsCardId: `${queueType}-projection-card-a`, queueIndex: 2 },
      ]);
    }

    const rowsByIds = await kernel.handle({
      id: `${queueType}-projection-rows-by-ids`,
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{
        queueType,
        ids: [`${queueType}-projection-card-a`, `${queueType}-projection-card-b`],
      }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        `${queueType}-projection-card-a`,
        `${queueType}-projection-card-b`,
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        `${queueType}-projection-card-a`,
        `${queueType}-projection-card-b`,
      ]);
    }
  });

  it('advances neural-roam through backend graph query and persisted session state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-1');
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'neural-source-1': {
        id: 'neural-source-1',
        content: 'Neural source content',
        type: 'p',
        root_id: 'doc-neural',
      },
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-success',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          cardId: 'neural-source-1',
          blockId: 'neural-source-1',
          sourceKind: 'virtual',
        },
        counters: {
          sourceNodes: 1,
        },
        sessionState: {
          engineMode: 'hyperspace',
          currentNodeId: 'neural-source-1',
          exhausted: false,
        },
        queueState: {
          version: 8,
          engineMode: 'hyperspace',
          hyperspace: {
            session: expect.objectContaining({
              history: expect.arrayContaining([
                expect.objectContaining({
                  nodeId: 'neural-source-1',
                }),
              ]),
            }),
          },
        },
      });
    }
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'fetchBlockData',
      blockId: 'neural-source-1',
    }));
  });

  it('continues neural-roam from request current virtual item when persisted session lost current path', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-1');
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: request.blockId === 'neural-source-1' ? 'Neural source content' : 'Neighbor content',
            type: 'p',
            root_id: 'doc-neural',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-source-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-neighbor-1' ? 0.7 : 0.9,
          error: null,
        };
      }
      if (request.operation === 'fetchHyperspaceEdges') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-source-1'
            ? [{
              nodeId: 'neural-neighbor-1',
              associationType: 'concept-link',
              weight: 12,
              channel: 'concept-map',
              origin: 'backlink',
              distance: 1,
              sourcePriority: 0.9,
              targetPriority: 0.7,
              rootId: 'doc-neural',
            }]
            : [],
          error: null,
        };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-virtual-repair',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: {
          id: 'neural-source-1',
          cardId: 'neural-source-1',
          blockId: 'neural-source-1',
          sourceKind: 'virtual',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'neural-neighbor-1',
          sourceKind: 'virtual',
        },
        sessionState: {
          engineMode: 'hyperspace',
          currentNodeId: 'neural-neighbor-1',
          exhausted: false,
        },
      });
      expect(response.result.queueState).toMatchObject({
        hyperspace: {
          session: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({ nodeId: 'neural-source-1' }),
              expect.objectContaining({ nodeId: 'neural-neighbor-1' }),
            ]),
          }),
        },
      });
    }
  });

  it('returns exhausted neural-roam advance when backend session has no graph item', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-exhausted',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'empty-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        nextItem: null,
        unavailableReason: null,
        sessionState: {
          exhausted: true,
        },
      });
    }
  });

  it('starts backend neural-roam advance from requested concept focus', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'concept-source-1': {
        id: 'concept-source-1',
        content: 'Concept source',
        type: 'p',
      },
      'old-source-1': {
        id: 'old-source-1',
        content: 'Old source',
        type: 'p',
      },
    });
    await seedNeuralRoamHyperspaceSource(database, 'old-source-1');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-start-focus',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'concept-source-1',
          includeFocusAsFirst: true,
          startNewSession: true,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'concept-source-1',
        },
        sessionState: {
          currentNodeId: 'concept-source-1',
          pathLength: 1,
        },
      });
    }
  });

  it('returns explicit unavailable when neural-roam graph query authority is absent', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'neural-advance-unavailable',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'session-no-graph',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'unavailable',
        nextItem: null,
        unavailableReason: 'advance-contract-unavailable',
      });
    }
  });

  it('returns neural-roam generation mismatch without local advance', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedQueueProjection(database, {
      queueType: 'neural-roam',
      policyHash: 'neural-policy-current',
      generation: 5,
      rows: [],
    });
    const resolveNeuralGraphQuery = createNeuralGraphResolver({});
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-generation-mismatch',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'session-stale',
        projectionGeneration: 4,
        policyHash: 'neural-policy-current',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'mismatch',
        nextItem: null,
        unavailableReason: 'generation-mismatch',
        projectionImpact: expect.objectContaining({
          refreshRequired: true,
        }),
      });
    }
    expect(resolveNeuralGraphQuery).not.toHaveBeenCalled();
  });

  it('returns neural-roam current item unavailable when source is known missing', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const current = buildCard({
      id: 'missing-neural-card',
      blockId: 'missing-neural-block',
    });
    await database.upsertCards([current]);
    await database.updateSourceExistence([
      { blockId: current.blockId, exists: false },
    ], 1_700_000_200_000);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-after-missing');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'neural-source-after-missing': {
          id: 'neural-source-after-missing',
          content: 'Next available source',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-source-missing',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: {
          id: current.id,
          cardId: current.id,
          blockId: current.blockId,
          sourceKind: 'associated-review',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'unavailable',
        unavailableReason: 'source-block-missing',
        nextItem: {
          blockId: 'neural-source-after-missing',
        },
      });
    }
  });

  it('keeps neural-roam virtual item rating practice-only without formal SRS commit', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const virtualShadow = buildCard({
      id: 'virtual-shadow-card',
      blockId: 'virtual-shadow-block',
      due: reviewedAt - 10_000,
      reps: 2,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([virtualShadow]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-virtual-rating',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'virtual-session',
        currentItem: {
          id: virtualShadow.id,
          cardId: virtualShadow.id,
          blockId: virtualShadow.blockId,
          sourceKind: 'virtual',
        },
        feedback: {
          action: 'rate',
          rating: 4,
        },
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        projectionImpact: null,
      });
    }
    const after = await database.getCard(virtualShadow.id);
    expect(after?.reps).toBe(2);
    expect(after?.lastReview).toBe(reviewedAt - 86_400_000);
  });

  it('commits neural-roam associated review feedback through backend review ownership', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const associated = buildCard({
      id: 'neural-associated-card',
      blockId: 'neural-associated-block',
      due: reviewedAt - 10_000,
      reps: 1,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([associated]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-associated-rating',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'associated-session',
        currentItem: {
          id: associated.id,
          cardId: associated.id,
          blockId: associated.blockId,
          sourceKind: 'associated-review',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        projectionImpact: expect.objectContaining({
          refreshRequired: true,
        }),
      });
    }
    const after = await database.getCard(associated.id);
    expect(after?.reps).toBe(2);
    expect(after?.lastReview).toBe(reviewedAt);
  });

  it('replays duplicate neural-roam advance idempotency keys without double-committing associated reviews', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const associated = buildCard({
      id: 'neural-associated-idempotent-card',
      blockId: 'neural-associated-idempotent-block',
      due: reviewedAt - 10_000,
      reps: 1,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([associated]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });
    const request = {
      queueType: 'neural-roam',
      sessionId: 'associated-idempotent-session',
      idempotencyKey: 'neural-associated-same-key',
      currentItem: {
        id: associated.id,
        cardId: associated.id,
        blockId: associated.blockId,
        sourceKind: 'associated-review',
      },
      feedback: {
        action: 'rate',
        rating: 3,
      },
      reviewedAt,
    };

    const first = await kernel.handle({
      id: 'neural-advance-associated-idempotent-first',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [request],
    });
    const second = await kernel.handle({
      id: 'neural-advance-associated-idempotent-second',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [request],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in first && 'result' in second) {
      expect(second.result).toEqual(first.result);
    }
    const after = await database.getCard(associated.id);
    expect(after?.reps).toBe(2);
  });

  it('imports old neural-roam queue state into an absent backend session', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'legacy-neural-source', 'neuralRoamQueue');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'legacy-neural-source': {
          id: 'legacy-neural-source',
          content: 'Legacy source content',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-import-old-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'imported-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'advanced',
        nextItem: {
          blockId: 'legacy-neural-source',
        },
      });
    }
    const imported = await database.getQueueStateValue<{ version?: number }>('neuralRoamQueue:imported-session');
    expect(imported?.version).toBe(8);
  });

  it('keeps existing backend neural-roam session state ahead of old default state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'legacy-neural-source', 'neuralRoamQueue');
    await seedNeuralRoamHyperspaceSource(database, 'backend-neural-source', 'neuralRoamQueue:kept-session');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'legacy-neural-source': {
          id: 'legacy-neural-source',
          content: 'Legacy source content',
          type: 'p',
        },
        'backend-neural-source': {
          id: 'backend-neural-source',
          content: 'Backend source content',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-keeps-backend-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'kept-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'advanced',
        nextItem: {
          blockId: 'backend-neural-source',
        },
      });
    }
  });

  it('resets corrupted old neural-roam state into v8 backend session state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.setQueueStateValue('neuralRoamQueue', {
      broken: true,
      version: 'not-a-neural-roam-state',
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-corrupted-old-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'corrupted-import-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'exhausted',
        nextItem: null,
        unavailableReason: null,
      });
    }
    const imported = await database.getQueueStateValue<{ version?: number }>('neuralRoamQueue:corrupted-import-session');
    expect(imported?.version).toBe(8);
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

  it('returns refresh-required queue impact when the projection generation is unavailable', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-impact-unavailable', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-projection-unavailable',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-impact-unavailable', rating: 3, queueType: 'retrieval-practice' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: false,
          refreshRequired: true,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            reason: 'projection-unavailable',
            refreshRequired: true,
          }],
        },
      });
    }
  });

  it('returns refresh-required queue impact when requested projection generation is stale', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({ id: 'card-impact-generation', due: reviewedAt - 10_000 });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      generation: 5,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-generation-mismatch',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-generation',
        rating: 3,
        queueType: 'retrieval-practice',
        projectionGeneration: 4,
        projectionPolicyHash: 'policy-a',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: false,
          refreshRequired: true,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            reason: 'generation-mismatch',
            currentGeneration: 6,
            requestedGeneration: 4,
            refreshRequired: true,
          }],
        },
      });
    }
    const counters = database.getOne<{ generation: number; version: number }>(
      'SELECT generation, version FROM queue_projection_counters WHERE queue_type = ? AND policy_hash = ?',
      ['retrieval-practice', 'policy-a'],
    );
    expect(counters).toMatchObject({ generation: 6, version: 6 });
  });

  it('updates projection rows and counter generation when reviewed card leaves retrieval queue', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-impact-remove',
      blockId: 'block-impact-remove',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-remove',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-remove',
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            generation: 2,
            removedRowIds: ['card-impact-remove'],
            counterGeneration: 2,
            counters: {
              version: 2,
              remaining: 0,
              total: 0,
            },
          }],
        },
      });
    }
    const remainingRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      ['retrieval-practice', 'card-impact-remove'],
    );
    expect(remainingRow?.count).toBe(0);
  });

  it('rebuilds projection feedback impact from active-source cards only', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewed = buildCard({
      id: 'card-impact-active-source',
      blockId: 'block-impact-active-source',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    const staleMissing = buildCard({
      id: 'card-impact-missing-source',
      blockId: 'block-impact-missing-source',
      due: reviewedAt - 5_000,
    });
    await database.upsertCards([reviewed, staleMissing]);
    await database.updateSourceExistence([
      { blockId: staleMissing.blockId, exists: false },
    ], reviewedAt - 1_000);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [reviewed, staleMissing],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-active-source-build',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: reviewed.id,
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      const affectedQueue = response.result.queueImpact?.affectedQueues[0];
      expect(affectedQueue).toMatchObject({
        queueType: 'retrieval-practice',
        generation: 2,
        counters: {
          remaining: 0,
          total: 0,
        },
      });
      expect(affectedQueue?.removedRowIds).toEqual(expect.arrayContaining([
        reviewed.id,
        staleMissing.id,
      ]));
    }

    const missingRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      ['retrieval-practice', staleMissing.id],
    );
    expect(missingRow?.count).toBe(0);
  });

  it('returns updated row and reorder hint when remaining retrieval row moves forward', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-impact-reorder',
      blockId: 'block-impact-reorder',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 1,
      difficulty: 9,
      reps: 2,
    });
    const peer = buildCard({
      id: 'card-impact-reorder-peer',
      blockId: 'block-impact-reorder-peer',
      due: reviewedAt - 5_000,
      priority: 30,
    });
    await database.upsertCards([card, peer]);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [card, peer],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-reorder',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-reorder',
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            generation: 2,
            removedRowIds: ['card-impact-reorder'],
            counterGeneration: 2,
          }],
        },
      });
      const affectedQueue = response.result.queueImpact?.affectedQueues[0];
      expect(affectedQueue?.updatedRows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rowId: 'card-impact-reorder-peer',
          cardId: 'card-impact-reorder-peer',
        }),
      ]));
      expect(affectedQueue?.reorderHints).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rowId: 'card-impact-reorder-peer',
        }),
      ]));
    }
  });

  it.each([
    {
      queueType: 'filter-group',
      committed: false,
      params: {
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      },
    },
    {
      queueType: 'final-drill',
      committed: false,
      params: {
        rating: 4,
      },
    },
    {
      queueType: 'leech',
      committed: true,
      params: {
        rating: 3,
      },
    },
    {
      queueType: 'neural-roam',
      committed: true,
      params: {
        rating: 3,
      },
    },
  ])('returns hot-patch queue impact for deferred projection-backed $queueType feedback', async ({ queueType, committed, params }) => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: `card-impact-${queueType}`,
      blockId: `block-impact-${queueType}`,
      due: reviewedAt - 10_000,
    });
    const peer = buildCard({
      id: `card-impact-${queueType}-peer`,
      blockId: `block-impact-${queueType}-peer`,
      due: reviewedAt - 5_000,
    });
    await database.upsertCards([card, peer]);
    await seedQueueProjection(database, {
      queueType,
      generation: 2,
      rows: [card, peer],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: `review-feedback-impact-${queueType}`,
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 3,
        queueType,
        projectionGeneration: 2,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
        ...params,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType,
            generation: 3,
            removedRowIds: [card.id],
            counterGeneration: 3,
            counters: {
              version: 3,
              remaining: 1,
              total: 1,
            },
          }],
        },
      });
    }
    const removedRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      [queueType, card.id],
    );
    expect(removedRow?.count).toBe(0);
  });

  it('moves low-rated final-drill projection row to tail without schedule writes', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-final-drill-impact-low',
      blockId: 'block-final-drill-impact-low',
      due: reviewedAt + 60_000,
    });
    const peer = buildCard({
      id: 'card-final-drill-impact-peer',
      blockId: 'block-final-drill-impact-peer',
      due: reviewedAt + 120_000,
    });
    await database.upsertCards([card, peer]);
    await seedQueueProjection(database, {
      queueType: 'final-drill',
      generation: 6,
      rows: [card, peer],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-final-drill-low',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 2,
        queueType: 'final-drill',
        projectionGeneration: 6,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: false,
        updatedCard: null,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'final-drill',
            generation: 7,
            removedRowIds: [],
            counterGeneration: 7,
            counters: {
              remaining: 2,
              total: 2,
            },
          }],
        },
      });
      const affectedQueue = response.result.queueImpact?.affectedQueues[0];
      expect(affectedQueue?.updatedRows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rowId: 'card-final-drill-impact-low',
          cardId: 'card-final-drill-impact-low',
          queueIndexHint: 2,
        }),
      ]));
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

  it('executes writer-owned semantic activation commands through the backend database owner', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const start = await kernel.handle({
      id: 'semantic-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'node-root',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in start).toBe(true);
    if (!('result' in start)) {
      throw new Error('semantic start did not return result');
    }
    expect(start.result).toMatchObject({
      status: 'ok',
      commandId: 'semantic-start-1',
      changed: {
        semanticSessionIds: ['semantic-session-1'],
      },
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'node-root',
        currentNodeId: 'node-root',
        activeLens: 'assimilation',
      },
      event: {
        type: 'node-visited',
      },
      events: [
        { type: 'session-started' },
        { type: 'node-visited' },
      ],
    });

    const follow = await kernel.handle({
      id: 'semantic-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-session-1',
          candidateId: 'node-next',
          lens: 'free',
        },
      }],
    });
    expect('result' in follow).toBe(true);
    if ('result' in follow) {
      expect(follow.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'node-next',
          activeLens: 'free',
        },
        event: {
          type: 'node-visited',
          nodeId: 'node-next',
        },
        events: [
          { type: 'lens-switched' },
          { type: 'edge-traversed' },
          { type: 'node-visited' },
        ],
      });
    }

    const station = await kernel.handle({
      id: 'semantic-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-session-1',
          stationType: 'node',
        },
      }],
    });
    expect('result' in station).toBe(true);
    if ('result' in station) {
      expect(station.result).toMatchObject({
        status: 'ok',
        station: {
          type: 'node',
          sessionId: 'semantic-session-1',
          nodeId: 'node-next',
        },
      });
    }

    const pathStation = await kernel.handle({
      id: 'semantic-path-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-path-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-path-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-session-1',
          stationType: 'path',
        },
      }],
    });
    expect('result' in pathStation).toBe(true);
    if ('result' in pathStation) {
      expect(pathStation.result).toMatchObject({
        status: 'ok',
        station: {
          type: 'path',
          sessionId: 'semantic-session-1',
          nodeId: null,
          path: [
            { nodeId: 'node-root', lens: 'assimilation' },
            { nodeId: 'node-next', lens: 'free' },
          ],
          lensHistory: ['assimilation', 'free'],
        },
      });
    }

    const relation = await kernel.handle({
      id: 'semantic-relation',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-relation-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-relation-key',
        command: {
          type: 'accept-relation',
          sessionId: 'semantic-session-1',
          relationId: 'relation-1',
          fromNodeId: 'node-root',
          toNodeId: 'node-next',
          confidence: 0.8,
          reason: 'accepted by user',
        },
      }],
    });
    expect('result' in relation).toBe(true);
    if ('result' in relation) {
      expect(relation.result).toMatchObject({
        status: 'ok',
        relation: {
          relationId: 'relation-1',
          decision: 'accepted',
          source: 'ai',
        },
        event: {
          type: 'ai-relation-accepted',
        },
      });
    }

    const implicitAction = await kernel.handle({
      id: 'semantic-implicit-action',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-implicit-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-implicit-key',
        command: {
          type: 'record-implicit-node-action',
          sessionId: 'semantic-session-1',
          nodeId: 'implicit-node-1',
          action: 'expand',
        },
      }],
    });
    expect('result' in implicitAction).toBe(true);
    if ('result' in implicitAction) {
      expect(implicitAction.result).toMatchObject({
        status: 'ok',
        event: {
          type: 'implicit-node-action',
          nodeId: 'implicit-node-1',
          payload: {
            action: 'expand',
          },
        },
      });
    }

    const projectionRow = database.getOne<{
      session_id: string | null;
      node_memory_json: string;
      edge_memory_json: string;
    }>(
      `SELECT session_id, node_memory_json, edge_memory_json
       FROM semantic_projection_cache
       WHERE projection_key = ?`,
      ['semantic-session-1'],
    );
    expect(projectionRow?.session_id).toBe('semantic-session-1');
    const nodeMemory = JSON.parse(projectionRow?.node_memory_json ?? '[]') as Array<Record<string, unknown>>;
    const edgeMemory = JSON.parse(projectionRow?.edge_memory_json ?? '[]') as Array<Record<string, unknown>>;
    expect(nodeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'node-root',
      }),
      expect.objectContaining({
        nodeId: 'node-next',
      }),
      expect.objectContaining({
        nodeId: 'implicit-node-1',
      }),
    ]));
    expect(edgeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromNodeId: 'node-root',
        toNodeId: 'node-next',
        traversalCount: 1,
      }),
    ]));

    const ended = await kernel.handle({
      id: 'semantic-end',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-end-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-end-key',
        command: {
          type: 'end-session',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in ended).toBe(true);
    if ('result' in ended) {
      expect(ended.result).toMatchObject({
        status: 'ok',
        session: {
          sessionId: 'semantic-session-1',
          endedAt: expect.any(Number),
        },
        event: {
          type: 'session-ended',
        },
      });
    }

    const restored = await kernel.handle({
      id: 'semantic-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-restore-key',
        command: {
          type: 'restore-session',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in restored).toBe(true);
    if ('result' in restored) {
      expect(restored.result).toMatchObject({
        status: 'ok',
        session: {
          sessionId: 'semantic-session-1',
          rootFocusNodeId: 'node-root',
          currentNodeId: 'node-next',
          activeLens: 'free',
          endedAt: expect.any(Number),
        },
      });
    }

    const replay = await kernel.handle({
      id: 'semantic-start-replay',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-start-2',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'other-root',
          sessionId: 'semantic-session-2',
        },
      }],
    });
    expect('result' in replay).toBe(true);
    if ('result' in replay) {
      expect(replay.result).toMatchObject({
        status: 'ok',
        commandId: 'semantic-start-1',
        session: {
          sessionId: 'semantic-session-1',
        },
      });
    }
  });

  it('returns explicit semantic session unavailable instead of fallback writes', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'semantic-missing-session',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-missing-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-missing-key',
        command: {
          type: 'create-station',
          sessionId: 'missing-session',
          stationType: 'node',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'unavailable',
        unavailableReason: 'session-unavailable',
      });
    }
  });

  it('archives semantic stations and restores path stations without replaying traversal events', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-restore-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root',
          sessionId: 'semantic-restore-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-restore-follow-a',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-follow-a-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-follow-a-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-restore-session',
          candidateId: 'node-a',
          lens: 'free',
        },
      }],
    });
    const pathStation = await kernel.handle({
      id: 'semantic-restore-path-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-path-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-path-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-restore-session',
          stationType: 'path',
        },
      }],
    });
    expect('result' in pathStation).toBe(true);
    await kernel.handle({
      id: 'semantic-restore-follow-b',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-follow-b-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-follow-b-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-restore-session',
          candidateId: 'node-b',
          lens: 'accommodation',
        },
      }],
    });

    const beforeRestoreEdges = database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM semantic_events WHERE session_id = ? AND event_type = ?`,
      ['semantic-restore-session', 'edge-traversed'],
    )?.count ?? 0;
    const restored = await kernel.handle({
      id: 'semantic-path-station-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-path-station-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-path-station-restore-key',
        command: {
          type: 'restore-path-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in restored).toBe(true);
    if ('result' in restored) {
      expect(restored.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'node-a',
          narrativePath: [
            { nodeId: 'root', lens: 'assimilation' },
            { nodeId: 'node-a', lens: 'free' },
          ],
        },
        event: {
          type: 'station-restored',
        },
      });
    }
    const afterRestoreEdges = database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM semantic_events WHERE session_id = ? AND event_type = ?`,
      ['semantic-restore-session', 'edge-traversed'],
    )?.count ?? 0;
    expect(afterRestoreEdges).toBe(beforeRestoreEdges);

    const archived = await kernel.handle({
      id: 'semantic-station-archive',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-station-archive-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-station-archive-key',
        command: {
          type: 'archive-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in archived).toBe(true);
    if ('result' in archived) {
      expect(archived.result).toMatchObject({
        status: 'ok',
        archivedStationId: 'semantic-station:semantic-restore-path-station-1',
        station: {
          archivedAt: expect.any(Number),
        },
        event: {
          type: 'station-archived',
        },
      });
    }

    const archivedRestore = await kernel.handle({
      id: 'semantic-archived-station-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-archived-station-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-archived-station-restore-key',
        command: {
          type: 'restore-path-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in archivedRestore).toBe(true);
    if ('result' in archivedRestore) {
      expect(archivedRestore.result).toMatchObject({
        status: 'failed',
        unavailableReason: 'inactive-station',
      });
    }
  });

  it('serves Browser Semantic read models without UI SQL and scopes stations to the current root', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-browser-root-a-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-a',
          sessionId: 'semantic-browser-session-a',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-a-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-browser-session-a',
          candidateId: 'old-node-a',
          lens: 'free',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-a-node-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-node-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-node-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-browser-session-a',
          stationType: 'node',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-b-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-b-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-b-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-b',
          sessionId: 'semantic-browser-session-b',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-b-node-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-b-node-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-b-node-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-browser-session-b',
          stationType: 'node',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-browser-read-root-a',
      jsonrpc: '2.0',
      method: 'semantic.browser.read' as never,
      params: [{
        requestId: 'semantic-browser-read-root-a-1',
        method: 'semantic.browser.read',
        callerIntent: 'test-semantic-browser-read',
        rootFocusNodeId: 'root-a',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        activeSession: {
          sessionId: 'semantic-browser-session-a',
          rootFocusNodeId: 'root-a',
          currentNodeId: 'old-node-a',
        },
        session: {
          sessionId: 'semantic-browser-session-a',
        },
        rootNode: {
          nodeId: 'root-a',
          nodeType: 'concept',
        },
        currentNode: {
          nodeId: 'old-node-a',
        },
      });
      expect(response.result.rootScopedStations.map((station: { sessionId: string }) => station.sessionId)).toEqual([
        'semantic-browser-session-a',
      ]);
      expect(response.result.stations.map((station: { stationId: string }) => station.stationId)).toEqual([
        'semantic-station:semantic-browser-root-a-node-station-1',
      ]);
      expect(response.result.candidates.free.map((candidate: { candidateId: string }) => candidate.candidateId)).not.toContain('root-b');
    }
  });

  it('uses old neural-roam pools as read-only semantic projection boosts', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const oldState = {
      version: 8,
      engineMode: 'hyperspace',
      orbit: {
        seedPool: [{ nodeId: 'old-orbit-seed', priority: 0.5, label: 'Orbit seed' }],
        anchorPool: [{ nodeId: 'old-orbit-anchor', priority: 1, label: 'Orbit anchor' }],
        session: { active: false },
      },
      hyperspace: {
        sourcePool: [{ nodeId: 'old-hyperspace-source', priority: 0.25, label: 'Hyperspace source' }],
        anchorPool: [{ nodeId: 'old-hyperspace-anchor', priority: 0.75, label: 'Hyperspace anchor' }],
        session: { active: false },
      },
      pendingAssociatedReviewCardIds: ['card-pending'],
      seenAssociatedReviewCardIds: ['card-seen'],
    };
    await database.setQueueStateValue('neuralRoamQueue', oldState);
    const before = await database.getQueueStateValue('neuralRoamQueue');
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'semantic-old-mode-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-old-mode-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-old-mode',
        idempotencyKey: 'semantic-old-mode-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'semantic-root',
          sessionId: 'semantic-old-mode-session',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        changed: {
          semanticSessionIds: ['semantic-old-mode-session'],
        },
      });
    }
    await expect(database.getQueueStateValue('neuralRoamQueue')).resolves.toEqual(before);
    const projectionRow = database.getOne<{
      node_memory_json: string;
      edge_memory_json: string;
    }>(
      `SELECT node_memory_json, edge_memory_json
       FROM semantic_projection_cache
       WHERE projection_key = ?`,
      ['semantic-old-mode-session'],
    );
    const nodeMemory = JSON.parse(projectionRow?.node_memory_json ?? '[]') as Array<Record<string, unknown>>;
    const edgeMemory = JSON.parse(projectionRow?.edge_memory_json ?? '[]') as Array<Record<string, unknown>>;
    expect(edgeMemory).toEqual([]);
    for (const nodeId of ['old-orbit-seed', 'old-orbit-anchor', 'old-hyperspace-source', 'old-hyperspace-anchor']) {
      const node = nodeMemory.find((entry) => entry.nodeId === nodeId);
      expect(node?.manualBoost).toBeGreaterThan(0);
      expect(node?.oldKnowledgeScore).toBeGreaterThan(0);
    }
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
