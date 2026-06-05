import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { buildQueueCardProjection, buildQueueSnapshotRow } from '../queueCardProjection';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: 'fsrs-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now + 86_400_000,
    stability: 3,
    difficulty: 4,
    reps: 2,
    lapses: 1,
    state: CardState.Review,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 8,
    priority: 0,
    type: CardType.Topic,
    tags: ['source', 'queue'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 604_800_000,
    updatedAt: now,
    riffCardId: 'riff-1',
    aFactor: 2.1,
    meta: {
      content: '<p>Queue source</p>',
      deckId: 'deck-1',
      rootId: 'root-1',
      note: 'keep note',
      blockType: 'paragraph',
    },
    ...overrides,
  };
}

describe('queue card projection payload seam', () => {
  it('preserves queue projection and snapshot fields', () => {
    vi.setSystemTime(1_700_000_000_000);
    const card = buildCard();

    const projection = buildQueueCardProjection(card, {
      firstReviewMode: 'created-or-last',
      queueIndex: 7,
    });
    const snapshot = buildQueueSnapshotRow(card, {
      firstReviewMode: 'created-or-last',
      queueIndex: 7,
    });

    expect(projection).toMatchObject({
      id: 'riff-1',
      fsrsCardId: 'fsrs-1',
      blockId: 'block-1',
      deckId: 'deck-1',
      rootId: 'root-1',
      content: 'Queue source',
      fullContent: '<p>Queue source</p>',
      state: CardState.Review,
      due: 1_700_086_400_000,
      reps: 2,
      lapses: 1,
      scheduledDays: 8,
      interval: 8,
      firstReview: 1_699_395_200_000,
      priority: 0,
      suspended: false,
      tags: ['source', 'queue'],
      note: 'keep note',
      cardType: CardType.Topic,
      aFactor: 2.1,
      queueIndex: 7,
      blockType: 'paragraph',
      meta: expect.objectContaining({
        content: '<p>Queue source</p>',
        deckId: 'deck-1',
        rootId: 'root-1',
      }),
    });
    const { note: _note, ...projectionSnapshotFields } = projection;
    expect(snapshot).toEqual(expect.objectContaining(projectionSnapshotFields));
    expect(snapshot).not.toHaveProperty('note');
    vi.useRealTimers();
  });
});
