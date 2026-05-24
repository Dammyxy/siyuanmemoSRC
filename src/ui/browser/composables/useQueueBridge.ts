import type { ComputedRef, Ref } from 'vue';
import type {
  BrowserQueueCountsRequest,
  IBrowserApplicationService,
} from '@/application/interfaces/IBrowserApplicationService';
import type { CardFilter, IReviewQueue } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

export const EMPTY_QUEUE_COUNTS: Record<string, number> = {
  retrieval: 0,
  'final-drill': 0,
  'neural-roam': 0,
  'filter-group': 0,
  'incremental-learning': 0,
};

interface UseQueueBridgeOptions {
  browserService: ComputedRef<IBrowserApplicationService | null | undefined>;
  isDevMode?: boolean;
}

export function useQueueBridge(options: UseQueueBridgeOptions) {
  const isDevMode = Boolean(options.isDevMode);
  const logger = createLogger('QueueBridge');
  const missingServiceLogged = new Set<string>();

  const getBrowserService = (action: string): IBrowserApplicationService | null => {
    const service = options.browserService.value;
    if (service) {
      return service;
    }

    if (!missingServiceLogged.has(action)) {
      missingServiceLogged.add(action);
      logger.error(`browserService unavailable for action "${action}"`);
    }
    return null;
  };

  const getQueueById = (id: string): IReviewQueue | null => {
    const service = getBrowserService('getQueueById');
    if (!service) {
      return null;
    }

    const queue = service.getQueueById(id);
    if (queue && isDevMode) {
      logger.debug('queue resolved by browserService:', id);
    }
    return queue;
  };

  const refreshQueueCounts = async (
    target: Ref<Record<string, number>>,
    refreshOptions: BrowserQueueCountsRequest = {},
  ): Promise<void> => {
    const service = getBrowserService('refreshQueueCounts');
    if (!service) {
      target.value = { ...EMPTY_QUEUE_COUNTS };
      return;
    }

    try {
      target.value = await service.getQueueCounts(refreshOptions);
    } catch (error) {
      logger.error('failed to refresh counts via browserService:', error);
      target.value = { ...EMPTY_QUEUE_COUNTS };
    }
  };

  const setFilterGroupFilter = async (filter: CardFilter): Promise<boolean> => {
    const service = getBrowserService('setFilterGroupFilter');
    if (!service) {
      return false;
    }

    try {
      return await service.setFilterGroupFilter(filter);
    } catch (error) {
      logger.error('failed to set filter-group filter via browserService:', error);
      return false;
    }
  };

  const rebuildFilterGroupQueue = async (): Promise<boolean> => {
    const service = getBrowserService('rebuildFilterGroupQueue');
    if (!service) {
      return false;
    }

    try {
      return await service.rebuildFilterGroupQueue();
    } catch (error) {
      logger.error('failed to rebuild filter-group queue via browserService:', error);
      return false;
    }
  };

  return {
    getQueueById,
    refreshQueueCounts,
    setFilterGroupFilter,
    rebuildFilterGroupQueue,
  };
}
