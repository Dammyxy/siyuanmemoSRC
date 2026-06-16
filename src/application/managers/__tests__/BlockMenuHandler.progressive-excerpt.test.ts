import { beforeEach, describe, expect, it, vi } from 'vitest';

const progressiveExcerptMocks = vi.hoisted(() => ({
  resolveProgressiveExcerptSnapshotFromBlocks: vi.fn(),
}));

vi.mock('@/application/entries/ProgressiveSelectionResolver', async () => {
  const actual = await vi.importActual<typeof import('@/application/entries/ProgressiveSelectionResolver')>(
    '@/application/entries/ProgressiveSelectionResolver',
  );
  return {
    ...actual,
    resolveProgressiveExcerptSnapshotFromBlocks: progressiveExcerptMocks.resolveProgressiveExcerptSnapshotFromBlocks,
  };
});

import type { FSRSCard } from '@/types/card';
import { BlockMenuHandler } from '../BlockMenuHandler';

function createHandler(options?: {
  executeSelectionExcerptAction?: ReturnType<typeof vi.fn>;
}) {
  const executeSelectionExcerptAction = options?.executeSelectionExcerptAction ?? vi.fn(async (input: {
    selection: {
      sourceBlockId: string;
      sourceBlockIds: string[];
      text: string;
      contentDom: string;
    };
    sourceMarkingEnabled: boolean;
    origin: string;
  }) => ({
    kind: 'created' as const,
    excerptEntityId: 'excerpt-doc-1',
    excerptEntityType: 'doc',
    topicCardId: 'card-1',
    sourceBlockId: input.selection.sourceBlockId,
    sourceBlockIds: input.selection.sourceBlockIds,
    containerDocId: 'excerpt-doc-1',
    recordId: 'record-1',
    colorApplied: false,
    sourceMark: {
      enabled: input.sourceMarkingEnabled,
      colorApplied: false,
    },
    preservation: {
      incomplete: false,
      diagnostics: [],
    },
  }));
  const prepareCurrentBlockMarks = vi.fn(() => ({
    rootId: 'topic-doc-root-1',
    topicContext: {
      topicCardId: 'topic-card-1',
      topicBlockId: 'topic-doc-root-1',
      sourceDocId: 'topic-doc-root-1',
      scope: 'doc-root' as const,
    },
    markCount: 1,
    available: true,
  }));
  const createFromCurrentBlockMarks = vi.fn(async () => ({
    created: 1,
    skipped: 0,
    items: [],
  }));
  const storage = {
    getCardsByBlockId: vi.fn((blockId: string) => (blockId === 'block-1'
      ? [{ id: 'item-1', blockId: 'block-1', type: 'item', due: Date.now() - 1 } as FSRSCard]
      : [])),
    getCardByBlockId: vi.fn((blockId: string) => (blockId === 'block-1'
      ? { id: 'item-1', blockId: 'block-1', type: 'item', due: Date.now() - 1 } as FSRSCard
      : null)),
    getAllCards: vi.fn(() => []),
  };
  const dialogManager = {
    openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
    openIncrementalLearningWithFilter: vi.fn().mockResolvedValue(undefined),
    openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    openFinalDrillDialog: vi.fn().mockResolvedValue(undefined),
    openNeuralRoamDialog: vi.fn().mockResolvedValue(undefined),
    openProgressiveSplitDialog: vi.fn().mockResolvedValue(undefined),
    createCdfMultilineTemplateCards: vi.fn().mockResolvedValue(undefined),
  };
  const tabApplicationService = {
    openDocumentTab: vi.fn().mockResolvedValue(undefined),
    openBlockTab: vi.fn().mockResolvedValue(undefined),
  };
  const siyuanApi = {
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
      progressiveExcerptMenuLabel: '摘录',
      progressiveExcerptCreated: '已创建 Topic，已进入今日渐进学习',
      progressiveExcerptCreatedSourceMarkFailed: '已创建 Topic，但原文标记未写入',
      progressiveExcerptPreservationDegraded: '已创建 Topic，但原文链接或块引用可能未完整保留',
      progressiveExcerptBatchMenuLabel: '从当前块高亮补齐 Item',
      progressiveExcerptBatchCreated: '已从当前块高亮补齐 {created} 个 Item',
      progressiveExcerptBatchCreatedSkipped: '已从当前块高亮补齐 {created} 个 Item，跳过 {skipped} 个重复项',
      progressiveExcerptBatchSkipped: '当前块高亮已对应现有 Item，已跳过 {skipped} 个重复项',
      progressiveExcerptBatchFailed: '从当前块高亮补齐 Item 失败：{message}',
      progressiveExcerptBatchUnavailable: '当前块没有可补齐的高亮 Item',
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
      getDocTreeReviewScopeService: () => ({
        collectDocReviewScope: vi.fn(() => ({ cards: [], docIds: [] })),
        isReady: vi.fn(() => true),
        hydrate: vi.fn().mockResolvedValue(undefined),
        scheduleRebuild: vi.fn(),
        hasDoc: vi.fn(() => false),
      }),
      getSelectionExcerptService: () => ({
        executeSelectionExcerptAction,
      }),
      getSelectionTopicContinuationService: () => ({
        prepareCurrentBlockMarks,
        createFromCurrentBlockMarks,
      }),
      getTabApplicationService: () => tabApplicationService,
    } as any,
    cardCreationHelper: {} as any,
    siyuanApi: siyuanApi as any,
  });

  return {
    handler,
    executeSelectionExcerptAction,
    prepareCurrentBlockMarks,
    createFromCurrentBlockMarks,
    siyuanApi,
    tabApplicationService,
  };
}

