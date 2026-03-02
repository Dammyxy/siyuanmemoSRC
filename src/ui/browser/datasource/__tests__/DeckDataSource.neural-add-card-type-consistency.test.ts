import { describe, expect, it, vi } from 'vitest';
import { DeckDataSource } from '../DeckDataSource';
import type { BrowserCard } from '../../types';
import type { FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { CardTypeConsistencyDependencies } from '../cardTypeConsistency';

function buildBrowserCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? 'row-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.9,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note ?? '',
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

function buildFsrsCard(overrides: Partial<FSRSCard>): FSRSCard {
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? Date.now(),
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? 0,
    lastReview: overrides.lastReview ?? Date.now(),
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? 'item',
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    meta: overrides.meta ?? {},
  };
}

function createManager(params: { queueAddCard?: ReturnType<typeof vi.fn>; cards: FSRSCard[] }) {
  const queueAddCard = params.queueAddCard ?? vi.fn(async () => undefined);
  const cardByBlockId = new Map(params.cards.map((card) => [card.blockId, card]));

  const getCards = vi.fn(async (filter?: { blockIds?: string[] }) => {
    const blockIds = Array.isArray(filter?.blockIds) ? filter?.blockIds : [];
    if (blockIds.length === 0) {
      return Array.from(cardByBlockId.values());
    }
    return blockIds
      .map((blockId) => cardByBlockId.get(blockId))
      .filter((card): card is FSRSCard => Boolean(card));
  });
  const updateCard = vi.fn(async (card: FSRSCard) => {
    cardByBlockId.set(card.blockId, card);
  });
  const getQueue = vi.fn(() => ({ addCard: queueAddCard }));

  const manager = {
    getQueue,
    getCards,
    updateCard,
  } as unknown as IUnifiedDataSourceManagerFacade;

  return {
    manager,
    getQueue,
    getCards,
    updateCard,
    queueAddCard,
    cardByBlockId,
  };
}

describe('DeckDataSource neural-roam card type consistency', () => {
  it('skips addCard and repairs local type when attribute says non-concept', async () => {
    const selectedRow = buildBrowserCard({
      id: 'card-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      cardType: 'concept',
    });
    const deps: CardTypeConsistencyDependencies = {
      runSql: vi.fn(async () => [{ block_id: 'block-1', value: 'item' }]),
      setBlockType: vi.fn(async () => undefined),
      detectTypes: vi.fn(async () => new Map()),
    };
    const ctx = createManager({
      cards: [buildFsrsCard({ id: 'card-1', blockId: 'block-1', type: 'concept' })],
    });

    const ds = new DeckDataSource(
      ctx.manager,
      { preset: 'all' },
      undefined,
      { cardTypeConsistencyDeps: deps }
    );

    const result = await ds.performAction('add-to-neural-roam-queue', [selectedRow]) as { added: number; message: string };

    expect(result.added).toBe(0);
    expect(ctx.queueAddCard).not.toHaveBeenCalled();
    expect(ctx.updateCard).toHaveBeenCalledTimes(1);
    expect(ctx.updateCard.mock.calls[0][0].type).toBe('item');
  });

  it('repairs local type to concept and adds card to neural-roam queue', async () => {
    const selectedRow = buildBrowserCard({
      id: 'card-2',
      fsrsCardId: 'card-2',
      blockId: 'block-2',
      cardType: 'item',
    });
    const deps: CardTypeConsistencyDependencies = {
      runSql: vi.fn(async () => [{ block_id: 'block-2', value: 'concept' }]),
      setBlockType: vi.fn(async () => undefined),
      detectTypes: vi.fn(async () => new Map()),
    };
    const ctx = createManager({
      cards: [buildFsrsCard({ id: 'card-2', blockId: 'block-2', type: 'item' })],
    });

    const ds = new DeckDataSource(
      ctx.manager,
      { preset: 'all' },
      undefined,
      { cardTypeConsistencyDeps: deps }
    );

    const result = await ds.performAction('add-to-neural-roam-queue', [selectedRow]) as { added: number; message: string };

    expect(result.added).toBe(1);
    expect(ctx.queueAddCard).toHaveBeenCalledTimes(1);
    expect(ctx.queueAddCard).toHaveBeenCalledWith('block-2', 'manual');
    expect(ctx.updateCard).toHaveBeenCalledTimes(1);
    expect(ctx.updateCard.mock.calls[0][0].type).toBe('concept');
  });
});
