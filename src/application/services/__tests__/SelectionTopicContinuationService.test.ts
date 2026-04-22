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
    expect(preparation.highlightTargetCount).toBe(0);
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
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div></div>',
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
    expect(preparation.plannerContent).toBe('Alpha ==Beta==');
    expect(preparation.artifactContentDom).toBe('');
    expect(preparation.mode).toBe('planner-derived');
    expect(preparation.highlightTargetCount).toBe(1);
    expect(preparation.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'cloze',
      }),
    ]));

    await service.createFromSelection({
      sourceBlockId: 'source-block-1',
      rootId: 'excerpt-doc-root-1',
      selectedText: 'Alpha Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div></div>',
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
      plannerContent: 'Alpha ==Beta==',
      decisions: expect.arrayContaining([
        expect.objectContaining({
          family: 'cloze',
        }),
      ]),
    }));
  });

  it('treats plain text selection inside a topic as manual cloze continuation', async () => {
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
    expect(preparation.mode).toBe('manual-cloze');
    expect(preparation.normalizedContent).toBe('Beta');
    expect(preparation.plannerContent).toBe('Alpha ==Beta== Gamma');
    expect(preparation.artifactContentDom).toContain('<span data-type="text mark">Beta</span>');
    expect(preparation.answerFingerprint).toBe('source-block-1::ManualSelectionClozeRule::Alpha::Beta::Gamma');
    expect(preparation.highlightTargetCount).toBe(0);
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
      plannerContent: 'Alpha ==Beta== Gamma',
      artifactContentDom: expect.stringContaining('<span data-type="text mark">Beta</span>'),
      answerFingerprint: 'source-block-1::ManualSelectionClozeRule::Alpha::Beta::Gamma',
      previewText: 'Beta',
      mode: 'manual-cloze',
      decisions: [
        expect.objectContaining({
          id: 'ManualSelectionClozeRule',
          family: 'cloze',
        }),
      ],
    }));
  });

  it('preserves block-ref anchor text in manual cloze artifact DOM', () => {
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock(),
      createCardServiceMock({
        sourceBlockId: 'source-block-2',
        rootId: 'topic-doc-root-2',
        rootBlockCards: [{ id: 'topic-card-topic-root-2', type: 'topic' }],
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
      sourceBlockId: 'source-block-2',
      rootId: 'topic-doc-root-2',
      selectedText: '*',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true"><span data-type="block-ref" data-id="20240101010101-abcdefg">*</span></div></div>',
      blockSelections: [{
        blockId: 'source-block-2',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true"><span data-type="block-ref" data-id="20240101010101-abcdefg">*</span></div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"> Gamma</div></div>',
      }],
    });

    expect(preparation.available).toBe(true);
    expect(preparation.mode).toBe('manual-cloze');
    expect(preparation.plannerContent).toBe('Alpha ==((20240101010101-abcdefg))== Gamma');
    expect(preparation.artifactContentDom).toContain('data-type="block-ref mark"');
    expect(preparation.artifactContentDom).toContain('>*</span>');
    expect(preparation.artifactContentDom).not.toContain('<span data-type="text mark"><span data-type="block-ref"');
    expect(preparation.highlightTargetCount).toBe(0);
  });

  it('requires a single-block range selection before manual cloze continuation becomes available', () => {
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock(),
      createCardServiceMock({
        sourceBlockId: 'source-block-1',
        rootId: 'topic-doc-root-1',
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
      selectedText: 'Beta Gamma',
      blockSelections: [
        {
          blockId: 'source-block-1',
          mode: 'range',
          excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        },
        {
          blockId: 'source-block-2',
          mode: 'range',
          excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Gamma</div></div>',
        },
      ],
    });

    expect(preparation.available).toBe(false);
    expect(preparation.topicContext).not.toBeNull();
    expect(preparation.mode).toBeNull();
    expect(preparation.plannerContent).toBe('');
    expect(preparation.artifactContentDom).toBe('');
    expect(preparation.highlightTargetCount).toBe(0);
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
    expect(preparation.plannerContent).toBe('((20240101010101-abcdefg))::定义正文');
    expect(preparation.artifactContentDom).toBe('');
    expect(preparation.mode).toBe('planner-derived');
    expect(preparation.highlightTargetCount).toBe(0);
    expect(preparation.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'concept-definition',
      }),
    ]));
  });

  it('prepares current-block batch fill only when the current Topic block contains mark targets', () => {
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock(),
      createCardServiceMock({
        sourceBlockId: 'source-block-batch-1',
        rootId: 'topic-doc-root-batch-1',
        rootBlockCards: [{ id: 'topic-card-topic-root-batch-1', type: 'topic' }],
      }),
      {
        createFromTopicSource: vi.fn(async () => ({
          created: 0,
          skipped: 0,
          items: [],
        })),
      } as any,
    );

    const preparation = service.prepareCurrentBlockMarks({
      sourceBlockId: 'source-block-batch-1',
      rootId: 'topic-doc-root-batch-1',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span> Gamma <span data-type="text mark">Delta</span></div></div>',
    });

    expect(preparation.available).toBe(true);
    expect(preparation.markCount).toBe(2);
    expect(preparation.topicContext).toEqual(expect.objectContaining({
      topicCardId: 'topic-card-topic-root-batch-1',
    }));
  });

  it('fans out current-block marks into one Topic continuation per highlight while flattening non-target marks', async () => {
    const topicDerivedItemService = {
      createFromTopicSource: vi.fn(async (input: Record<string, unknown>) => ({
        created: 1,
        skipped: 0,
        items: [{
          derivedDocId: `doc-${String(input.answerFingerprint || '')}`,
          derivedBlockId: `block-${String(input.answerFingerprint || '')}`,
          derivedCardId: `card-${String(input.answerFingerprint || '')}`,
          sourceBlockId: 'source-block-batch-2',
          storageMode: 'workbench',
          creationRuleId: 'ManualSelectionClozeRule',
          answerFingerprint: String(input.answerFingerprint || ''),
        }],
      })),
    };
    const service = new SelectionTopicContinuationService(
      createSiyuanPortMock({
        sql: vi.fn(async () => [{ root_id: 'topic-doc-root-batch-2', type: 'p' }]),
      }),
      createCardServiceMock({
        sourceBlockId: 'source-block-batch-2',
        rootId: 'topic-doc-root-batch-2',
        rootBlockCards: [{ id: 'topic-card-topic-root-batch-2', type: 'topic' }],
      }),
      topicDerivedItemService as any,
    );

    const result = await service.createFromCurrentBlockMarks({
      sourceBlockId: 'source-block-batch-2',
      rootId: 'topic-doc-root-batch-2',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span> Gamma <span data-type="block-ref mark" data-id="20240101010101-abcdefg">*</span></div></div>',
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledTimes(2);

    const firstCall = vi.mocked(topicDerivedItemService.createFromTopicSource).mock.calls[0]?.[0] as Record<string, unknown>;
    const secondCall = vi.mocked(topicDerivedItemService.createFromTopicSource).mock.calls[1]?.[0] as Record<string, unknown>;

    expect(firstCall).toEqual(expect.objectContaining({
      sourceBlockId: 'source-block-batch-2',
      sourceDocId: 'topic-doc-root-batch-2',
      parentTopicCardId: 'topic-card-topic-root-batch-2',
      mode: 'manual-cloze',
      previewText: 'Beta',
      plannerContent: 'Alpha ==Beta== Gamma ((20240101010101-abcdefg))',
      answerFingerprint: 'source-block-batch-2::ManualSelectionClozeRule::Alpha::Beta::Gamma ((20240101010101-abcdefg))',
      decisions: [expect.objectContaining({ id: 'ManualSelectionClozeRule', family: 'cloze' })],
    }));
    expect(String(firstCall.artifactContentDom || '')).toContain('<span data-type="text mark">Beta</span>');
    expect(String(firstCall.artifactContentDom || '')).not.toContain('block-ref mark');

    expect(secondCall).toEqual(expect.objectContaining({
      previewText: '*',
      plannerContent: 'Alpha Beta Gamma ==((20240101010101-abcdefg))==',
      answerFingerprint: 'source-block-batch-2::ManualSelectionClozeRule::Alpha Beta Gamma::((20240101010101-abcdefg))::',
    }));
    expect(String(secondCall.artifactContentDom || '')).toContain('data-type="block-ref mark"');
    expect(String(secondCall.artifactContentDom || '')).toContain('>*</span>');
    expect(String(secondCall.artifactContentDom || '')).not.toContain('<span data-type="text mark">Beta</span>');
  });
});
