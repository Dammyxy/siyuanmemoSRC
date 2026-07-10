import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { StorageManager } from '@/core/storage/manager';
import { BlockRepository } from '@/core/storage/infrastructure/BlockRepository';
import { DataAccessFacade } from '../DataAccessFacade';

const BLOCK_DEFAULT = '20260520000000-def0000';
const BLOCK_EXISTING = '20260520000001-exist01';
const BLOCK_MISSING = '20260520000002-missing';
const BLOCK_A = '20260520000003-block0a';
const BLOCK_B = '20260520000004-block0b';
const BLOCK_SYNCED_PENDING = '20260520000005-synced1';
const BLOCK_KEYWORD = '20260520000006-keyword';
const BLOCK_FILTERED = '20260520000007-filterd';
const BLOCK_STALE_SOURCE_EXISTS = '20260511184417-j2223s1';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-default',
    xiuyuanID: 'xiuyuan-default',
    blockId: BLOCK_DEFAULT,
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out cards whose block does not exist even when meta already has rootId/content', async () => {
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: BLOCK_EXISTING,
      meta: { rootId: 'doc-existing', content: 'existing content' },
    });
    const missingCard = createCard({
      id: 'card-missing',
      xiuyuanID: 'xiuyuan-missing',
      blockId: BLOCK_MISSING,
      meta: { rootId: 'doc-stale', content: 'stale content should not keep card' },
    });

    cardService.getCards.mockResolvedValue({
      cards: [existingCard, missingCard],
      total: 2,
    });
    getExistingBlockIds.mockResolvedValue(new Set([BLOCK_EXISTING]));

    const cards = await facade.getCards();

    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('card-existing');
  });

  it('keeps cards when block existence check fails (fail-open)', async () => {
    const cardA = createCard({
      id: 'card-a',
      xiuyuanID: 'xiuyuan-a',
      blockId: BLOCK_A,
    });
    const cardB = createCard({
      id: 'card-b',
      xiuyuanID: 'xiuyuan-b',
      blockId: BLOCK_B,
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

  it('keeps source-unchecked cards with incomplete source metadata when host index has not caught up after sync', async () => {
    const syncedPendingCard = createCard({
      id: 'card-synced-pending',
      xiuyuanID: 'xiuyuan-synced-pending',
      blockId: BLOCK_SYNCED_PENDING,
      meta: {
        source: 'auto-listener',
        content: '',
      },
    });
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: BLOCK_EXISTING,
      meta: { rootId: 'doc-existing', content: 'existing content' },
    });

    cardService.getCards.mockResolvedValue({
      cards: [syncedPendingCard, existingCard],
      total: 2,
    });
    getExistingBlockIds.mockResolvedValue(new Set([BLOCK_EXISTING]));
    vi.spyOn(BlockRepository.prototype, 'batchQueryRootIds').mockResolvedValue(new Map([
      [BLOCK_SYNCED_PENDING, 'doc-synced-pending'],
    ]));

    const cards = await facade.getCards();

    expect(cards.map((card) => card.id)).toEqual(['card-synced-pending', 'card-existing']);
  });

  it('filters stale source-existing cards when host no longer finds the block even if content is empty', async () => {
    const staleSourceExistingCard = createCard({
      id: 'card-stale-source-existing',
      xiuyuanID: 'xiuyuan-stale-source-existing',
      blockId: BLOCK_STALE_SOURCE_EXISTS,
      meta: {
        rootId: 'doc-stale-source',
        content: '',
      },
    });
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: BLOCK_EXISTING,
      meta: { rootId: 'doc-existing', content: 'existing content' },
    });

    cardService.getCards.mockResolvedValue({
      cards: [staleSourceExistingCard, existingCard],
      total: 2,
    });
    getExistingBlockIds.mockResolvedValue(new Set([BLOCK_EXISTING]));

    const cards = await facade.getCards();

    expect(cards.map((card) => card.id)).toEqual(['card-existing']);
  });

  it('filters source-unchecked cards with malformed block ids instead of treating them as post-sync pending blocks', async () => {
    const malformedCard = createCard({
      id: 'card-malformed',
      xiuyuanID: 'xiuyuan-malformed',
      blockId: 'missing-block-id',
      meta: {
        source: 'auto-listener',
        content: '',
      },
    });
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: '20260520032910-jsyrycd',
      meta: { rootId: 'doc-existing', content: 'existing content' },
    });

    cardService.getCards.mockResolvedValue({
      cards: [malformedCard, existingCard],
      total: 2,
    });
    getExistingBlockIds.mockResolvedValue(new Set(['20260520032910-jsyrycd']));

    const cards = await facade.getCards();

    expect(cards.map((card) => card.id)).toEqual(['card-existing']);
  });

  it('keeps pure residual filters local and calls cardService without structured prefilter', async () => {
    const card = createCard({
      id: 'card-keyword',
      xiuyuanID: 'xiuyuan-keyword',
      blockId: BLOCK_KEYWORD,
      meta: {
        rootId: 'doc-keyword',
        content: 'needle content',
      },
    });

    cardService.getCards.mockResolvedValue({
      cards: [card],
      total: 1,
    });
    getExistingBlockIds.mockResolvedValue(new Set([BLOCK_KEYWORD]));

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
      blockId: BLOCK_FILTERED,
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
    getExistingBlockIds.mockResolvedValue(new Set([BLOCK_FILTERED]));

    const result = await facade.getCards({
      blockIds: [BLOCK_FILTERED],
      cardType: 'item',
      cardStatus: ['new'],
      dueDate: { lte: new Date() },
      keyword: 'needle',
    });

    expect(cardService.getCards).toHaveBeenCalledWith({
      filter: expect.objectContaining({
        blockIds: [BLOCK_FILTERED],
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
      blockId: BLOCK_MISSING,
    });

    cardService.getCard.mockResolvedValue({ card: missingCard });
    getExistingBlockIds.mockResolvedValue(new Set());

    await expect(facade.getCard('card-missing')).rejects.toThrow('Block not found for card');
  });

  it('returns card when getCard block exists', async () => {
    const existingCard = createCard({
      id: 'card-existing',
      xiuyuanID: 'xiuyuan-existing',
      blockId: BLOCK_EXISTING,
    });

    cardService.getCard.mockResolvedValue({ card: existingCard });
    getExistingBlockIds.mockResolvedValue(new Set([BLOCK_EXISTING]));

    const card = await facade.getCard('card-existing');

    expect(card.id).toBe('card-existing');
    expect(card.blockId).toBe(BLOCK_EXISTING);
  });
});
