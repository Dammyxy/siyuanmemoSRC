import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewQueuePreparationService } from '../ReviewQueuePreparationService';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now - 1000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 1000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: 'item' as FSRSCard['type'],
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 2000,
    updatedAt: now - 1000,
    ...overrides,
  };
}

describe('ReviewQueuePreparationService', () => {
  const stateMap = new Map<string, unknown>();

  const queue = {
    getCards: vi.fn<() => Promise<FSRSCard[]>>().mockResolvedValue([createCard()]),
  };

  const manager = {
    getDayStartHour: vi.fn<() => number>().mockReturnValue(4),
    getQueue: vi.fn(() => queue),
  };

  const rescheduleService = {
    autoPostpone: vi.fn().mockResolvedValue({
      updated: 1,
      skipped: 0,
      skippedReasons: {},
      errors: [],
    }),
  };

  const queuePersistence = {
    get: vi.fn((key: string) => stateMap.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      stateMap.set(key, value);
    }),
  };

  const settingsService = {
    getSettings: vi.fn(() => ({
      queues: {
        autoPostpone: {
          enabled: true,
        },
      },
    })),
  };

  let service: ReviewQueuePreparationService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T06:00:00.000Z'));
    stateMap.clear();
    vi.clearAllMocks();
    queue.getCards.mockResolvedValue([createCard()]);
    settingsService.getSettings.mockReturnValue({
      queues: {
        autoPostpone: {
          enabled: true,
        },
      },
    });

    service = new ReviewQueuePreparationService(
      manager as never,
      rescheduleService as never,
      queuePersistence as never,
      settingsService as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs autoPostpone once for the first retrieval session of a logical day', async () => {
    await service.prepareBeforeReview(QueueType.RetrievalPractice);
    await service.prepareBeforeReview(QueueType.RetrievalPractice);

    expect(rescheduleService.autoPostpone).toHaveBeenCalledTimes(1);
    expect(rescheduleService.autoPostpone).toHaveBeenCalledWith(
      expect.objectContaining({
        skipTopNElements: 20,
      }),
      undefined,
      expect.objectContaining({
        cards: expect.any(Array),
      })
    );
  });

  it('uses configured skipTopNElements', async () => {
    settingsService.getSettings.mockReturnValue({
      queues: {
        autoPostpone: {
          enabled: true,
          skipTopNElements: 35,
        },
      },
    });

    await service.prepareBeforeReview(QueueType.RetrievalPractice);

    expect(rescheduleService.autoPostpone).toHaveBeenCalledWith(
      expect.objectContaining({
        skipTopNElements: 35,
      }),
      undefined,
      expect.objectContaining({
        cards: expect.any(Array),
      })
    );
  });

  it('runs again after crossing to the next logical day', async () => {
    await service.prepareBeforeReview(QueueType.IncrementalLearning);

    vi.setSystemTime(new Date('2026-02-28T06:00:00.000Z'));
    await service.prepareBeforeReview(QueueType.IncrementalLearning);

    expect(rescheduleService.autoPostpone).toHaveBeenCalledTimes(2);
  });

  it('does nothing for non-target queues', async () => {
    await service.prepareBeforeReview(QueueType.FinalDrill);
    await service.prepareBeforeReview(QueueType.NeuralRoam);

    expect(rescheduleService.autoPostpone).not.toHaveBeenCalled();
  });

  it('respects autoPostpone disabled config', async () => {
    settingsService.getSettings.mockReturnValue({
      queues: {
        autoPostpone: {
          enabled: false,
        },
      },
    });

    await service.prepareBeforeReview(QueueType.RetrievalPractice);

    expect(rescheduleService.autoPostpone).not.toHaveBeenCalled();
  });

  it('defaults to disabled when autoPostpone config is missing', async () => {
    settingsService.getSettings.mockReturnValue({
      queues: {},
    });

    await service.prepareBeforeReview(QueueType.RetrievalPractice);

    expect(rescheduleService.autoPostpone).not.toHaveBeenCalled();
  });
});
