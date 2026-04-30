import { describe, expect, it } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { CardState, CardType, type FSRSCard } from '@/types/card';

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
    expect(statusResponse).toEqual({
      id: 'status',
      jsonrpc: '2.0',
      result: {
        runtime: 'srs-backend-worker',
        initialized: true,
        dbFile: 'siyuanmemo.db',
      },
    });
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

    const reviewFeedbackResponse = await kernel.handle({
      id: 'review-feedback',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-1', rating: 3, queueType: 'final-drill' }],
    });
    expect(reviewFeedbackResponse).toEqual({
      id: 'review-feedback',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for queueType in current phase: final-drill',
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
});
