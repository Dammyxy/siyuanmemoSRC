import { describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

describe('AutoCardHandler doc-scan root guard', () => {
  it('passes current doc root guard to concept-definition execution in doc scan', async () => {
    const cardService = {
      getCardByBlockId: vi.fn().mockReturnValue(null),
    };

    const plugin = {
      getContext: () => ({
        getCardService: () => cardService,
      }),
    };

    const siyuanApi = {
      getBlockAttrs: vi.fn().mockResolvedValue({}),
      setBlockAttrs: vi.fn(),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
      sql: vi.fn().mockResolvedValue([]),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
      markBlockAsCard: vi.fn(),
    };

    const riffApi = {
      BUILTIN_DECK_ID: '20200812220555-lj3enxa',
      addRiffCards: vi.fn(),
    };

    const handler = new AutoCardHandler(plugin as never, {
      siyuanApi: siyuanApi as never,
      riffApi: riffApi as never,
    });

    const createConceptSpy = vi.spyOn(handler as any, 'createConceptCard').mockResolvedValue(undefined);

    await (handler as any).executePlannerDecision({
      blockId: '20260302110000-abcd123',
      content: '((20260302000000-docroot1)) :: 定义',
      decision: {
        id: 'ConceptDefinitionInlineRule',
        family: 'concept-definition',
        templateId: 'builtin-concept-definition',
        cardType: 'descriptor',
        mode: 'single',
        executorKind: 'concept-definition-inline',
        direction: 'both',
        priority: 90,
      },
      source: 'doc-oneclick-scan',
      docRootId: '20260302000000-docroot1',
    });

    expect(createConceptSpy).toHaveBeenCalledTimes(1);
    expect(createConceptSpy.mock.calls[0][4]).toEqual({
      skipEnsureConceptDocumentBlockId: '20260302000000-docroot1',
    });
  });
});