describe('BlockMenuHandler progressive excerpt block-menu flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('adds the excerpt action to the block submenu and excerpts all selected blocks', async () => {
    const { handler, executeSelectionExcerptAction, siyuanApi } = createHandler();
    const blockOne = document.createElement('div');
    blockOne.setAttribute('data-node-id', 'block-1');
    const blockTwo = document.createElement('div');
    blockTwo.setAttribute('data-node-id', 'block-2');
    progressiveExcerptMocks.resolveProgressiveExcerptSnapshotFromBlocks.mockReturnValue({
      blockId: 'block-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1', 'block-2'],
      text: 'Alpha\nBeta',
      contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div><div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      range: document.createRange(),
      blockSelections: [
        { blockId: 'block-1', mode: 'full-block', excerptHtml: '<div></div>' },
        { blockId: 'block-2', mode: 'full-block', excerptHtml: '<div></div>' },
      ],
      commonElement: blockOne,
      root: null,
      protyle: null,
    });

    const menu = { addItem: vi.fn() };
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [blockOne, blockTwo],
      },
    });

    const topLevelItem = menu.addItem.mock.calls[0][0];
    expect(topLevelItem.label).toBe('SiYuanMemo');
    const submenu = topLevelItem.submenu as Array<{ label?: string; icon?: string; click?: () => Promise<void> }>;
    const excerptItem = submenu.find((item) => item.label === '摘录');

    expect(excerptItem).toBeDefined();
    expect(excerptItem?.icon).toBe('iconQuote');

    await excerptItem?.click?.();

    expect(progressiveExcerptMocks.resolveProgressiveExcerptSnapshotFromBlocks).toHaveBeenCalledWith([blockOne, blockTwo]);
    expect(executeSelectionExcerptAction).toHaveBeenCalledWith({
      selection: expect.objectContaining({
        sourceBlockId: 'block-1',
        sourceBlockIds: ['block-1', 'block-2'],
        text: 'Alpha\nBeta',
        contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div><div data-type="NodeParagraph" class="p"><div contenteditable="true">Beta</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      }),
      origin: 'block-menu',
      sourceMarkingEnabled: true,
    });
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已创建 Topic，已进入今日渐进学习');
  });

  it('reports created source-mark diagnostics from the shared action', async () => {
    const executeSelectionExcerptAction = vi.fn(async (input: {
      selection: { sourceBlockId: string; sourceBlockIds: string[] };
    }) => ({
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc' as const,
      topicCardId: 'card-1',
      sourceBlockId: input.selection.sourceBlockId,
      sourceBlockIds: input.selection.sourceBlockIds,
      containerDocId: 'excerpt-doc-1',
      recordId: 'record-1',
      colorApplied: false,
      sourceMark: {
        enabled: true,
        colorApplied: false,
        diagnostic: {
          code: 'source-mark-persist-failed' as const,
          message: '原文标记未写入',
        },
      },
      preservation: {
        incomplete: false,
        diagnostics: [],
      },
    }));
    const { handler, siyuanApi } = createHandler({ executeSelectionExcerptAction });
    const blockOne = document.createElement('div');
    blockOne.setAttribute('data-node-id', 'block-1');
    progressiveExcerptMocks.resolveProgressiveExcerptSnapshotFromBlocks.mockReturnValue({
      blockId: 'block-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1'],
      text: 'Alpha',
      contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      range: document.createRange(),
      blockSelections: [
        { blockId: 'block-1', mode: 'full-block', excerptHtml: '<div></div>' },
      ],
      commonElement: blockOne,
      root: null,
      protyle: null,
    });

    const menu = { addItem: vi.fn() };
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [blockOne],
      },
    });

    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ label?: string; icon?: string; click?: () => Promise<void> }>;
    const excerptItem = submenu.find((item) => item.label === '摘录');

    await excerptItem?.click?.();

    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已创建 Topic，但原文标记未写入');
  });

  it('fails closed when the shared block-menu excerpt action throws', async () => {
    const executeSelectionExcerptAction = vi.fn(async () => {
      throw new Error('PROGRESSIVE_EXCERPT_HIGHLIGHT_UNAVAILABLE: failed to prepare progressive excerpt highlight: highlight planner down');
    });
    const { handler, siyuanApi } = createHandler({ executeSelectionExcerptAction });
    const blockOne = document.createElement('div');
    blockOne.setAttribute('data-node-id', 'block-1');
    progressiveExcerptMocks.resolveProgressiveExcerptSnapshotFromBlocks.mockReturnValue({
      blockId: 'block-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1'],
      text: 'Alpha',
      contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      range: document.createRange(),
      blockSelections: [
        { blockId: 'block-1', mode: 'full-block', excerptHtml: '<div></div>' },
      ],
      commonElement: blockOne,
      root: null,
      protyle: null,
    });

    const menu = { addItem: vi.fn() };
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [blockOne],
      },
    });

    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ label?: string; icon?: string; click?: () => Promise<void> }>;
    const excerptItem = submenu.find((item) => item.label === '摘录');

    await excerptItem?.click?.();

    expect(executeSelectionExcerptAction).toHaveBeenCalledTimes(1);
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith(
      expect.stringContaining('PROGRESSIVE_EXCERPT_HIGHLIGHT_UNAVAILABLE: failed to prepare progressive excerpt highlight: highlight planner down'),
    );
  });

  it('shows the current-block batch fill action only when a single Topic block already contains highlights', async () => {
    const { handler, prepareCurrentBlockMarks, createFromCurrentBlockMarks, siyuanApi } = createHandler();
    const protyleContent = document.createElement('div');
    protyleContent.className = 'protyle-content';
    const background = document.createElement('div');
    background.className = 'protyle-background';
    background.setAttribute('data-node-id', 'topic-doc-root-1');
    const wysiwyg = document.createElement('div');
    wysiwyg.className = 'protyle-wysiwyg';
    const block = document.createElement('div');
    block.setAttribute('data-node-id', 'block-1');
    block.innerHTML = '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>';
    wysiwyg.append(block);
    protyleContent.append(background, wysiwyg);
    document.body.append(protyleContent);

    progressiveExcerptMocks.resolveProgressiveExcerptSnapshotFromBlocks.mockReturnValue({
      blockId: 'block-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1'],
      text: 'Alpha Beta',
      contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      range: document.createRange(),
      blockSelections: [
        { blockId: 'block-1', mode: 'full-block', excerptHtml: '<div></div>' },
      ],
      commonElement: block,
      root: wysiwyg,
      protyle: null,
    });

    const menu = { addItem: vi.fn() };
    handler.handleBlockIconClick({
      detail: {
        menu,
        blockElements: [block],
      },
    });

    expect(prepareCurrentBlockMarks).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      rootId: 'topic-doc-root-1',
    });

    const topLevelItem = menu.addItem.mock.calls[0][0];
    const submenu = topLevelItem.submenu as Array<{ label?: string; click?: () => Promise<void> }>;
    const batchItem = submenu.find((item) => item.label === '从当前块高亮补齐 Item');
    expect(batchItem).toBeDefined();

    await batchItem?.click?.();

    expect(createFromCurrentBlockMarks).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      contentDom: '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
      rootId: 'topic-doc-root-1',
    }, expect.objectContaining({
      available: true,
      markCount: 1,
    }));
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已从当前块高亮补齐 1 个 Item');
  });
});
