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

  it('normalizes textcolor command to grouped color for KaTeX compatibility', () => {
    const renderToString = vi.fn((expression: string) => `<span class="katex">${expression}</span>`);
    (window as WindowWithKatex).katex = { renderToString };

    const rendered = renderMathWithKatex('$$E=\\textcolor{#166534}{MC^2}$$');

    expect(renderToString).toHaveBeenCalledTimes(1);
    expect(renderToString).toHaveBeenCalledWith(
      'E={\\color{#166534}MC^2}',
      expect.objectContaining({ displayMode: true })
    );
    expect(rendered).toContain('{\\color{#166534}MC^2}');
  });

  it('does not reprocess dollar signs inside rendered KaTeX html', () => {
    const katexErrorHtml =
      '<span class="katex-error" title="Can&#x27;t use function &#x27;$&#x27; in math mode">$${bad}$$</span>';
    const renderToString = vi.fn(() => katexErrorHtml);
    (window as WindowWithKatex).katex = { renderToString };

    const rendered = renderMathWithKatex('$$bad$$');

    expect(renderToString).toHaveBeenCalledTimes(1);
    expect(rendered).toBe(katexErrorHtml);
  });
});
