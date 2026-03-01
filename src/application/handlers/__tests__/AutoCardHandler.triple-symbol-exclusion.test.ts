import { describe, expect, it } from 'vitest';
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

describe('AutoCardHandler triple symbol exclusions', () => {
  it('does not trigger :: concept detection when ::: exists', () => {
    const handler = createHandler();
    const detectAllSymbols = (handler as any).detectAllSymbols.bind(handler);

    const symbolsHalf = detectAllSymbols('A:::B', {
      enabledSymbols: { concept: true, descriptor: true, basic: true, cloze: true },
    });
    expect(symbolsHalf.some((symbol: { type: string }) => symbol.type.startsWith('concept'))).toBe(false);

    const symbolsFull = detectAllSymbols('A：：：B', {
      enabledSymbols: { concept: true, descriptor: true, basic: true, cloze: true },
    });
    expect(symbolsFull.some((symbol: { type: string }) => symbol.type.startsWith('concept'))).toBe(false);
  });

  it('does not trigger ;; descriptor detection when ;;; exists', () => {
    const handler = createHandler();
    const detectAllSymbols = (handler as any).detectAllSymbols.bind(handler);

    const symbolsHalf = detectAllSymbols('A;;;B', {
      enabledSymbols: { concept: true, descriptor: true, basic: true, cloze: true },
    });
    expect(symbolsHalf.some((symbol: { type: string }) => symbol.type.startsWith('descriptor'))).toBe(false);

    const symbolsFull = detectAllSymbols('A；；；B', {
      enabledSymbols: { concept: true, descriptor: true, basic: true, cloze: true },
    });
    expect(symbolsFull.some((symbol: { type: string }) => symbol.type.startsWith('descriptor'))).toBe(false);
  });
});

