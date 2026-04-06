import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';

function createFixture(
  cardsByBlockId: Record<string, FSRSCard[]>,
  options?: {
    docScope?: { cards: FSRSCard[]; docIds: string[] } | null;
    hasDoc?: boolean;
  },
) {
  const storage = {
    getCardsByBlockId: vi.fn((blockId: string) => cardsByBlockId[blockId] || []),
    getCardByBlockId: vi.fn((blockId: string) => (cardsByBlockId[blockId] || [])[0] || null),
    getAllCards: vi.fn(() => []),
  };

  const dialogManager = {
    openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
    openIncrementalLearningWithFilter: vi.fn().mockResolvedValue(undefined),
    openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
  };

  const docTreeReviewScopeService = {
    collectDocReviewScope: vi.fn(() => options?.docScope ?? { cards: [], docIds: [] }),
    isReady: vi.fn(() => true),
    hydrate: vi.fn().mockResolvedValue(undefined),
    scheduleRebuild: vi.fn(),
    hasDoc: vi.fn(() => options?.hasDoc ?? false),
  };

  const handler = new BlockMenuHandler({
    app: {} as any,
    i18n: {
      retrievalPractice: '提取练习',
      incrementalLearning: '渐进学习',
      temporaryDrill: '临时练习',
      dueMode: '到期',
      allMode: '全部',
      addToFinalDrillQueue: '添加到刻意练习',
    },
    dialogManager: dialogManager as any,
    openCreateTemplateCardDialog: vi.fn().mockResolvedValue(undefined),
    openNeuralReviewDialog: vi.fn().mockResolvedValue(undefined),
    applicationContext: {
      getStorage: () => storage,
      getCardService: vi.fn(),
      getPlugin: vi.fn(),
      getReviewService: vi.fn(),
      getXiuyuanApplicationService: vi.fn(),
      getUnifiedDataSourceManager: vi.fn(),
      getDocTreeReviewScopeService: () => docTreeReviewScopeService,
    } as any,
    cardCreationHelper: {} as any,
    siyuanApi: {
      BUILTIN_DECK_ID: 'builtin',
      CARD_ID_ATTR: 'custom-fsrs-card-id',
      pushMsg: vi.fn().mockResolvedValue(undefined),
      pushErrMsg: vi.fn().mockResolvedValue(undefined),
      sql: vi.fn().mockResolvedValue([]),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
      getBlockText: vi.fn().mockResolvedValue(''),
      setBlockAttrs: vi.fn().mockResolvedValue(undefined),
      markBlockAsCard: vi.fn().mockResolvedValue(undefined),
      getCardBlockIds: vi.fn().mockResolvedValue([]),
      addRiffCards: vi.fn().mockResolvedValue({ name: '', size: 0 }),
    },
  });

  return {
    handler,
    dialogManager,
  };
}

function createFixtureWithDeferredDialogManager(cardsByBlockId: Record<string, FSRSCard[]>) {
  const storage = {
    getCardsByBlockId: vi.fn((blockId: string) => cardsByBlockId[blockId] || []),
    getCardByBlockId: vi.fn((blockId: string) => (cardsByBlockId[blockId] || [])[0] || null),
    getAllCards: vi.fn(() => []),
  };

  const deferredDialogManager = {
    openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
    openIncrementalLearningWithFilter: vi.fn().mockResolvedValue(undefined),
    openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
  };

  const docTreeReviewScopeService = {
    collectDocReviewScope: vi.fn(() => ({ cards: [], docIds: [] })),
    isReady: vi.fn(() => true),
    hydrate: vi.fn().mockResolvedValue(undefined),
    scheduleRebuild: vi.fn(),
    hasDoc: vi.fn(() => false),
  };

  const handler = new BlockMenuHandler({
    app: {} as any,
    i18n: {
      retrievalPractice: '提取练习',
      incrementalLearning: '渐进学习',
      temporaryDrill: '临时练习',
      dueMode: '到期',
      allMode: '全部',
      addToFinalDrillQueue: '添加到刻意练习',
    },
    dialogManager: undefined as unknown as any,
    openCreateTemplateCardDialog: vi.fn().mockResolvedValue(undefined),
    openNeuralReviewDialog: vi.fn().mockResolvedValue(undefined),
    applicationContext: {
      getStorage: () => storage,
      getCardService: vi.fn(),
      getPlugin: vi.fn(),
      getReviewService: vi.fn(),
      getXiuyuanApplicationService: vi.fn(),
      getUnifiedDataSourceManager: vi.fn(),
      getDocTreeReviewScopeService: () => docTreeReviewScopeService,
    } as any,
    cardCreationHelper: {} as any,
    siyuanApi: {
      BUILTIN_DECK_ID: 'builtin',
      CARD_ID_ATTR: 'custom-fsrs-card-id',
      pushMsg: vi.fn().mockResolvedValue(undefined),
      pushErrMsg: vi.fn().mockResolvedValue(undefined),
      sql: vi.fn().mockResolvedValue([]),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
      getBlockText: vi.fn().mockResolvedValue(''),
      setBlockAttrs: vi.fn().mockResolvedValue(undefined),
      markBlockAsCard: vi.fn().mockResolvedValue(undefined),
      getCardBlockIds: vi.fn().mockResolvedValue([]),
      addRiffCards: vi.fn().mockResolvedValue({ name: '', size: 0 }),
    },
  });

  (handler as any).deps.dialogManager = deferredDialogManager;

  return {
    handler,
    deferredDialogManager,
  };
}

