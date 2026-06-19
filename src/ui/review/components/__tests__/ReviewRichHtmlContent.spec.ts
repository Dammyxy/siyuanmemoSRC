// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reviewRichHtmlContentMocks = vi.hoisted(() => ({
  enhanceRenderedMarkdown: vi.fn(async () => undefined),
}));

vi.mock('@/ui/shared/rich-content', () => ({
  enhanceRenderedMarkdown: reviewRichHtmlContentMocks.enhanceRenderedMarkdown,
}));

import ReviewRichHtmlContent from '../ReviewRichHtmlContent.vue';
import type { RichContentResult } from '@/core/card/common/application/richContent';

function richContent(html: string, overrides: Partial<RichContentResult> = {}): RichContentResult {
  return {
    html,
    atoms: [],
    diagnostics: [],
    source: {
      kind: 'quick',
      field: 'front',
    },
    renderKind: 'html',
    ...overrides,
  };
}

describe('ReviewRichHtmlContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trusted html and enhances it after mount and html updates', async () => {
    const wrapper = mount(ReviewRichHtmlContent, {
      props: {
        content: richContent('<p><strong>Bold</strong> paragraph</p>'),
      },
    });

    await flushPromises();

    expect(wrapper.html()).toContain('<strong>Bold</strong>');
    expect(reviewRichHtmlContentMocks.enhanceRenderedMarkdown).toHaveBeenCalledTimes(1);
    expect(reviewRichHtmlContentMocks.enhanceRenderedMarkdown).toHaveBeenCalledWith(
      wrapper.find('.review-rich-html-content').element,
    );

    await wrapper.setProps({
      content: richContent('<pre><code class="language-mermaid">graph TD;A-->B</code></pre>'),
    });
    await flushPromises();

    expect(wrapper.html()).toContain('language-mermaid');
    expect(reviewRichHtmlContentMocks.enhanceRenderedMarkdown).toHaveBeenCalledTimes(2);
  });

  it('routes block links through the shared navigation callback without bubbling to review actions', async () => {
    const openBlock = vi.fn();
    const wrapper = mount(ReviewRichHtmlContent, {
      props: {
        content: richContent('<a href="siyuan://blocks/20260401010101-abcdefg">概念</a>'),
        onOpenBlock: openBlock,
      },
    });
    await flushPromises();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrapper.find('a').element.dispatchEvent(event);

    expect(openBlock).toHaveBeenCalledWith('20260401010101-abcdefg');
    expect(event.defaultPrevented).toBe(true);
  });

  it('routes SiYuan DOM links and exposes them as review links', async () => {
    const openExternal = vi.fn();
    const wrapper = mount(ReviewRichHtmlContent, {
      props: {
        content: richContent('<span data-type="a" data-href="https://openai.com">OpenAI</span>'),
        onOpenExternal: openExternal,
      },
    });
    await flushPromises();

    const link = wrapper.find('[data-type="a"]');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.element.dispatchEvent(event);

    expect(link.exists()).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://openai.com');
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows a light in-card placeholder when image media fails', async () => {
    const wrapper = mount(ReviewRichHtmlContent, {
      props: {
        content: richContent('<img src="assets/missing.png" alt="missing" />'),
      },
    });
    await flushPromises();

    wrapper.find('img').element.dispatchEvent(new Event('error'));
    await flushPromises();

    expect(wrapper.find('.review-rich-html-content__media-error').exists()).toBe(true);
    expect(wrapper.text()).toContain('assets/missing.png');
  });
});
