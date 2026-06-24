import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType, type IDataRouter } from '@/types/unified-data-source';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { UnifiedDataSourceManager } from '../UnifiedDataSourceManager';

function createRouterWithBackend(
  backend: unknown,
  options: {
    rolloutState?: (queueType: QueueType) => string | null | undefined;
    frontendRuntime?: unknown;
    followerCommandClient?: unknown;
  } = {},
): IDataRouter {
  const plugin = {
    getContext: () => ({
      getSrsBackendClient: () => backend,
      getQueueProjectionRolloutState: options.rolloutState,
      getFrontendInstanceRuntime: () => options.frontendRuntime,
      getFollowerCommandClient: () => options.followerCommandClient,
    }),
  };

  return {
    plugin,
    getCard: vi.fn(),
    getCards: vi.fn(async () => []),
    updateCard: vi.fn(async () => {}),
    deleteCard: vi.fn(async () => {}),
    getAvailableQueueTypes: vi.fn(() => Object.values(QueueType)),
  } as unknown as IDataRouter;
}

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

function createProjectionSnapshotRow(card: FSRSCard, rowId = card.id, queueIndex = 1) {
  return {
    id: rowId,
    fsrsCardId: card.id,
    blockId: card.blockId,
    deckId: 'deck-a',
    rootId: 'doc-a',
    content: String(card.meta?.content || card.id),
    fullContent: String(card.meta?.content || card.id),
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability: 1,
    reps: card.reps,
    lapses: card.lapses,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    lastReview: card.lastReview,
    interval: card.scheduledDays,
    firstReview: null,
    priority: card.priority,
    suspended: false,
    cardType: card.type,
    queueIndex,
    tags: [],
  };
}

function createProjectionCounters(total: number) {
  return {
    queueType: QueueType.RetrievalPractice,
    policyHash: 'policy-ready',
    generation: 11,
    version: 11,
    remaining: total,
    due: total,
    total,
    buckets: { all: total, item: total, descriptor: 0, topic: 0, concept: 0 },
    updatedAt: 1_700_000_100_000,
  };
}

