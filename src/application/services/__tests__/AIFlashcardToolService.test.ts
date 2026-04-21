import { describe, expect, it, vi } from 'vitest';
import { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import { CreateCdfMultilineCardsUseCase } from '@/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase';
import { ok } from '@/types/result';

function createPairMutationFixture(rootId: string) {
  const listId = `${rootId}-list`;
  const questionId = `${rootId}-question`;
  const nestedListId = `${rootId}-nested-list`;
  const answerItemId = `${rootId}-answer-item`;
  const answerId = `${rootId}-answer`;
  const rows = [
    { id: listId, parent_id: 'target-doc', root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '1' },
    { id: rootId, parent_id: listId, root_id: 'target-doc', type: 'i', content: 'Question', markdown: 'Question', sort: '2' },
    { id: questionId, parent_id: rootId, root_id: 'target-doc', type: 'p', content: 'Question', markdown: 'Question', sort: '3' },
    { id: nestedListId, parent_id: rootId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '4' },
    { id: answerItemId, parent_id: nestedListId, root_id: 'target-doc', type: 'i', content: 'Answer', markdown: 'Answer', sort: '5' },
    { id: answerId, parent_id: answerItemId, root_id: 'target-doc', type: 'p', content: 'Answer', markdown: 'Answer', sort: '6' },
  ];
  return {
    rows,
    mutation: {
      doOperations: rows.map((row) => ({
        action: 'insert',
        id: row.id,
        parentID: row.parent_id,
        data: row.markdown,
      })),
    },
    rootId,
    questionId,
    answerId,
  };
}

function createTextMutationFixture(rootId: string, content: string) {
  const rows = [
    { id: rootId, parent_id: 'target-doc', root_id: 'target-doc', type: 'p', content, markdown: content, sort: '1' },
  ];
  return {
    rows,
    mutation: {
      doOperations: rows.map((row) => ({
        action: 'insert',
        id: row.id,
        parentID: row.parent_id,
        data: row.markdown,
      })),
    },
    rootId,
  };
}

function createListTreeMutationFixture(rootId: string, rootText: string, childTexts: string[] = []) {
  const rows = [
    { id: `${rootId}-list`, parent_id: 'target-doc', root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '1' },
    { id: rootId, parent_id: `${rootId}-list`, root_id: 'target-doc', type: 'i', content: rootText, markdown: rootText, sort: '2' },
    { id: `${rootId}-p`, parent_id: rootId, root_id: 'target-doc', type: 'p', content: rootText, markdown: rootText, sort: '3' },
  ];
  if (childTexts.length > 0) {
    rows.push({ id: `${rootId}-nested-list`, parent_id: rootId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '4' });
    childTexts.forEach((childText, index) => {
      const itemId = `${rootId}-child-${index + 1}`;
      const paragraphId = `${itemId}-p`;
      rows.push(
        { id: itemId, parent_id: `${rootId}-nested-list`, root_id: 'target-doc', type: 'i', content: childText, markdown: childText, sort: String(5 + index * 2) },
        { id: paragraphId, parent_id: itemId, root_id: 'target-doc', type: 'p', content: childText, markdown: childText, sort: String(6 + index * 2) },
      );
    });
  }
  return {
    rows,
    mutation: {
      doOperations: rows.map((row) => ({
        action: 'insert',
        id: row.id,
        parentID: row.parent_id,
        data: row.markdown,
      })),
    },
    rootId,
  };
}

function extractQuotedSqlValues(stmt: string): string[] {
  return Array.from(stmt.matchAll(/'((?:[^']|'')+)'/g)).map((match) => match[1]!.replace(/''/g, "'"));
}

function createSiyuanPort(fixture: { rows: Array<Record<string, unknown>>; mutation: { doOperations: Array<Record<string, unknown>> } }) {
  return {
    listNotebooks: vi.fn(),
    sql: vi.fn(async (stmt: string) => {
      if (stmt.includes("WHERE id = 'target-leaf'")) {
        return [{
          id: 'target-leaf',
          box: 'notebook-1',
          root_id: 'target-doc',
          type: 'p',
          content: 'Leaf Target',
          markdown: 'Leaf Target',
          hpath: '/Leaf Target',
        }];
      }
      return fixture.rows;
    }),
    getBlockText: vi.fn(async () => ''),
    getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
    copyStdMarkdown: vi.fn(async () => ''),
    ensureTodayDailyNote: vi.fn(async () => 'daily-doc-1'),
    setBlockAttrs: vi.fn(),
    getNotebookConf: vi.fn(),
    renderTemplate: vi.fn(),
    createDocWithMarkdown: vi.fn(),
    insertBlockAfter: vi.fn(),
    insertBlockAfterDetailed: vi.fn(async () => fixture.mutation),
    appendBlockUnderParent: vi.fn(),
    appendBlockUnderParentDetailed: vi.fn(async () => fixture.mutation),
    updateBlockMarkdown: vi.fn(),
    deleteBlock: vi.fn(),
  };
}

