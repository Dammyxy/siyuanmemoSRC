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
  deleteCards: ReturnType<typeof vi.fn>;
  batchDeleteFSRSCards: ReturnType<typeof vi.fn>;
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
      deleteCards: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          deletedCount: 1,
          deletedCardIds: ['card-1'],
          failedCardIds: [],
        },
      }),
      batchDeleteFSRSCards: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          attemptedCount: 1,
          deletedCount: 1,
          deletedCardIds: ['card-1'],
          failedCardIds: [],
        },
      }),
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

    expect(cardService.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([nextCard], {});
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

  it('overlays committed backend review cards on local reads without frontend persistence', async () => {
    const now = Date.now();
    const before = createCard({
      id: 'card-review-overlay',
      blockId: '20260424190358-j8zdutw',
      due: now - 1_000,
      scheduledDays: 1,
      reps: 1,
    });
    const after = createCard({
      ...before,
      due: now + 7 * 86_400_000,
      scheduledDays: 7,
      reps: 2,
      updatedAt: now,
    });
    cardService.getCard.mockResolvedValue({ card: before });
    cardService.getCards.mockResolvedValue({ cards: [before], total: 1 });

    await facade.refreshCommittedBackendReviewCard(after);

    await expect(facade.getCard(before.id)).resolves.toEqual(expect.objectContaining({
      id: before.id,
      due: after.due,
      scheduledDays: after.scheduledDays,
      reps: after.reps,
    }));
    await expect(facade.getCards({ dueDate: { lte: new Date(now) } })).resolves.toEqual([]);
    expect(cardService.batchUpdateCardsWithoutEvents).not.toHaveBeenCalled();
  });

  it('clears committed backend review overlay after batch delete', async () => {
    const now = Date.now();
    const deleted = createCard({
      id: 'card-review-overlay-delete',
      blockId: '20260424190358-aprfis7',
      due: now + 7 * 86_400_000,
      scheduledDays: 7,
      reps: 2,
    });
    cardService.getCards.mockResolvedValue({ cards: [], total: 0 });
    cardService.batchDeleteFSRSCards.mockResolvedValueOnce({
      ok: true,
      value: {
        attemptedCount: 1,
        deletedCount: 1,
        deletedCardIds: [deleted.id],
        failedCardIds: [],
      },
    });

    await facade.refreshCommittedBackendReviewCard(deleted);
    await expect(facade.getCards({ blockIds: [deleted.blockId] })).resolves.toEqual([
      expect.objectContaining({ id: deleted.id }),
    ]);

    await facade.batchDeleteCards([deleted.id]);

    await expect(facade.getCards({ blockIds: [deleted.blockId] })).resolves.toEqual([]);
  });

  it('routes browser batch delete through FSRS local tombstone deletion instead of Xiuyuan batch delete', async () => {
    const deleted = createCard({
      id: 'card-batch-delete',
      blockId: '20260424190358-batchdel',
      xiuyuanID: '',
    });
    cardService.getCards.mockResolvedValue({ cards: [], total: 0 });
    cardService.batchDeleteFSRSCards.mockResolvedValueOnce({
      ok: true,
      value: {
        attemptedCount: 1,
        deletedCount: 1,
        deletedCardIds: [deleted.id],
        failedCardIds: [],
      },
    });

    const result = await facade.batchDeleteCards([deleted.id]);

    expect(cardService.batchDeleteFSRSCards).toHaveBeenCalledWith({
      cardIds: [deleted.id],
    });
    expect(cardService.deleteCards).not.toHaveBeenCalled();
    expect(result).toEqual({
      attemptedCount: 1,
      deletedCount: 1,
      deletedCardIds: [deleted.id],
      failedCardIds: [],
    });
  });
});
