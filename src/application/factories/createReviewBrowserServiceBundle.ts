import { CardCreationHelper } from '@/application/helpers/CardCreationHelper';
import type { BrowserAdvancedSqlQuerySourcePort } from '@/application/ports/BrowserAdvancedSqlQuerySourcePort';
import { BrowserApplicationService } from '@/application/services/BrowserApplicationService';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import { createCdfLiveRelationCardCreatorFromUnifiedStorage } from '@/application/services/CdfLiveRelationWriteSyncService';
import { NeuralRoamEntryActionService, type NeuralRoamOpenOptions } from '@/application/services/NeuralRoamEntryActionService';
import { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { ReviewLogService } from '@/application/services/ReviewLogService';
import { ReviewLogLearningCurveEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';
import { SrsTransparencyApplicationService } from '@/application/services/SrsTransparencyApplicationService';
import type { ArenaKernelService } from '@/application/services/ArenaKernelService';
import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import type {
  BrowserQueueRuntimeAccess,
  ReviewRuntimeAccess,
} from '@/application/runtime-access';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import type { StorageManager } from '@/core/storage';
import type { SchedulerRouter } from '@/core/scheduler';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { threeChoiceDialog } from '@/utils/dialog';

type I18nDictionary = Record<string, string>;

export interface ReviewBrowserNeuralRoamCompositionDeps {
  getStorage: () => StorageManager;
  getCardService: () => CardApplicationService;
  getUnifiedDataSourceManager: () => IUnifiedDataSourceManagerFacade;
  getI18n: () => I18nDictionary;
  createManagerSiyuanPort: () => ManagerSiyuanPort;
  openNeuralRoamDialog: (options?: NeuralRoamOpenOptions) => Promise<void>;
}

export interface ReviewBrowserBrowserCompositionDeps {
  runtimeAccess: BrowserQueueRuntimeAccess;
  createBrowserAdvancedSqlQuerySource: () => BrowserAdvancedSqlQuerySourcePort;
  createBrowserSiyuanPort: () => BrowserSiyuanPort;
  createBrowserQuerySiyuanPort: () => BrowserQuerySiyuanPort;
}

export interface ReviewBrowserReviewCompositionDeps {
  runtimeAccess: ReviewRuntimeAccess;
  createReviewSiyuanPort: () => ReviewSiyuanPort;
}

export interface ReviewBrowserCardEditorCompositionDeps {
  runtimeAccess: ReviewRuntimeAccess;
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
      const runtime = browser.runtimeAccess;
      const browserSiyuanApi = browser.createBrowserSiyuanPort();
      const browserQuerySiyuanApi = browser.createBrowserQuerySiyuanPort();
      return new BrowserApplicationService(
        runtime.unifiedStorage,
        new CardScheduleService(),
        new CardFilterService(),
        new CardSortService(),
        runtime.unifiedDataSourceManager,
        browserSiyuanApi,
        browserQuerySiyuanApi,
        null,
        runtime.browserDeckReadPort,
        runtime.backendClient,
        runtime.frontendInstanceRuntime,
        runtime.followerCommandClient,
        browser.createBrowserAdvancedSqlQuerySource(),
        createCdfLiveRelationCardCreatorFromUnifiedStorage(runtime.unifiedStorage),
      );
    },
    createReviewApplicationService: () => {
      const review = deps.review;
      const runtime = review.runtimeAccess;
      return new ReviewApplicationService(
        runtime.unifiedDataSourceManager,
        runtime.scheduler,
        review.createReviewSiyuanPort(),
        runtime.backendClient,
        runtime.frontendInstanceRuntime,
        runtime.followerCommandClient,
        createCdfLiveRelationCardCreatorFromUnifiedStorage(runtime.unifiedStorage),
      );
    },
    createCardEditorApplicationService: () => {
      const runtime = deps.cardEditor.runtimeAccess;
      return new CardEditorApplicationService(
        runtime.unifiedDataSourceManager,
        runtime.reviewService,
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
