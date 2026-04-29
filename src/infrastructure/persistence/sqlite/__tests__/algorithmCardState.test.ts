import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  applyAlgorithmCardState,
  deriveAlgorithmCardState,
  diagnoseAlgorithmCardStateRow,
  stringifyAlgorithmCardState,
} from '@/infrastructure/persistence/sqlite/algorithmCardState';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-state-codec',
    xiuyuanID: 'xy-state-codec',
    blockId: 'block-state-codec',
    due: 1_700_000_000_000,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: 1_699_900_000_000,
    elapsedDays: 1,
    scheduledDays: 5,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1_699_000_000_000,
    updatedAt: 1_700_000_000_000,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

describe('algorithmCardState codec', () => {
  it('roundtrips FSRS memory state as the active row', () => {
    const card = createCard({ stability: 9, difficulty: 4, scheduledDays: 9 });
    const derived = deriveAlgorithmCardState(card);

    expect(derived.algorithmId).toBe('fsrs-v6');
    expect(derived.state).toMatchObject({
      schedulerType: 'fsrs-v6',
      common: { scheduledDays: 9 },
      fsrs: { stability: 9, difficulty: 4 },
    });

    const applied = applyAlgorithmCardState(createCard({ stability: 1, difficulty: 1 }), {
      cardId: card.id,
      algorithmId: derived.algorithmId,
      stateJson: stringifyAlgorithmCardState(derived.state),
    });

    expect(applied.card.stability).toBe(9);
    expect(applied.card.difficulty).toBe(4);
    expect(applied.invalidStateRow).toBe(false);
  });

  it('allows empty FSRS memory only for non-review states', () => {
    const newCard = createCard({
      state: CardState.New,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
    });
    const derived = deriveAlgorithmCardState(newCard);

    expect(diagnoseAlgorithmCardStateRow(newCard, {
      cardId: newCard.id,
      algorithmId: derived.algorithmId,
      stateJson: stringifyAlgorithmCardState(derived.state),
    })).toMatchObject({
      invalid: false,
      mismatch: false,
    });

    const reviewCard = createCard({
      state: CardState.Review,
      stability: 0,
      difficulty: 0,
    });
    expect(diagnoseAlgorithmCardStateRow(reviewCard, {
      cardId: reviewCard.id,
      algorithmId: 'fsrs-v6',
      stateJson: JSON.stringify({
        ...derived.state,
        common: {
          ...derived.state.common,
          state: CardState.Review,
        },
      }),
    })).toMatchObject({
      invalid: true,
      reasons: expect.arrayContaining(['algorithmState.stability']),
    });
  });

  it('roundtrips Topic state with a-factor-v2 and topic schedulerMeta only', () => {
    const topic = createCard({
      id: 'topic-state-codec',
      type: CardType.Topic,
      schedulerType: 'fsrs-v6',
      aFactor: 4.4,
      schedulerMeta: {
        sm15: { afs: [2], of: 2, optimumInterval: 2 },
      },
    });
    const derived = deriveAlgorithmCardState(topic);

    expect(derived.algorithmId).toBe('a-factor-v2');
    expect(derived.card.schedulerType).toBe('a-factor-v2');
    expect(derived.state.topic?.aFactor).toBe(4.4);
    expect(derived.state.topic?.schedulerMeta).toEqual({
      topic: {
        afs: [4.4],
        of: 4.4,
        optimalInterval: 5,
      },
    });
  });

  it('diagnoses invalid and missing rows without trusting dirty state', () => {
    const card = createCard();

    expect(diagnoseAlgorithmCardStateRow(card, null)).toMatchObject({
      missing: true,
      invalid: false,
      mismatch: false,
    });

    expect(diagnoseAlgorithmCardStateRow(card, {
      cardId: card.id,
      algorithmId: 'fsrs-v6',
      stateJson: JSON.stringify({
        schemaVersion: 1,
        schedulerType: 'fsrs-v6',
        common: {
          due: card.due,
          state: card.state,
          reps: card.reps,
          lapses: card.lapses,
          lastReview: card.lastReview,
          elapsedDays: card.elapsedDays,
          scheduledDays: card.scheduledDays,
        },
        fsrs: { stability: 1, difficulty: 99 },
      }),
    })).toMatchObject({
      missing: false,
      invalid: true,
      mismatch: false,
      reasons: ['algorithmState.difficulty'],
    });
  });
});
