import { describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

describe('AutoCardHandler quick-cloze content normalization', () => {
  it('keeps multiline formula content when executing quick-cloze decision', async () => {
    const cardService = {
      createCard: vi.fn(),
      getCardByBlockId: vi.fn().mockReturnValue(null),
      saveCards: vi.fn(),
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

    const createClozeSpy = vi.spyOn(handler as any, 'createClozeCard').mockResolvedValue(undefined);

    await (handler as any).executePlannerDecision({
      blockId: '20260302110000-abcd123',
      content: '$$\nP(A|B)=\\cloze{c1}{P(A)/P(B)}\n$$\n{: id="20260302110000-abcd123"}',
      decision: {
        id: 'NumberedLatexClozeRule',
        family: 'cloze',
        templateId: 'builtin-multi-cloze',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-cloze',
        priority: 100,
      },
      source: 'doc-oneclick-scan',
    });

    expect(createClozeSpy).toHaveBeenCalledTimes(1);
    const passedContent = createClozeSpy.mock.calls[0][1] as string;
    expect(passedContent).toContain('$$');
    expect(passedContent).toContain('\\cloze{c1}{P(A)/P(B)}');
    expect(passedContent).not.toContain('{: id=');
    expect(passedContent.trim()).not.toBe('$$');
  });
});

