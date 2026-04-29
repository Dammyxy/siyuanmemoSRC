import { describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

describe('AutoCardHandler structural listener gating', () => {
  it('does not run structural template check in listener mode when force is not set', async () => {
    const siyuanApi = {
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: 'Question >>>' }),
      sql: vi.fn().mockResolvedValue([]),
      getBlockAttrs: vi.fn().mockResolvedValue({}),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
      markBlockAsCard: vi.fn(),
    };

    const riffApi = {
      BUILTIN_DECK_ID: '20200812220555-lj3enxa',
      addRiffCards: vi.fn(),
    };

    const context = {
      getSettingsService: () => ({
        getSettings: () => ({
          quickCard: {
            enabled: true,
            enabledSymbols: {
              multiLine: true,
            },
          },
        }),
      }),
      getCardService: () => ({
        createCard: vi.fn(),
        getCardByBlockId: vi.fn(),
        saveCards: vi.fn(),
      }),
      getXiuyuanApplicationService: async () => ({
        createFromBlocks: vi.fn(),
        createTemplate: vi.fn(),
      }),
    };

    const plugin = {
      getContext: () => context,
    };

    const handler = new AutoCardHandler(plugin as never, {
      siyuanApi: siyuanApi as never,
      riffApi: riffApi as never,
    });

    const executed = await (handler as any).executePlannerDecision({
      blockId: '20260101010101-abcdefg',
      content: 'Question >>>',
      decision: {
        id: 'ListTemplateStructuralRule',
        family: 'list-template',
        templateId: 'builtin-list-item',
        cardType: 'item',
        mode: 'split-list',
        executorKind: 'list-template-structural',
        priority: 100,
      },
      source: 'symbol-listener',
    });

    expect(executed).toBe(false);
    expect(siyuanApi.getBlockKramdown).not.toHaveBeenCalled();
  });

  it('skips planner execution when block already has xiuyuan binding', async () => {
    const siyuanApi = {
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '属性 ;; 描述' }),
      sql: vi.fn().mockResolvedValue([]),
      getBlockAttrs: vi.fn().mockResolvedValue({ 'custom-xiuyuan-id': 'xy_abc' }),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
      markBlockAsCard: vi.fn(),
    };

    const riffApi = {
      BUILTIN_DECK_ID: '20200812220555-lj3enxa',
      addRiffCards: vi.fn(),
    };

    const context = {
      getSettingsService: () => ({
        getSettings: () => ({ quickCard: { enabled: true } }),
      }),
      getCardService: () => ({
        createCard: vi.fn(),
        getCardByBlockId: vi.fn().mockReturnValue(null),
        saveCards: vi.fn(),
      }),
      getXiuyuanApplicationService: async () => ({
        createFromBlocks: vi.fn(),
        createTemplate: vi.fn(),
      }),
    };

    const plugin = { getContext: () => context };
    const handler = new AutoCardHandler(plugin as never, {
      siyuanApi: siyuanApi as never,
      riffApi: riffApi as never,
    });

    const executed = await (handler as any).executePlannerDecision({
      blockId: '20260101010101-abcdefg',
      content: '属性 ;; 描述',
      decision: {
        id: 'DescriptorInlineRule',
        family: 'descriptor',
        templateId: 'builtin-concept-descriptor',
        cardType: 'descriptor',
        mode: 'single',
        executorKind: 'descriptor-inline',
        priority: 90,
      },
      source: 'doc-oneclick-scan',
    });

    expect(executed).toBe(false);
  });
});
