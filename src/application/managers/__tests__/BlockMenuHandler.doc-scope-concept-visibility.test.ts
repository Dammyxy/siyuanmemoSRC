import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';

type DocScopeResult = {
  cards: FSRSCard[];
  docIds: string[];
} | null;

function cloneMenuItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    submenu: Array.isArray(item.submenu)
      ? item.submenu.map((child) => cloneMenuItem(child as Record<string, unknown>))
      : item.submenu,
  };
}

function createSnapshotMenu() {
  const snapshots: Array<Record<string, unknown>> = [];
  return {
    snapshots,
    menu: {
      addItem: vi.fn((item: Record<string, unknown>) => {
        snapshots.push(cloneMenuItem(item));
      }),
    },
  };
}

function createRawMenu() {
  const items: Array<Record<string, unknown>> = [];
  return {
    items,
    menu: {
      addItem: vi.fn((item: Record<string, unknown>) => {
        items.push(item);
      }),
    },
  };
}

function createFixture(params?: {
  cardsByBlockId?: Record<string, FSRSCard[]>;
  allCards?: FSRSCard[];
  docScopeResult?: DocScopeResult | ((docId: string) => DocScopeResult);
}) {
  const cardsByBlockId = params?.cardsByBlockId ?? {};
  const allCards = params?.allCards ?? [];
  const docScopeCollector = typeof params?.docScopeResult === 'function'
    ? params.docScopeResult
    : () => (params && 'docScopeResult' in params ? params.docScopeResult ?? null : { cards: [], docIds: [] });

  const storage = {
    getCardsByBlockId: vi.fn((blockId: string) => cardsByBlockId[blockId] || []),
    getCardByBlockId: vi.fn((blockId: string) => (cardsByBlockId[blockId] || [])[0] || null),
    getAllCards: vi.fn(() => allCards),
  };

  const dialogManager = {
    openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
    openIncrementalLearningWithFilter: vi.fn().mockResolvedValue(undefined),
    openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
  };

  const docTreeReviewScopeService = {
    collectDocReviewScope: vi.fn((docId: string) => docScopeCollector(docId)),
    isReady: vi.fn(() => params?.docScopeResult !== null),
    hydrate: vi.fn().mockResolvedValue(undefined),
    scheduleRebuild: vi.fn(),
    hasDoc: vi.fn((docId: string) => docId.startsWith('doc') || docId.includes('-doc-')),
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
      makeConceptAndAddToQueue: '制作为概念卡并加入队列',
      makeConceptAndStartRoam: '制作为概念卡并立即漫游',
      loading: '加载中...',
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
    docTreeReviewScopeService,
  };
}

