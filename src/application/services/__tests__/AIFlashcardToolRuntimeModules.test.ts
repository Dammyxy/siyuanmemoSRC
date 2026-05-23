import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { AIFlashcardCardResolutionRuntime } from '../AIFlashcardCardResolutionRuntime';
import { AIFlashcardMarkdownInsertionRuntime } from '../AIFlashcardMarkdownInsertionRuntime';
import { AIFlashcardTargetRuntime } from '../AIFlashcardTargetRuntime';
import { AIFlashcardToolDecisionRuntime } from '../AIFlashcardToolDecisionRuntime';
import { AIFlashcardXiuyuanWriteRuntime } from '../AIFlashcardXiuyuanWriteRuntime';

describe('AI flashcard tool runtime modules', () => {
  it('resolves explicit block targets and fails closed when default target is missing', async () => {
    const targetRuntime = new AIFlashcardTargetRuntime({
      loadDefaultTarget: vi.fn(async () => null),
      saveDefaultTarget: vi.fn(async () => null),
      ensureTodayDailyNote: vi.fn(),
      loadTargetBlock: vi.fn(async () => ({
        id: 'target-block',
        box: 'notebook-1',
        type: 'p',
        content: 'Target paragraph',
        hpath: '/Target paragraph',
      })),
    });

    await expect(targetRuntime.resolveWriteTarget({})).rejects.toThrow('请先在 AI 工作台设置默认制卡位置');

    const target = await targetRuntime.resolveWriteTarget({
      targetMode: 'block',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
      targetBlockId: 'target-block',
    });

    expect(target).toMatchObject({
      targetBlockId: 'target-block',
      writeMode: 'after',
      memory: {
        mode: 'block',
        notebookId: 'notebook-1',
        targetBlockId: 'target-block',
        targetLabel: '学习笔记 · target-block',
      },
    });
  });

  it('inserts markdown through append or after targets and rejects empty mutation ids', async () => {
    const markdownRuntime = new AIFlashcardMarkdownInsertionRuntime({
      appendBlockUnderParentDetailed: vi.fn(async () => ({
        doOperations: [{ id: 'child-1' }],
      })),
      insertBlockAfterDetailed: vi.fn(async () => ({
        doOperations: [],
      })),
      sql: vi.fn(async () => []),
    });

    await expect(markdownRuntime.insertMarkdown('Alpha', {
      targetBlockId: 'doc-1',
      writeMode: 'append',
    })).resolves.toEqual({
      doOperations: [{ id: 'child-1' }],
    });

    const emptyMutation = await markdownRuntime.insertMarkdown('Beta', {
      targetBlockId: 'leaf-1',
      writeMode: 'after',
    }, 'leaf-1');

    await expect(markdownRuntime.loadMutationRows(emptyMutation)).rejects.toThrow('未能解析插入后的块 ID');
  });

  it('resolves tool decisions and card shape config without touching write ports', () => {
    const decisionRuntime = new AIFlashcardToolDecisionRuntime();
    const cardRuntime = new AIFlashcardCardResolutionRuntime();

    expect(decisionRuntime.resolveCardCreationDecision({
      request: '请做 CDF 卡',
      selection: {
        selectedText: '概念:::',
        blockType: 'p',
      },
      continuationAvailable: false,
    })).toMatchObject({
      recommendedTool: 'CreateCdfMultilineCards',
      cardFamily: 'cdf-concept-multiline',
    });

    expect(cardRuntime.resolveInlineCardConfig('multi-cloze')).toMatchObject({
      templateId: 'builtin-multi-cloze',
      cardType: 'cloze',
    });
    expect(cardRuntime.resolveCdfListConfig('descriptor-multiline')).toMatchObject({
      templateId: 'builtin-list-descriptor-multiline',
      cardType: 'descriptor',
      listKind: 'descriptor-multiline',
    });
    expect(() => cardRuntime.resolveInlineCardConfig('unknown-mode')).toThrow('不支持的 inline 模式');
  });

  it('routes Xiuyuan writes through injected application service only', async () => {
    const xiuyuanService = {
      createFromBlocks: vi.fn(async () => ok({
        xiuyuan: { id: 'xy-1' },
        cards: [{ id: 'card-1' }],
      })),
      createListTemplateCards: vi.fn(async () => ok({
        xiuyuan: { id: 'xy-list' },
        cards: [{ id: 'card-list' }],
        created: 1,
        skippedChildBlockIds: [],
      })),
    };
    const runtime = new AIFlashcardXiuyuanWriteRuntime({
      getXiuyuanApplicationService: vi.fn(async () => xiuyuanService as never),
    });

    await runtime.createFromBlocks({
      blockIds: ['block-1'],
      templateId: 'builtin-quick-card',
      fieldMapping: { content: 'block-1' },
      cardType: 'item',
      source: 'ai-workbench',
    });
    await runtime.createListTemplateCards({
      parentBlockId: 'parent-1',
      childBlockIds: ['child-1', 'child-2'],
      templateId: 'builtin-list-item',
      creationMode: 'split-v2',
      cardType: 'item',
      listKind: 'default',
    });

    expect(xiuyuanService.createFromBlocks).toHaveBeenCalledTimes(1);
    expect(xiuyuanService.createListTemplateCards).toHaveBeenCalledTimes(1);
  });
});
