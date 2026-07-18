import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import {
  normalizeReviewTransactionUndoJournalEntry,
  type LegacyReviewTransactionUndoJournalEntry,
} from '../ReviewTransactionUndoJournal';

const NOW = 1_779_300_000_000;

function createCard(id: string): FSRSCard {
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId: `block-${id}`,
    due: NOW,
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW,
    meta: {},
  };
}

function createLegacyEntry(): LegacyReviewTransactionUndoJournalEntry {
  const current = createCard('card-current');
  const next = createCard('card-next');
  return {
    schemaVersion: 1,
    transactionId: 'transaction-legacy',
    undoToken: 'undo-legacy',
    sessionId: 'session-legacy',
    queueType: QueueType.IncrementalLearning,
    operation: 'answer',
    cardId: current.id,
    replayedCardId: current.id,
    originalReviewIdempotencyKey: 'review-legacy',
    beforeCard: current,
    afterCard: { ...current, reps: current.reps + 1 },
    frontierBefore: {
      cards: [next],
      current,
      avoidOnceCardId: null,
      avoidOnceBlockId: null,
      projectionGeneration: 17,
      projectionPolicyHash: 'policy-legacy',
    },
    frontierAfter: {
      cards: [],
      current: next,
      avoidOnceCardId: current.id,
      avoidOnceBlockId: current.blockId,
      projectionGeneration: 17,
      projectionPolicyHash: 'policy-legacy',
    },
    queueImpact: null,
    projectionGeneration: 17,
    projectionPolicyHash: 'policy-legacy',
    recordedAt: NOW,
    status: 'open',
    undoneAt: null,
  };
}

describe('ReviewTransactionUndoJournal compact frontier', () => {
  it('normalizes a schema-v1 full-card journal into schema-v2 ordered identities', () => {
    const normalized = normalizeReviewTransactionUndoJournalEntry(createLegacyEntry());

    expect(normalized).toMatchObject({
      schemaVersion: 2,
      beforeCard: expect.objectContaining({ id: 'card-current' }),
      afterCard: expect.objectContaining({ id: 'card-current', reps: 4 }),
      frontierBefore: {
        cardIds: ['card-next'],
        currentCardId: 'card-current',
        currentBlockId: 'block-card-current',
        avoidOnceCardId: null,
        avoidOnceBlockId: null,
        projectionGeneration: 17,
        projectionPolicyHash: 'policy-legacy',
      },
      frontierAfter: {
        cardIds: [],
        currentCardId: 'card-next',
        currentBlockId: 'block-card-next',
        avoidOnceCardId: 'card-current',
        avoidOnceBlockId: 'block-card-current',
        projectionGeneration: 17,
        projectionPolicyHash: 'policy-legacy',
      },
    });
    expect(normalized.frontierBefore).not.toHaveProperty('cards');
    expect(normalized.frontierBefore).not.toHaveProperty('current');
  });

  it('rejects malformed schema-v1 frontier identities', () => {
    const legacy = createLegacyEntry();
    legacy.frontierBefore.cards[0] = {
      ...legacy.frontierBefore.cards[0],
      id: '',
    };

    expect(() => normalizeReviewTransactionUndoJournalEntry(legacy))
      .toThrow('WORKER_REVIEW_UNDO_JOURNAL_INVALID_FRONTIER');
  });
});