describe('UnifiedDataSourceManager queue projection rollout diagnostics', () => {
  beforeEach(() => {
    UnifiedDataSourceManager.resetInstance();
  });

  it('reports projection-backed review queues as backend-projection by default', () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(null));

    const diagnostics = manager.getQueueProjectionRolloutDiagnostics();
    const diagnosticByQueue = new Map(diagnostics.map((entry) => [entry.queueType, entry]));

    for (const queueType of [
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
      QueueType.FilterGroup,
      QueueType.FinalDrill,
      QueueType.Leech,
    ]) {
      expect(diagnosticByQueue.get(queueType)).toMatchObject({
        queueType,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      });
    }

    expect(diagnosticByQueue.get(QueueType.NeuralRoam)).toMatchObject({
      queueType: QueueType.NeuralRoam,
      projectionBacked: false,
      state: 'advance-contract-unavailable',
      readPath: 'existing-queue-strategy',
      reason: 'advance-contract-unavailable',
      unavailableReason: 'advance-contract-unavailable',
    });
  });

  it('reports neural-roam as advance-backed only when backend advance capability exists', () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend({
      neuralRoamAdvance: vi.fn(),
    }));

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.NeuralRoam)).toEqual([
      expect.objectContaining({
        queueType: QueueType.NeuralRoam,
        projectionBacked: false,
        state: 'backend-advance',
        readPath: 'backend-advance',
        reason: 'advance-backed',
        unavailableReason: null,
      }),
    ]);
  });

  it('reacquires writer lease before relaying neural-roam advance from stale follower mode', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    const backendResult = {
      queueType: 'neural-roam',
      sessionId: null,
      status: 'exhausted',
      nextItem: null,
      counters: {
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
      sessionState: {
        sessionId: null,
        engineMode: null,
        currentNodeId: null,
        currentEventId: null,
        pathLength: 0,
        visitedCount: 0,
        policyHash: null,
        generation: null,
      },
      queueState: {
        sessionId: null,
        engineMode: null,
        currentNodeId: null,
        currentEventId: null,
        path: [],
        visitedNodeIds: [],
        counters: {
          remaining: 0,
          due: 0,
          total: 0,
          pendingAssociatedReview: 0,
          sourceNodes: 0,
        },
        policyHash: null,
        generation: null,
      },
    };
    const backend = {
      neuralRoamAdvance: vi.fn(async () => backendResult),
    };
    let mode = 'follower';
    const runtime = {
      getMode: vi.fn(() => mode),
      getInstanceId: vi.fn(() => 'instance-a'),
      ensureWritable: vi.fn(async () => {
        mode = 'writer';
      }),
    };
    const followerCommandClient = {
      submitAndWait: vi.fn(),
    };
    manager.setAdvancedRouter(createRouterWithBackend(backend, {
      frontendRuntime: runtime,
      followerCommandClient,
    }));

    await expect(manager.neuralRoamAdvance({
      queueType: 'neural-roam',
      sessionId: null,
      currentItem: null,
      feedback: null,
    })).resolves.toBe(backendResult);

    expect(runtime.ensureWritable).toHaveBeenCalledTimes(1);
    expect(backend.neuralRoamAdvance).toHaveBeenCalledTimes(1);
    expect(followerCommandClient.submitAndWait).not.toHaveBeenCalled();
  });

  it('keeps neural-roam read and command methods bound when extracted from the manager', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    const backendViewStateResult = {
      queueType: 'neural-roam',
      status: 'ready',
      viewState: {
        queueType: 'neural-roam',
        route: {
          id: 'route-a',
        },
      },
      unavailableReason: null,
      message: null,
    };
    const backendCommandResult = {
      queueType: 'neural-roam',
      status: 'ok',
      viewState: null,
      queueState: { version: 8 },
      unavailableReason: null,
      message: null,
    };
    const backend = {
      neuralRoamViewState: vi.fn(async () => backendViewStateResult),
      neuralRoamCommand: vi.fn(async () => backendCommandResult),
    };
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    const readNeuralRoamViewState = manager.readNeuralRoamViewState;
    const neuralRoamCommand = manager.neuralRoamCommand;

    await expect(readNeuralRoamViewState()).resolves.toBe(backendViewStateResult);
    await expect(neuralRoamCommand({
      queueType: 'neural-roam',
      command: {
        type: 'switch-route',
        routeId: 'route-b',
      },
    } as never)).resolves.toBe(backendCommandResult);

    expect(backend.neuralRoamViewState).toHaveBeenCalledWith({ queueType: 'neural-roam' });
    expect(backend.neuralRoamCommand).toHaveBeenCalledWith({
      queueType: 'neural-roam',
      command: {
        type: 'switch-route',
        routeId: 'route-b',
      },
    });
  });

  it('keeps follower relay when writer lease reacquire still leaves runtime as follower', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    const relayResult = {
      queueType: 'neural-roam',
      sessionId: null,
      status: 'unavailable',
      nextItem: null,
      counters: {
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
      sessionState: {
        sessionId: null,
        engineMode: null,
        currentNodeId: null,
        currentEventId: null,
        pathLength: 0,
        visitedCount: 0,
        policyHash: null,
        generation: null,
      },
      queueState: null,
      unavailableReason: 'writer-unavailable',
      message: 'writer unavailable',
    };
    const backend = {
      neuralRoamAdvance: vi.fn(),
    };
    const runtime = {
      getMode: vi.fn(() => 'follower'),
      getInstanceId: vi.fn(() => 'instance-a'),
      ensureWritable: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance');
      }),
    };
    const followerCommandClient = {
      submitAndWait: vi.fn(async () => relayResult),
    };
    manager.setAdvancedRouter(createRouterWithBackend(backend, {
      frontendRuntime: runtime,
      followerCommandClient,
    }));

    await expect(manager.neuralRoamAdvance({
      queueType: 'neural-roam',
      sessionId: null,
      currentItem: null,
      feedback: null,
    })).resolves.toBe(relayResult);

    expect(runtime.ensureWritable).toHaveBeenCalledTimes(1);
    expect(followerCommandClient.submitAndWait).toHaveBeenCalledTimes(1);
    expect(backend.neuralRoamAdvance).not.toHaveBeenCalled();
  });

  it('returns typed readiness from backend projection snapshot', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        policyHash: 'policy-ready',
        generation: 3,
        status: 'ready',
        rows: [],
        counters: null,
      })),
    };
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.ensureQueueProjectionReady({
      queueType: QueueType.RetrievalPractice,
      source: 'browser',
    })).resolves.toEqual({
      status: 'ready',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-ready',
      generation: 3,
    });
  });

  it('returns typed refreshing readiness while projection materialization is in flight', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(() => []),
    });
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        policyHash: null,
        generation: null,
        status: 'unavailable',
        rows: [],
        counters: null,
      })),
      queueProjectionReplace: vi.fn(() => new Promise(() => {})),
    };
    manager.setAdvancedRouter({
      ...createRouterWithBackend(backend),
      getCards: vi.fn(async () => [createCard()]),
    } as unknown as IDataRouter);

    await expect(manager.ensureQueueProjectionReady({
      queueType: QueueType.FilterGroup,
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.FilterGroup,
      cause: 'projection_unavailable',
    });
  });

  it('does not call backend projection RPC for queues explicitly rolled back to strategy reads', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        status: 'ready',
        rows: [],
        policyHash: 'unexpected',
        generation: 1,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend, {
      rolloutState: (queueType) => queueType === QueueType.FilterGroup ? 'existing-queue-strategy' : null,
    }));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(backend.queueProjectionSnapshot).not.toHaveBeenCalled();
    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: false,
        state: 'existing-queue-strategy',
        readPath: 'existing-queue-strategy',
        reason: 'projection-rollout-pending',
      }),
    ]);
  });

  it('uses backend projection reads for deferred queues by default', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        status: 'ready',
        rows: [],
        counters: null,
        policyHash: 'filter-policy',
        generation: 2,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toMatchObject({
      queueType: QueueType.FilterGroup,
      policyHash: 'filter-policy',
      generation: 2,
      rows: [],
      counters: null,
    });

    expect(backend.queueProjectionSnapshot).toHaveBeenCalledWith({ queueType: QueueType.FilterGroup });
    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
      }),
    ]);
  });

  it('hides locally deleted cards from ready backend projection snapshots after delete events', async () => {
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
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        status: 'ready',
        policyHash: 'policy-ready',
        generation: 11,
        rows: [
          createProjectionSnapshotRow(deletedCard, 'deleted-row', 1),
          createProjectionSnapshotRow(activeCard, 'active-row', 2),
        ],
        counters: createProjectionCounters(2),
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await manager.onCardsDeleted([deletedCard.id], [deletedCard.blockId]);

    const snapshot = await manager.readQueueProjectionSnapshot(QueueType.RetrievalPractice);
    expect(snapshot?.rows.map((row) => row.fsrsCardId)).toEqual([activeCard.id]);
    expect(snapshot?.counters).toMatchObject({
      total: 1,
      remaining: 1,
      due: 1,
      buckets: { all: 1, item: 1 },
    });
  });

  it('fails closed when backend projection snapshot read throws', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => {
        throw new Error('projection rpc down');
      }),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup))
      .rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'projection-unavailable',
        unavailableReason: 'projection rpc down',
      }),
    ]);
  });

  it('fails closed when backend projection row hydration throws', async () => {
    const backend = {
      queueProjectionRowsByIds: vi.fn(async () => {
        throw new Error('row hydration down');
      }),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.getQueueProjectionCardsBySnapshotIds(QueueType.FilterGroup, ['row-a']))
      .rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'projection-unavailable',
        unavailableReason: 'row hydration down',
      }),
    ]);
  });

  it('reports projection-unavailable for a promoted deferred queue when backend is missing', async () => {
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(null));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'backend-unavailable',
        unavailableReason: 'backend-unavailable',
      }),
    ]);
  });

  it.each([
    ['missing policy hash', { status: 'ready', policyHash: null, generation: 2 }, 'refresh-required'],
    ['missing generation', { status: 'ready', policyHash: 'filter-policy', generation: null }, 'refresh-required'],
    ['invalidated status', { status: 'invalidated', policyHash: 'filter-policy', generation: 2 }, 'materialization_in_progress'],
  ])('reports projection refresh diagnostics for a promoted deferred queue with %s', async (_name, result, unavailableReason) => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        rows: [],
        counters: null,
        ...result,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'refresh-required',
        unavailableReason,
      }),
    ]);
  });

  it('reports stale projection rows as rebuildable refresh state with freshness evidence', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        rows: [],
        counters: null,
        status: 'refreshing',
        policyHash: 'filter-policy',
        generation: 4,
        freshness: {
          checkedAt: 1_700_000_100_000,
          totalRows: 2,
          freshRows: 1,
          staleRows: 0,
          missingRows: 1,
          staleCardIds: [],
          missingCardIds: ['missing-row'],
        },
      })),
      queueProjectionReplace: vi.fn(() => new Promise(() => {})),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(() => []),
    });
    manager.setAdvancedRouter({
      ...createRouterWithBackend(backend),
      getCards: vi.fn(async () => [createCard()]),
    } as unknown as IDataRouter);

    await expect(manager.ensureQueueProjectionReady({
      queueType: QueueType.FilterGroup,
      source: 'browser',
    })).resolves.toMatchObject({
      status: 'refreshing',
      queueId: QueueType.FilterGroup,
      cause: 'projection_stale',
    });

    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: 'refresh-required',
        unavailableReason: 'projection_stale',
        backendStatus: 'refreshing',
        policyHash: 'filter-policy',
        generation: 4,
        freshness: expect.objectContaining({
          missingRows: 1,
          missingCardIds: ['missing-row'],
        }),
      }),
    ]);
  });

  it('fails closed when a missing backend projection cannot be read', async () => {
    const card = createCard({
      id: 'materialized-card',
      blockId: 'materialized-block',
      meta: { content: 'materialized queue projection', deckId: 'deck-a', rootId: 'doc-a' },
    });
    let replacedRows: Array<{ rowId: string; cardId: string }> = [];
    const backend = {
      queueProjectionSnapshot: vi.fn()
        .mockResolvedValueOnce({
          queueType: QueueType.FilterGroup,
          status: 'unavailable',
          rows: [],
          counters: null,
          policyHash: null,
          generation: null,
        })
        .mockImplementation(async () => ({
          queueType: QueueType.FilterGroup,
          status: 'ready',
          rows: replacedRows.map((row, index) => ({
            id: row.rowId,
            fsrsCardId: row.cardId,
            blockId: card.blockId,
            deckId: 'deck-a',
            rootId: 'doc-a',
            content: 'materialized queue projection',
            fullContent: 'materialized queue projection',
            state: card.state,
            due: card.due,
            stability: card.stability,
            difficulty: card.difficulty,
            retrievability: 1,
            reps: card.reps,
            lapses: card.lapses,
            elapsedDays: card.elapsedDays,
            scheduledDays: card.scheduledDays,
            lastReview: card.lastReview,
            interval: card.scheduledDays,
            firstReview: null,
            priority: card.priority,
            suspended: false,
            cardType: card.type,
            queueIndex: index + 1,
            tags: [],
          })),
          counters: {
            queueType: QueueType.FilterGroup,
            policyHash: 'filter-group:materialized:v1',
            generation: 1,
            version: 1,
            remaining: 1,
            due: 1,
            total: 1,
            buckets: { all: 1, item: 1, descriptor: 0, topic: 0, concept: 0 },
            updatedAt: 1_700_000_100_000,
          },
          policyHash: 'filter-group:materialized:v1',
          generation: 1,
        })),
      queueProjectionReplace: vi.fn(async (request: { rows: Array<{ rowId: string; cardId: string }> }) => {
        replacedRows = request.rows;
        return {
          queueType: QueueType.FilterGroup,
          status: 'ready',
          policyHash: 'filter-group:materialized:v1',
          generation: 1,
          rows: request.rows.length,
          counters: {
            remaining: request.rows.length,
            total: request.rows.length,
          },
        };
      }),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(() => []),
    });
    manager.setAdvancedRouter(createRouterWithBackend(backend) as unknown as IDataRouter);

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(backend.queueProjectionSnapshot).toHaveBeenCalledTimes(1);
    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('does not relay projection materialization through the writer when current instance is a follower', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn()
        .mockResolvedValueOnce({
          queueType: QueueType.FilterGroup,
          status: 'unavailable',
          rows: [],
          counters: null,
          policyHash: null,
          generation: null,
        })
        .mockResolvedValueOnce({
          queueType: QueueType.FilterGroup,
          status: 'ready',
          rows: [],
          counters: null,
          policyHash: 'filter-group:materialized:v1',
          generation: 1,
        }),
      queueProjectionReplace: vi.fn(async () => {
        throw new Error('local replace must not run in follower mode');
      }),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(() => []),
    });
    manager.setAdvancedRouter({
      ...createRouterWithBackend(backend, {
        frontendRuntime: {
          getMode: () => 'follower',
          getInstanceId: () => 'memo-follower',
        },
      }),
    } as unknown as IDataRouter);

    await expect(manager.readQueueProjectionSnapshot(QueueType.FilterGroup)).resolves.toBeNull();

    expect(backend.queueProjectionReplace).not.toHaveBeenCalled();
  });

  it('does not use a writer echo when follower local projection storage is stale', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        rows: [],
        counters: null,
        policyHash: null,
        generation: null,
      })),
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'unavailable',
        rows: [],
        cards: [],
        policyHash: null,
        generation: null,
      })),
      queueProjectionReplace: vi.fn(async () => {
        throw new Error('local replace must not run in follower mode');
      }),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(() => []),
    });
    manager.setAdvancedRouter({
      ...createRouterWithBackend(backend, {
        frontendRuntime: {
          getMode: () => 'follower',
          getInstanceId: () => 'memo-follower',
        },
      }),
    } as unknown as IDataRouter);

    const snapshot = await manager.readQueueProjectionSnapshot(QueueType.FilterGroup);
    expect(snapshot).toBeNull();
    await expect(manager.getQueueProjectionCardsBySnapshotIds(QueueType.FilterGroup, ['follower-echo-card']))
      .resolves.toEqual([]);
    expect(backend.queueProjectionRowsByIds).toHaveBeenCalledWith({
      queueType: QueueType.FilterGroup,
      ids: ['follower-echo-card'],
    });
  });

  it('repairs stale row hydration through explicit backend materialization', async () => {
    const backend = {
      queueProjectionRowsByIds: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'invalidated',
        rows: [],
        cards: [],
        policyHash: 'filter-policy',
        generation: 2,
      })),
      queueProjectionReplace: vi.fn(async (request: { rows: Array<{ rowId: string; cardId: string }> }) => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'filter-policy',
        generation: 3,
        rows: request.rows.length,
        counters: {
          queueType: QueueType.FilterGroup,
          policyHash: 'filter-policy',
          generation: 3,
          version: 3,
          remaining: request.rows.length,
          due: request.rows.length,
          total: request.rows.length,
          buckets: { all: request.rows.length, item: request.rows.length, descriptor: 0, topic: 0, concept: 0 },
          updatedAt: 1_700_000_100_000,
        },
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(() => []),
    });
    manager.setAdvancedRouter({
      ...createRouterWithBackend(backend),
    } as unknown as IDataRouter);

    await expect(manager.getQueueProjectionCardsBySnapshotIds(
      QueueType.FilterGroup,
      ['stale-row-card'],
    )).resolves.toEqual([]);
    expect(backend.queueProjectionRowsByIds).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.FilterGroup,
      ids: ['stale-row-card'],
    }));
    expect(backend.queueProjectionReplace).toHaveBeenCalledWith(expect.objectContaining({
      queueType: QueueType.FilterGroup,
      policyHash: 'filter-policy',
      generation: 3,
      reason: 'row-hydration-refresh',
    }));
    expect(manager.getQueueProjectionRolloutDiagnostics(QueueType.FilterGroup)).toEqual([
      expect.objectContaining({
        queueType: QueueType.FilterGroup,
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
      }),
    ]);
  });

  it('exposes queue projection live identity subscription through the manager facade', async () => {
    const backend = {
      queueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.FilterGroup,
        status: 'ready',
        policyHash: 'filter-policy',
        generation: 7,
        rows: [],
        counters: null,
      })),
    };
    const manager = UnifiedDataSourceManager.getInstance();
    manager.setAdvancedRouter(createRouterWithBackend(backend));
    const events: unknown[] = [];
    const unsubscribe = manager.subscribeQueueProjectionLiveIdentityEvents((event) => events.push(event));

    await manager.ensureQueueProjectionReady({
      queueType: QueueType.FilterGroup,
      source: 'browser',
    });
    unsubscribe();
    manager.invalidateQueue(QueueType.FilterGroup);

    expect(events).toEqual([
      expect.objectContaining({
        type: 'queue-projection-live-identity',
        queueType: QueueType.FilterGroup,
        policyId: 'filter-policy',
        generation: 7,
        reason: 'refreshed',
      }),
    ]);
  });
});
