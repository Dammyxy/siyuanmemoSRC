import { describe, expect, it } from 'vitest';
import { hasMarkCloze } from '../rule-utils';

describe('rule-utils mark token handling', () => {
  it('recognizes tokenized mark spans as cloze syntax', () => {
    expect(hasMarkCloze('Alpha <span data-type="text mark">Beta</span> Gamma')).toBe(true);
    expect(hasMarkCloze('Alpha <span data-type="text">Beta</span> Gamma')).toBe(false);
  });
});
