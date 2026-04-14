import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardEditorApplicationService } from '../CardEditorApplicationService';
import type { ReviewApplicationService } from '../ReviewApplicationService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 6,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 86_400_000,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 40,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    cardTypeMarker: overrides.cardTypeMarker,
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 2,
    isLeech: overrides.isLeech ?? true,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now - 1000,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
    aFactor: overrides.aFactor,
    schedulerType: overrides.schedulerType,
    postponeCount: overrides.postponeCount,
    lastPostponeDate: overrides.lastPostponeDate,
    rescheduleHistory: overrides.rescheduleHistory,
    learning_step: overrides.learning_step,
  };
}

describe('CardEditorApplicationService', () => {
  const cards = new Map<string, FSRSCard>();
  let manager: IUnifiedDataSourceManagerFacade;
  let reviewService: ReviewApplicationService;
  let getCard: ReturnType<typeof vi.fn>;
  let getCards: ReturnType<typeof vi.fn>;
  let updateCard: ReturnType<typeof vi.fn>;
  let rescheduleCard: ReturnType<typeof vi.fn>;
  let getBlockInfo: ReturnType<typeof vi.fn>;
  let getBlockAttrs: ReturnType<typeof vi.fn>;
  let setBlockAttrs: ReturnType<typeof vi.fn>;
  let service: CardEditorApplicationService;

  beforeEach(() => {
    cards.clear();
    cards.set('card-1', buildCard({
      id: 'card-1',
      blockId: 'block-1',
      type: CardType.Item,
      priority: 61,
    }));

    getCard = vi.fn(async (cardId: string) => {
      const card = cards.get(cardId);
      if (!card) {
        throw new Error(`Missing card: ${cardId}`);
      }
      return { ...card, meta: card.meta ? { ...card.meta } : undefined };
    });

    getCards = vi.fn(async (filter?: { blockIds?: string[] }) => {
      const blockIds = filter?.blockIds ?? [];
      return Array.from(cards.values())
        .filter((card) => blockIds.length === 0 || blockIds.includes(card.blockId))
        .map((card) => ({ ...card, meta: card.meta ? { ...card.meta } : undefined }));
    });

    updateCard = vi.fn(async (card: FSRSCard) => {
      cards.set(card.id, { ...card, meta: card.meta ? { ...card.meta } : undefined });
    });

    manager = {
      getCard,
      getCards,
      updateCard,
    } as unknown as IUnifiedDataSourceManagerFacade;

    getBlockInfo = vi.fn(async () => ({
      created_time: '20260307093000',
      last_edited_time: '20260307100000',
    }));
    getBlockAttrs = vi.fn(async () => ({}));
    setBlockAttrs = vi.fn(async () => undefined);

    rescheduleCard = vi.fn(async (_cardId: string, _options: unknown) => {
      const nextCard = buildCard({
        ...cards.get('card-1'),
        due: 1_800_000_000_000,
        updatedAt: 1_800_000_000_500,
      });
      cards.set(nextCard.id, nextCard);
      return nextCard;
    });

    reviewService = {
      rescheduleCard,
      getSiyuanApi: () => ({
        getBlockInfo,
        getBlockAttrs,
        setBlockAttrs,
      }),
    } as unknown as ReviewApplicationService;

    service = new CardEditorApplicationService(manager, reviewService);
  });

  it('loads snapshot by block id and resolves block timestamps', async () => {
    const snapshot = await service.loadSnapshot('block-1');

    expect(getCards).toHaveBeenCalledWith({ blockIds: ['block-1'] });
    expect(snapshot.card.id).toBe('card-1');
    expect(snapshot.blockInfo.createdAt).toBe(new Date(2026, 2, 7, 9, 30, 0).getTime());
    expect(snapshot.blockInfo.updatedAt).toBe(new Date(2026, 2, 7, 10, 0, 0).getTime());
  });

  it('prefers the requested card id when a block contains multiple cards', async () => {
    cards.set('card-2', buildCard({
      id: 'card-2',
      blockId: 'block-1',
      priority: 12,
      type: CardType.Descriptor,
    }));

    const snapshot = await service.loadSnapshot('block-1', 'card-2');

    expect(getCard).toHaveBeenCalledWith('card-2', { silent: true });
    expect(snapshot.card.id).toBe('card-2');
    expect(snapshot.card.priority).toBe(12);
    expect(snapshot.card.type).toBe(CardType.Descriptor);
  });

  it('updates priority through unified manager and clamps the value', async () => {
    const snapshot = await service.updatePriority('card-1', 132);

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(cards.get('card-1')?.priority).toBe(100);
    expect(snapshot.card.priority).toBe(100);
  });

  it('updates card type through shared transition logic', async () => {
    const snapshot = await service.updateCardType('card-1', CardType.Topic);

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(snapshot.card.type).toBe(CardType.Topic);
    expect(snapshot.card.aFactor).toBeTypeOf('number');
    expect(snapshot.card.meta).toMatchObject({
      forceProtyleRender: true,
    });
  });

  it('updates render through shared transition logic without changing card type', async () => {
    const snapshot = await service.updateRender('card-1', 'concept-definition-reverse');

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(snapshot.card.type).toBe(CardType.Item);
    expect(snapshot.card.meta).toMatchObject({
      renderProfile: 'concept-definition',
      typeMarker: 'concept-definition-reverse',
      templateID: 'builtin-concept-definition-reverse',
    });
  });

  it('resets review progress through unified manager', async () => {
    const snapshot = await service.resetProgress('card-1');

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(snapshot.card.state).toBe(CardState.New);
    expect(snapshot.card.reps).toBe(0);
    expect(snapshot.card.lapses).toBe(0);
    expect(snapshot.card.leechCount).toBe(0);
    expect(snapshot.card.isLeech).toBe(false);
  });

  it('delegates scheduling to ReviewApplicationService and rebuilds snapshot', async () => {
    const snapshot = await service.scheduleCard('card-1', {
      mode: 'direct',
      dueTimestamp: 1_800_000_000_000,
    });

    expect(rescheduleCard).toHaveBeenCalledWith('card-1', {
      mode: 'direct',
      dueTimestamp: 1_800_000_000_000,
    });
    expect(snapshot.card.due).toBe(1_800_000_000_000);
    expect(getBlockInfo).toHaveBeenCalledWith('block-1');
  });

  it('sets dismissed state without mutating schedule fields', async () => {
    const original = cards.get('card-1');
    const snapshot = await service.setDismissed('card-1', true);

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(setBlockAttrs).toHaveBeenCalledWith('block-1', { 'custom-fsrs-suspended': 'true' });
    expect(snapshot.card.meta).toMatchObject({ suspended: true });
    expect(snapshot.card.due).toBe(original?.due);
    expect(snapshot.card.state).toBe(original?.state);
    expect(snapshot.card.scheduledDays).toBe(original?.scheduledDays);
    expect(snapshot.card.lastReview).toBe(original?.lastReview);
  });

  it('restores dismissed state without mutating schedule fields', async () => {
    cards.set('card-1', buildCard({
      id: 'card-1',
      blockId: 'block-1',
      meta: { suspended: true },
    }));

    const original = cards.get('card-1');
    const snapshot = await service.setDismissed('card-1', false);

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(setBlockAttrs).toHaveBeenCalledWith('block-1', { 'custom-fsrs-suspended': '' });
    expect(snapshot.card.meta?.suspended).toBeUndefined();
    expect(snapshot.card.due).toBe(original?.due);
    expect(snapshot.card.state).toBe(original?.state);
    expect(snapshot.card.scheduledDays).toBe(original?.scheduledDays);
    expect(snapshot.card.lastReview).toBe(original?.lastReview);
  });

  it('batch sets dismissed state for peer cards while reporting failures', async () => {
    cards.set('card-2', buildCard({
      id: 'card-2',
      blockId: 'block-1',
      priority: 12,
    }));

    const result = await service.setDismissedMany(['card-1', 'card-2', 'missing-card'], true);

    expect(result).toEqual({
      updatedCardIds: ['card-1', 'card-2'],
      failedCardIds: ['missing-card'],
    });
    expect(cards.get('card-1')?.meta).toMatchObject({ suspended: true });
    expect(cards.get('card-2')?.meta).toMatchObject({ suspended: true });
    expect(setBlockAttrs).toHaveBeenCalledWith('block-1', { 'custom-fsrs-suspended': 'true' });
    expect(setBlockAttrs).toHaveBeenCalledTimes(2);
  });
});
