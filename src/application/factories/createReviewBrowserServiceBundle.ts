import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { BrowserAdvancedSqlQuerySourcePort } from '@/application/ports/BrowserAdvancedSqlQuerySourcePort';
import { BrowserApplicationService } from '@/application/services/BrowserApplicationService';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import { createCdfLiveRelationCardCreatorFromUnifiedStorage } from '@/application/services/CdfLiveRelationWriteRepairService';
import { NeuralRoamEntryActionService, type NeuralRoamOpenOptions } from '@/application/services/NeuralRoamEntryActionService';
import { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { ReviewLogService } from '@/application/services/ReviewLogService';
import { ReviewLogLearningCurveEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import { SrsTransparencyApplicationService } from '@/application/services/SrsTransparencyApplicationService';
import type { ArenaKernelService } from '@/application/services/ArenaKernelService';
import type { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import type { FrontendInstanceRuntime } from '@/application/clients/FrontendInstanceRuntime';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import type { StorageManager } from '@/core/storage';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { SchedulerRouter } from '@/core/scheduler';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { threeChoiceDialog } from '@/utils/dialog';

type I18nDictionary = Record<string, string>;

export interface ReviewBrowserSharedCompositionDeps {
  getUnifiedStorage: () => UnifiedStorageManager;
  getUnifiedDataSourceManager: () => IUnifiedDataSourceManagerFacade;
  getSrsBackendClient: () => SrsBackendClient | null;
  getFrontendInstanceRuntime: () => FrontendInstanceRuntime | null;
  getFollowerCommandClient: () => FollowerCommandClient | null;
}

export interface ReviewBrowserNeuralRoamCompositionDeps {
  getStorage: () => StorageManager;
  getCardService: () => CardApplicationService;
  getUnifiedDataSourceManager: () => IUnifiedDataSourceManagerFacade;
  getI18n: () => I18nDictionary;
  createManagerSiyuanPort: () => ManagerSiyuanPort;
  openNeuralRoamDialog: (options?: NeuralRoamOpenOptions) => Promise<void>;
}

export interface ReviewBrowserBrowserCompositionDeps extends ReviewBrowserSharedCompositionDeps {
  getBrowserDeckReadPort: () => BrowserDeckReadPort | null;
  createBrowserAdvancedSqlQuerySource: () => BrowserAdvancedSqlQuerySourcePort;
  createBrowserSiyuanPort: () => BrowserSiyuanPort;
  createBrowserQuerySiyuanPort: () => BrowserQuerySiyuanPort;
}

export interface ReviewBrowserReviewCompositionDeps extends ReviewBrowserSharedCompositionDeps {
  getScheduler: () => SchedulerRouter;
  createReviewSiyuanPort: () => ReviewSiyuanPort;
}

export interface ReviewBrowserCardEditorCompositionDeps {
  getUnifiedDataSourceManager: () => IUnifiedDataSourceManagerFacade;
  getReviewService: () => ReviewApplicationService;
}

export interface ReviewBrowserSrsTransparencyCompositionDeps {
  getScheduler: () => SchedulerRouter;
  getArenaKernelService: () => ArenaKernelService;
  getReviewLogService: () => ReviewLogService;
}

export interface ReviewBrowserCompositionDeps {
  neuralRoam: ReviewBrowserNeuralRoamCompositionDeps;
  browser: ReviewBrowserBrowserCompositionDeps;
  review: ReviewBrowserReviewCompositionDeps;
  cardEditor: ReviewBrowserCardEditorCompositionDeps;
  srsTransparency: ReviewBrowserSrsTransparencyCompositionDeps;
}

export interface ReviewBrowserServiceBundle {
  createNeuralRoamEntryActionService: () => NeuralRoamEntryActionService;
  createBrowserApplicationService: () => BrowserApplicationService;
  createReviewApplicationService: () => ReviewApplicationService;
  createCardEditorApplicationService: () => CardEditorApplicationService;
  createSrsTransparencyApplicationService: () => SrsTransparencyApplicationService;
}

export function createReviewBrowserServiceBundle(
  deps: ReviewBrowserCompositionDeps,
): ReviewBrowserServiceBundle {
  return {
    createNeuralRoamEntryActionService: () => {
      const neuralRoam = deps.neuralRoam;
      const siyuanApi = neuralRoam.createManagerSiyuanPort();
      const cardService = neuralRoam.getCardService();
      return new NeuralRoamEntryActionService({
        storage: neuralRoam.getStorage(),
        cardCreationHelper: new CardCreationHelper(cardService),
        cardService,
        dataSourceManager: neuralRoam.getUnifiedDataSourceManager(),
        openNeuralRoamDialog: neuralRoam.openNeuralRoamDialog,
        resolveBlockTitle: async (blockId) => siyuanApi.getBlockText(blockId),
        promptTemporaryRouteClose: async () => {
          const i18n = neuralRoam.getI18n();
          const choice = await threeChoiceDialog({
            title: i18n.temporaryRouteDirtyTitle || '临时航线有改动',
            content: i18n.temporaryRouteDirtyClosePrompt || '当前临时航线已有新的概念、空间站或漫游记录。请选择保存为航线、丢弃，或取消当前操作。',
            primaryText: i18n.saveAsRoute || '保存为航线',
            secondaryText: i18n.discard || '丢弃',
            cancelText: i18n.cancel || '取消',
            visualVariant: 'workspace',
          });
          if (choice === 'primary') {
            return 'save';
          }
          if (choice === 'secondary') {
            return 'discard';
          }
          return 'cancel';
        },
      });
    },
    createBrowserApplicationService: () => {
      const browser = deps.browser;
      const browserSiyuanApi = browser.createBrowserSiyuanPort();
      const browserQuerySiyuanApi = browser.createBrowserQuerySiyuanPort();
      return new BrowserApplicationService(
        browser.getUnifiedStorage(),
        new CardScheduleService(),
        new CardFilterService(),
        new CardSortService(),
        browser.getUnifiedDataSourceManager(),
        browserSiyuanApi,
        browserQuerySiyuanApi,
        null,
        browser.getBrowserDeckReadPort(),
        browser.getSrsBackendClient(),
        browser.getFrontendInstanceRuntime(),
        browser.getFollowerCommandClient(),
        browser.createBrowserAdvancedSqlQuerySource(),
        createCdfLiveRelationCardCreatorFromUnifiedStorage(browser.getUnifiedStorage()),
      );
    },
    createReviewApplicationService: () => {
      const review = deps.review;
      return new ReviewApplicationService(
        review.getUnifiedDataSourceManager(),
        review.getScheduler(),
        review.createReviewSiyuanPort(),
        review.getSrsBackendClient(),
        review.getFrontendInstanceRuntime(),
        review.getFollowerCommandClient(),
        createCdfLiveRelationCardCreatorFromUnifiedStorage(review.getUnifiedStorage()),
      );
    },
    createCardEditorApplicationService: () => {
      const cardEditor = deps.cardEditor;
      return new CardEditorApplicationService(
        cardEditor.getUnifiedDataSourceManager(),
        cardEditor.getReviewService(),
      );
    },
    createSrsTransparencyApplicationService: () => {
      const srsTransparency = deps.srsTransparency;
      return new SrsTransparencyApplicationService(
        srsTransparency.getScheduler(),
        srsTransparency.getArenaKernelService(),
        new ReviewLogLearningCurveEvidenceReader(srsTransparency.getReviewLogService()),
      );
    },
  };
}
