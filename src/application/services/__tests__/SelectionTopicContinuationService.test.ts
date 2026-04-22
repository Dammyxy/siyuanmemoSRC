import { describe, expect, it, vi } from 'vitest';
import type { ProgressiveSiyuanPort } from '@/application/ports/ProgressiveSiyuanPort';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import { SelectionTopicContinuationService } from '../SelectionTopicContinuationService';

function createCardServiceMock(options?: {
  currentBlockCards?: Array<{ id: string; type: string }>;
  rootBlockCards?: Array<{ id: string; type: string }>;
  sourceBlockId?: string;
  rootId?: string;
}): CardApplicationService {
  const sourceBlockId = options?.sourceBlockId || 'source-block-1';
  const rootId = options?.rootId || 'topic-doc-root-1';
  return {
    getCardByBlockId: vi.fn((blockId: string) => {
      if (blockId === sourceBlockId) {
        return options?.currentBlockCards?.[0] || null;
      }
      if (blockId === rootId) {
        return options?.rootBlockCards?.[0] || null;
      }
      return null;
    }),
    getCardsByBlockId: vi.fn((blockId: string) => {
      if (blockId === sourceBlockId) {
        return options?.currentBlockCards || [];
      }
      if (blockId === rootId) {
        return options?.rootBlockCards || [];
      }
      return [];
    }),
  } as unknown as CardApplicationService;
}

function createSiyuanPortMock(overrides: Partial<ProgressiveSiyuanPort> = {}): ProgressiveSiyuanPort {
  return {
    pushMsg: vi.fn(async () => undefined),
    pushErrMsg: vi.fn(async () => undefined),
    sql: vi.fn(async () => []),
    getDocInfo: vi.fn(async () => ({
      id: 'doc-1',
      box: 'notebook-a',
      path: '/doc.sy',
      hpath: '/doc',
      name: 'Doc',
    })),
    getBlockAttrs: vi.fn(async () => ({})),
    setBlockAttrs: vi.fn(async () => undefined),
    getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
    copyStdMarkdown: vi.fn(async () => ''),
    createDocWithMarkdown: vi.fn(async () => 'doc-1'),
    appendMarkdownBlock: vi.fn(async () => 'block-1'),
    appendDomBlock: vi.fn(async () => 'block-1'),
    updateDomBlock: vi.fn(async () => 'block-1'),
    moveBlockAsChild: vi.fn(async () => undefined),
    deleteBlock: vi.fn(async () => undefined),
    renderTemplate: vi.fn(async () => ''),
    getNotebookConf: vi.fn(async () => ({
      name: 'notebook-a',
      closed: false,
      refCreateSavePath: '/',
      createDocNameTemplate: '',
      dailyNoteSavePath: '/',
      dailyNoteTemplatePath: '',
    })),
    ...overrides,
  };
}

