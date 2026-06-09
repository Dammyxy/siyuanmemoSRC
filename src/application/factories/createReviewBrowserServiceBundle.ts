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

export interface CreateReviewBrowserServiceBundleDeps {
  getStorage: () => StorageManager;
  getCardService: () => CardApplicationService;
  getUnifiedStorage: () => UnifiedStorageManager;
  getUnifiedDataSourceManager: () => IUnifiedDataSourceManagerFacade;
  getScheduler: () => SchedulerRouter;
  getReviewService: () => ReviewApplicationService;
  getArenaKernelService: () => ArenaKernelService;
  getReviewLogService: () => ReviewLogService;
  getI18n: () => I18nDictionary;
  getBrowserDeckReadPort: () => BrowserDeckReadPort | null;
  getSrsBackendClient: () => SrsBackendClient | null;
  getFrontendInstanceRuntime: () => FrontendInstanceRuntime | null;
  getFollowerCommandClient: () => FollowerCommandClient | null;
  createBrowserAdvancedSqlQuerySource: () => BrowserAdvancedSqlQuerySourcePort;
  createManagerSiyuanPort: () => ManagerSiyuanPort;
  createBrowserSiyuanPort: () => BrowserSiyuanPort;
  createBrowserQuerySiyuanPort: () => BrowserQuerySiyuanPort;
  createReviewSiyuanPort: () => ReviewSiyuanPort;
  openNeuralRoamDialog: (options?: NeuralRoamOpenOptions) => Promise<void>;
}

export interface ReviewBrowserServiceBundle {
  createNeuralRoamEntryActionService: () => NeuralRoamEntryActionService;
  createBrowserApplicationService: () => BrowserApplicationService;
  createReviewApplicationService: () => ReviewApplicationService;
  createCardEditorApplicationService: () => CardEditorApplicationService;
  createSrsTransparencyApplicationService: () => SrsTransparencyApplicationService;
}

export function createReviewBrowserServiceBundle(
  deps: CreateReviewBrowserServiceBundleDeps,
): ReviewBrowserServiceBundle {
  return {
    createNeuralRoamEntryActionService: () => {
      const siyuanApi = deps.createManagerSiyuanPort();
      const cardService = deps.getCardService();
      return new NeuralRoamEntryActionService({
        storage: deps.getStorage(),
        cardCreationHelper: new CardCreationHelper(cardService),
        cardService,
        dataSourceManager: deps.getUnifiedDataSourceManager(),
        siyuanApi,
        openNeuralRoamDialog: deps.openNeuralRoamDialog,
        resolveBlockTitle: async (blockId) => siyuanApi.getBlockText(blockId),
        promptTemporaryRouteClose: async () => {
          const i18n = deps.getI18n();
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
      const browserSiyuanApi = deps.createBrowserSiyuanPort();
      const browserQuerySiyuanApi = deps.createBrowserQuerySiyuanPort();
      return new BrowserApplicationService(
        deps.getUnifiedStorage(),
        new CardScheduleService(),
        new CardFilterService(),
        new CardSortService(),
        deps.getUnifiedDataSourceManager(),
        browserSiyuanApi,
        browserQuerySiyuanApi,
        null,
        deps.getBrowserDeckReadPort(),
        deps.getSrsBackendClient(),
        deps.getFrontendInstanceRuntime(),
        deps.getFollowerCommandClient(),
        deps.createBrowserAdvancedSqlQuerySource(),
        createCdfLiveRelationCardCreatorFromUnifiedStorage(deps.getUnifiedStorage()),
      );
    },
    createReviewApplicationService: () => new ReviewApplicationService(
      deps.getUnifiedDataSourceManager(),
      deps.getScheduler(),
      deps.createReviewSiyuanPort(),
      deps.getSrsBackendClient(),
      deps.getFrontendInstanceRuntime(),
      deps.getFollowerCommandClient(),
      createCdfLiveRelationCardCreatorFromUnifiedStorage(deps.getUnifiedStorage()),
    ),
    createCardEditorApplicationService: () => new CardEditorApplicationService(
      deps.getUnifiedDataSourceManager(),
      deps.getReviewService(),
    ),
    createSrsTransparencyApplicationService: () => new SrsTransparencyApplicationService(
      deps.getScheduler(),
      deps.getArenaKernelService(),
      new ReviewLogLearningCurveEvidenceReader(deps.getReviewLogService()),
    ),
  };
}
