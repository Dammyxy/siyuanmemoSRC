import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType, type IDataRouter } from '@/types/unified-data-source';
import type { LeechActionEffectsPort } from '@/core/queue/domain/ports';
import {
  InMemoryNeuralRoamRouteRepository,
  NeuralRoamRouteCatalog,
  type NeuralRoamRouteState,
} from '@/core/queue/neural/routes';
import { UnifiedDataSourceManager } from '../UnifiedDataSourceManager';

function createRouterWithSettings(settings: unknown): IDataRouter {
  const plugin = {
    getContext: () => ({
      getSettingsService: () => ({
        getSettings: () => settings,
      }),
    }),
  };

  return {
    plugin,
    getCard: vi.fn(),
    getCards: vi.fn().mockResolvedValue([]),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    getAvailableQueueTypes: vi.fn(() => [
      QueueType.RetrievalPractice,
      QueueType.FinalDrill,
      QueueType.IncrementalLearning,
      QueueType.FilterGroup,
      QueueType.NeuralRoam,
      QueueType.Leech,
    ]),
  } as unknown as IDataRouter;
}

function createRouterWithPendingContext(): IDataRouter {
  const plugin = {
    getContext: () => {
      throw new Error('ApplicationContext is not ready');
    },
  };

  return {
    plugin,
    getCard: vi.fn(),
    getCards: vi.fn().mockResolvedValue([]),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    getAvailableQueueTypes: vi.fn(() => [QueueType.Leech]),
  } as unknown as IDataRouter;
}

function setupManager(settings: unknown): UnifiedDataSourceManager {
  UnifiedDataSourceManager.resetInstance();
  const manager = UnifiedDataSourceManager.getInstance();
  manager.setAdvancedRouter(createRouterWithSettings(settings));
  return manager;
}

describe('UnifiedDataSourceManager settings accessors', () => {
  beforeEach(() => {
    UnifiedDataSourceManager.resetInstance();
  });

  it('requires an injected LeechActionEffectsPort before creating the leech queue', () => {
    const manager = UnifiedDataSourceManager.getInstance();

    expect(() => manager.getQueue(QueueType.Leech)).toThrow(
      'LeechActionEffectsPort not initialized. Call setLeechActionEffects() first.',
    );

    const effects: LeechActionEffectsPort = {
      notify: vi.fn(),
      setBlockAttrs: vi.fn(),
    };

    manager.setLeechActionEffects(effects);

    expect(manager.getQueue(QueueType.Leech).name).toBe('LeechReviewQueue');
  });

  it('allows router injection while the plugin context is still being composed', () => {
    const manager = UnifiedDataSourceManager.getInstance();

    expect(() => manager.setAdvancedRouter(createRouterWithPendingContext())).not.toThrow();
    expect(manager.getAvailableQueueTypes()).toEqual([QueueType.Leech]);
  });

  it('injects the NeuralRoam route catalog into created NeuralRoam queues', async () => {
    const routeState: NeuralRoamRouteState = {
      activeRouteId: 'route-alpha',
      engineMode: 'orbit',
      routes: [
        {
          metadata: {
            id: 'default',
            name: '默认航线',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 1,
            updatedAt: 1,
            lastUsedAt: 1,
          },
          seedPool: [],
          anchorPool: [],
          sessions: { orbit: null, hyperspace: null },
          history: [],
        },
        {
          metadata: {
            id: 'route-alpha',
            name: '航线A',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: 2,
            updatedAt: 2,
            lastUsedAt: 2,
          },
          seedPool: [
            {
              routeId: 'route-alpha',
              nodeId: 'concept-alpha',
              kind: 'seed',
              nodeKind: 'concept',
              role: null,
              priority: 0.9,
              addedAt: 2,
              visitedAt: null,
              preview: 'Concept Alpha',
            },
          ],
          anchorPool: [],
          sessions: { orbit: null, hyperspace: null },
          history: [],
        },
      ],
    };
    const manager = setupManager({
      queues: {
        neuralRoam: {
          history: { maxEntries: 3000 },
        },
      },
    });
    manager.setQueuePersistence({
      get: vi.fn(() => null),
      set: vi.fn(async () => undefined),
    });
    manager.setNeuralRoamRouteCatalog(new NeuralRoamRouteCatalog({
      repository: new InMemoryNeuralRoamRouteRepository(routeState),
    }));

    const queue = manager.getQueue(QueueType.NeuralRoam);
    await (queue as unknown as { ensureInitialLoad: () => Promise<void> }).ensureInitialLoad();

    expect((queue as { getSeedSnapshot: () => Array<{ nodeId: string }> }).getSeedSnapshot()).toEqual([
      expect.objectContaining({ nodeId: 'concept-alpha' }),
    ]);
  });

  it('prefers fsrs.dayStartHour and falls back to queues.dayStartHour', () => {
    const preferFsrs = setupManager({
      fsrs: { dayStartHour: 6 },
      queues: { dayStartHour: 9 },
    });
    expect(preferFsrs.getDayStartHour()).toBe(6);

    const fallbackQueues = setupManager({
      queues: { dayStartHour: 5 },
    });
    expect(fallbackQueues.getDayStartHour()).toBe(5);
  });

  it('returns defaults when settings are missing or invalid', () => {
    const missing = setupManager({});
    expect(missing.getDayStartHour()).toBe(4);
    expect(missing.getPriorityRandomness()).toBe(0.1);
    expect(missing.getAutoSortEnabled()).toBe(true);
    expect(missing.getAddToOutstandingEveryNth()).toBe(2);

    const invalid = setupManager({
      fsrs: { dayStartHour: 'x' },
      priorityRandomness: 'bad',
      queues: { addToOutstandingEveryNth: 'bad', autoSort: { enabled: 'bad' } },
    });
    expect(invalid.getDayStartHour()).toBe(4);
    expect(invalid.getPriorityRandomness()).toBe(0.1);
    expect(invalid.getAutoSortEnabled()).toBe(true);
    expect(invalid.getAddToOutstandingEveryNth()).toBe(2);
  });

  it('reads queues.autoSort.enabled toggle', () => {
    const disabled = setupManager({
      queues: { autoSort: { enabled: false } },
    });
    expect(disabled.getAutoSortEnabled()).toBe(false);

    const enabled = setupManager({
      queues: { autoSort: { enabled: true } },
    });
    expect(enabled.getAutoSortEnabled()).toBe(true);
  });

  it('clamps priorityRandomness into [0, 1]', () => {
    const high = setupManager({ priorityRandomness: 8 });
    expect(high.getPriorityRandomness()).toBe(1);

    const low = setupManager({ priorityRandomness: -2 });
    expect(low.getPriorityRandomness()).toBe(0);
  });

  it('reads addToOutstandingEveryNth with legacy key compatibility', () => {
    const modern = setupManager({
      queues: { addToOutstandingEveryNth: 4 },
    });
    expect(modern.getAddToOutstandingEveryNth()).toBe(4);

    const legacyNth = setupManager({
      queues: { outstandingEveryNth: 7 },
    });
    expect(legacyNth.getAddToOutstandingEveryNth()).toBe(7);

    const legacySpacing = setupManager({
      queues: { outstandingSpacing: 9 },
    });
    expect(legacySpacing.getAddToOutstandingEveryNth()).toBe(9);

    const clamped = setupManager({
      queues: { addToOutstandingEveryNth: 0 },
    });
    expect(clamped.getAddToOutstandingEveryNth()).toBe(1);
  });
});
