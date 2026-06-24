import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardCreatedEvent, CardsCreatedEvent, CardDeletedEvent } from '@/core/xiuyuan/domain/events';
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import type { FSRSCard } from '@/types/card';
import { ReviewScopeCardCreationSyncService } from '../ReviewScopeCardCreationSyncService';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {},
    ...overrides,
  } as FSRSCard;
}

describe('ReviewScopeCardCreationSyncService', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus(false);
  });

  afterEach(async () => {
    eventBus.clear();
  });

  it('persists missing rootId and publishes created-card visibility updates', async () => {
    const originalCard = createCard();
    const cardService = {
      getCard: vi.fn(async () => ({ card: originalCard })),
      batchUpdateCardsWithoutEvents: vi.fn(async () => ({
        ok: true as const,
        value: { updatedCount: 1, failedCount: 0 },
      })),
    };
    const unifiedDataSourceManager = {
      onCardCreated: vi.fn(async () => undefined),
    };
    const docTreeReviewScopeService = {
      registerCardRootId: vi.fn(),
    };
    const siyuanApi = {
      sql: vi.fn(async () => [{ id: 'block-1', root_id: 'doc-1', type: 'p' }]),
    };

    const service = new ReviewScopeCardCreationSyncService(
      eventBus,
      cardService as any,
      unifiedDataSourceManager as any,
      docTreeReviewScopeService as any,
      { siyuanApi: siyuanApi as any },
    );

    await eventBus.publish(new CardCreatedEvent('xy-1', 'card-1', 0));

    expect(cardService.getCard).toHaveBeenCalledWith({ cardId: 'card-1' });
    expect(cardService.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'card-1',
        meta: expect.objectContaining({ rootId: 'doc-1' }),
      }),
    ]);
    expect(docTreeReviewScopeService.registerCardRootId).toHaveBeenCalledWith('block-1', 'doc-1');
    expect(unifiedDataSourceManager.onCardCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'card-1',
        meta: expect.objectContaining({ rootId: 'doc-1' }),
      }),
    );

    await service.dispose();
  });

  it('keeps the creation flow alive when rootId cannot be resolved', async () => {
    const originalCard = createCard({
      id: 'card-2',
      blockId: 'missing-block',
    });
    const cardService = {
      getCard: vi.fn(async () => ({ card: originalCard })),
      batchUpdateCardsWithoutEvents: vi.fn(),
    };
    const unifiedDataSourceManager = {
      onCardCreated: vi.fn(async () => undefined),
    };
    const docTreeReviewScopeService = {
      registerCardRootId: vi.fn(),
    };
    const siyuanApi = {
      sql: vi.fn(async () => []),
    };

    const service = new ReviewScopeCardCreationSyncService(
      eventBus,
      cardService as any,
      unifiedDataSourceManager as any,
      docTreeReviewScopeService as any,
      { siyuanApi: siyuanApi as any },
    );

    await eventBus.publish(new CardCreatedEvent('xy-2', 'card-2', 0));

    expect(cardService.batchUpdateCardsWithoutEvents).not.toHaveBeenCalled();
    expect(docTreeReviewScopeService.registerCardRootId).not.toHaveBeenCalled();
    expect(unifiedDataSourceManager.onCardCreated).toHaveBeenCalledWith(originalCard);

    await service.dispose();
  });

  it('coalesces batch created cards into one rootId repair and one review sync pass', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const cardService = {
      getCards: vi.fn(async () => ({ cards: [first, second] })),
      getCard: vi.fn(),
      batchUpdateCardsWithoutEvents: vi.fn(async () => ({
        ok: true as const,
        value: {
          updatedCount: 2,
          failedCount: 0,
          updatedCardIds: ['card-1', 'card-2'],
          failedCardIds: [],
        },
      })),
    };
    const unifiedDataSourceManager = {
      onCardCreated: vi.fn(async () => undefined),
      onCardsCreated: vi.fn(async () => undefined),
    };
    const docTreeReviewScopeService = {
      registerCardRootId: vi.fn(),
    };
    const siyuanApi = {
      sql: vi.fn(async (sql: string) => {
        if (sql.includes("block-1")) {
          return [{ id: 'block-1', root_id: 'doc-1', type: 'p' }];
        }
        return [{ id: 'block-2', root_id: 'doc-2', type: 'p' }];
      }),
    };

    const service = new ReviewScopeCardCreationSyncService(
      eventBus,
      cardService as any,
      unifiedDataSourceManager as any,
      docTreeReviewScopeService as any,
      { siyuanApi: siyuanApi as any },
    );

    await eventBus.publish(new CardsCreatedEvent(
      'cards-created:xy-1',
      ['card-1', 'card-2'],
      ['block-1', 'block-2'],
      ['xy-1', 'xy-2'],
      'doc-oneclick-scan',
    ));

    expect(cardService.getCards).toHaveBeenCalledWith({ filter: { blockIds: ['block-1', 'block-2'] } });
    expect(cardService.batchUpdateCardsWithoutEvents).toHaveBeenCalledTimes(1);
    expect(cardService.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'card-1', meta: expect.objectContaining({ rootId: 'doc-1' }) }),
      expect.objectContaining({ id: 'card-2', meta: expect.objectContaining({ rootId: 'doc-2' }) }),
    ]);
    expect(docTreeReviewScopeService.registerCardRootId).toHaveBeenCalledWith('block-1', 'doc-1');
    expect(docTreeReviewScopeService.registerCardRootId).toHaveBeenCalledWith('block-2', 'doc-2');
    expect(unifiedDataSourceManager.onCardsCreated).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'card-1', meta: expect.objectContaining({ rootId: 'doc-1' }) }),
      expect.objectContaining({ id: 'card-2', meta: expect.objectContaining({ rootId: 'doc-2' }) }),
    ]);

    await service.dispose();
  });

  it('publishes deleted-card visibility updates for single-card deletion events', async () => {
    const cardService = {
      getCard: vi.fn(),
      batchUpdateCardsWithoutEvents: vi.fn(),
    };
    const unifiedDataSourceManager = {
      onCardCreated: vi.fn(async () => undefined),
      onCardsDeleted: vi.fn(async () => undefined),
    };
    const docTreeReviewScopeService = {
      registerCardRootId: vi.fn(),
    };
    const siyuanApi = {
      sql: vi.fn(async () => []),
    };

    const service = new ReviewScopeCardCreationSyncService(
      eventBus,
      cardService as any,
      unifiedDataSourceManager as any,
      docTreeReviewScopeService as any,
      { siyuanApi: siyuanApi as any },
    );

    await eventBus.publish(new CardDeletedEvent('xy-1', 'card-1', 'block-1'));

    expect(unifiedDataSourceManager.onCardsDeleted).toHaveBeenCalledWith(['card-1'], ['block-1']);

    await service.dispose();
  });

  it('publishes deleted-card visibility updates for batch deletion events', async () => {
    const cardService = {
      getCard: vi.fn(),
      batchUpdateCardsWithoutEvents: vi.fn(),
    };
    const unifiedDataSourceManager = {
      onCardCreated: vi.fn(async () => undefined),
      onCardsDeleted: vi.fn(async () => undefined),
    };
    const docTreeReviewScopeService = {
      registerCardRootId: vi.fn(),
    };
    const siyuanApi = {
      sql: vi.fn(async () => []),
    };

    const service = new ReviewScopeCardCreationSyncService(
      eventBus,
      cardService as any,
      unifiedDataSourceManager as any,
      docTreeReviewScopeService as any,
      { siyuanApi: siyuanApi as any },
    );

    await eventBus.publish(new CardsDeletedEvent('batch-delete', ['card-1', 'card-2'], ['block-1']));

    expect(unifiedDataSourceManager.onCardsDeleted).toHaveBeenCalledWith(['card-1', 'card-2'], ['block-1']);

    await service.dispose();
  });
});
