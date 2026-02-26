import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostponeEngine } from '../PostponeEngine';
import type { FSRSCard } from '@/types/card';
import { CardState, CardType } from '@/types/card';
import type { PostponeConfig } from '@/types/reschedule';
import type { CardUpdatePort, RescheduleStoragePort } from '../ports';

describe('PostponeEngine', () => {
  const now = new Date('2026-02-01T08:00:00.000Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  let engine: PostponeEngine;
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
    engine = new PostponeEngine(storage, updater);
  });

  function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
    return {
      id: 'c1',
      xiuyuanID: 'x1',
      blockId: 'b1',
      due: now - 2 * dayMs,
      stability: 10,
      difficulty: 5,
      reps: 10,
      lapses: 1,
      state: CardState.Review,
      lastReview: now - 12 * dayMs,
      elapsedDays: 12,
      scheduledDays: 10,
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

  function createConfig(overrides: Partial<PostponeConfig> = {}): PostponeConfig {
    return {
      delayFactor: 1.1,
      minInterval: 1,
      maxInterval: 365,
      includeNonOutstanding: false,
      skipConditions: {},
      modifyDelayByRetrievability: false,
      modifyDelayByPriority: false,
      ...overrides,
    };
  }

  function latestUpdatedCard(): FSRSCard {
    return updatedBatches.at(-1)?.at(-1) as FSRSCard;
  }

  it('never moves non-outstanding card earlier when includeNonOutstanding=true', async () => {
    const card = createCard({
      due: now + 10 * dayMs,
      lastReview: now - 1 * dayMs,
      scheduledDays: 2,
    });
    const result = await engine.execute(
      [card],
      createConfig({ includeNonOutstanding: true, delayFactor: 1.0 }),
      false,
      'test'
    );

    expect(result.updated).toBe(1);
    const updated = latestUpdatedCard();
    expect(updated.due).toBeGreaterThan(card.due);
  });

  it('keeps scheduledDays aligned with due and lastReview', async () => {
    const card = createCard({
      due: now - 5 * dayMs,
      lastReview: now - 30 * dayMs,
      scheduledDays: 10,
    });
    const result = await engine.execute(
      [card],
      createConfig({ delayFactor: 1.0, minInterval: 1, maxInterval: 10 }),
      false,
      'test'
    );

    expect(result.updated).toBe(1);
    const updated = latestUpdatedCard();
    const actualInterval = Math.floor((updated.due - updated.lastReview) / dayMs);
    expect(updated.scheduledDays).toBe(actualInterval);
    expect(updated.due).toBeGreaterThanOrEqual(now + dayMs);
  });

  it('reports not-outstanding skip reason in postpone mode', async () => {
    const card = createCard({ due: now + 2 * dayMs });
    const result = await engine.execute([card], createConfig({ includeNonOutstanding: false }), false, 'test');

    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedReasons['not-outstanding']).toBe(1);
  });
});
