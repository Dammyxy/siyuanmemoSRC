import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

const basicDecision = {
  id: 'BasicDirectionRule',
  family: 'basic',
  templateId: 'builtin-quick-card',
  cardType: 'item',
  mode: 'single',
  executorKind: 'quick-basic',
  renderProfile: 'quick-default',
  direction: 'forward',
  priority: 50,
} as const;

function createHostBlockQuery(overrides?: {
  getBlock?: (blockId: string) => Promise<Record<string, unknown> | null>;
}) {
  return {
    getBlock: vi.fn(overrides?.getBlock ?? (async (blockId: string) => ({
      id: blockId,
      type: 'p',
      root_id: 'root-doc',
      content: 'Prompt >> Answer',
      markdown: 'Prompt >> Answer',
    }))),
    getDocumentRootId: vi.fn(async () => 'root-doc'),
    getExistingBlockIds: vi.fn(async (blockIds: string[]) => new Set(blockIds)),
    getSubtreeBlockIds: vi.fn(async () => []),
    getManagedBlockAttrs: vi.fn(async () => []),
    listBlocksByRoot: vi.fn(async () => []),
    listParagraphChildren: vi.fn(async () => []),
    listParentIdsWithParagraphChild: vi.fn(async () => new Set<string>()),
    getBlockType: vi.fn(async () => 'p'),
    getParentId: vi.fn(async () => null),
    getBlockTypeAndContent: vi.fn(async (blockId: string) => ({
      id: blockId,
      type: 'p',
      content: 'Prompt >> Answer',
    })),
    getBlockMarkdownAndContent: vi.fn(async () => ({
      markdown: 'Prompt >> Answer',
      content: 'Prompt >> Answer',
    })),
    getXiuyuanBindingAttrs: vi.fn(async () => ({})),
    getFirstParagraphUnderParent: vi.fn(async () => null),
    getFirstListContainerId: vi.fn(async () => null),
    listListContainerIds: vi.fn(async () => []),
    listListItemIdsUnderParent: vi.fn(async () => []),
    listListItemsUnderParent: vi.fn(async () => []),
    listDescendantParagraphs: vi.fn(async () => []),
    listBlockTypesByIds: vi.fn(async () => new Map<string, string>()),
    listRecursiveListItemsUnderParent: vi.fn(async () => []),
    getBlockKramdown: vi.fn(async () => ({ kramdown: 'Prompt >> Answer' })),
  };
}

