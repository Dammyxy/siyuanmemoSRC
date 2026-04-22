import { describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

function createHandler(input: {
  blockId: string;
  rootId: string;
  currentBlockCards?: Array<{ id: string; type: string }>;
  rootBlockCards?: Array<{ id: string; type: string }>;
  blockAttrsById?: Record<string, Record<string, string>>;
}) {
  const topicDerivedItemService = {
    createFromTopicSource: vi.fn(async () => ({
      created: 1,
      skipped: 0,
      items: [],
    })),
  };

  const settingsService = {
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
        flashcard: {
          mark: true,
          list: true,
          heading: true,
          superBlock: true,
        },
        topicDerivation: {
          enabled: true,
          storageMode: 'workbench' as const,
        },
      },
    }),
  };

  const cardService = {
    getCardByBlockId: vi.fn((blockId: string) => {
      const card = blockId === input.blockId
        ? input.currentBlockCards?.[0]
        : input.rootBlockCards?.[0];
      return card || null;
    }),
    getCardsByBlockId: vi.fn((blockId: string) => {
      if (blockId === input.blockId) {
        return input.currentBlockCards || [];
      }
      if (blockId === input.rootId) {
        return input.rootBlockCards || [];
      }
      return [];
    }),
    saveCards: vi.fn(),
  };

  const plugin = {
    getContext: () => ({
      getSettingsService: () => settingsService,
      getCardService: () => cardService,
      getCardTypeDetectionService: () => ({
        detectCardType: vi.fn(async () => 'item'),
      }),
      getTopicDerivedItemService: () => topicDerivedItemService,
    }),
  };

  const siyuanApi = {
    getBlockKramdown: vi.fn(async () => ({
      kramdown: 'Alpha >> Beta',
    })),
    sql: vi.fn(async (stmt: string) => {
      if (stmt.includes(`WHERE id = '${input.blockId}'`)) {
        return [{
          type: 'p',
          root_id: input.rootId,
        }];
      }
      return [];
    }),
    getBlockAttrs: vi.fn(async (blockId: string) => input.blockAttrsById?.[blockId] || {}),
    pushMsg: vi.fn(async () => undefined),
    pushErrMsg: vi.fn(async () => undefined),
    setBlockAttrs: vi.fn(async () => undefined),
    markBlockAsCard: vi.fn(async () => undefined),
  };

  const riffApi = {
    BUILTIN_DECK_ID: 'builtin-deck',
    addRiffCards: vi.fn(async () => ({ name: 'builtin-deck', size: 0 })),
  };

  const handler = new AutoCardHandler(plugin as never, {
    siyuanApi: siyuanApi as never,
    riffApi: riffApi as never,
  });

  return {
    handler,
    topicDerivedItemService,
    siyuanApi,
  };
}

describe('AutoCardHandler topic derivation routing', () => {
  it('derives a new item when the current block is already a topic card', async () => {
    const { handler, topicDerivedItemService, siyuanApi } = createHandler({
      blockId: 'topic-block-1',
      rootId: 'doc-root-1',
      currentBlockCards: [{ id: 'topic-card-1', type: 'topic' }],
      blockAttrsById: {
        'topic-block-1': {
          'custom-xiuyuan-id': 'topic-xiuyuan-1',
        },
      },
    });

    await (handler as any).checkQuickSymbols('topic-block-1');

    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledTimes(1);
    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'topic-block-1',
      sourceDocId: 'doc-root-1',
      parentTopicCardId: 'topic-card-1',
      content: 'Alpha >> Beta',
      storageMode: 'workbench',
      decisions: expect.arrayContaining([
        expect.objectContaining({
          family: 'basic',
        }),
      ]),
    }));
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已在当前 Topic 下新增 1 个 Item');
  });

  it('derives from topic doc root context instead of skipping child blocks inside a topic document', async () => {
    const { handler, topicDerivedItemService, siyuanApi } = createHandler({
      blockId: 'child-block-1',
      rootId: 'topic-doc-1',
      rootBlockCards: [{ id: 'topic-card-root-1', type: 'topic' }],
    });

    await (handler as any).checkQuickSymbols('child-block-1');

    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledTimes(1);
    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'child-block-1',
      sourceDocId: 'topic-doc-1',
      parentTopicCardId: 'topic-card-root-1',
      content: 'Alpha >> Beta',
    }));
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已在当前 Topic 下新增 1 个 Item');
  });

  it('passes excerpt-doc lineage through the topic-derived path when editing inside an excerpt document', async () => {
    const { handler, topicDerivedItemService, siyuanApi } = createHandler({
      blockId: 'excerpt-child-1',
      rootId: 'excerpt-doc-root-1',
      rootBlockCards: [{ id: 'topic-card-excerpt-root-1', type: 'topic' }],
      blockAttrsById: {
        'excerpt-doc-root-1': {
          'custom-fsrs-reading-kind': 'excerpt-doc',
          'custom-fsrs-reading-source-doc-id': 'doc-ordinary',
          'custom-fsrs-reading-source-block-id': 'source-root-1',
        },
      },
    });

    await (handler as any).checkQuickSymbols('excerpt-child-1');

    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledTimes(1);
    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'excerpt-child-1',
      sourceDocId: 'excerpt-doc-root-1',
      parentTopicCardId: 'topic-card-excerpt-root-1',
      parentExcerptId: 'excerpt-doc-root-1',
      sourceRootKind: 'excerpt-doc',
      content: 'Alpha >> Beta',
    }));
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已在当前 Topic 下新增 1 个 Item');
  });

  it('passes excerpt-block lineage through the topic-derived path for daily-note excerpts', async () => {
    const { handler, topicDerivedItemService, siyuanApi } = createHandler({
      blockId: 'excerpt-block-1',
      rootId: 'daily-doc-1',
      currentBlockCards: [{ id: 'topic-card-excerpt-block-1', type: 'topic' }],
      blockAttrsById: {
        'excerpt-block-1': {
          'custom-fsrs-reading-kind': 'excerpt',
          'custom-fsrs-reading-source-doc-id': 'doc-ordinary',
          'custom-fsrs-reading-source-block-id': 'source-daily-1',
        },
      },
    });

    await (handler as any).checkQuickSymbols('excerpt-block-1');

    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledTimes(1);
    expect(topicDerivedItemService.createFromTopicSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'excerpt-block-1',
      sourceDocId: 'daily-doc-1',
      parentTopicCardId: 'topic-card-excerpt-block-1',
      parentExcerptId: 'excerpt-block-1',
      sourceRootKind: 'excerpt-block',
      content: 'Alpha >> Beta',
    }));
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已在当前 Topic 下新增 1 个 Item');
  });

  it('still skips non-topic Xiuyuan bindings even when the root document is a topic doc', async () => {
    const { handler, topicDerivedItemService, siyuanApi } = createHandler({
      blockId: 'descriptor-block-1',
      rootId: 'topic-doc-1',
      rootBlockCards: [{ id: 'topic-card-root-1', type: 'topic' }],
      blockAttrsById: {
        'descriptor-block-1': {
          'custom-xiuyuan-id': 'descriptor-xiuyuan-1',
        },
      },
    });

    await (handler as any).checkQuickSymbols('descriptor-block-1');

    expect(topicDerivedItemService.createFromTopicSource).not.toHaveBeenCalled();
    expect(siyuanApi.pushMsg).not.toHaveBeenCalled();
  });
});
