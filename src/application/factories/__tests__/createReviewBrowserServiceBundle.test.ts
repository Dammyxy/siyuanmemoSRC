import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '@/application/services/BrowserApplicationService';
import { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import { NeuralRoamEntryActionService } from '@/application/services/NeuralRoamEntryActionService';
import { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import { SrsTransparencyApplicationService } from '@/application/services/SrsTransparencyApplicationService';
import { createReviewBrowserServiceBundle } from '../createReviewBrowserServiceBundle';

describe('createReviewBrowserServiceBundle', () => {
  it('creates typed Review and Browser service factories without ApplicationContext locator access', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/application/factories/createReviewBrowserServiceBundle.ts'),
      'utf8',
    );
    const unifiedDataSourceManager = {
      getQueue: vi.fn(),
      neuralRoamCommand: vi.fn(),
    };
    const reviewSiyuanApi = {
      BUILTIN_DECK_ID: 'builtin',
      sql: vi.fn(async () => []),
      getBlockAttrs: vi.fn(async () => ({})),
      getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
      setBlockAttrs: vi.fn(async () => undefined),
      getBlockInfo: vi.fn(async () => ({})),
      getEditableBlockMarkdown: vi.fn(async () => ''),
      getBlockDOM: vi.fn(async () => ({ dom: '' })),
      getBlockBreadcrumb: vi.fn(async () => []),
      getIconByType: vi.fn(() => ''),
      updateBlockMarkdown: vi.fn(async (_blockId: string, markdown: string) => markdown),
      reviewRiffCard: vi.fn(async () => undefined),
      skipReviewRiffCard: vi.fn(async () => undefined),
      pushMsg: vi.fn(async () => undefined),
      pushErrMsg: vi.fn(async () => undefined),
    };
    const managerSiyuanApi = {
      BUILTIN_DECK_ID: 'builtin',
      CARD_ID_ATTR: 'custom-riff-decks',
      sql: vi.fn(async () => []),
      getBlockAttrs: vi.fn(async () => ({})),
      getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
      getBlockText: vi.fn(async () => ''),
      setBlockAttrs: vi.fn(async () => undefined),
      markBlockAsCard: vi.fn(async () => undefined),
      getCardBlockIds: vi.fn(async () => []),
      addRiffCards: vi.fn(async () => ({ name: 'builtin', size: 0 })),
      pushMsg: vi.fn(async () => undefined),
      pushErrMsg: vi.fn(async () => undefined),
    };
    const browserSiyuanApi = {
      ATTR_CARD_ID: 'custom-riff-decks',
      ATTR_PRIORITY: 'custom-riff-priority',
      ATTR_SUSPENDED: 'custom-riff-suspended',
      ATTR_CARD_TYPE: 'custom-riff-card-type',
      ATTR_A_FACTOR: 'custom-riff-a-factor',
      BUILTIN_DECK_ID: 'builtin',
      sql: vi.fn(async () => []),
      getBlockAttrs: vi.fn(async () => ({})),
      getBlockInfoRowsByIds: vi.fn(async () => []),
      getBlockAttributeRowsByIds: vi.fn(async () => []),
      getDocTreeRowsByIds: vi.fn(async () => []),
      getBlockMeta: vi.fn(async () => null),
      setBlockAttrs: vi.fn(async () => undefined),
      pushMsg: vi.fn(async () => undefined),
      pushErrMsg: vi.fn(async () => undefined),
    };
    const bundle = createReviewBrowserServiceBundle({
      getStorage: () => ({ getCardByBlockId: vi.fn() } as never),
      getCardService: () => ({ updateFSRSCard: vi.fn(), getCard: vi.fn() } as never),
      getUnifiedStorage: () => ({ getAllCards: vi.fn(() => []) } as never),
      getUnifiedDataSourceManager: () => unifiedDataSourceManager as never,
      getScheduler: () => ({ getSchedulerType: vi.fn(), preview: vi.fn() } as never),
      getReviewService: () => ({ getSiyuanApi: () => reviewSiyuanApi } as never),
      getArenaKernelService: () => ({ buildSrsRecommendation: vi.fn() } as never),
      getReviewLogService: () => ({ listReviewLogsForCard: vi.fn(async () => []) } as never),
      getI18n: () => ({}),
      getBrowserDeckReadPort: () => null,
      getSrsBackendClient: () => null,
      getFrontendInstanceRuntime: () => null,
      getFollowerCommandClient: () => null,
      createBrowserAdvancedSqlQuerySource: () => ({ matchedIds: vi.fn(async () => []) }),
      createManagerSiyuanPort: () => managerSiyuanApi,
      createBrowserSiyuanPort: () => browserSiyuanApi,
      createReviewSiyuanPort: () => reviewSiyuanApi,
      openNeuralRoamDialog: vi.fn(async () => undefined),
    });

    expect(source).toContain('ReviewBrowserServiceBundle');
    expect(source).not.toContain('ApplicationContext');
    expect(bundle.createNeuralRoamEntryActionService()).toBeInstanceOf(NeuralRoamEntryActionService);
    expect(bundle.createBrowserApplicationService()).toBeInstanceOf(BrowserApplicationService);
    expect(bundle.createReviewApplicationService()).toBeInstanceOf(ReviewApplicationService);
    expect(bundle.createCardEditorApplicationService()).toBeInstanceOf(CardEditorApplicationService);
    expect(bundle.createSrsTransparencyApplicationService()).toBeInstanceOf(SrsTransparencyApplicationService);
  });
});
