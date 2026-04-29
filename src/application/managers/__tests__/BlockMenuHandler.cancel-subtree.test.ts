import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';

function createFixture(params: {
  cardsByBlockId: Record<string, FSRSCard[]>;
  subtreeRows: Array<{ id: string }>;
}) {
  const storage = {
    getCardsByBlockId: vi.fn((blockId: string) => params.cardsByBlockId[blockId] || []),
    getCardByBlockId: vi.fn((blockId: string) => (params.cardsByBlockId[blockId] || [])[0] || null),
    getAllCards: vi.fn(() => []),
  };

  const cardService = {
    deleteCards: vi.fn(async ({ cardIds }: { cardIds: string[] }) => ({
      ok: true as const,
      value: {
        deletedCount: cardIds.length,
        failedCardIds: [] as string[],
      },
    })),
    deleteCard: vi.fn(),
  };

  const sql = vi.fn(async () => params.subtreeRows);
  const pushMsg = vi.fn(async () => undefined);
  const pushErrMsg = vi.fn(async () => undefined);
  const docTreeReviewScopeService = {
    hasDoc: vi.fn(() => false),
    collectDocReviewScope: vi.fn(() => ({ cards: [], docIds: [] })),
    isReady: vi.fn(() => true),
    hydrate: vi.fn().mockResolvedValue(undefined),
    scheduleRebuild: vi.fn(),
  };

  const handler = new BlockMenuHandler({
    app: {} as any,
    i18n: {
      deleteCard: '取消闪卡',
    },
    dialogManager: {} as any,
    openCreateTemplateCardDialog: vi.fn(),
    openNeuralReviewDialog: vi.fn(),
    applicationContext: {
      getStorage: () => storage,
      getCardService: () => cardService,
      getUnifiedDataSourceManager: () => ({ getQueue: vi.fn() }),
      getXiuyuanApplicationService: vi.fn(),
      getPlugin: vi.fn(),
      getReviewService: vi.fn(),
      getDocTreeReviewScopeService: () => docTreeReviewScopeService,
    } as any,
    cardCreationHelper: {} as any,
    siyuanApi: {
      BUILTIN_DECK_ID: 'builtin',
      CARD_ID_ATTR: 'custom-fsrs-card-id',
      pushMsg,
      pushErrMsg,
      sql,
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
      getBlockText: vi.fn().mockResolvedValue(''),
      getBlockAttrs: vi.fn().mockResolvedValue({}),
      setBlockAttrs: vi.fn().mockResolvedValue(undefined),
      markBlockAsCard: vi.fn().mockResolvedValue(undefined),
      getCardBlockIds: vi.fn().mockResolvedValue([]),
      addRiffCards: vi.fn().mockResolvedValue({ name: '', size: 0 }),
    },
  });

  return {
    handler,
    cardService,
    sql,
    pushMsg,
  };
}

function createBlockElement(blockId: string): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('data-node-id', blockId);
  return element;
}

function resolveDeleteAction(handler: BlockMenuHandler, elements: HTMLElement[]): () => Promise<void> {
  const menu = {
    addItem: vi.fn(),
  };

  handler.handleBlockIconClick({
    detail: {
      menu,
      blockElements: elements,
    },
  });

  const topLevelItem = menu.addItem.mock.calls[0][0];
  const submenu = topLevelItem.submenu as Array<{ label?: string; click?: () => Promise<void> }>;
  const deleteEntry = submenu.find((entry) => entry.label === '取消闪卡');
  expect(deleteEntry?.click).toBeTypeOf('function');
  return deleteEntry!.click!;
}

describe('BlockMenuHandler cancel flashcards in subtree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels cards on selected block and descendant blocks', async () => {
    const { handler, cardService, pushMsg } = createFixture({
      cardsByBlockId: {
        parent: [{ id: 'card-parent', blockId: 'parent' } as FSRSCard],
        child: [{ id: 'card-child', blockId: 'child' } as FSRSCard],
      },
      subtreeRows: [{ id: 'parent' }, { id: 'child' }],
    });

    const deleteAction = resolveDeleteAction(handler, [createBlockElement('parent')]);
    await deleteAction();

    expect(cardService.deleteCards).toHaveBeenCalledTimes(1);
    expect(cardService.deleteCards).toHaveBeenCalledWith({
      cardIds: ['card-parent', 'card-child'],
    });
    expect(pushMsg).toHaveBeenCalledWith('已取消 2 张闪卡');
  });

  it('deduplicates overlapping subtree cards when multiple roots are selected', async () => {
    const { handler, cardService } = createFixture({
      cardsByBlockId: {
        parent: [{ id: 'card-parent', blockId: 'parent' } as FSRSCard],
        child: [{ id: 'card-shared', blockId: 'child' } as FSRSCard],
        grandchild: [{ id: 'card-shared', blockId: 'grandchild' } as FSRSCard],
      },
      subtreeRows: [{ id: 'parent' }, { id: 'child' }, { id: 'grandchild' }],
    });

    const deleteAction = resolveDeleteAction(handler, [
      createBlockElement('parent'),
      createBlockElement('child'),
    ]);
    await deleteAction();

    expect(cardService.deleteCards).toHaveBeenCalledTimes(1);
    const args = cardService.deleteCards.mock.calls[0][0] as { cardIds: string[] };
    expect(new Set(args.cardIds)).toEqual(new Set(['card-parent', 'card-shared']));
    expect(args.cardIds).toHaveLength(2);
  });
});
