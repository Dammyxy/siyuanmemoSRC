import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { QueueProjectionRuntime } from '../QueueProjectionRuntime';
import {
  getRuntimePerformanceDiagnosticsReport,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 86_400_000,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now - 86_400_000,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

function createRuntime(options: {
  backend?: any;
  follower?: any;
  frontendRuntime?: any;
  queueCards?: FSRSCard[];
  queueGetCards?: any;
  rolloutState?: (queueType: QueueType) => string | null | undefined;
  publishQueueProjectionIdentityBroadcast?: any;
} = {}) {
  const queueCards = options.queueCards ?? [createCard()];
  const queue = {
    getCards: options.queueGetCards ?? vi.fn(async () => queueCards),
  } as unknown as IReviewQueue;
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  };
  const runtime = new QueueProjectionRuntime({
    getBackendClient: () => options.backend,
    getFollowerCommandClient: () => options.follower,
    getFrontendRuntime: () => options.frontendRuntime,
    getQueue: () => queue,
    getQueueProjectionRolloutState: (queueType) => options.rolloutState?.(queueType) ?? null,
    publishQueueProjectionIdentityBroadcast: options.publishQueueProjectionIdentityBroadcast,
    logger,
  });
  return { queue, runtime, logger };
}

describe('QueueProjectionRuntime', () => {
  afterEach(() => {
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
  });

  it('returns ready, refreshing, and unavailable readiness outcomes explicitly', async () => {
    const readyBackend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: 'policy-ready',
        generation: 3,
        rows: [],
        counters: null,
      })),
    };
    await expect(createRuntime({ backend: readyBackend }).runtime.ensureReady({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    })).resolves.toEqual({
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-ready',
      generation: 3,
    });

    const refreshingBackend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.Leech,
        status: 'invalidated',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(() => new Promise(() => {})),
    };
    await expect(createRuntime({ backend: refreshingBackend }).runtime.ensureReady({
      queueType: QueueType.Leech,
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.Leech,
      cause: 'materialization_in_progress',
    });

    await expect(createRuntime({ backend: null }).runtime.ensureReady({
      queueType: 'missing-queue',
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'unavailable',
      queueId: 'missing-queue',
      cause: 'invalid_queue',
      recoverable: false,
    });
  });

  it('reports invalidated retrieval readiness without materializing projection', async () => {
    const card = createCard({
      id: 'retrieval-card',
      blockId: 'retrieval-block',
      due: 1_700_000_000_000,
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'retrieval projection' },
    });
    const backend = {
      queueProjectionSnapshot: vi.fn()
        .mockResolvedValueOnce({
          queueType: QueueType.RetrievalPractice,
          status: 'invalidated',
          policyHash: 'old-policy',
          generation: 7,
          rows: [],
          counters: null,
        })
        .mockResolvedValueOnce({
          queueType: QueueType.RetrievalPractice,
          status: 'ready',
          policyHash: 'queue-projection:{"cardType":"all","docId":null,"preset":"all","queueType":"retrieval-practice","scopeDocIds":[],"searchText":null,"source":"browser"}',
          generation: 8,
          rows: [],
          counters: null,
        }),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[] }) => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 8,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.RetrievalPractice,
          policyHash: request.policyHash,
          generation: request.generation ?? 8,
          version: request.generation ?? 8,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { queue, runtime } = createRuntime({
      backend,
      queueCards: [card],
    });

    await expect(runtime.ensureReady({
      queueType: QueueType.RetrievalPractice,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.RetrievalPractice,
      cause: 'materialization_in_progress',
    });

    expect(queue.getCards).not.toHaveBeenCalled();
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('hides locally deleted cards from ready backend projection snapshots and hydration', async () => {
    const deletedCard = createCard({
      id: 'deleted-card',
      blockId: 'deleted-block',
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'deleted projection' },
    });
    const activeCard = createCard({
      id: 'active-card',
      blockId: 'active-block',
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'active projection' },
    });
    const rows = [
      {
        id: 'deleted-row',
        fsrsCardId: deletedCard.id,
        blockId: deletedCard.blockId,
        deckId: 'deck-a',
        rootId: 'doc-a',
        content: 'deleted projection',
        fullContent: 'deleted projection',
        state: deletedCard.state,
        due: deletedCard.due,
        stability: deletedCard.stability,
        difficulty: deletedCard.difficulty,
        retrievability: 1,
        reps: deletedCard.reps,
        lapses: deletedCard.lapses,
        elapsedDays: deletedCard.elapsedDays,
        scheduledDays: deletedCard.scheduledDays,
        lastReview: deletedCard.lastReview,
        interval: deletedCard.scheduledDays,
        firstReview: null,
        priority: deletedCard.priority,
        suspended: false,
        cardType: deletedCard.type,
        queueIndex: 1,
        tags: [],
      },
      {
        id: 'active-row',
        fsrsCardId: activeCard.id,
        blockId: activeCard.blockId,
        deckId: 'deck-a',
        rootId: 'doc-a',
        content: 'active projection',
        fullContent: 'active projection',
        state: activeCard.state,
        due: activeCard.due,
        stability: activeCard.stability,
        difficulty: activeCard.difficulty,
        retrievability: 1,
        reps: activeCard.reps,
        lapses: activeCard.lapses,
        elapsedDays: activeCard.elapsedDays,
        scheduledDays: activeCard.scheduledDays,
        lastReview: activeCard.lastReview,
        interval: activeCard.scheduledDays,
        firstReview: null,
        priority: activeCard.priority,
        suspended: false,
        cardType: activeCard.type,
        queueIndex: 2,
        tags: [],
      },
    ];
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: 'policy-ready',
        generation: 11,
        rows,
        counters: {
          queueType: QueueType.RetrievalPractice,
          policyHash: 'policy-ready',
          generation: 11,
          version: 11,
          remaining: 2,
          due: 2,
          total: 2,
          buckets: { all: 2, item: 2, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: 'policy-ready',
        generation: 11,
        rows,
        cards: [deletedCard, activeCard],
        freshness: null,
        cacheState: 'ready-populated',
      })),
    };
    const { runtime } = createRuntime({ backend });

    runtime.recordLocalCardDeletionProjectionInvalidation([deletedCard.id], [deletedCard.blockId]);

    const snapshot = await runtime.readSnapshot(QueueType.RetrievalPractice);
    expect(snapshot?.rows.map((row) => row.fsrsCardId)).toEqual(['active-card']);
    expect(snapshot?.counters).toMatchObject({
      remaining: 1,
      due: 1,
      total: 1,
      buckets: { all: 1, item: 1 },
    });

    await expect(runtime.getCardsBySnapshotIds(
      QueueType.RetrievalPractice,
      ['deleted-card', 'active-card'],
    )).resolves.toEqual([activeCard]);
  });

  it('reports missing derived-cache readiness without materializing projection', async () => {
    const card = createCard({
      id: 'missing-cache-card',
      blockId: 'missing-cache-block',
      due: 1_700_000_000_000,
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'missing cache projection' },
    });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'refreshing',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
        cacheState: 'missing-derived-cache',
      })),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[]; reason?: string }) => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 1,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.RetrievalPractice,
          policyHash: request.policyHash,
          generation: request.generation ?? 1,
          version: request.generation ?? 1,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { queue, runtime } = createRuntime({
      backend,
      queueCards: [card],
    });

    await expect(runtime.ensureReady({
      queueType: QueueType.RetrievalPractice,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.RetrievalPractice,
      cause: 'missing_derived_cache',
    });

    expect(queue.getCards).not.toHaveBeenCalled();
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
    expect(runtime.getRolloutDiagnostics(QueueType.RetrievalPractice)).toEqual([
      expect.objectContaining({
        queueType: QueueType.RetrievalPractice,
        state: 'projection-unavailable',
        reason: 'refresh-required',
        unavailableReason: 'missing_derived_cache',
      }),
    ]);
  });

  it('does not require replace backend for passive missing derived-cache readiness', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'refreshing',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
        cacheState: 'missing-derived-cache',
      })),
    };
    const { runtime } = createRuntime({ backend });

    await expect(runtime.ensureReady({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.RetrievalPractice,
      cause: 'missing_derived_cache',
    });
    expect(runtime.getRolloutDiagnostics(QueueType.RetrievalPractice)).toEqual([
      expect.objectContaining({
        state: 'projection-unavailable',
        reason: 'refresh-required',
        unavailableReason: 'missing_derived_cache',
        backendStatus: 'refreshing',
      }),
    ]);
  });

  it('does not start overlapping readiness materialization for the same queue policy', async () => {
    const queueGetCards = vi.fn(() => new Promise<FSRSCard[]>((resolve) => {
      resolve([createCard({ id: 'dedup-card', blockId: 'dedup-block' })]);
    }));
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'invalidated',
        policyHash: 'dedup-policy',
        generation: 4,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[] }) => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 5,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.RetrievalPractice,
          policyHash: request.policyHash,
          generation: request.generation ?? 5,
          version: request.generation ?? 5,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { runtime } = createRuntime({
      backend,
      queueGetCards,
    });

    const first = runtime.ensureReady({
      queueType: QueueType.RetrievalPractice,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    });
    const second = runtime.ensureReady({
      queueType: QueueType.RetrievalPractice,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
      }),
      expect.objectContaining({
        status: 'refreshing',
        queueId: QueueType.RetrievalPractice,
      }),
    ]);

    expect(queueGetCards).not.toHaveBeenCalled();
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('does not start sequential slow readiness materialization retries for the same queue policy', async () => {
    const pendingResolvers: Array<(cards: FSRSCard[]) => void> = [];
    const queueGetCards = vi.fn(() => new Promise<FSRSCard[]>((resolve) => {
      pendingResolvers.push(resolve);
    }));
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.IncrementalLearning,
        status: 'invalidated',
        policyHash: 'incremental-policy',
        generation: 4,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[] }) => ({
        queueType: QueueType.IncrementalLearning,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 5,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.IncrementalLearning,
          policyHash: request.policyHash,
          generation: request.generation ?? 5,
          version: request.generation ?? 5,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { runtime } = createRuntime({
      backend,
      queueGetCards,
    });

    const first = runtime.ensureReady({
      queueType: QueueType.IncrementalLearning,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    });
    await expect(first).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.IncrementalLearning,
    });

    const second = runtime.ensureReady({
      queueType: QueueType.IncrementalLearning,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    });
    await expect(second).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.IncrementalLearning,
    });

    expect(queueGetCards).not.toHaveBeenCalled();
    expect(pendingResolvers).toHaveLength(0);
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('reports invalidated filter-group readiness without materializing projection', async () => {
    const card = createCard({
      id: 'filter-card',
      blockId: 'filter-block',
      due: 1_700_000_000_000,
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'filter projection' },
    });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[] }) => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 1,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: request.policyHash,
          generation: request.generation ?? 1,
          version: request.generation ?? 1,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { queue, runtime } = createRuntime({
      backend,
      queueCards: [card],
    });

    await expect(runtime.ensureReady({
      queueType: QueueType.FilterGroup,
      preset: 'all',
      cardType: 'all',
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.FilterGroup,
      cause: 'materialization_in_progress',
    });

    expect(queue.getCards).not.toHaveBeenCalled();
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('preserves submitted FilterGroup identity in materialized projection policy and row metadata', async () => {
    const manualCard = createCard({
      id: 'manual-card',
      blockId: 'manual-block',
      due: 1_700_000_000_000,
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'manual filter projection' },
    });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: any[] }) => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 1,
        rows: request.rows.length,
        counters: null,
      })),
    };
    const { runtime } = createRuntime({
      backend,
      queueCards: [manualCard],
    });

    await expect(runtime.materialize(QueueType.FilterGroup, null, {
      readinessRequest: {
      queueType: QueueType.FilterGroup,
      source: 'browser',
      filterHash: 'filter-hash-a',
      manualCardIds: ['manual-card'],
      temporaryBlacklistIds: ['hidden-card'],
      customOrder: ['manual-card'],
      transferSessionId: 'transfer-a',
      sessionId: 'session-a',
      commitPolicy: 'write-schedule',
      },
    })).resolves.toMatchObject({
      status: 'ready',
      queueType: QueueType.FilterGroup,
    });

    const replaceRequest = backend.queueProjectionReplace.mock.calls[0]?.[0];
    expect(replaceRequest.policyHash).toContain('"filterHash":"filter-hash-a"');
    expect(replaceRequest.policyHash).toContain('"manualCardIds":["manual-card"]');
    expect(replaceRequest.policyHash).toContain('"temporaryBlacklistIds":["hidden-card"]');
    expect(replaceRequest.policyHash).toContain('"customOrder":["manual-card"]');
    expect(replaceRequest.rows[0]?.payload).toMatchObject({
      queueKind: 'filter-group',
      filterHash: 'filter-hash-a',
      transferSessionId: 'transfer-a',
      commitPolicy: 'write-schedule',
      membershipSource: 'manual',
      sessionTransferActive: true,
    });
  });

  it('does not materialize invalidated projection during forced snapshot reads for queue counters', async () => {
    const card = createCard({
      id: 'incremental-card',
      blockId: 'incremental-block',
      due: 1_700_000_000_000,
      meta: { rootId: 'doc-a', deckId: 'deck-a', content: 'incremental projection' },
    });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.IncrementalLearning,
        status: 'invalidated',
        policyHash: 'old-policy',
        generation: 9,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[] }) => ({
        queueType: QueueType.IncrementalLearning,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 10,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.IncrementalLearning,
          policyHash: request.policyHash,
          generation: request.generation ?? 10,
          version: request.generation ?? 10,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { queue, runtime } = createRuntime({
      backend,
      queueCards: [card],
    });

    await expect(runtime.readSnapshot(QueueType.IncrementalLearning, { forceRefresh: true }))
      .resolves.toBeNull();
    expect(queue.getCards).not.toHaveBeenCalled();
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('does not emit local repair identity events for non-ready projections', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
    };
    const { runtime } = createRuntime({ backend });
    const events: unknown[] = [];
    runtime.subscribeLiveIdentityEvents((event) => events.push(event));

    await runtime.readSnapshot(QueueType.FilterGroup);

    expect(events).toEqual([]);
  });

  it('emits refreshed live identity once and suppresses unavailable ready events', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: 'policy-ready',
        generation: 4,
        rows: [],
        counters: null,
      })),
    };
    const { runtime } = createRuntime({ backend });
    const events: unknown[] = [];
    runtime.subscribeLiveIdentityEvents((event) => events.push(event));

    await runtime.ensureReady({ queueType: QueueType.RetrievalPractice, source: 'browser' });
    await runtime.ensureReady({ queueType: QueueType.RetrievalPractice, source: 'browser' });
    await createRuntime({ backend: null }).runtime.ensureReady({
      queueType: 'missing-queue',
      source: 'browser',
    });

    expect(events).toEqual([
      expect.objectContaining({
        queueType: QueueType.RetrievalPractice,
        policyId: 'policy-ready',
        generation: 4,
        reason: 'refreshed',
      }),
    ]);
  });

  it('broadcasts local ready identities and accepts remote identities without projection writes', async () => {
    const publishQueueProjectionIdentityBroadcast = vi.fn();
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: 'policy-ready',
        generation: 4,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(),
    };
    const { runtime } = createRuntime({ backend, publishQueueProjectionIdentityBroadcast });
    const events: unknown[] = [];
    runtime.subscribeLiveIdentityEvents((event) => events.push(event));

    await runtime.ensureReady({ queueType: QueueType.RetrievalPractice, source: 'browser' });
    const accepted = runtime.acceptRemoteLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-ready',
      generation: 5,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 20,
      diagnosticEventId: 'remote-event',
    });
    const duplicate = runtime.acceptRemoteLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-ready',
      generation: 5,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 21,
      diagnosticEventId: 'remote-event-duplicate',
    });

    expect(publishQueueProjectionIdentityBroadcast).toHaveBeenCalledTimes(1);
    expect(publishQueueProjectionIdentityBroadcast).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-ready',
      generation: 4,
    }));
    expect(accepted).toBe(true);
    expect(duplicate).toBe(false);
    expect(events).toEqual([
      expect.objectContaining({ generation: 4 }),
      expect.objectContaining({ generation: 5, diagnosticEventId: 'remote-event' }),
    ]);
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('clones snapshots and hydrates backend rows in requested order', async () => {
    const rows = [
      { id: 'row-a', fsrsCardId: 'card-a', blockId: 'block-a', deckId: '', tags: ['a'] },
    ];
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'policy-a',
        generation: 1,
        rows,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: 'policy-a',
          generation: 1,
          version: 1,
          remaining: 1,
          due: 1,
          total: 1,
          buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1,
        },
      })),
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'policy-a',
        generation: 1,
        rows: [],
        cards: [
          createCard({ id: 'card-b', blockId: 'block-b' }),
          createCard({ id: 'card-a', blockId: 'block-a' }),
        ],
      })),
    };
    const { runtime } = createRuntime({ backend });

    const snapshot = await runtime.readSnapshot(QueueType.FilterGroup);
    snapshot?.rows[0].tags.push('mutated');

    await expect(runtime.readSnapshot(QueueType.FilterGroup))
      .resolves.toMatchObject({ rows: [expect.objectContaining({ tags: ['a'] })] });
    await expect(runtime.getCardsBySnapshotIds(QueueType.FilterGroup, ['row-b', 'row-a']))
      .resolves.toEqual([
        expect.objectContaining({ id: 'card-b' }),
        expect.objectContaining({ id: 'card-a' }),
      ]);
  });

  it('reports unavailable row hydration without strategy fallback', async () => {
    const backend = {
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: 'policy-old',
        generation: 4,
        rows: [],
        cards: [],
      })),
    };
    const { runtime } = createRuntime({ backend });

    await expect(runtime.getCardsBySnapshotIds(QueueType.FilterGroup, ['repair-card']))
      .resolves.toEqual([]);
    expect(backend.queueProjectionRowsByIds).toHaveBeenCalledTimes(1);
    expect(backend.queueProjectionReplace).toBeUndefined();

    const unavailableRuntime = createRuntime({
      backend: {
        queueProjectionRowsByIds: vi.fn(async () => {
          throw new Error('rows down');
        }),
      },
    }).runtime;
    await expect(unavailableRuntime.getCardsBySnapshotIds(QueueType.FilterGroup, ['row-a']))
      .rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');
  });

  it('does not repair stale row hydration through writer relay on follower windows', async () => {
    const card = createCard({
      id: 'relay-card',
      blockId: 'relay-block',
      due: 1_700_000_000_000,
      priority: 30,
    });
    const backend = {
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        policyHash: 'policy-stale',
        generation: 4,
        rows: [],
        cards: [],
        freshness: {
          checkedAt: 1_700_000_100_000,
          totalRows: 1,
          freshRows: 0,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['relay-card'],
          missingCardIds: [],
        },
      })),
      queueProjectionReplace: vi.fn(),
    };
    const follower = {
      submitAndWait: vi.fn(async ({ params }: { params: { policyHash: string; generation: number; rows: unknown[] } }) => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: params.policyHash,
        generation: params.generation,
        rows: params.rows.length,
        counters: null,
      })),
    };
    const { queue, runtime } = createRuntime({
      backend,
      follower,
      frontendRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'follower-a',
      },
      queueCards: [card],
    });

    await expect(runtime.getCardsBySnapshotIds(QueueType.FilterGroup, ['relay-card']))
      .resolves.toEqual([]);
    expect(queue.getCards).not.toHaveBeenCalled();
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
    expect(follower.submitAndWait).not.toHaveBeenCalled();
  });

  it('relays explicit priority-source projection materialization from follower windows', async () => {
    const card = createCard({
      id: 'priority-card',
      blockId: 'priority-block',
      priority: 18,
    });
    const backend = {
      queueProjectionReplace: vi.fn(async () => {
        throw new Error('follower must not write projection locally');
      }),
    };
    const follower = {
      submitAndWait: vi.fn(async ({ params }: { params: { policyHash: string; generation: number; rows: unknown[] } }) => ({
        queueType: QueueType.IncrementalLearning,
        status: 'ready',
        policyHash: params.policyHash,
        generation: params.generation,
        rows: params.rows.length,
        counters: null,
      })),
    };
    const { queue, runtime } = createRuntime({
      backend,
      follower,
      frontendRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'follower-priority',
      },
      queueCards: [card],
    });

    await expect(runtime.materialize(QueueType.IncrementalLearning)).resolves.toMatchObject({
      status: 'ready',
      queueType: QueueType.IncrementalLearning,
      rows: 1,
    });

    expect(queue.getCards).toHaveBeenCalledTimes(1);
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
    expect(follower.submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-priority',
      method: 'queue.projection.replace',
      params: expect.objectContaining({
        queueType: QueueType.IncrementalLearning,
        rows: [
          expect.objectContaining({
            cardId: 'priority-card',
            priorityScore: 18,
          }),
        ],
      }),
    }));
  });

  it('records materialization phase diagnostics for slow queue projection repair', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    const card = createCard({
      id: 'diagnostic-card',
      blockId: 'diagnostic-block',
    });
    const backend = {
      queueProjectionReplace: vi.fn(async (request: { policyHash: string; generation?: number | null; rows: unknown[] }) => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: request.policyHash,
        generation: request.generation ?? 1,
        rows: request.rows.length,
        counters: null,
      })),
    };
    const { runtime } = createRuntime({
      backend,
      queueCards: [card],
    });

    await expect(runtime.materialize(QueueType.RetrievalPractice)).resolves.toMatchObject({
      status: 'ready',
      rows: 1,
    });

    const report = getRuntimePerformanceDiagnosticsReport();
    expect(report.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'browser',
        operation: 'queue-projection.materialize.get-cards',
        metadata: expect.objectContaining({
          queueType: QueueType.RetrievalPractice,
          reason: 'explicit-repair',
        }),
      }),
      expect.objectContaining({
        path: 'browser',
        operation: 'queue-projection.materialize.build-rows',
        metadata: expect.objectContaining({
          queueType: QueueType.RetrievalPractice,
          cardCount: 1,
        }),
      }),
      expect.objectContaining({
        path: 'browser',
        operation: 'queue-projection.materialize.replace',
        metadata: expect.objectContaining({
          queueType: QueueType.RetrievalPractice,
          rowCount: 1,
        }),
      }),
      expect.objectContaining({
        path: 'browser',
        operation: 'queue-projection.materialize.total',
        metadata: expect.objectContaining({
          queueType: QueueType.RetrievalPractice,
          status: 'ready',
          cardCount: 1,
          rowCount: 1,
        }),
      }),
    ]));
  });

  it('records freshness evidence in rollout diagnostics when projection rows are stale', async () => {
    const staleCardIds = Array.from({ length: 10 }, (_, index) => `card-stale-${index}`);
    const missingCardIds = Array.from({ length: 10 }, (_, index) => `card-missing-${index}`);
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        policyHash: 'policy-stale',
        generation: 12,
        rows: [],
        counters: {
          remaining: 4,
          due: 2,
          total: 5,
          source: 'backend-snapshot',
        },
        cacheState: 'projection-stale',
        freshness: {
          checkedAt: 1_700_000_100_000,
          totalRows: 2,
          freshRows: 1,
          staleRows: 1,
          missingRows: 1,
          staleCardIds,
          missingCardIds,
        },
      })),
    };
    const { runtime, logger } = createRuntime({ backend });

    await expect(runtime.readSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(runtime.getRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        state: 'projection-unavailable',
        policyHash: 'policy-stale',
        generation: 12,
        cacheState: 'projection-stale',
        freshness: expect.objectContaining({
          staleRows: 1,
          missingRows: 1,
          staleCardIds,
          missingCardIds,
        }),
      }),
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      '[SiYuanMemo][QueueProjectionRuntime] Queue projection snapshot not ready',
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        unavailableReason: 'projection_stale',
        policyHash: 'policy-stale',
        policyHashValid: true,
        generation: 12,
        generationValid: true,
        cacheState: 'projection-stale',
        counters: expect.objectContaining({
          remaining: 4,
          due: 2,
          total: 5,
          source: 'backend-snapshot',
        }),
        freshness: expect.objectContaining({
          staleRows: 1,
          missingRows: 1,
          staleCardIds: staleCardIds.slice(0, 8),
          missingCardIds: missingCardIds.slice(0, 8),
        }),
      }),
    );
  });

  it('builds rollout diagnostics from runtime-owned unavailable state and capability checks', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => {
        throw new Error('snapshot down');
      }),
    };
    const { runtime } = createRuntime({
      backend,
      rolloutState: (queueType) => queueType === QueueType.Leech ? 'existing-queue-strategy' : null,
    });

    await expect(runtime.readSnapshot(QueueType.FilterGroup)).rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');

    expect(runtime.getRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'projection-unavailable',
        unavailableReason: 'snapshot down',
      }),
    ]);
    expect(runtime.getRolloutDiagnostics(QueueType.Leech)).toEqual([
      expect.objectContaining({
        queueType: QueueType.Leech,
        projectionBacked: false,
        state: 'existing-queue-strategy',
        readPath: 'existing-queue-strategy',
      }),
    ]);
    expect(createRuntime({ backend: { neuralRoamAdvance: vi.fn() } }).runtime.getRolloutDiagnostics(QueueType.NeuralRoam)).toEqual([
      expect.objectContaining({
        queueType: QueueType.NeuralRoam,
        state: 'backend-advance',
        readPath: 'backend-advance',
        reason: 'advance-backed',
      }),
    ]);
  });
});
