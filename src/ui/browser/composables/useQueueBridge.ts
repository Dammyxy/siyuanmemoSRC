import type { ComputedRef, Ref } from 'vue';
import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import { QueueType, type CardFilter, type IReviewQueue, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
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
  pluginUnifiedDataSourceManager: ComputedRef<IUnifiedDataSourceManagerFacade | null | undefined>;
  isDevMode?: boolean;
}

const FALLBACK_QUEUE_TYPE_MAP: Record<string, QueueType> = {
  retrieval: QueueType.RetrievalPractice,
  'final-drill': QueueType.FinalDrill,
  'incremental-learning': QueueType.IncrementalLearning,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
  neural: QueueType.NeuralRoam,
};

type FilterGroupQueueBridge = IReviewQueue & {
  setFilter: (filter: CardFilter) => Promise<void>;
  rebuild: () => Promise<void>;
};

function hasSetFilter(queue: IReviewQueue | null): queue is FilterGroupQueueBridge {
  const candidate = queue as Partial<FilterGroupQueueBridge> | null;
  return Boolean(candidate && typeof candidate.setFilter === 'function');
}

function hasRebuild(queue: IReviewQueue | null): queue is FilterGroupQueueBridge {
  const candidate = queue as Partial<FilterGroupQueueBridge> | null;
  return Boolean(candidate && typeof candidate.rebuild === 'function');
}

export function useQueueBridge(options: UseQueueBridgeOptions) {
  const isDevMode = Boolean(options.isDevMode);
  const logger = createLogger('QueueBridge');
  const QUEUE_COUNTS_CACHE_TTL_MS = 150;
  let fallbackQueueCountsInFlight: Promise<Record<string, number>> | null = null;
  let fallbackQueueCountsCache = {
    value: { ...EMPTY_QUEUE_COUNTS },
    timestamp: 0,
  };

  const readQueueCountsFromManager = async (
    manager: IUnifiedDataSourceManagerFacade,
  ): Promise<Record<string, number>> => {
    const retrievalQueue = manager.getQueue(QueueType.RetrievalPractice);
    const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);
    const neuralRoamQueue = manager.getQueue(QueueType.NeuralRoam);
    const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
    const incrementalQueue = manager.getQueue(QueueType.IncrementalLearning);

    const [retrieval, finalDrill, neuralRoam, filterGroup, incrementalLearning] = await Promise.all([
      retrievalQueue ? retrievalQueue.getSize() : Promise.resolve(0),
      finalDrillQueue ? finalDrillQueue.getSize() : Promise.resolve(0),
      neuralRoamQueue ? neuralRoamQueue.getSize() : Promise.resolve(0),
      filterGroupQueue ? filterGroupQueue.getSize() : Promise.resolve(0),
      incrementalQueue ? incrementalQueue.getSize() : Promise.resolve(0),
    ]);

    return {
      retrieval,
      'final-drill': finalDrill,
      'neural-roam': neuralRoam,
      'filter-group': filterGroup,
      'incremental-learning': incrementalLearning,
    };
  };

  const getFallbackQueueCounts = async (): Promise<Record<string, number>> => {
    const now = Date.now();
    if (now - fallbackQueueCountsCache.timestamp < QUEUE_COUNTS_CACHE_TTL_MS) {
      return { ...fallbackQueueCountsCache.value };
    }

    if (fallbackQueueCountsInFlight) {
      return fallbackQueueCountsInFlight;
    }

    const manager = options.pluginUnifiedDataSourceManager.value;
    if (!manager) {
      fallbackQueueCountsCache = { value: { ...EMPTY_QUEUE_COUNTS }, timestamp: Date.now() };
      return { ...EMPTY_QUEUE_COUNTS };
    }

    fallbackQueueCountsInFlight = readQueueCountsFromManager(manager)
      .then((counts) => {
        fallbackQueueCountsCache = { value: counts, timestamp: Date.now() };
        return { ...counts };
      })
      .catch((error) => {
        logger.error('failed to refresh counts via manager:', error);
        fallbackQueueCountsCache = { value: { ...EMPTY_QUEUE_COUNTS }, timestamp: Date.now() };
        return { ...EMPTY_QUEUE_COUNTS };
      })
      .finally(() => {
        fallbackQueueCountsInFlight = null;
      });

    return fallbackQueueCountsInFlight;
  };

  const getQueueById = (id: string): IReviewQueue | null => {
    const service = options.browserService.value;
    const fromService = service?.getQueueById?.(id);
    if (fromService) {
      if (isDevMode) {
        logger.debug('queue resolved by browserService:', id);
      }
      return fromService;
    }

    const manager = options.pluginUnifiedDataSourceManager.value;
    const queueType = FALLBACK_QUEUE_TYPE_MAP[id];
    if (!manager || !queueType) {
      return null;
    }

    try {
      return manager.getQueue(queueType);
    } catch (error) {
      logger.error('failed to get queue from manager:', { id, error });
      return null;
    }
  };

  const refreshQueueCounts = async (target: Ref<Record<string, number>>): Promise<void> => {
    const service = options.browserService.value;
    if (typeof service?.getQueueCounts === 'function') {
      try {
        target.value = await service.getQueueCounts();
      } catch (error) {
        logger.error('failed to refresh counts via browserService:', error);
        target.value = await getFallbackQueueCounts();
      }
      return;
    }
    target.value = await getFallbackQueueCounts();
  };

  const setFilterGroupFilter = async (filter: CardFilter): Promise<boolean> => {
    const service = options.browserService.value;
    const fromService = await service?.setFilterGroupFilter?.(filter);
    if (fromService) return true;

    const queue = getQueueById('filter-group');
    if (!hasSetFilter(queue)) return false;

    await queue.setFilter(filter);
    return true;
  };

  const rebuildFilterGroupQueue = async (): Promise<boolean> => {
    const service = options.browserService.value;
    const fromService = await service?.rebuildFilterGroupQueue?.();
    if (fromService) return true;

    const queue = getQueueById('filter-group');
    if (!hasRebuild(queue)) return false;

    await queue.rebuild();
    return true;
  };

  return {
    getQueueById,
    refreshQueueCounts,
    setFilterGroupFilter,
    rebuildFilterGroupQueue,
  };
}
