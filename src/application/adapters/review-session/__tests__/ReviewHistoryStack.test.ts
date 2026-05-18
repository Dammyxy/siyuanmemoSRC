import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import {
  ReviewHistoryStack,
  type ReviewTransaction,
} from '..';

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: overrides.xiuyuanID ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
    due: 1,
    stability: 1,
    difficulty: 1,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function transaction(cardId: string): ReviewTransaction {
  return {
    action: 'rate',
    cardId,
    cardBefore: card(cardId),
    queueSnapshots: [],
    sessionExcludedCardIdsBefore: [],
    sessionExcludedLogicalKeysBefore: [],
  };
}

describe('ReviewHistoryStack', () => {
  it('keeps bounded cloned history entries and pops oldest entries first', () => {
    const history = new ReviewHistoryStack(2);
    const first = card('first');
    const second = card('second');
    const third = card('third');
    history.push(first, null);
    history.push(second, null);
    history.push(third, null);
    first.id = 'mutated';

    expect(history.canGoBack()).toBe(true);
    expect(history.pop()?.item.id).toBe('third');
    expect(history.pop()?.item.id).toBe('second');
    expect(history.pop()).toBeNull();
  });

  it('discards only the matching failed history entry at the top', () => {
    const history = new ReviewHistoryStack();
    const firstTransaction = transaction('first');
    const failedTransaction = transaction('failed');
    history.push(card('first'), firstTransaction);
    history.push(card('failed'), failedTransaction);

    expect(history.discardFailedEntry(card('failed'), firstTransaction)).toBe(false);
    expect(history.discardFailedEntry(card('other'), failedTransaction)).toBe(false);
    expect(history.discardFailedEntry(card('failed'), failedTransaction)).toBe(true);
    expect(history.pop()?.item.id).toBe('first');
  });

  it('clears all history entries', () => {
    const history = new ReviewHistoryStack();
    history.push(card('one'), transaction('one'));
    history.push(card('two'), null);

    history.clear();

    expect(history.canGoBack()).toBe(false);
    expect(history.pop()).toBeNull();
  });

  it('preserves transaction object identity for rollback owners', () => {
    const history = new ReviewHistoryStack();
    const reviewTransaction = transaction('card-a');

    history.push(card('card-a'), reviewTransaction);

    expect(history.pop()?.transaction).toBe(reviewTransaction);
  });

  it('accepts synthetic NeuralRoam session-only history entries', () => {
    const history = new ReviewHistoryStack();
    const neuralNode = card('node-a', {
      type: CardType.Concept,
      meta: { queueType: QueueType.NeuralRoam },
    });

    history.push(neuralNode, null);

    expect(history.pop()?.item.id).toBe('node-a');
  });
});
