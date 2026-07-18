import type { ComputedRef, Ref } from 'vue';
import type {
  BrowserQueueCountsRequest,
  IBrowserApplicationService,
} from '@/application/interfaces/IBrowserApplicationService';
import type { CardFilter, IReviewQueue } from '@/types/unified-data-source';
import {
  getCanonicalBrowserQueueIds,
  resolveBrowserQueueIdForQueueType,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
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
  const lastAppliedQueueCountRequest = new Map<BrowserQueueId, number>();
  let queueCountRefreshSequence = 0;

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

  const resolveQueueCountPatchIds = (
    refreshOptions: BrowserQueueCountsRequest,
  ): BrowserQueueId[] => {
    const activeReviewQueueId = refreshOptions.reviewPressure?.active === true
      ? resolveBrowserQueueIdForQueueType(refreshOptions.reviewPressure.activeQueueType)
      : null;
    const affectedQueueTypes = refreshOptions.affectedQueueTypes;
    if (!affectedQueueTypes || affectedQueueTypes.length === 0) {
      if (activeReviewQueueId) {
        return [activeReviewQueueId];
      }
      return getCanonicalBrowserQueueIds();
    }

    const queueIds = Array.from(new Set(
      affectedQueueTypes
        .map((queueType) => resolveBrowserQueueIdForQueueType(queueType))
        .filter((queueId): queueId is BrowserQueueId => Boolean(queueId)),
    ));
    return activeReviewQueueId
      ? queueIds.filter((queueId) => queueId === activeReviewQueueId)
      : queueIds;
  };

  const normalizeQueueCount = (value: unknown): number => Math.max(0, Number(value) || 0);

  const applyQueueCountPatch = (
    target: Ref<Record<string, number>>,
    counts: Record<string, number>,
    queueIds: BrowserQueueId[],
    requestSequence: number,
  ): void => {
    const nextCounts = {
      ...EMPTY_QUEUE_COUNTS,
      ...target.value,
    };

    for (const queueId of queueIds) {
      const lastAppliedSequence = lastAppliedQueueCountRequest.get(queueId) ?? 0;
      if (lastAppliedSequence > requestSequence) {
        continue;
      }

      nextCounts[queueId] = normalizeQueueCount(counts[queueId]);
      lastAppliedQueueCountRequest.set(queueId, requestSequence);
    }

    target.value = nextCounts;
  };

  const refreshQueueCounts = async (
    target: Ref<Record<string, number>>,
    refreshOptions: BrowserQueueCountsRequest = {},
  ): Promise<void> => {
    const requestSequence = ++queueCountRefreshSequence;
    const patchQueueIds = resolveQueueCountPatchIds(refreshOptions);
    if (patchQueueIds.length === 0) {
      return;
    }
    const service = getBrowserService('refreshQueueCounts');
    if (!service) {
      applyQueueCountPatch(target, EMPTY_QUEUE_COUNTS, patchQueueIds, requestSequence);
      return;
    }

    try {
      const counts = await service.getQueueCounts(refreshOptions);
      applyQueueCountPatch(target, counts, patchQueueIds, requestSequence);
    } catch (error) {
      logger.error('failed to refresh counts via browserService:', error);
      applyQueueCountPatch(target, EMPTY_QUEUE_COUNTS, patchQueueIds, requestSequence);
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
