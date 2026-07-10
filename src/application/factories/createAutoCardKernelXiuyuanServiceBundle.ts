import type SiyuanMemoPlugin from '@/index';
import type { Plugin } from 'siyuan';
import type { AutoCardHandler } from '@/application/handlers/AutoCardHandler';
import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { HostBlockQuerySiyuanAdapter } from '@/infrastructure/siyuan/HostBlockQuerySiyuanAdapter';
import { XiuyuanSiyuanAdapter } from '@/infrastructure/siyuan/XiuyuanSiyuanAdapter';
import { AutoCardSiyuanAdapter } from '@/infrastructure/siyuan/AutoCardSiyuanAdapter';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import type { SqlXiuyuanReadRepository } from '@/infrastructure/persistence/sqlite';

export interface CreateAutoCardKernelXiuyuanServiceBundleDeps {
  plugin: Plugin;
  getUnifiedStorage: () => UnifiedStorageManager;
  getSqlXiuyuanReadRepository: () => SqlXiuyuanReadRepository | null;
  getCardTypeDetectionService: () => CardTypeDetectionService;
  getEventBus: () => EventBus;
}

export interface AutoCardKernelXiuyuanServiceBundle {
  createXiuyuanApplicationService: () => Promise<XiuyuanApplicationService>;
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
    createAutoCardHandler: async () => {
      const { AutoCardHandler } = await import('@/application/handlers/AutoCardHandler');
      return new AutoCardHandler(deps.plugin as unknown as SiyuanMemoPlugin, {
        siyuanApi: new AutoCardSiyuanAdapter(),
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
