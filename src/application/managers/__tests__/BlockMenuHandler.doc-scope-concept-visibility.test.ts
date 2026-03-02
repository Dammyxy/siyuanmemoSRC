import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';

function createFixture(cardsByBlockId: Record<string, FSRSCard[]>, allCards: FSRSCard[]) {
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
    const { handler } = createFixture(cardsByBlockId, allCards);

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

    const menu = { addItem: vi.fn() };
    handler.handleEditorTitleIconClick({
      detail: {
        menu,
        data: { rootID: 'doc-1' },
      },
    });

    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    expect(submenu[0].label || '').toContain('(2/2)');
    expect(submenu[1].label || '').toContain('(2)');
  });

  it('does not show concept creation actions in regular block icon menu', () => {
    const now = Date.now();
    const card = { id: 'card-1', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard;
    const { handler } = createFixture({ 'block-1': [card] }, [card]);

    const block = document.createElement('div');
    block.setAttribute('data-node-id', 'block-1');

    const menu = { addItem: vi.fn() };
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [block],
      },
    });

    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    const labels = submenu.map((item) => item.label || '');

    expect(labels.some((label) => label.includes('制作为概念卡并加入队列'))).toBe(false);
    expect(labels.some((label) => label.includes('制作为概念卡并立即漫游'))).toBe(false);
  });

  it('keeps concept creation actions in block reference menu', () => {
    const { handler } = createFixture({}, []);
    const menu = { addItem: vi.fn() };

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

    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ label?: string }>;
    const labels = submenu.map((item) => item.label || '');

    expect(labels.some((label) => label.includes('制作为概念卡并加入队列'))).toBe(true);
    expect(labels.some((label) => label.includes('制作为概念卡并立即漫游'))).toBe(true);
  });
});