function createXiuyuanService() {
  return {
    createFromBlocks: vi.fn(async (command: { templateId: string; blockIds: string[] }) => ({
      ok: true,
      value: {
        xiuyuan: {
          id: `xy-${command.templateId}`,
          blockIDs: command.blockIds,
          templateID: command.templateId,
        },
        cards: [{ id: `card-${command.templateId}`, xiuyuanId: `xy-${command.templateId}`, faceIndex: 0 }],
      },
    })),
    createListTemplateCards: vi.fn(),
  };
}

describe('AIFlashcardToolService', () => {
  it('reuses the remembered daily-note target for pair-card creation and persists successful writes', async () => {
    const fixture = createPairMutationFixture('pair-root-1');
    const siyuanPort = createSiyuanPort(fixture);
    const xiuyuanService = createXiuyuanService();
    const loadDefaultTarget = vi.fn(async () => ({
      mode: 'daily-note' as const,
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
      targetBlockId: null,
      targetLabel: '学习笔记 · 今日日记',
      updatedAt: 1,
    }));
    const saveDefaultTarget = vi.fn(async (target) => target);
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => xiuyuanService as never,
      loadDefaultTarget,
      saveDefaultTarget,
    });

    const result = await service.createPairCards({
      mode: 'basic-qa',
      items: [{ front: 'Question', back: 'Answer' }],
    }, {
      context: {
        currentCardRaw: {
          deckId: 'deck-1',
        },
      } as never,
      attachedContexts: [],
    });

    expect(loadDefaultTarget).toHaveBeenCalledTimes(1);
    expect(siyuanPort.ensureTodayDailyNote).toHaveBeenCalledWith('notebook-1');
    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledWith('* Question\n  * Answer', 'daily-doc-1');
    expect(xiuyuanService.createFromBlocks).toHaveBeenCalledWith(expect.objectContaining({
      templateId: 'builtin-basic-qa',
      blockIds: [fixture.questionId, fixture.answerId],
      deckId: 'deck-1',
      fieldMapping: {
        question: fixture.questionId,
        answer: fixture.answerId,
      },
    }));
    expect(saveDefaultTarget).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'daily-note',
      notebookId: 'notebook-1',
    }));
    expect(result).toMatchObject({
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
  });

  it('allows explicit block targets to override the remembered target for concept-definition cards', async () => {
    const fixture = createPairMutationFixture('pair-root-2');
    const siyuanPort = createSiyuanPort(fixture);
    const xiuyuanService = createXiuyuanService();
    const loadDefaultTarget = vi.fn(async () => null);
    const saveDefaultTarget = vi.fn(async (target) => target);
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => xiuyuanService as never,
      loadDefaultTarget,
      saveDefaultTarget,
    });

    const result = await service.createConceptDefinitionCards({
      targetMode: 'block',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
      targetBlockId: 'target-leaf',
      items: [{
        concept: '概念',
        definition: '定义',
        direction: 'reverse',
      }],
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(loadDefaultTarget).not.toHaveBeenCalled();
    expect(siyuanPort.insertBlockAfterDetailed).toHaveBeenCalledWith('* 概念\n  * 定义', 'target-leaf');
    expect(xiuyuanService.createFromBlocks).toHaveBeenCalledWith(expect.objectContaining({
      templateId: 'builtin-concept-definition-reverse',
      fieldMapping: {
        concept: fixture.questionId,
        definition: fixture.answerId,
      },
    }));
    expect(saveDefaultTarget).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'block',
      targetBlockId: 'target-leaf',
    }));
    expect(result).toMatchObject({
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
  });

  it('searches concept documents only within the target notebook', async () => {
    const fixture = createPairMutationFixture('pair-root-3');
    const siyuanPort = createSiyuanPort(fixture);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      expect(stmt).toContain("box = 'notebook-1'");
      expect(stmt).toContain("type = 'd'");
      return [
        { id: 'concept-doc-1', content: '幂函数', hpath: '/数学/幂函数', box: 'notebook-1' },
      ];
    });
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => createXiuyuanService() as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
    });

    const results = await service.searchConceptDocumentsInNotebook({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, '幂函数');

    expect(results).toEqual([{
      id: 'concept-doc-1',
      title: '幂函数',
      hPath: '/数学/幂函数',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }]);
  });

  it('creates a new root concept document and returns a manual-binding candidate', async () => {
    const fixture = createPairMutationFixture('pair-root-4');
    const siyuanPort = createSiyuanPort(fixture);
    siyuanPort.createDocWithMarkdown.mockResolvedValue('concept-doc-new');
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes("WHERE id = 'concept-doc-new'")) {
        return [{ id: 'concept-doc-new', content: '幂函数', hpath: '/幂函数', box: 'notebook-1' }];
      }
      if (stmt.includes('AND hpath IN')) {
        return [];
      }
      return fixture.rows;
    });
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => createXiuyuanService() as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
    });

    const result = await service.createOrReuseConceptDocumentInNotebook({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, '幂函数');

    expect(siyuanPort.createDocWithMarkdown).toHaveBeenCalledWith('notebook-1', '/幂函数', '# 幂函数');
    expect(result).toEqual({
      document: {
        id: 'concept-doc-new',
        title: '幂函数',
        hPath: '/幂函数',
        notebookId: 'notebook-1',
        notebookName: '学习笔记',
      },
      reused: false,
    });
  });

  it('reuses an existing root concept document instead of creating a duplicate', async () => {
    const fixture = createPairMutationFixture('pair-root-5');
    const siyuanPort = createSiyuanPort(fixture);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes('AND hpath IN')) {
        return [{ id: 'concept-doc-existing', content: '幂函数', hpath: '/幂函数', box: 'notebook-1' }];
      }
      return fixture.rows;
    });
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => createXiuyuanService() as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
    });

    const result = await service.createOrReuseConceptDocumentInNotebook({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, '幂函数');

    expect(siyuanPort.createDocWithMarkdown).not.toHaveBeenCalled();
    expect(result).toEqual({
      document: {
        id: 'concept-doc-existing',
        title: '幂函数',
        hPath: '/幂函数',
        notebookId: 'notebook-1',
        notebookName: '学习笔记',
      },
      reused: true,
    });
  });

  it('creates semantic CDF cards from manual resolutions and skips stale notebook resolutions', async () => {
    const cdfFixture = createListTreeMutationFixture(
      'cdf-root-1',
      '((concept-doc-1))::自变量在底数位置，指数固定的函数。',
      ['识别线索;;通常写成 y = x^a'],
    );
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      return cdfFixture.rows.filter((row) => ids.includes(String(row.id)));
    });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'execute')
      .mockResolvedValue(ok({
        createdDefinition: 1,
        createdDescriptor: 1,
        skipped: 0,
        skippedExistingBinding: 0,
        skippedNoTemplate: 0,
        failed: 0,
        stoppedByDocumentReference: false,
      }));
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => xiuyuanService as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
    });
    const structure = {
      anchors: [{
        id: 'anchor-1',
        conceptName: '幂函数',
        selected: true,
        resolution: {
          status: 'resolved-manual',
          conceptBlockId: 'concept-doc-1',
          conceptTitle: '幂函数',
          reason: '手动选择概念文档。',
          notebookId: 'notebook-1',
        },
        definitionCandidates: [
          { id: 'definition-1', text: '自变量在底数位置，指数固定的函数。', selected: true },
        ],
        descriptorGroups: [
          {
            id: 'group-1',
            title: '识别线索',
            selected: true,
            items: [
              { id: 'item-1', text: '通常写成 y = x^a', selected: true },
            ],
          },
        ],
      }],
    };

    const created = await service.createSemanticCdfCards(structure as never, {
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(siyuanPort.ensureTodayDailyNote).toHaveBeenCalledWith('notebook-1');
    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledWith(
      '* ((concept-doc-1))::自变量在底数位置，指数固定的函数。\n  * 识别线索;;通常写成 y = x^a',
      'daily-doc-1',
    );
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      parentBlockId: 'cdf-root-1',
      templateId: 'builtin-list-concept-multiline',
    }));
    expect(created).toMatchObject({
      createdCount: 1,
      createdDefinitionCount: 1,
      createdDescriptorCount: 1,
      itemResults: [
        {
          insertedRootBlockId: 'cdf-root-1',
        },
      ],
    });

    const stale = await service.createSemanticCdfCards(structure as never, {
      mode: 'daily-note',
      notebookId: 'notebook-2',
      notebookName: '第二笔记本',
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(stale.itemResults[0]).toMatchObject({
      status: 'skipped',
      conceptBlockId: 'concept-doc-1',
    });
    expect(stale.itemResults[0]?.warnings.join(' ')).toContain('旧目标笔记本');
    executeSpy.mockRestore();
  });

  it('accepts legacy resolved notebook anchors that do not carry notebookId yet', async () => {
    const cdfFixture = createListTreeMutationFixture(
      'cdf-root-legacy',
      '((concept-doc-legacy))::旧会话里保留下来的定义。',
    );
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes("type = 'd'")) {
        return [{ id: 'concept-doc-legacy', content: '幂函数' }];
      }
      const ids = extractQuotedSqlValues(stmt);
      return cdfFixture.rows.filter((row) => ids.includes(String(row.id)));
    });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'execute')
      .mockResolvedValue(ok({
        createdDefinition: 1,
        createdDescriptor: 0,
        skipped: 0,
        skippedExistingBinding: 0,
        skippedNoTemplate: 0,
        failed: 0,
        stoppedByDocumentReference: false,
      }));
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => xiuyuanService as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
    });

    const created = await service.createSemanticCdfCards({
      anchors: [{
        id: 'anchor-legacy',
        conceptName: '幂函数',
        selected: true,
        resolution: {
          status: 'resolved-notebook',
          conceptBlockId: 'concept-doc-legacy',
          conceptTitle: '幂函数',
          reason: '旧会话里命中过目标笔记本概念文档。',
        },
        definitionCandidates: [
          { id: 'definition-legacy', text: '旧会话里保留下来的定义。', selected: true },
        ],
        descriptorGroups: [],
      }],
    } as never, {
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(siyuanPort.ensureTodayDailyNote).toHaveBeenCalledWith('notebook-1');
    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledWith(
      '* ((concept-doc-legacy))::旧会话里保留下来的定义。',
      'daily-doc-1',
    );
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      parentBlockId: 'cdf-root-legacy',
      templateId: 'builtin-list-concept-multiline',
    }));
    expect(created).toMatchObject({
      createdCount: 1,
      createdDefinitionCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    executeSpy.mockRestore();
  });

  it('expands semantic CDF descriptor groups into repeated ;; children and falls back to kramdown for the inserted root list item', async () => {
    const cdfFixture = createListTreeMutationFixture(
      'cdf-root-fallback',
      '((concept-doc-1))::自变量在底数位置，指数固定的函数。',
      [
        '识别线索;;通常写成 y = x^a',
        '识别线索;;指数固定',
      ],
    );
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      return cdfFixture.rows.filter((row) => (
        ids.includes(String(row.id))
        && String(row.type) === 'p'
      ));
    });
    siyuanPort.getBlockKramdown.mockResolvedValueOnce({
      kramdown: [
        '* {: id="cdf-root-fallback"} ((concept-doc-1))::自变量在底数位置，指数固定的函数。',
        '  * {: id="cdf-root-fallback-child-1"} 识别线索;;通常写成 y = x^a',
        '  * {: id="cdf-root-fallback-child-2"} 识别线索;;指数固定',
      ].join('\n'),
    });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'execute')
      .mockResolvedValue(ok({
        createdDefinition: 1,
        createdDescriptor: 2,
        skipped: 0,
        skippedExistingBinding: 0,
        skippedNoTemplate: 0,
        failed: 0,
        stoppedByDocumentReference: false,
      }));
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => xiuyuanService as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
    });

    const created = await service.createSemanticCdfCards({
      anchors: [{
        id: 'anchor-fallback',
        conceptName: '幂函数',
        selected: true,
        resolution: {
          status: 'resolved-manual',
          conceptBlockId: 'concept-doc-1',
          conceptTitle: '幂函数',
          reason: '手动选择概念文档。',
          notebookId: 'notebook-1',
        },
        definitionCandidates: [
          { id: 'definition-fallback', text: '自变量在底数位置，指数固定的函数。', selected: true },
        ],
        descriptorGroups: [{
          id: 'group-fallback',
          title: '识别线索',
          selected: true,
          items: [
            { id: 'item-fallback-1', text: '通常写成 y = x^a', selected: true },
            { id: 'item-fallback-2', text: '指数固定', selected: true },
          ],
        }],
      }],
    } as never, {
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledWith(
      [
        '* ((concept-doc-1))::自变量在底数位置，指数固定的函数。',
        '  * 识别线索;;通常写成 y = x^a',
        '  * 识别线索;;指数固定',
      ].join('\n'),
      'daily-doc-1',
    );
    expect(String(siyuanPort.appendBlockUnderParentDetailed.mock.calls[0]?.[0] || '')).not.toContain(';;;');
    expect(siyuanPort.getBlockKramdown).toHaveBeenCalledWith('cdf-root-fallback');
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      parentBlockId: 'cdf-root-fallback',
      templateId: 'builtin-list-concept-multiline',
    }));
    expect(created).toMatchObject({
      createdCount: 1,
      createdDefinitionCount: 1,
      createdDescriptorCount: 2,
      itemResults: [{
        insertedRootBlockId: 'cdf-root-fallback',
        createdDefinitionCount: 1,
        createdDescriptorCount: 2,
      }],
    });
    executeSpy.mockRestore();
  });
});
