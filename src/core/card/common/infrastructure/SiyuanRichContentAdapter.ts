import {
  renderReviewMarkdown,
  type ReviewMarkdownRenderOptions,
  type ReviewRenderedMarkdown,
} from '@/core/card/common/application/reviewMarkdownRender';
import type { ReviewRichContentMarkdownAdapter } from '@/core/card/common/application/ReviewRichContentRenderer';

export class SiyuanRichContentAdapter implements ReviewRichContentMarkdownAdapter {
  renderMarkdown(
    markdown: string,
    options?: ReviewMarkdownRenderOptions,
  ): ReviewRenderedMarkdown {
    return renderReviewMarkdown(markdown, options);
  }
}