describe('SelectionTopicContinuationService', () => {
  it('keeps the manual excerpt continuation entry hidden outside topic/excerpt context', () => {
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock(),
      createCardServiceMock({
        currentBlockCards: [],
        rootBlockCards: [],
      }),
      {
        createFromTopicSource: vi.fn(async () => ({
          created: 0,
          skipped: 0,
          items: [],
        })),
      } as any,
    );

    const preparation = service.prepareSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'ordinary-doc-1',
      selectedText: 'Alpha >> Beta',
    });

    expect(preparation.available).toBe(false);
    expect(preparation.topicContext).toBeNull();
    expect(preparation.decisions).toHaveLength(0);
    expect(preparation.mode).toBeNull();
  });

  it('normalizes excerpt-doc rich selection content and forwards the derived-item contract with parent excerpt lineage', async () => {
    const topicDerivedItemService = {
      createFromTopicSource: vi.fn(async () => ({
        created: 1,
        skipped: 0,
        items: [],
      })),
    };
    const siyuanApi = createSiyuanPortMock({
      sql: vi.fn(async () => [{ root_id: 'excerpt-doc-root-1', type: 'p' }]),
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === 'excerpt-doc-root-1') {
          return {
            'custom-fsrs-reading-kind': 'excerpt-doc',
            'custom-fsrs-reading-source-doc-id': 'doc-ordinary',
            'custom-fsrs-reading-source-block-id': 'source-root-1',
          };
        }
        return {};
      }),
    });
    const service = new SelectionTopicContinuationService(
      siyuanApi,
      createCardServiceMock({
        sourceBlockId: 'source-block-1',
        rootId: 'excerpt-doc-root-1',
        rootBlockCards: [{ id: 'topic-card-excerpt-root-1', type: 'topic' }],
      }),
      topicDerivedItemService as any,
    );

    const preparation = service.prepareSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'excerpt-doc-root-1',
      selectedText: 'Alpha Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="mark">Beta</span></div></div>',
      blockSelections: [{
        blockId: 'source-block-1',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"></div></div>',
      }],
    });

    expect(preparation.available).toBe(true);
    expect(preparation.normalizedContent).toBe('Alpha ==Beta==');
    expect(preparation.creationContent).toBe('Alpha ==Beta==');
    expect(preparation.mode).toBe('planner-derived');
    expect(preparation.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'cloze',
      }),
    ]));

    await service.createFromSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'excerpt-doc-root-1',
      selectedText: 'Alpha Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="mark">Beta</span></div></div>',
      blockSelections: [{
        blockId: 'source-block-1',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"></div></div>',
      }],
    }, preparation);

    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'source-block-1',
      sourceDocId: 'excerpt-doc-root-1',
      parentTopicCardId: 'topic-card-excerpt-root-1',
      parentExcerptId: 'excerpt-doc-root-1',
      sourceRootKind: 'excerpt-doc',
      content: 'Alpha ==Beta==',
      decisions: expect.arrayContaining([
        expect.objectContaining({
          family: 'cloze',
        }),
      ]),
    }));
  });

  it('treats plain text selection inside a topic as direct cloze continuation', async () => {
    const topicDerivedItemService = {
      createFromTopicSource: vi.fn(async () => ({
        created: 1,
        skipped: 0,
        items: [],
      })),
    };
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock({
        sql: vi.fn(async () => [{ root_id: 'topic-doc-root-1', type: 'p' }]),
      }),
      createCardServiceMock({
        sourceBlockId: 'source-block-1',
        rootId: 'topic-doc-root-1',
        rootBlockCards: [{ id: 'topic-card-topic-root-1', type: 'topic' }],
      }),
      topicDerivedItemService as any,
    );

    const preparation = service.prepareSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'topic-doc-root-1',
      selectedText: 'Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
      blockSelections: [{
        blockId: 'source-block-1',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"> Gamma</div></div>',
      }],
    });

    expect(preparation.available).toBe(true);
    expect(preparation.mode).toBe('direct-cloze');
    expect(preparation.normalizedContent).toBe('Beta');
    expect(preparation.creationContent).toBe('Alpha ==Beta== Gamma');
    expect(preparation.decisions).toEqual([
      expect.objectContaining({
        id: 'ManualSelectionClozeRule',
        family: 'cloze',
      }),
    ]);

    await service.createFromSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'topic-doc-root-1',
      selectedText: 'Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
      blockSelections: [{
        blockId: 'source-block-1',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"> Gamma</div></div>',
      }],
    }, preparation);

    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'source-block-1',
      sourceDocId: 'topic-doc-root-1',
      parentTopicCardId: 'topic-card-topic-root-1',
      sourceRootKind: 'topic-doc',
      content: 'Alpha ==Beta== Gamma',
      decisions: [
        expect.objectContaining({
          id: 'ManualSelectionClozeRule',
          family: 'cloze',
        }),
      ],
    }));
  });

  it('reconstructs block references from content DOM so concept-definition selections remain derivable', () => {
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock(),
      createCardServiceMock({
        rootBlockCards: [{ id: 'topic-card-topic-root-1', type: 'topic' }],
      }),
      {
        createFromTopicSource: vi.fn(async () => ({
          created: 0,
          skipped: 0,
          items: [],
        })),
      } as any,
    );

    const preparation = service.prepareSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'topic-doc-root-1',
      selectedText: '概念 定义正文',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true"><span data-type="block-ref" data-id="20240101010101-abcdefg">概念</span>::定义正文</div></div>',
    });

    expect(preparation.available).toBe(true);
    expect(preparation.normalizedContent).toBe('((20240101010101-abcdefg))::定义正文');
    expect(preparation.creationContent).toBe('((20240101010101-abcdefg))::定义正文');
    expect(preparation.mode).toBe('planner-derived');
    expect(preparation.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'concept-definition',
      }),
    ]));
  });
});
