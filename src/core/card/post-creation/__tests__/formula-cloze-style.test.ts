import { describe, expect, it } from 'vitest';
import { parseFormulaClozeTargets } from '../formula-cloze-style';

describe('formula cloze parser', () => {
  it('parses numbered and hash-marker formula cloze targets without treating markers as answers', () => {
    const parsed = parseFormulaClozeTargets('E=\\cloze{c1}{mc^2}+\\cloze{#2}{x}');

    expect(parsed.targets).toEqual([
      expect.objectContaining({
        markerId: 'c1',
        text: 'mc^2',
      }),
      expect.objectContaining({
        markerId: '#2',
        text: 'x',
      }),
    ]);
    expect(parsed.malformed).toHaveLength(0);
  });

  it('preserves legacy one-argument formula cloze targets and nested answer braces', () => {
    const parsed = parseFormulaClozeTargets('P=\\cloze{P(B|A)}+\\cloze{c2}{{P(B)}}');

    expect(parsed.targets).toEqual([
      expect.objectContaining({
        text: 'P(B|A)',
      }),
      expect.objectContaining({
        markerId: 'c2',
        text: '{P(B)}',
      }),
    ]);
  });

  it('reports malformed formula cloze commands without fabricating targets', () => {
    const parsed = parseFormulaClozeTargets('E=\\cloze{c1}{mc^2');

    expect(parsed.targets).toHaveLength(0);
    expect(parsed.malformed).toEqual([
      expect.objectContaining({
        reason: 'missing-answer-argument',
      }),
    ]);
  });
});