describe('BlockMenuHandler doc scope and concept action visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses current document DOM descendants for document review counts when rootId metadata is missing', () => {
    const now = Date.now();
    const allCards: FSRSCard[] = [
      { id: 'card-1', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'card-2', blockId: 'block-2', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'card-outside', blockId: 'block-outside', type: 'item', due: now - 1 } as FSRSCard,
    ];
    const cardsByBlockId: Record<string, FSRSCard[]> = {
      'block-1': [allCards[0]],
      'block-2': [allCards[1]],
      'block-outside': [allCards[2]],
    };
    const { handler } = createFixture({
      cardsByBlockId,
      allCards,
      docScopeResult: { cards: [], docIds: ['doc-1'] },
    });

    const block1 = document.createElement('div');
    block1.setAttribute('data-node-id', 'block-1');
    const block2 = document.createElement('div');
    block2.setAttribute('data-node-id', 'block-2');

    const docRoot = document.createElement('div');
    docRoot.classList.add('protyle-background');
    docRoot.setAttribute('data-node-id', 'doc-1');

    const wysiwyg = document.createElement('div');
    wysiwyg.classList.add('protyle-wysiwyg');
    wysiwyg.append(block1, block2);

    const protyleContent = document.createElement('div');
    protyleContent.classList.add('protyle-content');
    protyleContent.append(docRoot, wysiwyg);
    document.body.appendChild(protyleContent);

    const { menu, snapshots } = createSnapshotMenu();
    handler.handleEditorTitleIconClick({
      detail: {
        menu,
        data: { rootID: 'doc-1' },
      },
    });

    const topLevelItem = snapshots[0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    expect(submenu[0].label || '').toContain('(2/2)');
    expect(submenu[1].label || '').toContain('(2)');
  });

  it('counts topic cards from descendant split and excerpt documents in doc-tree review menus', () => {
    const now = Date.now();
    const allCards: FSRSCard[] = [
      {
        id: 'item-doc-1',
        blockId: 'block-doc-1',
        type: 'item',
        due: now - 1,
        meta: { rootId: 'doc-1' },
      } as FSRSCard,
      {
        id: 'topic-piece-1',
        blockId: 'piece-doc-1',
        type: 'topic',
        due: now - 1,
        meta: { rootId: 'piece-doc-1' },
      } as FSRSCard,
      {
        id: 'topic-excerpt-1',
        blockId: 'excerpt-doc-1',
        type: 'topic',
        due: now - 1,
        meta: { rootId: 'excerpt-doc-1' },
      } as FSRSCard,
    ];

    const { handler, docTreeReviewScopeService } = createFixture({
      allCards,
      docScopeResult: {
        cards: allCards,
        docIds: ['doc-1', 'piece-doc-1', 'excerpt-doc-1'],
      },
    });

    const { menu, snapshots } = createSnapshotMenu();
    const docElement = document.createElement('div');
    docElement.setAttribute('data-node-id', 'doc-1');
    handler.handleDocTreeMenu({
      detail: {
        menu,
        elements: [docElement],
      },
    });

    expect(docTreeReviewScopeService.collectDocReviewScope).toHaveBeenCalledWith('doc-1');
    const topLevelItem = snapshots[0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    expect(submenu[0].label || '').toContain('(1/1)');
    expect(submenu[1].label || '').toContain('(1)');
    expect(submenu[3].label || '').toContain('(3/3)');
    expect(submenu[4].label || '').toContain('(3)');
    expect(submenu[6].label || '').toContain('(3)');
  });

  it('opens incremental learning with recursive child doc ids from document menu scope', async () => {
    const now = Date.now();
    const cards: FSRSCard[] = [
      { id: 'item-doc-1', blockId: 'block-doc-1', type: 'item', due: now - 1, meta: { rootId: 'doc-1' } } as FSRSCard,
      { id: 'topic-piece-1', blockId: 'piece-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'piece-doc-1' } } as FSRSCard,
      { id: 'topic-excerpt-1', blockId: 'excerpt-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'excerpt-doc-1' } } as FSRSCard,
    ];
    const { handler, dialogManager } = createFixture({
      allCards: cards,
      docScopeResult: {
        cards,
        docIds: ['doc-1', 'piece-doc-1', 'excerpt-doc-1'],
      },
    });

    const { menu, items } = createRawMenu();
    handler.handleEditorTitleIconClick({
      detail: {
        menu,
        data: { rootID: 'doc-1' },
      },
    });

    const topLevelItem = items[0];
    const submenu = topLevelItem.submenu as Array<{ click?: () => Promise<void> }>;
    await submenu[4].click?.();

    expect(dialogManager.openIncrementalLearningWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-doc-1', 'piece-doc-1', 'excerpt-doc-1'],
      dueOnly: false,
    });
  });

  it('uses recursive doc scope when right-clicking a document block icon', async () => {
    const now = Date.now();
    const cards: FSRSCard[] = [
      { id: 'item-doc-1', blockId: 'block-doc-1', type: 'item', due: now - 1, meta: { rootId: 'doc-1' } } as FSRSCard,
      { id: 'topic-piece-1', blockId: 'piece-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'piece-doc-1' } } as FSRSCard,
      { id: 'topic-excerpt-1', blockId: 'excerpt-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'excerpt-doc-1' } } as FSRSCard,
    ];
    const { handler, dialogManager, docTreeReviewScopeService } = createFixture({
      allCards: cards,
      docScopeResult: {
        cards,
        docIds: ['doc-1', 'piece-doc-1', 'excerpt-doc-1'],
      },
    });

    const block = document.createElement('div');
    block.setAttribute('data-node-id', 'doc-1');
    block.setAttribute('data-type', 'NodeDocument');

    const { menu, items } = createRawMenu();
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [block],
      },
    });

    expect(docTreeReviewScopeService.collectDocReviewScope).toHaveBeenCalledWith('doc-1');

    const topLevelItem = items[0];
    const submenu = topLevelItem.submenu as Array<{ label?: string; click?: () => Promise<void> }>;
    expect(submenu[0].label || '').toContain('(1/1)');
    expect(submenu[1].label || '').toContain('(1)');
    expect(submenu[3].label || '').toContain('(3/3)');
    expect(submenu[4].label || '').toContain('(3)');
    expect(submenu[6].label || '').toContain('(3)');

    await submenu[4].click?.();

    expect(dialogManager.openIncrementalLearningWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-doc-1', 'piece-doc-1', 'excerpt-doc-1'],
      dueOnly: false,
    });
  });

  it('shows loading review entries when the doc tree index is not ready', () => {
    const { handler } = createFixture({
      docScopeResult: null,
    });

    const { menu, snapshots } = createSnapshotMenu();
    handler.handleDocTreeMenu({
      detail: {
        menu,
        elements: [{
          getAttribute: () => 'doc-1',
        }] as any,
      },
    });

    const topLevelItem = snapshots[0];
    const submenu = topLevelItem.submenu as Array<{ label?: string; disabled?: boolean }>;
    expect(submenu[0].label || '').toContain('加载中...');
    expect(submenu[0].disabled).toBe(true);
    expect(submenu[3].label || '').toContain('加载中...');
    expect(submenu[3].disabled).toBe(true);
    expect(submenu[6].label || '').toContain('加载中...');
    expect(submenu[6].disabled).toBe(true);
  });

  it('does not show concept creation actions in regular block icon menu', () => {
    const now = Date.now();
    const card = { id: 'card-1', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard;
    const { handler } = createFixture({ cardsByBlockId: { 'block-1': [card] }, allCards: [card] });

    const block = document.createElement('div');
    block.setAttribute('data-node-id', 'block-1');

    const { menu, snapshots } = createSnapshotMenu();
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [block],
      },
    });

    const topLevelItem = snapshots[0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    const labels = submenu.map((item) => item.label || '');

    expect(labels.some((label) => label.includes('制作为概念卡并加入队列'))).toBe(false);
    expect(labels.some((label) => label.includes('制作为概念卡并立即漫游'))).toBe(false);
  });

  it('keeps concept creation actions in block reference menu', () => {
    const { handler } = createFixture();
    const { menu, snapshots } = createSnapshotMenu();

    handler.handleBlockRefMenu({
      detail: {
        menu,
        element: {
          dataset: {
            id: 'anchor-block',
          },
        },
      },
    });

    const topLevelItem = snapshots[0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    const labels = submenu.map((item) => item.label || '');

    expect(labels.some((label) => label.includes('制作为概念卡并加入队列'))).toBe(true);
    expect(labels.some((label) => label.includes('制作为概念卡并立即漫游'))).toBe(true);
  });
});
