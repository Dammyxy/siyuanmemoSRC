import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { StorageManager } from '@/core/storage/manager';
import { DataAccessFacade } from '../DataAccessFacade';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-default',
    xiuyuanID: 'xiuyuan-default',
    blockId: 'block-default',
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {
      rootId: 'doc-default',
      content: 'content-default',
    },
    ...overrides,
  };
}

type CardServiceLike = {
  getCards: ReturnType<typeof vi.fn>;
  getCard: ReturnType<typeof vi.fn>;
  updateFSRSCard: ReturnType<typeof vi.fn>;
  deleteFSRSCard: ReturnType<typeof vi.fn>;
};

describe('DataAccessFacade missing block filtering', () => {
  let cardService: CardServiceLike;
  let siyuanApi: {
    batchSetRiffCardsDueTime: ReturnType<typeof vi.fn>;
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
      batchSetRiffCardsDueTime: vi.fn(),
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

  it('filters out cards whose block does not exist even when meta already has rootId/content', async () => {
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: 'block-existing',
      meta: { rootId: 'doc-existing', content: 'existing content' },
    });
    const missingCard = createCard({
      id: 'card-missing',
      xiuyuanID: 'xiuyuan-missing',
      blockId: 'block-missing',
      meta: { rootId: 'doc-stale', content: 'stale content should not keep card' },
    });

    cardService.getCards.mockResolvedValue({
      cards: [existingCard, missingCard],
      total: 2,
    });
    getExistingBlockIds.mockResolvedValue(new Set(['block-existing']));

    const cards = await facade.getCards();

    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('card-existing');
  });

  it('keeps cards when block existence check fails (fail-open)', async () => {
    const cardA = createCard({
      id: 'card-a',
      xiuyuanID: 'xiuyuan-a',
      blockId: 'block-a',
    });
    const cardB = createCard({
      id: 'card-b',
      xiuyuanID: 'xiuyuan-b',
      blockId: 'block-b',
    });

    cardService.getCards.mockResolvedValue({
      cards: [cardA, cardB],
      total: 2,
    });
    getExistingBlockIds.mockRejectedValue(new Error('host block query unavailable'));

    const cards = await facade.getCards();

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.id)).toEqual(['card-a', 'card-b']);
  });

  it('keeps pure residual filters local and calls cardService without structured prefilter', async () => {
    const card = createCard({
      id: 'card-keyword',
      xiuyuanID: 'xiuyuan-keyword',
      blockId: 'block-keyword',
      meta: {
        rootId: 'doc-keyword',
        content: 'needle content',
      },
    });

    cardService.getCards.mockResolvedValue({
      cards: [card],
      total: 1,
    });
    getExistingBlockIds.mockResolvedValue(new Set(['block-keyword']));

    const result = await facade.getCards({
      keyword: 'needle',
    });

    expect(cardService.getCards).toHaveBeenCalledWith({});
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('card-keyword');
  });

  it('pushes structured filters to cardService while keeping keyword local', async () => {
    const card = createCard({
      id: 'card-filtered',
      xiuyuanID: 'xiuyuan-filtered',
      blockId: 'block-filtered',
      state: CardState.New,
      type: CardType.Item,
      due: Date.now(),
      meta: {
        rootId: 'doc-filtered',
        content: 'this content does not match',
      },
    });

    cardService.getCards.mockResolvedValue({
      cards: [card],
      total: 1,
    });
    getExistingBlockIds.mockResolvedValue(new Set(['block-filtered']));

    const result = await facade.getCards({
      blockIds: ['block-filtered'],
      cardType: 'item',
      cardStatus: ['new'],
      dueDate: { lte: new Date() },
      keyword: 'needle',
    });

    expect(cardService.getCards).toHaveBeenCalledWith({
      filter: expect.objectContaining({
        blockIds: ['block-filtered'],
        cardTypes: ['item'],
        cardStatus: ['new'],
        dueDate: expect.objectContaining({
          lte: expect.any(Date),
        }),
      }),
    });
    expect((cardService.getCards.mock.calls[0]?.[0] as { filter?: { keyword?: string } }).filter?.keyword).toBeUndefined();
    expect(result).toHaveLength(0);
  });

  it('throws when getCard resolves to a card whose block is missing', async () => {
    const missingCard = createCard({
      id: 'card-missing',
      xiuyuanID: 'xiuyuan-missing',
      blockId: 'block-missing',
    });

    cardService.getCard.mockResolvedValue({ card: missingCard });
    getExistingBlockIds.mockResolvedValue(new Set());

    await expect(facade.getCard('card-missing')).rejects.toThrow('Block not found for card');
  });

  it('returns card when getCard block exists', async () => {
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: 'block-existing',
    });

    cardService.getCard.mockResolvedValue({ card: existingCard });
    getExistingBlockIds.mockResolvedValue(new Set(['block-existing']));

    const card = await facade.getCard('card-existing');

    expect(card.id).toBe('card-existing');
    expect(card.blockId).toBe('block-existing');
  });
});
