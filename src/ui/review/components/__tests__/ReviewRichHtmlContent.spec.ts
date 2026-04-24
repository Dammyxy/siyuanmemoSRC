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

describe('ReviewRichHtmlContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trusted html and enhances it after mount and html updates', async () => {
    const wrapper = mount(ReviewRichHtmlContent, {
      props: {
        html: '<p><strong>Bold</strong> paragraph</p>',
      },
    });

    await flushPromises();

    expect(wrapper.html()).toContain('<strong>Bold</strong>');
    expect(reviewRichHtmlContentMocks.enhanceRenderedMarkdown).toHaveBeenCalledTimes(1);
    expect(reviewRichHtmlContentMocks.enhanceRenderedMarkdown).toHaveBeenCalledWith(
      wrapper.find('.review-rich-html-content').element,
    );

    await wrapper.setProps({
      html: '<pre><code class="language-mermaid">graph TD;A-->B</code></pre>',
    });
    await flushPromises();

    expect(wrapper.html()).toContain('language-mermaid');
    expect(reviewRichHtmlContentMocks.enhanceRenderedMarkdown).toHaveBeenCalledTimes(2);
  });
});
