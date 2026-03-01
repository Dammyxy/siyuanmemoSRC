import { describe, expect, it } from 'vitest';
import { ClozeCardStrategy } from '../ClozeCardStrategy';
import type { QuickCardMetadata } from '../../types';

describe('ClozeCardStrategy latex cloze escaped command handling', () => {
  const strategy = new ClozeCardStrategy();

  it('replaces full escaped command span for double backslash numbered cloze', () => {
    const content = '$$ E = \\\\cloze{c1}{mc^2} $$';
    const metadata: QuickCardMetadata = { symbol: '\\cloze' };

    const result = strategy.parse(content, metadata);

    expect(result.front.html).toContain('\\boxed{\\text{[...]}}');
    expect(result.front.html).not.toContain('\\\\boxed');
    expect(result.back.html).toContain('{\\color{#166534}mc^2}');
    expect(result.back.html).not.toContain('\\mc^2');
    expect(result.back.html).not.toContain('\\\\cloze');
  });

  it('keeps latex front placeholder and back answer consistent for escaped input', () => {
    const content = '$$ \\\\cloze{c1}{a} + \\\\cloze{c2}{b} $$';
    const metadata: QuickCardMetadata = { symbol: '\\cloze', typeMarker: 'cloze-1' };

    const result = strategy.parse(content, metadata);

    expect(result.front.html).toContain('a');
    expect(result.front.html).toContain('\\boxed{\\text{[...]}}');
    expect(result.front.html).not.toContain('\\\\boxed');
    expect(result.back.html).toContain('a');
    expect(result.back.html).toContain('{\\color{#166534}b}');
    expect(result.back.html).not.toContain('\\a');
    expect(result.back.html).not.toContain('\\b');
  });

  it('adds display math delimiters for latex cloze content without $ delimiters', () => {
    const content = 'P(A|B)=\\\\cloze{c1}{P(B|A)}*P(A)/P(B)';
    const metadata: QuickCardMetadata = { symbol: '\\cloze' };

    const result = strategy.parse(content, metadata);

    expect(result.front.html.startsWith('$$')).toBe(true);
    expect(result.front.html.endsWith('$$')).toBe(true);
    expect(result.back.html.startsWith('$$')).toBe(true);
    expect(result.back.html.endsWith('$$')).toBe(true);
  });
});
