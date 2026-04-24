import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const rendererSources = {
  concept: read('src/ui/review/components/ConceptCardRenderer.vue'),
  conceptDefinition: read('src/ui/review/components/ConceptDefinitionCardRenderer.vue'),
  descriptor: read('src/ui/review/components/DescriptorCardRenderer.vue'),
  descriptorService: read('src/core/card/descriptor-card/application/DescriptorCardRenderService.ts'),
  quick: read('src/ui/review/components/QuickCardRenderer.vue'),
  reviewRichHtmlContent: read('src/ui/review/components/ReviewRichHtmlContent.vue'),
  cdf: read('src/ui/review/components/CdfDirectLayout.vue'),
  multiCloze: read('src/ui/review/components/MultiClozeCardRenderer.vue'),
  imageOcclusion: read('src/ui/review/components/ImageOcclusionCardRenderer.vue'),
  xiuyuanList: read('src/ui/review/v2/components/XiuyuanListTemplateCard.vue'),
};

describe('Review content font tokens', () => {
  it('uses editor-size-driven font tokens across the active review renderers without descriptor inline px sizing', () => {
    expect(rendererSources.concept).toContain('var(--siyuanmemo-review-font-body');
    expect(rendererSources.conceptDefinition).toContain('var(--siyuanmemo-review-font-title-lg');
    expect(rendererSources.descriptor).toContain('var(--siyuanmemo-review-font-body');
    expect(rendererSources.descriptor).toContain('.descriptor-card-question');
    expect(rendererSources.descriptor).toContain('var(--siyuanmemo-review-font-small');
    expect(rendererSources.descriptorService).toContain('descriptor-card-question');
    expect(rendererSources.descriptorService).not.toContain('font-size: 22px');
    expect(rendererSources.descriptorService).not.toContain('font-size: 14px');
    expect(rendererSources.quick).toContain('var(--siyuanmemo-review-font-title-lg');
    expect(rendererSources.reviewRichHtmlContent).toContain('enhanceRenderedMarkdown(rootRef.value)');
    expect(rendererSources.cdf).toContain('var(--siyuanmemo-review-font-xs');
    expect(rendererSources.multiCloze).toContain('var(--siyuanmemo-review-font-title-lg');
    expect(rendererSources.imageOcclusion).toContain('var(--siyuanmemo-review-font-small');
    expect(rendererSources.xiuyuanList).toContain('var(--siyuanmemo-review-font-title');
  });
});