function createFixture(options?: {
  getBlockKramdown?: (blockId: string) => Promise<{ kramdown: string }>;
  getBlock?: (blockId: string) => Promise<Record<string, unknown> | null>;
  executeAutoCard?: (request: unknown, localCards: Map<string, unknown[]>) => Promise<unknown>;
}) {
  const localCards = new Map<string, unknown[]>();
  const hostBlockQuery = createHostBlockQuery({
    getBlock: options?.getBlock,
  });
  const getBlockKramdown = vi.fn(options?.getBlockKramdown ?? (async () => ({
    kramdown: 'Prompt >> Answer',
  })));
  const getBlockAttrs = vi.fn(async () => ({}));
  const executeAutoCard = vi.fn(async (request: unknown) => {
    if (options?.executeAutoCard) {
      return options.executeAutoCard(request, localCards);
    }
    const blockId = String((request as { envelope?: { blockId?: string } }).envelope?.blockId || '');
    localCards.set(blockId, [{ id: `card-${blockId}`, blockId }]);
    return { executed: true, created: 1, skipped: 0 };
  });
  const resolveAutoCardDecision = vi.fn(async () => ({
    candidateId: 'backend-candidate',
    decisionEventId: 'backend-decision',
    status: 'selected',
    unavailableClass: null,
    matchedRuleIds: ['BasicDirectionRule'],
    filteredDecisions: [basicDecision],
    selectedDecision: basicDecision,
    conflicted: false,
    shouldUseTopicDerivation: false,
    markOnlyClozeCandidate: false,
  }));
  const context = {
    getSettingsService: () => ({
      getSettings: () => ({
        quickCard: {
          enabled: true,
          enabledSymbols: {
            basic: true,
            concept: true,
            descriptor: true,
            cloze: true,
            multiLine: true,
          },
        },
      }),
    }),
    getCardService: () => ({
      getCardByBlockId: (blockId: string) => localCards.get(blockId)?.[0] ?? null,
      getCardsByBlockId: (blockId: string) => localCards.get(blockId) ?? [],
      saveCards: vi.fn(async () => undefined),
    }),
    getCardTypeDetectionService: () => ({
      detectCardType: vi.fn(async () => 'item'),
    }),
    getTopicDerivedItemService: () => ({
      createFromTopicSource: vi.fn(async () => ({ created: 0, skipped: 0, items: [] })),
    }),
    getSrsBackendClient: () => ({
      executeAutoCard,
      resolveAutoCardDecision,
    }),
  };
  const handler = new AutoCardHandler({ getContext: () => context } as never, {
    siyuanApi: {
      getBlockKramdown,
      sql: vi.fn(async () => []),
      getBlockAttrs,
      setBlockAttrs: vi.fn(async () => undefined),
      pushMsg: vi.fn(async () => undefined),
      pushErrMsg: vi.fn(async () => undefined),
      markBlockAsCard: vi.fn(async () => undefined),
    } as never,
    riffApi: {
      BUILTIN_DECK_ID: 'builtin-deck',
      addRiffCards: vi.fn(async () => ({ name: 'builtin-deck', size: 0 })),
    } as never,
    hostBlockQuery: hostBlockQuery as never,
  });

  return {
    handler,
    executeAutoCard,
    getBlockKramdown,
    getBlockAttrs,
    hostBlockQuery,
    localCards,
  };
}

function latestDiagnostic(handler: AutoCardHandler, blockId: string) {
  return (handler as any)
    .getListenerCandidateDiagnostics()
    .filter((item: { blockId: string }) => item.blockId === blockId)
    .at(-1);
}

