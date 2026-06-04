import { describe, expect, it } from 'vitest';
import {
  parseCardSourceGrammar,
  tokenizeCardSourceOperators,
} from '../sourceGrammar';

describe('Card Source Grammar', () => {
  it('matches longest operators before shorter prefixes', () => {
    const tokens = tokenizeCardSourceOperators('cue ;<> answer');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual(expect.objectContaining({
      canonical: ';<>',
      raw: ';<>',
      relationKinds: ['descriptor-forward', 'descriptor-reverse'],
    }));
  });

  it('recognizes fullwidth, Chinese-angle, and mixed-width operator variants', () => {
    expect(tokenizeCardSourceOperators(`concept \uFF1A\u300B definition`)[0]?.canonical).toBe(':>');
    expect(tokenizeCardSourceOperators(`cue \uFF1B\u300A answer`)[0]?.canonical).toBe(';<');
    expect(tokenizeCardSourceOperators(`cue \uFF1B<\u300B answer`)[0]?.canonical).toBe(';<>');
    expect(tokenizeCardSourceOperators(`question \uFF1E\uFF1E answer`)[0]?.canonical).toBe('>>');
  });

  it('ignores operator-like text inside fenced code, inline code, and math', () => {
    const source = [
      '```',
      'code :: ignored',
      '```',
      '`inline ;; ignored`',
      '$math :< ignored$',
      'concept :> definition',
    ].join('\n');

    const tokens = tokenizeCardSourceOperators(source);

    expect(tokens.map((token) => token.canonical)).toEqual([':>']);
  });

  it('emits blocking invalid-source-grammar for more than one main operator', () => {
    const parsed = parseCardSourceGrammar('concept :: definition ;; descriptor');

    expect(parsed.operators.map((operator) => operator.canonical)).toEqual(['::', ';;']);
    expect(parsed.issues).toEqual([
      expect.objectContaining({
        code: 'invalid-source-grammar',
        severity: 'blocking',
      }),
    ]);
  });
});
