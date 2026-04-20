import { describe, expect, it, vi } from 'vitest';
import { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';

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

function extractQuotedSqlValues(stmt: string): string[] {
  return Array.from(stmt.matchAll(/'((?:[^']|'')+)'/g)).map((match) => match[1]!.replace(/''/g, "'"));
}

function createSiyuanPort(fixture: ReturnType<typeof createPairMutationFixture>) {
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

  it('creates semantic CDF cards from manual resolutions and skips stale notebook resolutions', async () => {
    const definitionFixture = createTextMutationFixture('definition-block-1', '自变量在底数位置，指数固定的函数。');
    const descriptorFixture = createTextMutationFixture('descriptor-block-1', '识别线索;;通常写成 y = x^a');
    const siyuanPort = createSiyuanPort(createPairMutationFixture('pair-root-4'));
    siyuanPort.appendBlockUnderParentDetailed
      .mockResolvedValueOnce(definitionFixture.mutation)
      .mockResolvedValueOnce(descriptorFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      return [...definitionFixture.rows, ...descriptorFixture.rows].filter((row) => ids.includes(row.id));
    });
    const xiuyuanService = createXiuyuanService();
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
    expect(xiuyuanService.createFromBlocks).toHaveBeenCalledTimes(2);
    expect(xiuyuanService.createFromBlocks).toHaveBeenNthCalledWith(1, expect.objectContaining({
      blockIds: ['concept-doc-1', 'definition-block-1'],
      templateId: 'builtin-concept-definition',
    }));
    expect(xiuyuanService.createFromBlocks).toHaveBeenNthCalledWith(2, expect.objectContaining({
      blockIds: ['concept-doc-1', 'descriptor-block-1'],
      templateId: 'builtin-concept-descriptor',
    }));
    expect(created).toMatchObject({
      createdCount: 1,
      createdDefinitionCount: 1,
      createdDescriptorCount: 1,
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
  });

  it('accepts legacy resolved notebook anchors that do not carry notebookId yet', async () => {
    const definitionFixture = createTextMutationFixture('definition-block-legacy', '旧会话里保留下来的定义。');
    const siyuanPort = createSiyuanPort(createPairMutationFixture('pair-root-5'));
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(definitionFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes("type = 'd'")) {
        return [{ id: 'concept-doc-legacy', content: '幂函数' }];
      }
      const ids = extractQuotedSqlValues(stmt);
      return definitionFixture.rows.filter((row) => ids.includes(row.id));
    });
    const xiuyuanService = createXiuyuanService();
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
    expect(xiuyuanService.createFromBlocks).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['concept-doc-legacy', 'definition-block-legacy'],
      templateId: 'builtin-concept-definition',
    }));
    expect(created).toMatchObject({
      createdCount: 1,
      createdDefinitionCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
  });
});
