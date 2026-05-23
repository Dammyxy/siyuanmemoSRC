import { describe, expect, it } from 'vitest';
import { normalizeInlineSymbolContent } from '../AutoCardPlannerExecutionRuntime';

describe('AutoCardPlannerExecutionRuntime normalizeInlineSymbolContent', () => {
  it('prefers a later line that contains card symbols', () => {
    const normalized = normalizeInlineSymbolContent('这是一段说明\n北京>>中国首都');
    expect(normalized).toBe('北京>>中国首都');
  });

  it('falls back to first non-empty normalized line when no symbol exists', () => {
    const normalized = normalizeInlineSymbolContent('第一行说明\n第二行说明');
    expect(normalized).toBe('第一行说明');
  });

  it('prefers a later valid basic line over an earlier malformed one', () => {
    const normalized = normalizeInlineSymbolContent('测试>>\n北京<>中国首都');
    expect(normalized).toBe('北京<>中国首都');
  });
});
