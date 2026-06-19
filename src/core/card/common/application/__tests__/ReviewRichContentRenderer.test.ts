// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewRichContentRenderer } from '../ReviewRichContentRenderer';

describe('ReviewRichContentRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders review kramdown into html, atoms, source metadata, and diagnostics', () => {
    vi.stubGlobal('window', {});
    const renderer = new ReviewRichContentRenderer();

    const result = renderer.renderMarkdown(
      [
        'See ((20260401010101-abcdefg "复合函数"))',
        '[例题](siyuan://blocks/20260402020202-bcdefgh)',
        '![图](assets/chain-rule.png)',
        '[音频](assets/chain-rule.mp3)',
        '[外链](https://example.com)',
        '[bad](javascript:alert(1))',
        '$f(g(x))$',
        '```ts',
        'const x = 1',
        '```',
      ].join('\n'),
      {
        sourceId: 'card-1',
        sourceKind: 'quick',
        field: 'front',
      },
    );

    expect(result.html).toContain('data-type="block-ref"');
    expect(result.html).toContain('siyuan://blocks/20260402020202-bcdefgh');
    expect(result.html).not.toContain('href="javascript:');
    expect(result.atoms.map(atom => atom.kind)).toEqual(expect.arrayContaining([
      'block-ref',
      'siyuan-link',
      'external-link',
      'image',
      'audio',
      'math',
      'code',
    ]));
    expect(result.source).toMatchObject({
      id: 'card-1',
      kind: 'quick',
      field: 'front',
    });
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'unsafe-link-disabled')).toBe(true);
  });

  it('sanitizes trusted html and keeps render failures visible as escaped source', () => {
    const renderer = new ReviewRichContentRenderer({
      renderMarkdown: () => {
        throw new Error('boom');
      },
    });

    const htmlResult = renderer.renderHtml(
      '<p onclick="bad()">ok</p><script>alert(1)</script><a href="javascript:bad()">bad</a>',
      {
        id: 'html-1',
        kind: 'raw-html',
      },
    );
    expect(htmlResult.html).toContain('<p>ok</p>');
    expect(htmlResult.html).not.toContain('onclick');
    expect(htmlResult.html).not.toContain('<script');
    expect(htmlResult.html).not.toContain('javascript:');

    const markdownResult = renderer.renderMarkdown('<unsafe>', {
      sourceId: 'broken-1',
      sourceKind: 'concept',
    });
    expect(markdownResult.html).toContain('&lt;unsafe&gt;');
    expect(markdownResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render-failed',
      severity: 'error',
    }));
  });

  it('expands unresolved markdown links inside html fragments', () => {
    const renderer = new ReviewRichContentRenderer();

    const result = renderer.renderHtml(
      [
        '问题',
        '<br><br>',
        '[OpenAI](https://openai.com)',
        ' 和 ',
        '((20260401010101-abcdefg "概念"))',
      ].join(''),
      {
        id: 'quick-1:back',
        kind: 'quick',
        field: 'back',
      },
    );

    expect(result.html).toContain('<a href="https://openai.com">OpenAI</a>');
    expect(result.html).toContain('data-type="block-ref"');
    expect(result.html).toContain('data-id="20260401010101-abcdefg"');
    expect(result.atoms.map(atom => atom.kind)).toEqual(expect.arrayContaining([
      'external-link',
      'block-ref',
    ]));
  });
});
