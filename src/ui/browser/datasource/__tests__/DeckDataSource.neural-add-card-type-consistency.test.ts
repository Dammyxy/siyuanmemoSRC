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
  const updateCard = vi.fn(async (_card: FSRSCard) => undefined);
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
  };
}

describe('DeckDataSource neural-roam card type consistency', () => {
  it('skips non-concept rows without mutating local cards', async () => {
    const selectedRow = buildBrowserCard({
      id: 'card-1',
      fsrsCardId: 'card-1',
      blockId: 'block-1',
      cardType: 'item',
    });
    const deps: CardTypeConsistencyDependencies = {
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
    expect(ctx.updateCard).not.toHaveBeenCalled();
  });

  it('adds concept rows to neural-roam queue without local repair writeback', async () => {
    const selectedRow = buildBrowserCard({
      id: 'card-2',
      fsrsCardId: 'card-2',
      blockId: 'block-2',
      cardType: 'concept',
    });
    const addConceptBlocksToCurrentRoute = vi.fn(async () => ({
      ok: true,
      status: 'ok',
      blockIds: ['block-2'],
      added: 1,
      skipped: 0,
      routeId: 'route-current',
      message: '已将 1 张 Concept 卡片加入神经漫游当前航线',
    }));
    const deps: CardTypeConsistencyDependencies = {
      detectTypes: vi.fn(async () => new Map()),
    };
    const ctx = createManager({
      cards: [buildFsrsCard({ id: 'card-2', blockId: 'block-2', type: 'item' })],
    });
    const plugin = {
      getContext: () => ({
        getNeuralRoamEntryActionService: () => ({
          addConceptBlocksToCurrentRoute,
        }),
      }),
    };

    const ds = new DeckDataSource(
      ctx.manager,
      { preset: 'all' },
      plugin as never,
      { cardTypeConsistencyDeps: deps }
    );

    const result = await ds.performAction('add-to-neural-roam-queue', [selectedRow]) as { added: number; message: string };

    expect(result.added).toBe(1);
    expect(addConceptBlocksToCurrentRoute).toHaveBeenCalledWith(['block-2'], {
      source: 'browser',
      enabled: true,
    });
    expect(ctx.queueAddCard).not.toHaveBeenCalled();
    expect(deps.detectTypes).not.toHaveBeenCalled();
    expect(ctx.updateCard).not.toHaveBeenCalled();
  });
});
