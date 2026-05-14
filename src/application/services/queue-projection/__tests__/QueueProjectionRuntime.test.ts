import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { QueueProjectionRuntime } from '../QueueProjectionRuntime';

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
  rolloutState?: (queueType: QueueType) => string | null | undefined;
  publishQueueProjectionIdentityBroadcast?: any;
} = {}) {
  const queueCards = options.queueCards ?? [createCard()];
  const queue = {
    getCards: vi.fn(async () => queueCards),
  } as unknown as IReviewQueue;
  const runtime = new QueueProjectionRuntime({
    getBackendClient: () => options.backend,
    getFollowerCommandClient: () => options.follower,
    getFrontendRuntime: () => options.frontendRuntime,
    getQueue: () => queue,
    getQueueProjectionRolloutState: (queueType) => options.rolloutState?.(queueType) ?? null,
    publishQueueProjectionIdentityBroadcast: options.publishQueueProjectionIdentityBroadcast,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  });
  return { queue, runtime };
}

describe('QueueProjectionRuntime', () => {
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
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(() => new Promise(() => {})),
    };
    await expect(createRuntime({ backend: refreshingBackend }).runtime.ensureReady({
      queueType: QueueType.FilterGroup,
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.FilterGroup,
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

  it('materializes through writer relay and serves same-generation echo for snapshot and rows', async () => {
    const card = createCard({
      id: 'echo-card',
      blockId: 'echo-block',
      meta: { content: 'echo content', deckId: 'deck-echo', rootId: 'doc-echo' },
    });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        policyHash: null,
        generation: null,
        rows: [],
        cards: [],
      })),
      queueProjectionReplace: vi.fn(async () => {
        throw new Error('local replace must not run');
      }),
    };
    const follower = {
      submitAndWait: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'filter-policy',
        generation: 2,
        rows: 1,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: 'filter-policy',
          generation: 2,
          version: 2,
          remaining: 1,
          due: 1,
          total: 1,
          buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { runtime } = createRuntime({
      backend,
      follower,
      frontendRuntime: { getMode: () => 'follower', getInstanceId: () => 'follower-a' },
      queueCards: [card],
    });

    const snapshot = await runtime.readSnapshot(QueueType.FilterGroup);
    expect(snapshot).toMatchObject({
      policyHash: 'filter-policy',
      generation: 2,
      rows: [expect.objectContaining({ fsrsCardId: 'echo-card', blockId: 'echo-block' })],
    });
    expect(follower.submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      method: 'queue.projection.replace',
      params: expect.objectContaining({
        queueType: QueueType.FilterGroup,
        rows: [expect.objectContaining({ cardId: 'echo-card' })],
      }),
    }));
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();

    await expect(runtime.getCardsBySnapshotIds(
      QueueType.FilterGroup,
      snapshot?.rows.map((row) => row.id) ?? [],
    )).resolves.toEqual([expect.objectContaining({ id: 'echo-card' })]);
    expect(backend.queueProjectionRowsByIds).not.toHaveBeenCalled();
  });

  it('clears materialized echo after explicit invalidation', async () => {
    const card = createCard({ id: 'clear-card', blockId: 'clear-block' });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'filter-policy',
        generation: 1,
        rows: [],
        cards: [createCard({ id: 'backend-card', blockId: 'backend-block' })],
      })),
      queueProjectionReplace: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'filter-policy',
        generation: 1,
        rows: 1,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: 'filter-policy',
          generation: 1,
          version: 1,
          remaining: 1,
          due: 1,
          total: 1,
          buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const { runtime } = createRuntime({ backend, queueCards: [card] });

    const snapshot = await runtime.readSnapshot(QueueType.FilterGroup);
    const rowIds = snapshot?.rows.map((row) => row.id) ?? [];
    await expect(runtime.getCardsBySnapshotIds(QueueType.FilterGroup, rowIds))
      .resolves.toEqual([expect.objectContaining({ id: 'clear-card' })]);

    runtime.clearMaterializedProjectionEcho(QueueType.FilterGroup);

    await expect(runtime.getCardsBySnapshotIds(QueueType.FilterGroup, rowIds))
      .resolves.toEqual([expect.objectContaining({ id: 'backend-card' })]);
    expect(backend.queueProjectionRowsByIds).toHaveBeenCalledTimes(1);
  });

  it('emits content-free live identity events for materialized and invalidated projections', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: null,
        generation: null,
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'filter-policy',
        generation: 1,
        rows: 1,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: 'filter-policy',
          generation: 1,
          version: 1,
          remaining: 1,
          due: 1,
          total: 1,
          buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1,
        },
      })),
    };
    const { runtime } = createRuntime({ backend, queueCards: [createCard({ id: 'event-card' })] });
    const events: unknown[] = [];
    runtime.subscribeLiveIdentityEvents((event) => events.push(event));

    await runtime.readSnapshot(QueueType.FilterGroup);
    runtime.clearMaterializedProjectionEcho(QueueType.FilterGroup);

    expect(events).toEqual([
      expect.objectContaining({
        type: 'queue-projection-live-identity',
        queueId: QueueType.FilterGroup,
        queueType: QueueType.FilterGroup,
        policyId: 'filter-policy',
        generation: 1,
        reason: 'materialized',
        source: 'backend',
      }),
      expect.objectContaining({
        type: 'queue-projection-live-identity',
        queueId: QueueType.FilterGroup,
        queueType: QueueType.FilterGroup,
        policyId: null,
        generation: null,
        reason: 'echo-cleared',
        source: 'runtime',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('event-card');
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

  it('repairs non-ready row hydration and reports unavailable without strategy fallback', async () => {
    const card = createCard({ id: 'repair-card', blockId: 'repair-block' });
    const backend = {
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        policyHash: 'policy-old',
        generation: 4,
        rows: [],
        cards: [],
      })),
      queueProjectionReplace: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'policy-old',
        generation: 5,
        rows: 1,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: 'policy-old',
          generation: 5,
          version: 5,
          remaining: 1,
          due: 1,
          total: 1,
          buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1,
        },
      })),
    };
    const { runtime } = createRuntime({ backend, queueCards: [card] });

    await expect(runtime.getCardsBySnapshotIds(QueueType.FilterGroup, ['repair-card']))
      .resolves.toEqual([expect.objectContaining({ id: 'repair-card' })]);

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
