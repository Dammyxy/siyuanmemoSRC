import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  canonicalizeSchedulingState,
  stripTransientSchedulingPreviewFields,
  summarizeSchedulingStateCleanliness,
} from '../schedulingStateCleanliness';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const due = new Date('2026-04-26T23:38:33+08:00').getTime();
  const lastReview = new Date('2026-02-15T23:38:33+08:00').getTime();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview,
    elapsedDays: 0,
    scheduledDays: 70,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: lastReview,
    updatedAt: due,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

describe('schedulingStateCleanliness', () => {
  it('repairs polluted FSRS review memory and strips persistent preview metadata', () => {
    const dirty = {
      ...createCard({
        schedulerType: 'a-factor-v2',
        stability: 1,
        difficulty: 0,
        scheduledDays: 1,
        aFactor: 4,
        schedulerMeta: {
          topic: {
            afs: [4],
            of: 4,
            optimalInterval: 4,
          },
        },
        meta: {
          nextDues: { again: 1, hard: 1, good: 1 },
          stability: 1,
          difficulty: 0,
          aFactor: 4,
          scheduledDays: 1,
          customField: 'kept',
        },
      }),
      nextDues: { again: 1, hard: 1, good: 1 },
    } as FSRSCard & { nextDues: unknown };

    const result = canonicalizeSchedulingState(dirty, {
      source: 'storage-load',
      mode: 'repair-external',
      now: dirty.due,
    });

    expect(result.changed).toBe(true);
    expect(result.card).toMatchObject({
      schedulerType: 'fsrs-v6',
      stability: 70,
      difficulty: 5,
      scheduledDays: 70,
      meta: { customField: 'kept' },
    });
    expect((result.card as { aFactor?: unknown }).aFactor).toBeUndefined();
    expect(result.card.schedulerMeta).toBeUndefined();
    expect((result.card as { nextDues?: unknown }).nextDues).toBeUndefined();
    expect(result.reasons).toEqual(expect.arrayContaining([
      'schedulerType',
      'stability',
      'difficulty',
      'scheduledDays',
      'aFactor',
      'schedulerMeta',
      'nextDues',
      'meta.nextDues',
      'meta.aFactor',
    ]));
  });

  it('canonicalizes Topic/Concept scheduling into a-factor-v2 only', () => {
    const dirty = createCard({
      id: 'topic-1',
      type: CardType.Topic,
      schedulerType: 'fsrs-v6',
      aFactor: 99,
      scheduledDays: 4,
      schedulerMeta: {
        sm15: {
          afs: [0.5, 7, 3],
          of: 3,
          optimumInterval: 8,
        },
      },
    });

    const result = canonicalizeSchedulingState(dirty, {
      source: 'storage-load',
      mode: 'repair-external',
    });

    expect(result.card.schedulerType).toBe('a-factor-v2');
    expect(result.card.aFactor).toBe(6);
    expect(result.card.schedulerMeta).toEqual({
      topic: {
        afs: [6],
        of: 6,
        optimalInterval: 4,
      },
    });
  });

  it('fails fast when internal scheduler output is dirty', () => {
    expect(() => canonicalizeSchedulingState(createCard({
      schedulerType: 'a-factor-v2',
    }), {
      source: 'review-commit',
      mode: 'assert-internal',
    })).toThrow(/Dirty scheduling state/);
  });

  it('strips nested queue nextDues snapshots without touching normal values', () => {
    const snapshot = {
      queue: {
        entries: [
          { cardId: 'a', nextDues: { good: 1 }, due: 2 },
          { cardId: 'b', preview: { nextDues: { hard: 3 }, label: 'kept' } },
        ],
      },
    };

    const result = stripTransientSchedulingPreviewFields(snapshot);

    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      queue: {
        entries: [
          { cardId: 'a', due: 2 },
          { cardId: 'b', preview: { label: 'kept' } },
        ],
      },
    });
  });

  it('reports dirty counts for diagnostics without mutating cards', () => {
    const dirty = createCard({
      id: 'dirty',
      schedulerType: 'a-factor-v2',
    });
    const clean = createCard({ id: 'clean', state: CardState.New });

    const summary = summarizeSchedulingStateCleanliness([dirty, clean]);

    expect(summary.total).toBe(2);
    expect(summary.dirty).toBe(1);
    expect(summary.reasons.schedulerType).toBe(1);
    expect(dirty.schedulerType).toBe('a-factor-v2');
  });
});
