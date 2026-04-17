import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types';
import { CardType } from '@/types/card';
import { SchedulerRouter } from '../SchedulerRouter';
import { TSFSRSScheduler } from '../strategies/TSFSRSScheduler';
import { DEFAULT_SETTINGS } from '@/types/settings';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: now + 86400000,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRouter() {
  const cardUpdater = {
    batchUpdateCardsWithoutEvents: vi.fn().mockResolvedValue(undefined),
  };
  return {
    router: new SchedulerRouter(
      {
        defaultScheduler: 'fsrs-v6',
        fsrsParams: DEFAULT_SETTINGS.fsrs,
      },
      cardUpdater
    ),
    cardUpdater,
  };
}

describe('SchedulerRouter fsrs-v6 migration constraints', () => {
  it('registers only one TSFSRSScheduler instance', () => {
    const { router } = createRouter();
    const schedulers = (router as unknown as { schedulers: Map<string, unknown> }).schedulers;

    const fsrsSchedulerInstances = [...schedulers.values()].filter(
      (scheduler) => scheduler instanceof TSFSRSScheduler
    );

    expect(fsrsSchedulerInstances).toHaveLength(1);
    expect(schedulers.has('fsrs-v6')).toBe(true);
    expect(schedulers.has('fsrs-v5')).toBe(false);
  });

  it('rejects legacy fsrs-v5 schedulerType on cards', () => {
    const { router } = createRouter();
    const legacyCard = createCard({
      schedulerType: 'fsrs-v5',
      type: CardType.Item,
    });

    expect(() => router.getSchedulerType(legacyCard)).toThrow(/unsupported scheduler type/i);
  });

  it('normalizes dirty card data before and after scheduling', async () => {
    const { router, cardUpdater } = createRouter();
    const updatedCard = await router.route(createCard({
      schedulerType: undefined,
      type: CardType.Item,
      state: 2,
      due: Number.NaN,
      stability: 0,
      difficulty: Number.POSITIVE_INFINITY,
      reps: -3,
      lapses: -1,
      lastReview: 0,
      elapsedDays: -2,
      scheduledDays: 0,
      learning_step: -1,
      priority: Number.NEGATIVE_INFINITY,
      createdAt: 0,
      updatedAt: Number.NaN,
    }), 3);

    expect(updatedCard.schedulerType).toBe('fsrs-v6');
    expect(Number.isFinite(updatedCard.due)).toBe(true);
    expect(updatedCard.difficulty).toBeGreaterThanOrEqual(1);
    expect(updatedCard.difficulty).toBeLessThanOrEqual(10);
    expect(updatedCard.priority).toBeGreaterThanOrEqual(0);
    expect(updatedCard.priority).toBeLessThanOrEqual(100);
    expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(cardUpdater.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: updatedCard.id,
        schedulerType: 'fsrs-v6',
      }),
    ]);
  });
});
