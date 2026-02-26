import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpreadEngine } from '../SpreadEngine';
import type { FSRSCard } from '@/types/card';
import { CardState, CardType } from '@/types/card';
import { SortingCriterion, type SpreadConfig } from '@/types/reschedule';
import type { CardUpdatePort, RescheduleStoragePort } from '../ports';

describe('SpreadEngine', () => {
  const now = new Date('2026-02-01T08:00:00.000Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  let engine: SpreadEngine;
  let updatedBatches: FSRSCard[][];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    updatedBatches = [];
    const storage: RescheduleStoragePort = {
      getCardsByBlockId: () => [],
      addRescheduleLog: vi.fn().mockResolvedValue(undefined),
    };
    const updater: CardUpdatePort = {
      batchUpdateCardsWithoutEvents: vi.fn(async (cards: FSRSCard[]) => {
        updatedBatches.push(cards);
      }),
    };

    engine = new SpreadEngine(storage, updater);
  });

  function createCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
    return {
      id,
      xiuyuanID: `x-${id}`,
      blockId: `b-${id}`,
      due: now - dayMs,
      stability: 10,
      difficulty: 5,
      reps: 8,
      lapses: 0,
      state: CardState.Review,
      lastReview: now - 20 * dayMs,
      elapsedDays: 20,
      scheduledDays: 20,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now - 100 * dayMs,
      updatedAt: now - dayMs,
      ...overrides,
    };
  }

  function createConfig(overrides: Partial<SpreadConfig> = {}): SpreadConfig {
    return {
      collectingPeriod: 30,
      reschedulingPeriod: 7,
      considerFutureRepetitions: false,
      sortingCriterion: SortingCriterion.ByPriority,
      ...overrides,
    };
  }

  function latestBatch(): FSRSCard[] {
    return updatedBatches.at(-1) ?? [];
  }

  it('supports collecting all input cards for queue mode', async () => {
    const cards = [
      createCard('c1', { due: now - dayMs }),
      createCard('c2', { due: now + 90 * dayMs }),
    ];
    const result = await engine.execute(
      cards,
      createConfig({
        considerFutureRepetitions: false,
        collectingPeriod: 1,
        collectAllCards: true,
      }),
      'test'
    );

    expect(result.updated).toBe(2);
  });

  it('enforces maxCardsPerDay and postpones overflow', async () => {
    const cards = Array.from({ length: 8 }, (_, index) =>
      createCard(`c${index}`, { priority: index })
    );

    const result = await engine.execute(
      cards,
      createConfig({
        reschedulingPeriod: 2,
        maxCardsPerDay: 2,
      }),
      'test'
    );

    expect(result.updated).toBe(8);

    const dayLoads = new Map<number, number>();
    for (const card of latestBatch()) {
      const dayIndex = Math.floor((card.due - now) / dayMs);
      dayLoads.set(dayIndex, (dayLoads.get(dayIndex) ?? 0) + 1);
    }

    const loads = Array.from(dayLoads.values());
    expect(loads.length).toBeGreaterThan(2);
    expect(loads.every((count) => count <= 2)).toBe(true);
  });
});
