import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMathWithKatex } from '../mathRender';

type WindowWithKatex = Window & {
  katex?: {
    renderToString?: (expression: string, options?: { displayMode?: boolean; throwOnError?: boolean }) => string;
  };
};

const originalKatex = (window as WindowWithKatex).katex;

describe('mathRender', () => {
  afterEach(() => {
    (window as WindowWithKatex).katex = originalKatex;
  });

  it('normalizes legacy mark placeholder inside display math', () => {
    const renderToString = vi.fn((expression: string) => `<span class="katex">${expression}</span>`);
    (window as WindowWithKatex).katex = { renderToString };

    const rendered = renderMathWithKatex('$$E=<mark>[...]</mark>$$');

    expect(renderToString).toHaveBeenCalledTimes(1);
    expect(rendered).toContain('\\boxed{\\text{[...]}}');
    expect(rendered).not.toContain('<mark>');
  });
});
