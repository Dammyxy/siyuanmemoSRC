import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { CardTypeMarkerService } from '../CardTypeMarkerService';

function createCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: '',
    blockId: `block-${id}`,
    due: 1,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.Review,
    lastReview: 1,
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

describe('CardTypeMarkerService SQL candidate scan', () => {
  it('hydrates only inconsistent marker candidates when SQL candidate ids are available', async () => {
    const inconsistent = createCard('card-inconsistent', {
      cardTypeMarker: 'concept',
      type: CardType.Item,
    });
    const consistent = createCard('card-consistent', {
      cardTypeMarker: 'descriptor',
      type: CardType.Descriptor,
    });
    const cardById = new Map([
      [inconsistent.id, inconsistent],
      [consistent.id, consistent],
    ]);
    const storage = {
      queryInconsistentCardTypeMarkerIds: vi.fn(() => ['card-inconsistent']),
      getCard: vi.fn((cardId: string) => cardById.get(cardId)),
      getAllCards: vi.fn(() => {
        throw new Error('getAllCards should not be used when SQL candidates are available');
      }),
      setCard: vi.fn(),
      saveCards: vi.fn(async () => undefined),
    };

    const service = new CardTypeMarkerService(storage);
    const fixedCount = await service.fixInconsistentCards();

    expect(fixedCount).toBe(1);
    expect(storage.queryInconsistentCardTypeMarkerIds).toHaveBeenCalledTimes(1);
    expect(storage.getCard).toHaveBeenCalledWith('card-inconsistent');
    expect(storage.getAllCards).not.toHaveBeenCalled();
    expect(storage.setCard).toHaveBeenCalledWith(expect.objectContaining({
      id: 'card-inconsistent',
      type: CardType.Concept,
    }));
    expect(storage.saveCards).toHaveBeenCalledTimes(1);
  });

  it('falls back to full scan when SQL candidate query fails', async () => {
    const inconsistent = createCard('card-inconsistent', {
      cardTypeMarker: 'concept',
      type: CardType.Item,
    });
    const storage = {
      queryInconsistentCardTypeMarkerIds: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
      getCard: vi.fn(),
      getAllCards: vi.fn(() => [inconsistent]),
      setCard: vi.fn(),
      saveCards: vi.fn(async () => undefined),
    };

    const service = new CardTypeMarkerService(storage);
    const fixedCount = await service.fixInconsistentCards();

    expect(fixedCount).toBe(1);
    expect(storage.getAllCards).toHaveBeenCalledTimes(1);
    expect(storage.setCard).toHaveBeenCalledWith(expect.objectContaining({
      id: 'card-inconsistent',
      type: CardType.Concept,
    }));
  });
});
