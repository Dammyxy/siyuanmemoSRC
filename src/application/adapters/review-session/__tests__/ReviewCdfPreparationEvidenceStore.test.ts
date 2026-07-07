import { describe, expect, it, vi } from 'vitest';
import { ReviewCdfPreparationEvidenceStore } from '../ReviewCdfPreparationEvidenceStore';
import { CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now + 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

function createStore(logger = { info: vi.fn(), trace: vi.fn() }) {
  return new ReviewCdfPreparationEvidenceStore<FSRSCard | null>({
    queueType: QueueType.RetrievalPractice,
    buildKey: (card) => JSON.stringify({
      id: card.id,
      blockId: card.blockId,
      updatedAt: card.updatedAt,
      liveRelationStatus: card.meta?.liveRelationStatus ?? null,
    }),
    matchesAnyCardIdentity: (card, identities) => identities.has(card.id) || identities.has(card.blockId),
    getCurrentCardId: () => 'current-card',
    logger,
  });
}

describe('ReviewCdfPreparationEvidenceStore', () => {
  it('preserves a pending prime when its own refresh emits one matching card-updated event', async () => {
    const logger = { info: vi.fn(), trace: vi.fn() };
    const store = createStore(logger);
    const nextCard = createCard({ id: 'next-card', blockId: 'next-block' });
    const prepare = vi.fn(async (card: FSRSCard, key: string) => ({
      key,
      preparedCard: { ...card, meta: { ...card.meta, liveRelationStatus: 'active-live' } },
      refreshResult: { updatedCard: card },
    }));

    store.prime(nextCard, { enabled: true, prepare });
    store.handleCardUpdated({
      type: 'card-updated',
      cardIds: [nextCard.id],
      blockIds: [nextCard.blockId],
      timestamp: Date.now(),
    });
    await Promise.resolve();

    const consumed = await store.consume(nextCard, prepare);

    expect(consumed.reused).toBe(true);
    expect(consumed.evidence.preparedCard).toMatchObject({ id: nextCard.id });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('CDF preparation evidence preserved across self update'),
      expect.objectContaining({ pendingCardId: nextCard.id }),
    );
  });

  it('invalidates pending evidence on a second matching update before it is consumed', async () => {
    const store = createStore();
    const nextCard = createCard({ id: 'next-card', blockId: 'next-block' });
    const prepare = vi.fn(async (card: FSRSCard, key: string) => ({
      key,
      preparedCard: { ...card },
      refreshResult: { updatedCard: card },
    }));

    store.prime(nextCard, { enabled: true, prepare });
    store.handleCardUpdated({
      type: 'card-updated',
      cardIds: [nextCard.id],
      blockIds: [nextCard.blockId],
      timestamp: Date.now(),
    });
    store.handleCardUpdated({
      type: 'card-updated',
      cardIds: [nextCard.id],
      blockIds: [nextCard.blockId],
      timestamp: Date.now(),
    });
    await Promise.resolve();

    const consumed = await store.consume(nextCard, prepare);

    expect(consumed.reused).toBe(false);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('clears only completed evidence when a current-card update arrives while another card is pending', async () => {
    const store = createStore();
    const currentCard = createCard({ id: 'current-card', blockId: 'current-block' });
    const nextCard = createCard({ id: 'next-card', blockId: 'next-block' });
    const prepare = vi.fn(async (card: FSRSCard, key: string) => ({
      key,
      preparedCard: { ...card },
      refreshResult: { updatedCard: card },
    }));

    await store.consume(currentCard, prepare);
    store.prime(nextCard, { enabled: true, prepare });
    store.handleCardUpdated({
      type: 'card-updated',
      cardIds: [currentCard.id],
      blockIds: [currentCard.blockId],
      timestamp: Date.now(),
    });
    await Promise.resolve();

    const consumed = await store.consume(nextCard, prepare);

    expect(consumed.reused).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
