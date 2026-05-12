import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { SrsV2QueuePolicy } from '../SrsV2QueuePolicy';

const NOW = new Date('2026-04-27T08:00:00+08:00').getTime();
const DAY = 86_400_000;

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: `xiuyuan-${id}`,
    blockId: `block-${id}`,
    due: NOW,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - DAY,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - DAY,
    updatedAt: NOW,
    ...overrides,
  };
}

function baseInput(baseCards: FSRSCard[], manualCards: FSRSCard[] = []) {
  return {
    baseCards,
    manualCards,
    now: NOW,
    dayEnd: NOW + DAY,
    newCardsPerDay: 1,
    reviewsPerDay: 1,
    priorityRandomness: 0,
    stableSalt: 'test',
    isBlacklisted: () => false,
    isDismissed: () => false,
  };
}

describe('SrsV2QueuePolicy', () => {
  it('orders retrieval as due learning, capped same-day reviews, then manual future preview items', () => {
    const learning = card('learning', {
      state: CardState.Learning,
      due: NOW - 60_000,
      priority: 90,
    });
    const reviewEarly = card('review-early', {
      state: CardState.Review,
      due: NOW,
      priority: 80,
    });
    const reviewLater = card('review-later', {
      state: CardState.Review,
      due: NOW + 2 * 60_000,
      priority: 1,
    });
    const newA = card('new-a', {
      state: CardState.New,
      reps: 0,
      due: NOW,
      priority: 5,
    });
    const newB = card('new-b', {
      state: CardState.New,
      reps: 0,
      due: NOW,
      priority: 10,
    });
    const manualFuture = card('manual-future', {
      due: NOW + 10 * DAY,
      priority: 1,
    });

    const result = SrsV2QueuePolicy.buildRetrievalPracticeQueue(baseInput(
      [newB, reviewLater, learning, newA, reviewEarly],
      [manualFuture],
    ));

    expect(result.map((item) => item.id)).toEqual([
      'learning',
      'review-early',
      'manual-future',
    ]);
  });

  it('keeps incremental new cards within the daily cap', () => {
    const newA = card('new-a', {
      state: CardState.New,
      reps: 0,
      due: NOW,
      priority: 5,
    });
    const newB = card('new-b', {
      state: CardState.New,
      reps: 0,
      due: NOW,
      priority: 10,
    });

    const result = SrsV2QueuePolicy.buildIncrementalLearningQueue(baseInput([newB, newA]));

    expect(result.map((item) => item.id)).toEqual(['new-a']);
  });

  it('holds future learning steps out of the normal queue until their exact due time', () => {
    const dueNow = card('learning-now', {
      state: CardState.Learning,
      due: NOW,
    });
    const dueInSixMinutes = card('learning-six-minutes', {
      state: CardState.Learning,
      due: NOW + 6 * 60_000,
    });
    const reviewLaterToday = card('review-later-today', {
      state: CardState.Review,
      due: NOW + 6 * 60_000,
    });

    const result = SrsV2QueuePolicy.buildIncrementalLearningQueue(baseInput([
      dueInSixMinutes,
      reviewLaterToday,
      dueNow,
    ]));

    expect(result.map((item) => item.id)).toEqual(['learning-now', 'review-later-today']);
  });

  it('learn ahead selects only future learning steps within both window and card cap', () => {
    const dueInSixMinutes = card('learning-six-minutes', {
      state: CardState.Learning,
      due: NOW + 6 * 60_000,
    });
    const relearningInTenMinutes = card('relearning-ten-minutes', {
      state: CardState.Relearning,
      due: NOW + 10 * 60_000,
    });
    const dueInThirtyMinutes = card('learning-thirty-minutes', {
      state: CardState.Learning,
      due: NOW + 30 * 60_000,
    });
    const reviewInSixMinutes = card('review-six-minutes', {
      state: CardState.Review,
      due: NOW + 6 * 60_000,
    });

    const result = SrsV2QueuePolicy.buildLearnAheadQueue({
      ...baseInput([
        reviewInSixMinutes,
        dueInThirtyMinutes,
        relearningInTenMinutes,
        dueInSixMinutes,
      ]),
      windowEnd: NOW + 20 * 60_000,
      maxCards: 1,
    });

    expect(result.map((item) => item.id)).toEqual(['learning-six-minutes']);
  });

  it('includes review cards through the review-day boundary but excludes cards after rollover', () => {
    const reviewAtDayEnd = card('review-day-end', {
      state: CardState.Review,
      due: NOW + DAY,
    });
    const reviewAfterRollover = card('review-after-rollover', {
      state: CardState.Review,
      due: NOW + DAY + 1,
    });

    const result = SrsV2QueuePolicy.buildIncrementalLearningQueue({
      ...baseInput([reviewAfterRollover, reviewAtDayEnd]),
      reviewsPerDay: 0,
    });

    expect(result.map((item) => item.id)).toEqual(['review-day-end']);
  });

  it('keeps incremental rotation materials after formal memory cards', () => {
    const formal = card('formal', {
      type: CardType.Item,
      state: CardState.Review,
      due: NOW,
    });
    const topic = card('topic', {
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      due: NOW - 60_000,
    });

    const result = SrsV2QueuePolicy.buildIncrementalLearningQueue(baseInput([topic, formal]));

    expect(result.map((item) => item.id)).toEqual(['formal', 'topic']);
  });
});
