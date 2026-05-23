import type SiyuanMemoPlugin from '@/index';
import type { Plugin } from 'siyuan';
import type { AutoCardHandler } from '@/application/handlers/AutoCardHandler';
import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';
import type { HybridSyncConfig } from '@/application/services/XiuyuanSyncService.types';
import type { RiffBlacklistService } from '@/application/services/RiffBlacklistService';
import { HostBlockQuerySiyuanAdapter } from '@/infrastructure/siyuan/HostBlockQuerySiyuanAdapter';
import { XiuyuanSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSiyuanAdapter';
import { XiuyuanSyncSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter';
import { AutoCardSiyuanAdapter } from '@/infrastructure/siyuan/AutoCardSiyuanAdapter';
import { AutoCardRiffAdapter } from '@/infrastructure/siyuan/AutoCardRiffAdapter';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { StorageManager } from '@/core/storage';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { SqlXiuyuanReadRepository } from '@/infrastructure/persistence/sqlite';

export interface CreateAutoCardKernelXiuyuanServiceBundleDeps {
  plugin: Plugin;
  getUnifiedStorage: () => UnifiedStorageManager;
  getUnifiedDataSourceManager: () => UnifiedDataSourceManager;
  getSqlXiuyuanReadRepository: () => SqlXiuyuanReadRepository | null;
  getCardTypeDetectionService: () => CardTypeDetectionService;
  getEventBus: () => EventBus;
  getRiffBlacklistService: () => RiffBlacklistService;
  getDeletionTracker: () => IDeletionTracker;
}

export interface AutoCardKernelXiuyuanServiceBundle {
  createXiuyuanApplicationService: () => Promise<XiuyuanApplicationService>;
  createXiuyuanSyncService: (riffConfig: HybridSyncConfig) => XiuyuanSyncService;
  createAutoCardHandler: () => Promise<AutoCardHandler>;
}

export function createAutoCardKernelXiuyuanServiceBundle(
  deps: CreateAutoCardKernelXiuyuanServiceBundleDeps,
): AutoCardKernelXiuyuanServiceBundle {
  return {
    createXiuyuanApplicationService: async () => {
      const xiuyuanRepository = createXiuyuanRepository(deps);
      const { ALL_TEMPLATES } = await import('@/core/xiuyuan');
      const { BUILTIN_CONCEPT_TEMPLATE } = await import('@/core/xiuyuan/templates/builtin-concept');
      const templateRegistry = new Map<string, ICardTemplate>();
      for (const template of ALL_TEMPLATES) {
        templateRegistry.set(template.id, template);
      }
      templateRegistry.set(BUILTIN_CONCEPT_TEMPLATE.id, BUILTIN_CONCEPT_TEMPLATE);
      return new XiuyuanApplicationService(
        xiuyuanRepository,
        templateRegistry,
        deps.getEventBus(),
        new XiuyuanSiyuanAdapter(),
      );
    },
    createXiuyuanSyncService: (riffConfig) => {
      const syncSiyuanApi = new XiuyuanSyncSiyuanAdapter();
      const riffBlacklistService = deps.getRiffBlacklistService();
      return new XiuyuanSyncService(
        {
          deckId: syncSiyuanApi.BUILTIN_DECK_ID,
          storage: deps.getUnifiedStorage() as unknown as StorageManager,
          riffBlacklistService,
          incrementalSync: {
            ...riffConfig.incrementalSync,
            autoDetectCardType: true,
          },
          fullSync: riffConfig.fullSync,
          deleteSync: riffConfig.deleteSync,
        },
        deps.getEventBus(),
        createXiuyuanRepository(deps),
        riffBlacklistService,
        deps.getCardTypeDetectionService(),
        deps.getDeletionTracker(),
        syncSiyuanApi,
      );
    },
    createAutoCardHandler: async () => {
      const { AutoCardHandler } = await import('@/application/handlers/AutoCardHandler');
      return new AutoCardHandler(deps.plugin as unknown as SiyuanMemoPlugin, {
        siyuanApi: new AutoCardSiyuanAdapter(),
        riffApi: new AutoCardRiffAdapter(),
        hostBlockQuery: new HostBlockQuerySiyuanAdapter(),
      });
    },
  };
}

function createXiuyuanRepository(
  deps: Pick<
    CreateAutoCardKernelXiuyuanServiceBundleDeps,
    'getUnifiedStorage' | 'getCardTypeDetectionService' | 'getSqlXiuyuanReadRepository'
  >,
): XiuyuanRepository {
  return new XiuyuanRepository(
    deps.getUnifiedStorage(),
    deps.getCardTypeDetectionService(),
    deps.getSqlXiuyuanReadRepository(),
  );
}