describe('BlockMenuHandler core review entry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runCoreEntryAction delegates to retrieval due flow', async () => {
    const now = Date.now();
    const cardsByBlockId: Record<string, FSRSCard[]> = {
      'block-1': [
        { id: 'item-due', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard,
        { id: 'item-future', blockId: 'block-1', type: 'item', due: now + 10_000 } as FSRSCard,
      ],
    };
    const { handler, dialogManager } = createFixture(cardsByBlockId);

    const element = document.createElement('div');
    element.setAttribute('data-node-id', 'block-1');

    await handler.runCoreEntryAction('retrieval-due', [element]);

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-1'],
      dueOnly: true,
    });
  });

  it('keeps core action order in block menu and preserves add-to-final entry', () => {
    const now = Date.now();
    const cardsByBlockId: Record<string, FSRSCard[]> = {
      'block-1': [
        { id: 'item-due', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard,
      ],
    };
    const { handler } = createFixture(cardsByBlockId);

    const menu = {
      addItem: vi.fn(),
    };
    const element = document.createElement('div');
    element.setAttribute('data-node-id', 'block-1');

    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [element],
      },
    });

    expect(menu.addItem).toHaveBeenCalledTimes(1);
    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ icon?: string; type?: string }>;

    expect(submenu[0].icon).toBe('iconRiffCard');
    expect(submenu[1].icon).toBe('iconRiffCard');
    expect(submenu[2].type).toBe('separator');
    expect(submenu[3].icon).toBe('iconBook');
    expect(submenu[4].icon).toBe('iconBook');
    expect(submenu[5].type).toBe('separator');
    expect(submenu[6].icon).toBe('iconEye');
    expect(submenu[7].type).toBe('separator');
    expect(submenu[8].icon).toBe('iconAdd');
  });

  it('uses deferred dialogManager when it is injected after handler construction', async () => {
    const now = Date.now();
    const cardsByBlockId: Record<string, FSRSCard[]> = {
      'block-1': [
        { id: 'item-due', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard,
      ],
    };
    const { handler, deferredDialogManager } = createFixtureWithDeferredDialogManager(cardsByBlockId);

    const element = document.createElement('div');
    element.setAttribute('data-node-id', 'block-1');

    await handler.runCoreEntryAction('temporary-drill', [element]);

    expect(deferredDialogManager.openTemporaryDrill).toHaveBeenCalledWith(['block-1']);
  });

  it('passes doc scope ids through doc tree review menu actions', async () => {
    const now = Date.now();
    const scopeCards: FSRSCard[] = [
      { id: 'item-1', blockId: 'topic-block-1', type: 'item', due: now - 1, meta: { rootId: 'doc-1' } } as FSRSCard,
    ];
    const { handler, dialogManager } = createFixture({}, {
      docScope: {
        cards: scopeCards,
        docIds: ['doc-1', 'doc-1-child'],
      },
      hasDoc: true,
    });

    const menu = { addItem: vi.fn() };
    const element = document.createElement('div');
    element.setAttribute('data-node-id', 'doc-1');

    handler.handleDocTreeMenu({
      detail: {
        menu,
        elements: [element],
      },
    });

    const submenu = menu.addItem.mock.calls[0][0].submenu as Array<{ click?: () => Promise<void> }>;
    await submenu[1]?.click?.();

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['topic-block-1'],
      scopeDocIds: ['doc-1', 'doc-1-child'],
      dueOnly: false,
    });
  });
});
