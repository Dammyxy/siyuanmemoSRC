import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { buildFsrsSchedulingFingerprint, repairFsrsReviewState } from '../fsrsReviewStateRepair';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-04-26T23:38:33+08:00').getTime();
  return {
    id: 'repair-card-1',
    xiuyuanID: 'xy-repair-card-1',
    blockId: 'repair-card-1',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 4,
    lapses: 0,
    state: CardState.Review,
    lastReview: new Date('2026-02-15T23:38:33+08:00').getTime(),
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

describe('repairFsrsReviewState', () => {
  it('repairs screenshot-like Review cards from the historical interval instead of 0.01 stability', () => {
    const now = new Date('2026-04-26T23:38:33+08:00');
    const result = repairFsrsReviewState(createCard(), { now });

    expect(result.repaired).toBe(true);
    expect(result.reasons).toContain('stability');
    expect(result.card.stability).toBe(70);
    expect(result.card.scheduledDays).toBe(70);
    expect(result.card.difficulty).toBe(5);
    expect(result.card.elapsedDays).toBe(70);
  });

  it('repairs low one-day Review memory when due-lastReview proves a longer interval', () => {
    const now = new Date('2026-04-26T23:38:33+08:00');
    const result = repairFsrsReviewState(createCard({
      stability: 1,
      scheduledDays: 1,
      difficulty: 6,
    }), { now });

    expect(result.repaired).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['stability', 'scheduledDays']));
    expect(result.card.stability).toBe(70);
    expect(result.card.scheduledDays).toBe(70);
    expect(result.card.difficulty).toBe(6);
  });

  it('does not derive a fake interval from now-lastReview when due is invalid', () => {
    const now = new Date('2026-04-26T23:38:33+08:00');
    const result = repairFsrsReviewState(createCard({
      due: Number.NaN,
      stability: 0,
      scheduledDays: 0,
    }), { now });

    expect(result.repaired).toBe(true);
    expect(result.card.stability).toBe(1);
    expect(result.card.scheduledDays).toBe(1);
  });

  it('keeps same-day Review elapsedDays=0 clean', () => {
    const lastReview = new Date('2026-04-26T10:00:00+08:00').getTime();
    const result = repairFsrsReviewState(createCard({
      due: new Date('2026-05-06T10:00:00+08:00').getTime(),
      stability: 10,
      difficulty: 5,
      scheduledDays: 10,
      elapsedDays: 0,
      lastReview,
    }), {
      now: new Date('2026-04-26T18:00:00+08:00'),
    });

    expect(result.repaired).toBe(false);
    expect(result.card.elapsedDays).toBe(0);
  });

  it('does not rewrite valid Review elapsedDays just because wall-clock time moved forward', () => {
    const lastReview = new Date('2026-04-01T10:00:00+08:00').getTime();
    const result = repairFsrsReviewState(createCard({
      due: new Date('2026-05-01T10:00:00+08:00').getTime(),
      stability: 30,
      difficulty: 5,
      scheduledDays: 30,
      elapsedDays: 1,
      lastReview,
    }), {
      now: new Date('2026-04-26T18:00:00+08:00'),
    });

    expect(result.repaired).toBe(false);
    expect(result.card.elapsedDays).toBe(1);
  });

  it('keeps New cards eligible for zero stability', () => {
    const result = repairFsrsReviewState(createCard({
      state: CardState.New,
      stability: 0,
      scheduledDays: 0,
      lastReview: 0,
    }));

    expect(result.repaired).toBe(false);
    expect(result.card.stability).toBe(0);
  });

  it('promotes mature New cards whose review state was reset but memory remained', () => {
    const due = new Date('2026-05-26T23:39:17+08:00').getTime();
    const lastReview = new Date('2026-05-01T07:02:51+08:00').getTime();
    const result = repairFsrsReviewState(createCard({
      id: 'card-1772222812855-5i98o4e96',
      state: CardState.New,
      due,
      lastReview,
      reps: 0,
      stability: 19.63158225,
      difficulty: 2.04951585,
      scheduledDays: 22,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
      meta: {
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: '20260228040652-am16wq4',
      },
    }), { now: due });

    expect(result.repaired).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['state', 'reps']));
    expect(result.card.state).toBe(CardState.Review);
    expect(result.card.reps).toBe(1);
    expect(result.card.scheduledDays).toBe(22);
    expect(result.card.stability).toBe(19.63158225);
  });

  it('normalizes uninitialized New memory as 0/0 instead of difficulty=1 stability=0', () => {
    const result = repairFsrsReviewState(createCard({
      state: CardState.New,
      stability: 0,
      difficulty: 1,
      scheduledDays: 0,
      lastReview: 0,
    }));

    expect(result.repaired).toBe(true);
    expect(result.reasons).toContain('memoryState');
    expect(result.card.stability).toBe(0);
    expect(result.card.difficulty).toBe(0);
  });

  it('promotes mature Learning cards imported from Riff into Review state', () => {
    const due = new Date('2026-04-28T23:21:27+08:00').getTime();
    const lastReview = new Date('2026-04-28T23:11:27+08:00').getTime();
    const result = repairFsrsReviewState(createCard({
      id: 'card-20260424190358-nv5h2no',
      state: CardState.Learning,
      due,
      lastReview,
      reps: 1,
      stability: 23.20535865,
      difficulty: 2.09745544,
      scheduledDays: 26,
      learning_step: 0,
      type: CardType.Descriptor,
      schedulerType: 'fsrs-v6',
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
      },
    }), { now: new Date('2026-05-26T19:58:00+08:00') });

    expect(result.repaired).toBe(true);
    expect(result.reasons).toContain('state');
    expect(result.card.state).toBe(CardState.Review);
    expect(result.card.due).toBe(due);
    expect(result.card.lastReview).toBe(lastReview);
    expect(result.card.scheduledDays).toBe(26);
    expect(result.card.stability).toBe(23.20535865);
  });

  it('keeps true short-term Learning cards in Learning state', () => {
    const now = new Date('2026-05-26T19:58:00+08:00').getTime();
    const result = repairFsrsReviewState(createCard({
      state: CardState.Learning,
      due: now + 10 * 60 * 1000,
      lastReview: now,
      reps: 1,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learning_step: 1,
    }), { now });

    expect(result.repaired).toBe(false);
    expect(result.card.state).toBe(CardState.Learning);
    expect(result.card.learning_step).toBe(1);
  });

  it('skips topic cards because their card type owns A-Factor scheduling', () => {
    const topic = createCard({
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
    });
    const result = repairFsrsReviewState(topic);

    expect(result.repaired).toBe(false);
    expect(result.card.stability).toBe(0);
  });

  it('includes the scheduling fields that can change preview results in the fingerprint', () => {
    const original = buildFsrsSchedulingFingerprint(createCard());
    const changed = buildFsrsSchedulingFingerprint(createCard({
      due: new Date('2026-04-27T23:38:33+08:00').getTime(),
      reps: 5,
      stability: 71,
    }));

    expect(changed).not.toBe(original);
  });
});
