import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueType, type IDataRouter } from '@/types/unified-data-source';
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
