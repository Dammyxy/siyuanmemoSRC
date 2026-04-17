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
});
