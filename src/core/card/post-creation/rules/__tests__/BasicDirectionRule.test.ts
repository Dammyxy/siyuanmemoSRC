import { describe, expect, it } from 'vitest';
import { BasicDirectionRule } from '../BasicDirectionRule';
import { parseBasicDirectionContent } from '../rule-utils';

describe('BasicDirectionRule', () => {
  const rule = new BasicDirectionRule();

  it('matches standard forward, backward, and bidirectional basic cards', () => {
    expect(parseBasicDirectionContent('Alpha >> Beta')).toEqual(expect.objectContaining({
      direction: 'forward',
      question: 'Alpha',
      answer: 'Beta',
      symbol: '>>',
    }));
    expect(parseBasicDirectionContent('Alpha << Beta')).toEqual(expect.objectContaining({
      direction: 'backward',
      question: 'Beta',
      answer: 'Alpha',
      symbol: '<<',
    }));
    expect(parseBasicDirectionContent('Alpha <> Beta')).toEqual(expect.objectContaining({
      direction: 'both',
      question: 'Alpha',
      answer: 'Beta',
      symbol: '<>',
    }));
  });

  it('rejects malformed or list-tail basic markers', () => {
    expect(rule.match({
      blockId: 'block-1',
      content: '测试>>',
      source: 'symbol-listener',
    })).toBeNull();
    expect(rule.match({
      blockId: 'block-1',
      content: '>>答案',
      source: 'symbol-listener',
    })).toBeNull();
    expect(rule.match({
      blockId: 'block-1',
      content: '<>',
      source: 'symbol-listener',
    })).toBeNull();
    expect(rule.match({
      blockId: 'block-1',
      content: '标题 >>>',
      source: 'symbol-listener',
    })).toBeNull();
  });

  it('picks a later valid basic line instead of an earlier malformed one', () => {
    const decision = rule.match({
      blockId: 'block-1',
      content: '测试>>\n合法问题 <> 合法答案',
      source: 'symbol-listener',
    });

    expect(decision).toEqual(expect.objectContaining({
      family: 'basic',
      direction: 'both',
      templateId: 'builtin-bidirectional-single',
    }));
  });
});
