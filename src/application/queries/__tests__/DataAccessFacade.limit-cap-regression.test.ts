import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { StorageManager } from '@/core/storage/manager';
import { DataAccessFacade } from '../DataAccessFacade';

function createCard(index: number): FSRSCard {
  const now = Date.now();
  const suffix = `b${index.toString(36).padStart(6, '0')}`.slice(0, 7);
  return {
    id: `card-${index}`,
    xiuyuanID: `xiuyuan-${index}`,
    blockId: `${String(20260520000000 + index).padStart(14, '0')}-${suffix}`,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
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
    meta: {
      rootId: `doc-${index}`,
      content: `content-${index}`,
    },
  };
}

type CardServiceLike = {
  getCards: ReturnType<typeof vi.fn>;
  getCard: ReturnType<typeof vi.fn>;
  updateFSRSCard: ReturnType<typeof vi.fn>;
  deleteFSRSCard: ReturnType<typeof vi.fn>;
};

describe('DataAccessFacade host block query regression', () => {
  let cardService: CardServiceLike;
  let siyuanApi: {
  };
  let getExistingBlockIds: ReturnType<typeof vi.fn>;
  let facade: DataAccessFacade;

  beforeEach(() => {
    cardService = {
      getCards: vi.fn().mockResolvedValue({ cards: [], total: 0 }),
      getCard: vi.fn().mockResolvedValue({ card: null }),
      updateFSRSCard: vi.fn(),
      deleteFSRSCard: vi.fn(),
    };
    siyuanApi = {
    };
    getExistingBlockIds = vi.fn().mockResolvedValue(new Set<string>());

    facade = new DataAccessFacade(
      cardService as unknown as CardApplicationService,
      { getSettings: () => ({}) } as unknown as StorageManager,
      undefined,
      undefined,
      siyuanApi as unknown as QuerySiyuanPort,
      { getExistingBlockIds },
    );
  });

  it('keeps all cards when semantic block query returns every requested id', async () => {
    const cards = Array.from({ length: 200 }, (_, index) => createCard(index + 1));
    cardService.getCards.mockResolvedValue({
      cards,
      total: cards.length,
    });
    getExistingBlockIds.mockResolvedValue(new Set(cards.map((card) => card.blockId)));

    const result = await facade.getCards();

    expect(result).toHaveLength(200);
    expect(getExistingBlockIds).toHaveBeenCalledWith(cards.map((card) => card.blockId));
  });
});

