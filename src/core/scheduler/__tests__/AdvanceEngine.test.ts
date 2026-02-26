import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvanceEngine } from '../AdvanceEngine';
import type { FSRSCard } from '@/types/card';
import { CardState, CardType } from '@/types/card';
import type { AdvanceConfig } from '@/types/reschedule';
import type { CardUpdatePort, RescheduleStoragePort } from '../ports';

describe('AdvanceEngine', () => {
  const now = new Date('2026-02-01T08:00:00.000Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  let storage: RescheduleStoragePort;
  let cardUpdater: CardUpdatePort;
  let engine: AdvanceEngine;
  let updatedBatches: FSRSCard[][];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    updatedBatches = [];
    storage = {
      getCardsByBlockId: () => [],
      addRescheduleLog: vi.fn().mockResolvedValue(undefined),
    };
    cardUpdater = {
      batchUpdateCardsWithoutEvents: vi.fn(async (cards: FSRSCard[]) => {
        updatedBatches.push(cards);
      }),
    };
    engine = new AdvanceEngine(storage, cardUpdater);
  });

  function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
    return {
      id: `card-${Math.random().toString(36).slice(2)}`,
      xiuyuanID: 'x1',
      blockId: 'b1',
      due: now + 40 * dayMs,
      stability: 10,
      difficulty: 5,
      reps: 10,
      lapses: 1,
      state: CardState.Review,
      lastReview: now - 10 * dayMs,
      elapsedDays: 10,
      scheduledDays: 40,
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

  function createConfig(overrides: Partial<AdvanceConfig> = {}): AdvanceConfig {
    return {
      maxDays: 30,
      randomize: true,
      handleOverdueCards: true,
      ...overrides,
    };
  }

  function latestUpdatedCard(): FSRSCard {
    return updatedBatches.at(-1)?.at(-1) as FSRSCard;
  }

  it('uses fixed target day when randomize=false', async () => {
    const card = createCard();
    const result = await engine.execute([card], createConfig({ randomize: false, maxDays: 14 }), 'test');

    expect(result.updated).toBe(1);
    const updated = latestUpdatedCard();
    expect(updated.due).toBe(now + 14 * dayMs);
    expect(updated.scheduledDays).toBe(Math.floor((updated.due - updated.lastReview) / dayMs));
  });

  it('uses random range when randomize=true', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const card = createCard();
    const result = await engine.execute([card], createConfig({ randomize: true, maxDays: 20 }), 'test');

    expect(result.updated).toBe(1);
    const updated = latestUpdatedCard();
    expect(updated.due).toBe(now + 1 * dayMs);
  });

  it('does not treat never-reviewed card as overdue', async () => {
    const card = createCard({
      lastReview: 0,
      scheduledDays: 50,
    });
    const result = await engine.execute([card], createConfig({ randomize: false, maxDays: 10 }), 'test');

    expect(result.updated).toBe(1);
    expect(result.overdueHandled).toBe(0);
    expect(latestUpdatedCard().due).toBe(now + 10 * dayMs);
  });

  it('updates overdue cards to now and writes interval consistently', async () => {
    const card = createCard({
      lastReview: now - 40 * dayMs,
      scheduledDays: 5,
    });
    const result = await engine.execute([card], createConfig({ maxDays: 30 }), 'test');

    expect(result.overdueHandled).toBe(1);
    const updated = latestUpdatedCard();
    expect(updated.due).toBe(now);
    expect(updated.scheduledDays).toBe(40);
  });
});
