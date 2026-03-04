import { describe, expect, it } from 'vitest';
import { getAvailableCardTypeFilters } from '../types';

function valuesOf(options: Array<{ value: string }>): string[] {
  return options.map((option) => option.value);
}

describe('getAvailableCardTypeFilters', () => {
  it('never exposes missing-block-only', () => {
    const globalValues = valuesOf(getAvailableCardTypeFilters(null));
    const lostValues = valuesOf(getAvailableCardTypeFilters(null, { docId: '__lost__' }));
    const queueValues = valuesOf(getAvailableCardTypeFilters('retrieval', { docId: 'doc-a' }));

    expect(globalValues).not.toContain('missing-block-only');
    expect(queueValues).not.toContain('missing-block-only');
    expect(lostValues).not.toContain('missing-block-only');
  });

  it('keeps neural queue as concept-only in non-lost view', () => {
    const values = valuesOf(getAvailableCardTypeFilters('neural-roam', { docId: null }));
    expect(values).toEqual(['concept-only']);
  });
});