describe('AutoCardHandler listener reliability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('retries transient missing block query data and creates once block is visible', async () => {
    let getBlockCalls = 0;
    const { handler, executeAutoCard, hostBlockQuery } = createFixture({
      getBlock: async (blockId) => {
        getBlockCalls += 1;
        if (getBlockCalls === 1) {
          return null;
        }
        return {
          id: blockId,
          type: 'p',
          root_id: 'root-doc',
          content: 'Prompt >> Answer',
          markdown: 'Prompt >> Answer',
        };
      },
    });

    handler.handle([{
      doOperations: [{ action: 'insert', id: 'block-transient-query' }],
      undoOperations: null,
    } as never]);

    await vi.advanceTimersByTimeAsync(300);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(latestDiagnostic(handler, 'block-transient-query')).toEqual(expect.objectContaining({
      status: 'retry-scheduled',
      reason: 'missing-block',
    }));

    await vi.advanceTimersByTimeAsync(250);
    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(hostBlockQuery.getBlock).toHaveBeenCalledTimes(2);
    expect(latestDiagnostic(handler, 'block-transient-query')).toEqual(expect.objectContaining({
      status: 'created',
      reason: 'executed-planner-decision',
      blockId: 'block-transient-query',
    }));
  });

  it('retries transient empty kramdown and evaluates the later content', async () => {
    let readCount = 0;
    const { handler, executeAutoCard, getBlockKramdown } = createFixture({
      getBlockKramdown: async () => {
        readCount += 1;
        return { kramdown: readCount === 1 ? '' : 'Delayed prompt >> Delayed answer' };
      },
    });

    handler.handle([{
      doOperations: [{ action: 'insert', id: 'block-transient-kramdown' }],
      undoOperations: null,
    } as never]);

    await vi.advanceTimersByTimeAsync(300);
    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(latestDiagnostic(handler, 'block-transient-kramdown')).toEqual(expect.objectContaining({
      status: 'retry-scheduled',
      reason: 'empty-content',
    }));

    await vi.advanceTimersByTimeAsync(250);
    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledTimes(2);
    expect(latestDiagnostic(handler, 'block-transient-kramdown')).toEqual(expect.objectContaining({
      status: 'created',
      reason: 'executed-planner-decision',
    }));
  });

  it('preserves a same-block candidate accepted while the block is already processing', async () => {
    let releaseExecute: (() => void) | null = null;
    const { handler, executeAutoCard, getBlockKramdown } = createFixture({
      executeAutoCard: async (request, localCards) => {
        await new Promise<void>((resolve) => {
          releaseExecute = resolve;
        });
        const blockId = String((request as { envelope?: { blockId?: string } }).envelope?.blockId || '');
        localCards.set(blockId, [{ id: `card-${blockId}`, blockId }]);
        return { executed: true, created: 1, skipped: 0 };
      },
    });

    handler.handle([{
      doOperations: [{ action: 'insert', id: 'block-inflight' }],
      undoOperations: null,
    } as never]);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    expect(executeAutoCard).toHaveBeenCalledTimes(1);

    handler.handle([{
      doOperations: [{ action: 'update', id: 'block-inflight' }],
      undoOperations: null,
    } as never]);
    await vi.advanceTimersByTimeAsync(300);
    expect(latestDiagnostic(handler, 'block-inflight')).toEqual(expect.objectContaining({
      status: 'retry-scheduled',
      reason: 'already-processing',
    }));

    releaseExecute?.();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledTimes(2);
    expect(latestDiagnostic(handler, 'block-inflight')).toEqual(expect.objectContaining({
      status: 'skipped',
      reason: 'skip-existing-card',
    }));
  });

  it('does not duplicate a card when a later listener update reaches the same block', async () => {
    const { handler, executeAutoCard } = createFixture();

    handler.handle([{
      doOperations: [{ action: 'insert', id: 'block-duplicate' }],
      undoOperations: null,
    } as never]);
    await vi.advanceTimersByTimeAsync(300);
    expect(executeAutoCard).toHaveBeenCalledTimes(1);

    handler.handle([{
      doOperations: [{ action: 'update', id: 'block-duplicate' }],
      undoOperations: null,
    } as never]);
    await vi.advanceTimersByTimeAsync(300);

    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(latestDiagnostic(handler, 'block-duplicate')).toEqual(expect.objectContaining({
      status: 'skipped',
      reason: 'skip-existing-card',
    }));
  });

  it('records retry-exhausted when transient readiness never resolves', async () => {
    const { handler, executeAutoCard } = createFixture({
      getBlock: async () => null,
    });

    handler.handle([{
      doOperations: [{ action: 'insert', id: 'block-never-visible' }],
      undoOperations: null,
    } as never]);

    await vi.advanceTimersByTimeAsync(300 + 250 + 750 + 1500 + 3000 + 6000);

    expect(executeAutoCard).not.toHaveBeenCalled();
    expect(latestDiagnostic(handler, 'block-never-visible')).toEqual(expect.objectContaining({
      status: 'retry-exhausted',
      reason: 'missing-block',
    }));
  });

  it('gives every accepted block id in a batch a terminal created outcome', async () => {
    const { handler, executeAutoCard } = createFixture();
    const blockIds = Array.from({ length: 10 }, (_, index) => `block-batch-${index + 1}`);

    handler.handle([{
      doOperations: blockIds.map((blockId) => ({ action: 'insert', id: blockId })),
      undoOperations: null,
    } as never]);
    await vi.advanceTimersByTimeAsync(300);

    expect(executeAutoCard).toHaveBeenCalledTimes(10);
    const diagnostics = (handler as any).getListenerCandidateDiagnostics();
    for (const blockId of blockIds) {
      expect(diagnostics).toContainEqual(expect.objectContaining({
        blockId,
        status: 'created',
        reason: 'executed-planner-decision',
      }));
    }
  });
});
