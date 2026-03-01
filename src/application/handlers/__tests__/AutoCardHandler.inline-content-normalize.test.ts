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

describe('AutoCardHandler normalizeInlineSymbolContent', () => {
  it('prefers a later line that contains card symbols', () => {
    const handler = createHandler();
    const normalizeInlineSymbolContent = (handler as any).normalizeInlineSymbolContent.bind(handler);

    const normalized = normalizeInlineSymbolContent('这是一段说明\n北京>>中国首都');
    expect(normalized).toBe('北京>>中国首都');
  });

  it('falls back to first non-empty normalized line when no symbol exists', () => {
    const handler = createHandler();
    const normalizeInlineSymbolContent = (handler as any).normalizeInlineSymbolContent.bind(handler);

    const normalized = normalizeInlineSymbolContent('第一行说明\n第二行说明');
    expect(normalized).toBe('第一行说明');
  });
});

