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

function createRouter(): SchedulerRouter {
  const cardUpdater = {
    batchUpdateCardsWithoutEvents: vi.fn().mockResolvedValue(undefined),
  };
  return new SchedulerRouter(
    {
      defaultScheduler: 'fsrs-v6',
      fsrsParams: DEFAULT_SETTINGS.fsrs,
    },
    cardUpdater
  );
}

describe('SchedulerRouter fsrs-v6 migration constraints', () => {
  it('registers only one TSFSRSScheduler instance', () => {
    const router = createRouter();
    const schedulers = (router as unknown as { schedulers: Map<string, unknown> }).schedulers;

    const fsrsSchedulerInstances = [...schedulers.values()].filter(
      (scheduler) => scheduler instanceof TSFSRSScheduler
    );

    expect(fsrsSchedulerInstances).toHaveLength(1);
    expect(schedulers.has('fsrs-v6')).toBe(true);
    expect(schedulers.has('fsrs-v5')).toBe(false);
  });

  it('rejects legacy fsrs-v5 schedulerType on cards', () => {
    const router = createRouter();
    const legacyCard = createCard({
      schedulerType: 'fsrs-v5',
      type: CardType.Item,
    });

    expect(() => router.getSchedulerType(legacyCard)).toThrow(/unsupported scheduler type/i);
  });
});
