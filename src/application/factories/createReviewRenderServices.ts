import type { ICardStorage } from '@/application/interfaces/ICardStorage';
import { QuickCardRenderService } from '@/core/card/quick-card/application/QuickCardRenderService';
import { QuickCardRepository } from '@/core/card/quick-card/infrastructure/QuickCardRepository';
import { SiyuanBlockAdapter } from '@/core/card/quick-card/infrastructure/SiyuanBlockAdapter';
import { DescriptorCardRenderService } from '@/core/card/descriptor-card/application/DescriptorCardRenderService';
import { DescriptorCardRepository } from '@/core/card/descriptor-card/infrastructure/DescriptorCardRepository';
import { SiyuanBlockAdapter as DescriptorBlockAdapter } from '@/core/card/descriptor-card/infrastructure/SiyuanBlockAdapter';

export interface ReviewRenderServices {
  quickCardRenderService: QuickCardRenderService;
  descriptorCardRenderService: DescriptorCardRenderService;
}

export function createReviewRenderServices(options: {
  cardStorage?: ICardStorage | null;
  i18n?: Record<string, string>;
} = {}): ReviewRenderServices {
  return {
    quickCardRenderService: new QuickCardRenderService(
      new QuickCardRepository(
        new SiyuanBlockAdapter(),
        options.cardStorage || null,
      ),
    ),
    descriptorCardRenderService: new DescriptorCardRenderService(
      new DescriptorCardRepository(
        new DescriptorBlockAdapter(),
      ),
      options.i18n || {},
    ),
  };
}
