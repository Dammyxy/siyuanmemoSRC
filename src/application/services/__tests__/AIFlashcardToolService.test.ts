import { describe, expect, it, vi } from 'vitest';
import { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import { CreateCdfMultilineCardsUseCase } from '@/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase';
import type { CdfScanResult } from '@/application/usecases/xiuyuan/shared/CdfMultilineScanner';
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

function createNestedCdfMutationFixture(rootId: string, definitionText: string, groupTitle: string, childTexts: string[]) {
  const listId = `${rootId}-list`;
  const rootParagraphId = `${rootId}-p`;
  const groupItemId = `${rootId}-group`;
  const groupParagraphId = `${groupItemId}-p`;
  const nestedListId = `${groupItemId}-nested-list`;
  const rows: Array<Record<string, unknown>> = [
    { id: listId, parent_id: 'target-doc', root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '1' },
    { id: rootId, parent_id: listId, root_id: 'target-doc', type: 'i', content: definitionText, markdown: definitionText, sort: '2' },
    { id: rootParagraphId, parent_id: rootId, root_id: 'target-doc', type: 'p', content: definitionText, markdown: definitionText, sort: '3' },
    { id: `${rootId}-nested-list`, parent_id: rootId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '4' },
    { id: groupItemId, parent_id: `${rootId}-nested-list`, root_id: 'target-doc', type: 'i', content: `${groupTitle};;;`, markdown: `${groupTitle};;;`, sort: '5' },
    { id: groupParagraphId, parent_id: groupItemId, root_id: 'target-doc', type: 'p', content: `${groupTitle};;;`, markdown: `${groupTitle};;;`, sort: '6' },
    { id: nestedListId, parent_id: groupItemId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '7' },
  ];
  childTexts.forEach((childText, index) => {
    const itemId = `${groupItemId}-child-${index + 1}`;
    rows.push(
      { id: itemId, parent_id: nestedListId, root_id: 'target-doc', type: 'i', content: childText, markdown: childText, sort: String(8 + index * 2) },
      { id: `${itemId}-p`, parent_id: itemId, root_id: 'target-doc', type: 'p', content: childText, markdown: childText, sort: String(9 + index * 2) },
    );
  });
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

function createSemanticCdfMutationFixture(
  rootId: string,
  rootRowText: string,
  groups: Array<{ title: string; items: string[]; stripGroupMarker?: boolean }>,
) {
  const listId = `${rootId}-list`;
  const rootParagraphId = `${rootId}-p`;
  let sort = 1;
  const rows: Array<Record<string, unknown>> = [
    { id: listId, parent_id: 'target-doc', root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: String(sort++) },
    { id: rootId, parent_id: listId, root_id: 'target-doc', type: 'i', content: rootRowText, markdown: rootRowText, sort: String(sort++) },
    { id: rootParagraphId, parent_id: rootId, root_id: 'target-doc', type: 'p', content: rootRowText, markdown: rootRowText, sort: String(sort++) },
    { id: `${rootId}-nested-list`, parent_id: rootId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: String(sort++) },
  ];

  groups.forEach((group, groupIndex) => {
    const groupItemId = `${rootId}-group-${groupIndex + 1}`;
    const groupParagraphId = `${groupItemId}-p`;
    const emittedGroupText = group.items.length === 1
      ? `${group.title};;${group.items[0]}`
      : `${group.title};;;`;
    const storedGroupText = group.stripGroupMarker ? group.title : emittedGroupText;
    rows.push(
      { id: groupItemId, parent_id: `${rootId}-nested-list`, root_id: 'target-doc', type: 'i', content: storedGroupText, markdown: storedGroupText, sort: String(sort++) },
      { id: groupParagraphId, parent_id: groupItemId, root_id: 'target-doc', type: 'p', content: storedGroupText, markdown: storedGroupText, sort: String(sort++) },
    );
    if (group.items.length <= 1) {
      return;
    }
    const nestedListId = `${groupItemId}-nested-list`;
    rows.push({ id: nestedListId, parent_id: groupItemId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: String(sort++) });
    group.items.forEach((childText, childIndex) => {
      const childItemId = `${groupItemId}-child-${childIndex + 1}`;
      rows.push(
        { id: childItemId, parent_id: nestedListId, root_id: 'target-doc', type: 'i', content: childText, markdown: childText, sort: String(sort++) },
        { id: `${childItemId}-p`, parent_id: childItemId, root_id: 'target-doc', type: 'p', content: childText, markdown: childText, sort: String(sort++) },
      );
    });
  });

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
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'executeFromScanResult')
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
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        parentBlockId: 'cdf-root-1',
      }),
      'builtin-list-concept-multiline',
      undefined,
    );
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
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'executeFromScanResult')
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
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        parentBlockId: 'cdf-root-legacy',
      }),
      'builtin-list-concept-multiline',
      undefined,
    );
    expect(created).toMatchObject({
      createdCount: 1,
      createdDefinitionCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    executeSpy.mockRestore();
  });

  it('builds mixed semantic CDF scan results from kramdown fallback and delegates to executeFromScanResult', async () => {
    const cdfFixture = createNestedCdfMutationFixture(
      'cdf-root-fallback',
      '((concept-doc-1))::自变量在底数位置，指数固定的函数。',
      '识别线索',
      ['通常写成 y = x^a', '指数固定'],
    );
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes('WHERE parent_id IN')) {
        const ids = extractQuotedSqlValues(stmt);
        return cdfFixture.rows.filter((row) => (
          ids.includes(String(row.parent_id))
          && String(row.type) === 'p'
        ));
      }
      const ids = extractQuotedSqlValues(stmt);
      return cdfFixture.rows.filter((row) => (
        ids.includes(String(row.id))
        && String(row.type) === 'p'
      ));
    });
    siyuanPort.getBlockKramdown.mockResolvedValue({
      kramdown: [
        '* {: id="cdf-root-fallback"} ((concept-doc-1))::自变量在底数位置，指数固定的函数。',
        '  * {: id="cdf-root-fallback-group"} 识别线索;;;',
        '    * {: id="cdf-root-fallback-group-child-1"} 通常写成 y = x^a',
        '    * {: id="cdf-root-fallback-group-child-2"} 指数固定',
      ].join('\n'),
    });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'executeFromScanResult')
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
        '  * 识别线索;;;',
        '    * 通常写成 y = x^a',
        '    * 指数固定',
      ].join('\n'),
      'daily-doc-1',
    );
    expect(String(siyuanPort.appendBlockUnderParentDetailed.mock.calls[0]?.[0] || '')).toContain(';;;');
    expect(siyuanPort.getBlockKramdown).toHaveBeenCalledWith('cdf-root-fallback');
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        parentBlockId: 'cdf-root-fallback',
        nodes: [
          expect.objectContaining({
            id: 'cdf-root-fallback-group',
            markerKind: 'descriptor-multiline',
            unorderedChildListItemIds: [
              'cdf-root-fallback-group-child-1',
              'cdf-root-fallback-group-child-2',
            ],
          }),
        ],
      }),
      'builtin-list-concept-multiline',
      undefined,
    );
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

  it('restores semantic CDF tree from kramdown mark when mutation rows lack paragraph blocks', async () => {
    const definitionText = '学习是学习者在实践共同体中通过合法的边缘性参与，逐渐增加参与度、转变身份，同时共同体也因此改变的社会性过程。';
    const mutationRows: Array<Record<string, unknown>> = [
      { id: 'cdf-root-mark', parent_id: 'daily-doc-1', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '1' },
      { id: 'cdf-root-mark-traits', parent_id: 'cdf-root-mark', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '2' },
      { id: 'cdf-root-mark-trait-1', parent_id: 'cdf-root-mark-traits', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '3' },
      { id: 'cdf-root-mark-trait-2', parent_id: 'cdf-root-mark-traits', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '4' },
      { id: 'cdf-root-mark-trait-3', parent_id: 'cdf-root-mark-traits', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '5' },
      { id: 'cdf-root-mark-core', parent_id: 'cdf-root-mark', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '6' },
      { id: 'cdf-root-mark-core-1', parent_id: 'cdf-root-mark-core', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '7' },
      { id: 'cdf-root-mark-core-2', parent_id: 'cdf-root-mark-core', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '8' },
      { id: 'cdf-root-mark-core-3', parent_id: 'cdf-root-mark-core', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '9' },
      { id: 'cdf-root-mark-critique', parent_id: 'cdf-root-mark', root_id: 'daily-doc-1', type: 'i', content: '', markdown: '', sort: '10' },
    ];
    const cdfFixture = {
      rows: mutationRows,
      mutation: {
        doOperations: mutationRows.map((row) => ({
          action: 'insert',
          id: row.id,
          parentID: row.parent_id,
          data: row.markdown,
        })),
      },
    };
    const kramdownMark = [
      `- {: id="cdf-root-mark" updated="20260421202747"}((20260421161755-idsbuho '20260421161755-idsbuho'))::${definitionText}`,
      '  {: id="cdf-root-mark-p" updated="20260421202747"}',
      '',
      '  - {: id="cdf-root-mark-traits" updated="20260421202747"}特征;;;',
      '    {: id="cdf-root-mark-traits-p" updated="20260421202747"}',
      '',
      '    - {: id="cdf-root-mark-trait-1" updated="20260421202747"}社会性和情境性',
      '      {: id="cdf-root-mark-trait-1-p" updated="20260421202747"}',
      '    - {: id="cdf-root-mark-trait-2" updated="20260421202747"}强调共同体参与',
      '      {: id="cdf-root-mark-trait-2-p" updated="20260421202747"}',
      '    - {: id="cdf-root-mark-trait-3" updated="20260421202747"}知识与实践活动相关',
      '      {: id="cdf-root-mark-trait-3-p" updated="20260421202747"}',
      '  - {: id="cdf-root-mark-core" updated="20260421202747"}核心概念;;;',
      '    {: id="cdf-root-mark-core-p" updated="20260421202747"}',
      '',
      '    - {: id="cdf-root-mark-core-1" updated="20260421202747"}合法的边缘性参与',
      '      {: updated="20260421202747" id="cdf-root-mark-core-1-p"}',
      '    - {: id="cdf-root-mark-core-2" updated="20260421202747"}实践共同体',
      '      {: id="cdf-root-mark-core-2-p" updated="20260421202747"}',
      '    - {: updated="20260421202747" id="cdf-root-mark-core-3"}身份转变',
      '      {: updated="20260421202747" id="cdf-root-mark-core-3-p"}',
      '  - {: id="cdf-root-mark-critique" updated="20260421202747"}批评对象;;脱离情境的抽象学习',
      '    {: updated="20260421202747" id="cdf-root-mark-critique-p"}',
    ].join('\n');
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes('WHERE parent_id IN')) {
        return [];
      }
      if (stmt.includes('WHERE id IN')) {
        const ids = extractQuotedSqlValues(stmt);
        return mutationRows.filter((row) => ids.includes(String(row.id)));
      }
      return [];
    });
    siyuanPort.getBlockKramdown.mockResolvedValue({ kramdown: kramdownMark });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'executeFromScanResult')
      .mockResolvedValue(ok({
        createdDefinition: 1,
        createdDescriptor: 7,
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
        id: 'anchor-mark',
        conceptName: '情境学习理论',
        selected: true,
        resolution: {
          status: 'resolved-manual',
          conceptBlockId: '20260421161755-idsbuho',
          conceptTitle: '情境学习理论',
          reason: '手动选择概念文档。',
          notebookId: 'notebook-1',
        },
        definitionCandidates: [
          {
            id: 'definition-mark',
            text: definitionText,
            selected: true,
          },
        ],
        descriptorGroups: [
          {
            id: 'group-traits',
            title: '特征',
            selected: true,
            items: ['社会性和情境性', '强调共同体参与', '知识与实践活动相关']
              .map((text, index) => ({ id: `trait-${index + 1}`, text, selected: true })),
          },
          {
            id: 'group-core',
            title: '核心概念',
            selected: true,
            items: ['合法的边缘性参与', '实践共同体', '身份转变']
              .map((text, index) => ({ id: `core-${index + 1}`, text, selected: true })),
          },
          {
            id: 'group-critique',
            title: '批评对象',
            selected: true,
            items: [{ id: 'critique-1', text: '脱离情境的抽象学习', selected: true }],
          },
        ],
      }],
    } as never, {
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, {
      context: null,
      attachedContexts: [],
    });

    expect(siyuanPort.getBlockKramdown).toHaveBeenCalledWith('cdf-root-mark');
    const scanResult = executeSpy.mock.calls[0]?.[0] as CdfScanResult;
    expect(scanResult).toMatchObject({
      parentBlockId: 'cdf-root-mark',
      parentParagraphId: 'cdf-root-mark-p',
      parentParagraphKramdown: `((20260421161755-idsbuho))::${definitionText}`,
    });
    expect(scanResult.nodes).toHaveLength(3);
    expect(scanResult.nodes[0]).toMatchObject({
      id: 'cdf-root-mark-traits',
      firstParagraphId: 'cdf-root-mark-traits-p',
      markerKind: 'descriptor-multiline',
      unorderedChildListItemIds: [
        'cdf-root-mark-trait-1',
        'cdf-root-mark-trait-2',
        'cdf-root-mark-trait-3',
      ],
    });
    expect(scanResult.nodes[1]).toMatchObject({
      id: 'cdf-root-mark-core',
      firstParagraphId: 'cdf-root-mark-core-p',
      markerKind: 'descriptor-multiline',
      unorderedChildListItemIds: [
        'cdf-root-mark-core-1',
        'cdf-root-mark-core-2',
        'cdf-root-mark-core-3',
      ],
    });
    expect(scanResult.nodes[2]).toMatchObject({
      id: 'cdf-root-mark-critique',
      firstParagraphId: 'cdf-root-mark-critique-p',
      firstParagraphKramdown: '批评对象;;脱离情境的抽象学习',
      markerKind: 'descriptor-forward',
      descriptorMeta: {
        groupHint: '批评对象',
        cue: '',
        answer: '脱离情境的抽象学习',
      },
    });
    expect(scanResult.nodes.some((node) => node.markerKind.startsWith('definition'))).toBe(false);
    expect(created).toMatchObject({
      createdDefinitionCount: 1,
      createdDescriptorCount: 7,
      failedCount: 0,
      itemResults: [{
        insertedRootBlockId: 'cdf-root-mark',
        createdDefinitionCount: 1,
        createdDescriptorCount: 7,
        error: null,
      }],
    });
    executeSpy.mockRestore();
  });

  it('keeps semantic CDF definition and descriptor roles when inserted rows lose CDF marker text', async () => {
    const traitItems = [
      '发生在思考探索衍生问题的过程中',
      '目的是更好观察、对照、思考、诠释问题',
    ];
    const misuseItems = ['常见错误是把引用当作摘抄'];
    const groups = [
      {
        title: '特征',
        items: traitItems,
        stripGroupMarker: true,
      },
      {
        title: '误区',
        items: misuseItems,
        stripGroupMarker: true,
      },
    ];
    const cdfFixture = createSemanticCdfMutationFixture(
      'cdf-root-markerless',
      '引用是一种在思考探索衍生问题时，为了更好观察、对照、思考、诠释问题，而回过头来使用其他材料的行为。',
      groups,
    );
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      return cdfFixture.rows.filter((row) => ids.includes(String(row.id)));
    });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'executeFromScanResult')
      .mockResolvedValue(ok({
        createdDefinition: 1,
        createdDescriptor: 3,
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
        id: 'anchor-markerless',
        conceptName: '引用',
        selected: true,
        resolution: {
          status: 'resolved-manual',
          conceptBlockId: 'concept-doc-1',
          conceptTitle: '引用',
          reason: '手动选择概念文档。',
          notebookId: 'notebook-1',
        },
        definitionCandidates: [
          {
            id: 'definition-markerless',
            text: '引用是一种在思考探索衍生问题时，为了更好观察、对照、思考、诠释问题，而回过头来使用其他材料的行为。',
            selected: true,
          },
        ],
        descriptorGroups: [
          {
            id: 'group-traits',
            title: '特征',
            selected: true,
            items: traitItems.map((text, index) => ({
              id: `trait-${index + 1}`,
              text,
              selected: true,
            })),
          },
          {
            id: 'group-misuse',
            title: '误区',
            selected: true,
            items: misuseItems.map((text, index) => ({
              id: `misuse-${index + 1}`,
              text,
              selected: true,
            })),
          },
        ],
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
        '* ((concept-doc-1))::引用是一种在思考探索衍生问题时，为了更好观察、对照、思考、诠释问题，而回过头来使用其他材料的行为。',
        '  * 特征;;;',
        '    * 发生在思考探索衍生问题的过程中',
        '    * 目的是更好观察、对照、思考、诠释问题',
        '  * 误区;;常见错误是把引用当作摘抄',
      ].join('\n'),
      'daily-doc-1',
    );
    const scanResult = executeSpy.mock.calls[0]?.[0] as CdfScanResult;
    expect(scanResult.parentParagraphKramdown).toContain('((concept-doc-1))::');
    expect(scanResult.nodes).toEqual([
      expect.objectContaining({
        id: 'cdf-root-markerless-group-1',
        markerKind: 'descriptor-multiline',
        firstParagraphKramdown: '特征;;;',
        unorderedChildListItemIds: [
          'cdf-root-markerless-group-1-child-1',
          'cdf-root-markerless-group-1-child-2',
        ],
      }),
      expect.objectContaining({
        id: 'cdf-root-markerless-group-2',
        markerKind: 'descriptor-forward',
        firstParagraphKramdown: '误区;;常见错误是把引用当作摘抄',
        descriptorMeta: {
          groupHint: '误区',
          cue: '',
          answer: '常见错误是把引用当作摘抄',
        },
      }),
    ]);
    expect(scanResult.nodes.some((node) => node.markerKind.startsWith('definition'))).toBe(false);
    expect(created).toMatchObject({
      createdDefinitionCount: 1,
      createdDescriptorCount: 3,
      itemResults: [{
        insertedRootBlockId: 'cdf-root-markerless',
        createdDefinitionCount: 1,
        createdDescriptorCount: 3,
      }],
    });
    executeSpy.mockRestore();
  });

  it('preserves cue-arrow descriptor text in semantic CDF markdown and restores cue-answer metadata from it', async () => {
    const cueArrowItem = '前身→恒星';
    const cdfFixture = createSemanticCdfMutationFixture(
      'cdf-root-cue-arrow',
      '((concept-doc-1))::由发光等离子体组成的天体。',
      [{
        title: '演化线索',
        items: [cueArrowItem],
      }],
    );
    const siyuanPort = createSiyuanPort(cdfFixture);
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValueOnce(cdfFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      return cdfFixture.rows.filter((row) => ids.includes(String(row.id)));
    });
    const xiuyuanService = createXiuyuanService();
    const executeSpy = vi.spyOn(CreateCdfMultilineCardsUseCase.prototype, 'executeFromScanResult')
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

    const created = await service.createSemanticCdfCards({
      anchors: [{
        id: 'anchor-cue-arrow',
        conceptName: '恒星',
        selected: true,
        resolution: {
          status: 'resolved-manual',
          conceptBlockId: 'concept-doc-1',
          conceptTitle: '恒星',
          reason: '手动选择概念文档。',
          notebookId: 'notebook-1',
        },
        definitionCandidates: [
          {
            id: 'definition-cue-arrow',
            text: '由发光等离子体组成的天体。',
            selected: true,
          },
        ],
        descriptorGroups: [{
          id: 'group-cue-arrow',
          title: '演化线索',
          selected: true,
          items: [{
            id: 'item-cue-arrow-1',
            text: cueArrowItem,
            selected: true,
          }],
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
        '* ((concept-doc-1))::由发光等离子体组成的天体。',
        `  * 演化线索;;${cueArrowItem}`,
      ].join('\n'),
      'daily-doc-1',
    );
    const scanResult = executeSpy.mock.calls[0]?.[0] as CdfScanResult;
    expect(scanResult.nodes).toEqual([
      expect.objectContaining({
        id: 'cdf-root-cue-arrow-group-1',
        markerKind: 'descriptor-forward',
        firstParagraphKramdown: `演化线索;;${cueArrowItem}`,
        descriptorMeta: {
          groupHint: '演化线索',
          cue: '前身',
          answer: '恒星',
        },
      }),
    ]);
    expect(created).toMatchObject({
      createdDefinitionCount: 1,
      createdDescriptorCount: 1,
      failedCount: 0,
      itemResults: [{
        insertedRootBlockId: 'cdf-root-cue-arrow',
        createdDefinitionCount: 1,
        createdDescriptorCount: 1,
        error: null,
      }],
    });
    executeSpy.mockRestore();
  });

  it('creates excerpt topics from the current runtime selection when explicit args are omitted', async () => {
    const fixture = createTextMutationFixture('text-root-selection', 'Selected runtime text');
    const siyuanPort = createSiyuanPort(fixture);
    const selectionExcerptService = {
      createFromSelection: vi.fn(async () => ({
        kind: 'created',
        excerptEntityId: 'excerpt-doc-1',
        excerptEntityType: 'doc',
        topicCardId: 'topic-card-1',
        sourceBlockId: 'source-block-1',
        sourceBlockIds: ['source-block-1'],
        containerDocId: 'container-doc-1',
        recordId: 'record-1',
        colorApplied: true,
      })),
    };
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => createXiuyuanService() as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
      getSelectionExcerptService: () => selectionExcerptService as never,
    });

    const result = await service.createExcerptTopic({}, {
      context: {
        source: 'review',
        selectedBlockIds: ['source-block-1'],
        blocks: [{
          blockId: 'source-block-1',
          text: 'Selected runtime text',
          type: 'p',
          rootId: 'source-doc-1',
        }],
        currentCard: null,
        neuralBatch: null,
      } as never,
      attachedContexts: [],
    });

    expect(selectionExcerptService.createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      selectedText: 'Selected runtime text',
      origin: 'review',
    });
    expect(result).toMatchObject({
      sourceBlockId: 'source-block-1',
      selectedText: 'Selected runtime text',
      result: {
        topicCardId: 'topic-card-1',
      },
    });
  });

  it('creates topic items through the continuation service and exposes preparation metadata', async () => {
    const fixture = createTextMutationFixture('text-root-continuation', 'Question >> Answer');
    const siyuanPort = createSiyuanPort(fixture);
    const selectionTopicContinuationService = {
      prepareSelection: vi.fn(() => ({
        rootId: 'source-doc-2',
        topicContext: {
          topicCardId: 'topic-card-2',
          sourceDocId: 'source-doc-2',
        },
        normalizedContent: 'Question >> Answer',
        plannerContent: 'Question >> Answer',
        artifactContentDom: '',
        decisions: [],
        mode: 'planner-derived',
        highlightTargetCount: 0,
        available: true,
      })),
      createFromSelection: vi.fn(async () => ({
        created: 1,
        skipped: 0,
        items: [{
          derivedDocId: 'item-doc-1',
          derivedBlockId: 'item-block-1',
          derivedCardId: 'item-card-1',
          sourceBlockId: 'source-block-2',
          storageMode: 'workbench',
          creationRuleId: 'rule-1',
          answerFingerprint: 'fingerprint-1',
        }],
      })),
    };
    const service = new AIFlashcardToolService({
      siyuanPort: siyuanPort as never,
      getXiuyuanApplicationService: async () => createXiuyuanService() as never,
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async (target) => target),
      getSelectionTopicContinuationService: () => selectionTopicContinuationService as never,
    });

    const result = await service.createTopicItems({}, {
      context: {
        source: 'standalone',
        selectedBlockIds: ['source-block-2'],
        blocks: [{
          blockId: 'source-block-2',
          text: 'Question >> Answer',
          type: 'p',
          rootId: 'source-doc-2',
        }],
        currentCard: null,
        neuralBatch: null,
      } as never,
      attachedContexts: [],
    });

    expect(selectionTopicContinuationService.prepareSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-2',
      sourceBlockIds: ['source-block-2'],
      selectedText: 'Question >> Answer',
      rootId: 'source-doc-2',
      origin: 'editor',
    });
    expect(result).toMatchObject({
      available: true,
      topicCardId: 'topic-card-2',
      created: 1,
      items: [{
        derivedCardId: 'item-card-1',
      }],
    });
  });
});
