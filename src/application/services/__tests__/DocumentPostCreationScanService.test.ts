import { describe, expect, it, vi } from 'vitest';
import { DocumentPostCreationScanService } from '../DocumentPostCreationScanService';

function createBlockQuery(rows: Array<{ id: string; type: string }>, parentIdsWithParagraphChild: string[] = []) {
  return {
    listBlocksByRoot: vi.fn(async () => rows),
    listParentIdsWithParagraphChild: vi.fn(async () => new Set(parentIdsWithParagraphChild)),
  };
}

describe('DocumentPostCreationScanService', () => {
  it('prefers paragraph blocks and skips list-item fallback when list item has paragraph child', async () => {
    const blockQuery = createBlockQuery([
      { id: 'i-1', type: 'i' },
      { id: 'p-1', type: 'p' },
    ], ['i-1']);

    const getBlockKramdown = vi.fn(async (blockId: string) => {
      if (blockId === 'i-1') return { kramdown: 'List root >>>' };
      return { kramdown: 'Question >> Answer' };
    });

    const executeSingleBlockDecision = vi.fn().mockResolvedValue(true);
    const executeStructuralDecision = vi.fn().mockResolvedValue(true);

    const service = new DocumentPostCreationScanService(
      {
        getBlockKramdown,
      },
      blockQuery,
      {
        executeSingleBlockDecision,
        executeStructuralDecision,
      }
    );

    const summary = await service.scanByRootId('root-1');

    expect(summary.rootId).toBe('root-1');
    expect(summary.scanned).toBe(2);
    expect(summary.created).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.consumed).toBe(1);
    expect(executeStructuralDecision).not.toHaveBeenCalled();
    expect(executeSingleBlockDecision).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledWith('p-1');
  });

  it('uses list-item fallback when list item has no paragraph child', async () => {
    const blockQuery = createBlockQuery([
      { id: 'i-1', type: 'i' },
    ]);

    const getBlockKramdown = vi.fn().mockResolvedValue({ kramdown: '术语;;描述' });
    const executeSingleBlockDecision = vi.fn().mockResolvedValue(true);
    const executeStructuralDecision = vi.fn().mockResolvedValue(true);

    const service = new DocumentPostCreationScanService(
      {
        getBlockKramdown,
      },
      blockQuery,
      {
        executeSingleBlockDecision,
        executeStructuralDecision,
      }
    );

    const summary = await service.scanByRootId('root-1');

    expect(summary.scanned).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(executeSingleBlockDecision).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledWith('i-1');
  });

  it('uses injected single-block decision resolver when provided', async () => {
    const blockQuery = createBlockQuery([
      { id: 'p-2', type: 'p' },
    ]);
    const getBlockKramdown = vi.fn().mockResolvedValue({ kramdown: 'Alpha >> Beta' });
    const executeSingleBlockDecision = vi.fn().mockResolvedValue(true);
    const executeStructuralDecision = vi.fn().mockResolvedValue(true);
    const resolveSingleBlockDecision = vi.fn().mockResolvedValue({
      matchedRuleIds: ['BasicDirectionRule'],
      enabledDecisions: [{
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-quick-card',
        cardType: 'item',
        mode: 'single',
        executorKind: 'quick-basic',
        direction: 'forward',
        priority: 50,
      }],
      selectedDecision: {
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-quick-card',
        cardType: 'item',
        mode: 'single',
        executorKind: 'quick-basic',
        direction: 'forward',
        priority: 50,
      },
      conflicted: true,
    });

    const service = new DocumentPostCreationScanService(
      {
        getBlockKramdown,
      },
      blockQuery,
      {
        executeSingleBlockDecision,
        executeStructuralDecision,
      },
      {
        resolveSingleBlockDecision,
      },
    );

    const summary = await service.scanByRootId('root-2');

    expect(summary.scanned).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.conflicted).toBe(1);
    expect(resolveSingleBlockDecision).toHaveBeenCalledTimes(1);
    expect(resolveSingleBlockDecision).toHaveBeenCalledWith({
      blockId: 'p-2',
      blockType: 'p',
      content: 'Alpha >> Beta',
      resolvedCardType: undefined,
    });
    expect(executeSingleBlockDecision).toHaveBeenCalledTimes(1);
    expect(executeSingleBlockDecision.mock.calls[0]?.[0]).toMatchObject({
      blockId: 'p-2',
      content: 'Alpha >> Beta',
      decision: {
        id: 'BasicDirectionRule',
      },
    });
  });

  it('uses injected structural decision resolver when provided', async () => {
    const blockQuery = createBlockQuery([
      { id: 'i-3', type: 'i' },
    ]);
    const getBlockKramdown = vi.fn().mockResolvedValue({ kramdown: '术语 >>>' });
    const executeSingleBlockDecision = vi.fn().mockResolvedValue(false);
    const executeStructuralDecision = vi.fn().mockResolvedValue(true);
    const resolveStructuralDecision = vi.fn().mockResolvedValue({
      matchedRuleIds: ['ListTemplateStructuralRule'],
      enabledDecisions: [{
        id: 'ListTemplateStructuralRule',
        family: 'list-template',
        templateId: 'builtin-list-item',
        cardType: 'item',
        mode: 'split-list',
        executorKind: 'list-template-structural',
        priority: 100,
      }],
      selectedDecision: {
        id: 'ListTemplateStructuralRule',
        family: 'list-template',
        templateId: 'builtin-list-item',
        cardType: 'item',
        mode: 'split-list',
        executorKind: 'list-template-structural',
        priority: 100,
      },
      conflicted: true,
    });

    const service = new DocumentPostCreationScanService(
      {
        getBlockKramdown,
      },
      blockQuery,
      {
        executeSingleBlockDecision,
        executeStructuralDecision,
      },
      {
        resolveStructuralDecision,
      },
    );

    const summary = await service.scanByRootId('root-3');

    expect(summary.scanned).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.conflicted).toBe(1);
    expect(resolveStructuralDecision).toHaveBeenCalledTimes(1);
    expect(resolveStructuralDecision).toHaveBeenCalledWith({
      blockId: 'i-3',
      blockType: 'i',
      content: '术语 >>>',
      resolvedCardType: undefined,
    });
    expect(executeStructuralDecision).toHaveBeenCalledTimes(1);
    expect(executeSingleBlockDecision).not.toHaveBeenCalled();
  });
});
