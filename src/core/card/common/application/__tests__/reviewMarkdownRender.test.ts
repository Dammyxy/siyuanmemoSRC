// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderReviewMarkdown } from '../reviewMarkdownRender';

describe('reviewMarkdownRender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips Siyuan attribute artifacts from fragment and block-flow review html', () => {
    vi.stubGlobal('window', {
      Lute: {
        New: () => ({
          Md2HTML: (markdown: string) => `<fragment>${markdown}</fragment>`,
          Md2BlockDOM: (markdown: string) => `<block>${markdown}</block>`,
        }),
      },
    });

    const fragment = renderReviewMarkdown('学习\n{: id="2026042401" updated="2026042402"}', {
      forceRenderKind: 'fragment',
    });
    const blockFlow = renderReviewMarkdown('第一段\n\n> 引用\n{: id="2026042403" updated="2026042404"}', {
      forceRenderKind: 'block-flow',
    });

    expect(fragment.html).toBe('<fragment>学习</fragment>');
    expect(fragment.html).not.toContain('{:');
    expect(blockFlow.html).toBe('<block>第一段\n\n> 引用</block>');
    expect(blockFlow.html).not.toContain('{:');
  });

  it('falls back to cleaned escaped html when Lute is unavailable', () => {
    vi.stubGlobal('window', {});

    const rendered = renderReviewMarkdown('第一段\n{: id="2026042405" updated="2026042406"}', {
      forceRenderKind: 'block-flow',
    });

    expect(rendered.html).toContain('第一段');
    expect(rendered.html).not.toContain('{:');
  });

  it('auto-detects multi-paragraph content as block-flow', () => {
    vi.stubGlobal('window', {
      Lute: {
        New: () => ({
          Md2HTML: (markdown: string) => `<fragment>${markdown}</fragment>`,
          Md2BlockDOM: (markdown: string) => `<block>${markdown}</block>`,
        }),
      },
    });

    const rendered = renderReviewMarkdown('第一段\n\n第二段');

    expect(rendered.renderKind).toBe('block-flow');
    expect(rendered.html).toBe('<block>第一段\n\n第二段</block>');
  });
});
