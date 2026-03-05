import { describe, expect, it } from 'vitest';
import { ClozeCardStrategy } from '../ClozeCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('ClozeCardStrategy equal-marker normalization', () => {
  const strategy = new ClozeCardStrategy();

  it('renders == single cloze with highlighted placeholder on front and no == on back', () => {
    const metadata: QuickCardMetadata = { symbol: '==' };
    const result = strategy.parse('test==cloze==', metadata);

    expect(result.front.html).toBe('test<mark>[...]</mark>');
    expect(result.front.html).not.toContain('==');
    expect(result.back.html).toBe('test<mark>cloze</mark>');
    expect(result.back.html).not.toContain('==');
  });

  it('normalizes == multi-cloze output for both front and back', () => {
    const metadata: QuickCardMetadata = { symbol: '==', typeMarker: 'cloze-1' };
    const result = strategy.parse('test==first==and==second==', metadata);

    expect(result.front.html).toBe('testfirstand<mark>[...]</mark>');
    expect(result.front.html).not.toContain('==');
    expect(result.back.html).toBe('testfirstand<mark>second</mark>');
    expect(result.back.html).not.toContain('==');
  });

  it('removes residual == markers even when extractor misses a segment', () => {
    const metadata: QuickCardMetadata = { symbol: '==' };
    const result = strategy.parse('test==a=b==', metadata);

    expect(result.front.html).toBe('test<mark>[...]</mark>');
    expect(result.back.html).toBe('test<mark>a=b</mark>');
    expect(result.front.html).not.toContain('==');
    expect(result.back.html).not.toContain('==');
  });

  it('keeps non-== cloze behavior unchanged', () => {
    const metadata: QuickCardMetadata = { symbol: '{{}}' };
    const result = strategy.parse('test{{cloze}}', metadata);

    expect(result.front.html).toBe('test[...]');
    expect(result.back.html).toBe('test<mark>cloze</mark>');
  });
});
