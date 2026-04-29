import { describe, expect, it, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';

function createHandler() {
  const plugin = {
    getContext: () => null,
  } as any;

  const siyuanApi = {
    BUILTIN_DECK_ID: 'builtin-deck',
    CARD_ID_ATTR: 'custom-fsrs-card-id',
    pushMsg: async () => undefined,
    pushErrMsg: async () => undefined,
    sql: async () => [],
    getBlockKramdown: async () => ({ kramdown: '' }),
    getBlockText: async () => '',
    setBlockAttrs: async () => undefined,
    markBlockAsCard: async () => undefined,
  } as any;

  const riffApi = {
    BUILTIN_DECK_ID: 'builtin-deck',
    addRiffCards: async () => ({ name: 'builtin-deck', size: 0 }),
  } as any;

  return new AutoCardHandler(plugin, { siyuanApi, riffApi });
}

describe('AutoCardHandler cloze planner alignment', () => {
  it('uses multi-cloze path for numbered latex cloze even with one cloze', async () => {
    const handler = createHandler();
    const multiSpy = vi.spyOn(handler as any, 'createMultipleClozeCards').mockResolvedValue(undefined);

    await (handler as any).createClozeCard('20260301120000-latex01', '$$E=\\\\cloze{c1}{mc^2}$$');

    expect(multiSpy).toHaveBeenCalledTimes(1);
    expect(multiSpy.mock.calls[0][3]).toBe('inline-formula-cloze');
  });

  it('uses default render mode for non-latex one-cloze content', async () => {
    const handler = createHandler();
    const multiSpy = vi.spyOn(handler as any, 'createMultipleClozeCards').mockResolvedValue(undefined);

    await (handler as any).createClozeCard('20260301120000-brace01', 'alpha {{beta}} gamma');

    expect(multiSpy).toHaveBeenCalledTimes(1);
    expect(multiSpy.mock.calls[0][3]).toBe('default');
  });
});
