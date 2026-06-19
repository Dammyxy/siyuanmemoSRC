import type { ICardStorage } from '@/application/interfaces/ICardStorage';
import { QuickCardRenderService } from '@/core/card/quick-card/application/QuickCardRenderService';
import { QuickCardRepository } from '@/core/card/quick-card/infrastructure/QuickCardRepository';
import type { SiyuanBlockAdapter as QuickCardBlockAdapter } from '@/core/card/quick-card/infrastructure/SiyuanBlockAdapter';
import { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import { DescriptorCardRepository } from '@/core/card/descriptor-card/infrastructure/DescriptorCardRepository';
import type { SiyuanBlockAdapter as DescriptorBlockAdapter } from '@/core/card/descriptor-card/infrastructure/SiyuanBlockAdapter';
import { ConceptDefinitionCardRenderService } from '@/core/card/concept-definition/application/ConceptDefinitionCardRenderService';
import { ConceptCardRenderService } from '@/core/card/concept/application/ConceptCardRenderService';
import { MultiClozeCardRenderService } from '@/core/card/multi-cloze/application/MultiClozeCardRenderService';
import { ReviewRichContentRenderer } from '@/core/card/common/application/ReviewRichContentRenderer';
import { SiyuanRichContentAdapter } from '@/core/card/common/infrastructure/SiyuanRichContentAdapter';

export interface ReviewRenderServices {
  richContentRenderer: ReviewRichContentRenderer;
  quickCardRenderService: QuickCardRenderService;
  descriptorCardRenderService: DescriptorCardRenderService;
  conceptDefinitionCardRenderService: ConceptDefinitionCardRenderService;
  conceptCardRenderService: ConceptCardRenderService;
  multiClozeCardRenderService: MultiClozeCardRenderService;
}

export interface CreateReviewRenderServicesOptions {
  quickBlockAdapter: QuickCardBlockAdapter;
  descriptorBlockAdapter: DescriptorBlockAdapter;
  cardStorage?: ICardStorage | null;
  i18n?: Record<string, string>;
}

export function createReviewRenderServices(options: CreateReviewRenderServicesOptions): ReviewRenderServices {
  const richContentRenderer = new ReviewRichContentRenderer(new SiyuanRichContentAdapter());

  return {
    richContentRenderer,
    quickCardRenderService: new QuickCardRenderService(
      new QuickCardRepository(
        options.quickBlockAdapter,
        options.cardStorage || null,
      ),
      richContentRenderer,
    ),
    descriptorCardRenderService: new DescriptorCardRenderService(
      new DescriptorCardRepository(
        options.descriptorBlockAdapter,
      ),
      options.i18n || {},
      richContentRenderer,
    ),
    conceptDefinitionCardRenderService: new ConceptDefinitionCardRenderService(options.i18n || {}, {}, richContentRenderer),
    conceptCardRenderService: new ConceptCardRenderService(richContentRenderer),
    multiClozeCardRenderService: new MultiClozeCardRenderService(richContentRenderer),
  };
}
