import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { StorageManager } from '@/core/storage/manager';
import { DataAccessFacade } from '../DataAccessFacade';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 2.5,
    difficulty: 5.5,
    reps: 3,
    lapses: 1,
    state: CardState.Review,
    lastReview: now - 86_400_000,
    elapsedDays: 2,
    scheduledDays: 5,
    priority: 18,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 1000,
    updatedAt: now,
    meta: {
      content: 'content',
      rootId: 'doc-1',
    },
    ...overrides,
  };
}

type CardServiceLike = {
  getCards: ReturnType<typeof vi.fn>;
  getCard: ReturnType<typeof vi.fn>;
  updateFSRSCard: ReturnType<typeof vi.fn>;
  deleteFSRSCard: ReturnType<typeof vi.fn>;
  batchUpdateCardsWithoutEvents: ReturnType<typeof vi.fn>;
};

describe('DataAccessFacade updateCard regression', () => {
  let cardService: CardServiceLike;
  let siyuanApi: {
    batchSetRiffCardsDueTime: ReturnType<typeof vi.fn>;
  };
  let facade: DataAccessFacade;

  beforeEach(() => {
    cardService = {
      getCards: vi.fn().mockResolvedValue({ cards: [], total: 0 }),
      getCard: vi.fn().mockResolvedValue({ card: null }),
      updateFSRSCard: vi.fn(),
      deleteFSRSCard: vi.fn(),
      batchUpdateCardsWithoutEvents: vi.fn().mockResolvedValue({
        ok: true,
        value: { updatedCount: 1, failedCount: 0 },
      }),
    };
    siyuanApi = {
      batchSetRiffCardsDueTime: vi.fn(),
    };

    facade = new DataAccessFacade(
      cardService as unknown as CardApplicationService,
      { getSettings: () => ({}) } as unknown as StorageManager,
      undefined,
      undefined,
      siyuanApi as unknown as QuerySiyuanPort,
    );
  });

  it('persists semantic type updates through full-card upsert instead of partial FSRS updates', async () => {
    const nextCard = createCard({
      type: CardType.Topic,
      aFactor: 3.2,
      cardTypeMarker: undefined,
      meta: {
        content: 'content',
        rootId: 'doc-1',
        forceProtyleRender: true,
      },
    });

    await facade.updateCard(nextCard);

    expect(cardService.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([nextCard]);
    expect(cardService.updateFSRSCard).not.toHaveBeenCalled();
  });

  it('throws when full-card persistence reports a failed upsert', async () => {
    cardService.batchUpdateCardsWithoutEvents.mockResolvedValueOnce({
      ok: true,
      value: { updatedCount: 0, failedCount: 1 },
    });

    await expect(facade.updateCard(createCard({ type: CardType.Concept }))).rejects.toThrow(
      'Failed to fully persist card',
    );
  });
});
