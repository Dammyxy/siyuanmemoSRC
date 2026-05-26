import { describe, expect, it } from 'vitest';
import { CardState, CardType, Rating, type FSRSCard, type FSRSParameters } from '@/types';
import { ImprovedTopicScheduler } from '../ImprovedTopicScheduler';

function createParams(): FSRSParameters {
  return {
    requestRetention: 0.9,
    maximumInterval: 36500,
    weights: [],
    enableFuzz: false,
    enableShortTerm: false,
  };
}

function createTopic(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-05-26T20:10:00+08:00').getTime();
  return {
    id: 'topic-learning',
    xiuyuanID: 'xy-topic-learning',
    blockId: 'topic-learning',
    due: now,
    stability: 0,
    difficulty: 1,
    reps: 1,
    lapses: 0,
    state: CardState.Learning,
    lastReview: now - 43 * 24 * 60 * 60 * 1000,
    elapsedDays: 43,
    scheduledDays: 43,
    learning_step: 1,
    priority: 50,
    type: CardType.Topic,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    schedulerType: 'a-factor-v2',
    aFactor: 2.5,
    ...overrides,
  };
}

describe('ImprovedTopicScheduler', () => {
  it('returns subsequent mature topic reviews to Review state', () => {
    const scheduler = new ImprovedTopicScheduler(createParams());
    const result = scheduler.review(
      createTopic(),
      Rating.Good,
      new Date('2026-05-26T20:10:00+08:00'),
    );

    expect(result.state).toBe(CardState.Review);
    expect(result.reps).toBe(2);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
  });
});
