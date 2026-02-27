import { describe, expect, it } from 'vitest';
import { UnifiedReviewAdapter } from '../UnifiedReviewAdapter';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function createCard(): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'x-1',
    blockId: 'block-1',
    due: now + 60_000,
    stability: 5,
    difficulty: 4,
    reps: 2,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 60_000,
    elapsedDays: 1,
    scheduledDays: 2,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now,
  };
}

function createQueue(queueType: string) {
  return {
    getType: () => queueType,
    getStats: async () => ({ size: 3, label: '3 due', extra: '3 total' }),
    getUIConfig: () => ({
      statsType: 'queue-size',
      showRatingButtons: true,
      allowSkip: true,
    }),
  };
}

describe('UnifiedReviewAdapter', () => {
  it('injects plan-review-scope toolbar action for filter-group queue', async () => {
    const adapter = new UnifiedReviewAdapter({
      i18n: { planReviewScope: '规划复习范围' },
    });

    const ui = await adapter.toUIState(
      createQueue('filter-group') as never,
      createCard() as never,
      { showAnswer: false, session: { startTime: Date.now(), resumed: false } },
    );

    const filterButton = ui.header.toolbar?.find((item) => item.type === 'plan-review-scope');
    expect(filterButton).toBeDefined();
    expect(filterButton?.icon).toBe('#iconFilter');
    expect(filterButton?.label).toBe('规划复习范围');
  });

  it('does not inject plan-review-scope toolbar action for non filter-group queue', async () => {
    const adapter = new UnifiedReviewAdapter({
      i18n: { planReviewScope: '规划复习范围' },
    });

    const ui = await adapter.toUIState(
      createQueue('retrieval-practice') as never,
      createCard() as never,
      { showAnswer: false, session: { startTime: Date.now(), resumed: false } },
    );

    const filterButton = ui.header.toolbar?.find((item) => item.type === 'plan-review-scope');
    expect(filterButton).toBeUndefined();
  });
});

