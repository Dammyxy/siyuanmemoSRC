import type { BrowserCardStoragePort } from '@/core/storage/ports';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { QueueType, type CardFilter, type IReviewQueue, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import { BrowserSiyuanAdapter } from '@/infrastructure/siyuan/BrowserSiyuanAdapter';
import { GetBrowserCardsQueryHandler } from '../queries/browser/GetBrowserCardsQueryHandler';
import type {
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
} from '../queries/browser/GetBrowserCardsQuery';
import type {
  IBrowserApplicationService,
  BrowserQueueCountsRequest,
  DataSourceOptions,
  BrowserQueueId,
} from '../interfaces/IBrowserApplicationService';
import type { ICardDataSource } from '../interfaces/ICardDataSource';
import { DeckDataSource } from '@/ui/browser/datasource/DeckDataSource';
import { createQueueDataSource, createQueryDataSource } from '@/ui/browser/utils/dataSourceFactory';
import { createLogger } from '@/utils/logger';
import { hasFilterSetter, hasRebuildAction } from './browser/filterGroupQueueContract';

const EMPTY_QUEUE_COUNTS: Record<string, number> = {
  retrieval: 0,
  'final-drill': 0,
  'neural-roam': 0,
  'filter-group': 0,
  'incremental-learning': 0,
};

const QUEUE_ID_TO_TYPE: Record<BrowserQueueId, QueueType> = {
  retrieval: QueueType.RetrievalPractice,
  'final-drill': QueueType.FinalDrill,
  'incremental-learning': QueueType.IncrementalLearning,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
  neural: QueueType.NeuralRoam,
};

const QUEUE_TYPE_TO_BROWSER_KEY: Partial<Record<QueueType, BrowserQueueId>> = {
  [QueueType.RetrievalPractice]: 'retrieval',
  [QueueType.FinalDrill]: 'final-drill',
  [QueueType.IncrementalLearning]: 'incremental-learning',
  [QueueType.FilterGroup]: 'filter-group',
  [QueueType.NeuralRoam]: 'neural-roam',
};

const logger = createLogger('BrowserApplicationService');

export class BrowserApplicationService implements IBrowserApplicationService {
  private readonly getBrowserCardsQueryHandler: GetBrowserCardsQueryHandler;
  private readonly unifiedDataSourceManager: IUnifiedDataSourceManagerFacade | null;
  private readonly siyuanApi: BrowserSiyuanPort;
  private readonly queueCountInFlight = new Map<BrowserQueueId, Promise<number>>();
  private readonly queueCountCache = new Map<BrowserQueueId, { value: number; timestamp: number }>();
  private static readonly QUEUE_COUNTS_CACHE_TTL_MS = 150;

  constructor(
    storageManager: BrowserCardStoragePort,
    cardScheduleService: CardScheduleService,
    cardFilterService: CardFilterService,
    cardSortService: CardSortService,
    unifiedDataSourceManager?: IUnifiedDataSourceManagerFacade | null,
    siyuanApi: BrowserSiyuanPort = new BrowserSiyuanAdapter(),
  ) {
    this.getBrowserCardsQueryHandler = new GetBrowserCardsQueryHandler(
      storageManager,
      cardScheduleService,
      cardFilterService,
      cardSortService,
    );

    this.unifiedDataSourceManager = unifiedDataSourceManager ?? null;
    this.siyuanApi = siyuanApi;
  }

  getUnifiedDataSourceManager(): IUnifiedDataSourceManagerFacade | null {
    return this.unifiedDataSourceManager;
  }

  getSiyuanApi(): BrowserSiyuanPort {
    return this.siyuanApi;
  }

  async getBrowserCards(query: GetBrowserCardsQuery = {}): Promise<GetBrowserCardsQueryResult> {
    return this.getBrowserCardsQueryHandler.execute(query);
  }

  async getDueCount(): Promise<number> {
    const result = await this.getBrowserCards({ preset: 'due', pageSize: 1 });
    return result.total;
  }

  async getStats() {
    const result = await this.getBrowserCards({ pageSize: 1 });
    return result.stats;
  }

  private normalizeQueueId(queueId: string): BrowserQueueId | null {
    const normalized = String(queueId || '').trim();
    if (!normalized) return null;

    if (normalized === 'neural') return 'neural';
    if (normalized in QUEUE_ID_TO_TYPE) return normalized as BrowserQueueId;
    return null;
  }

  getQueueById(queueId: string): IReviewQueue | null {
    if (!this.unifiedDataSourceManager) return null;

    const normalized = this.normalizeQueueId(queueId);
    if (!normalized) return null;

    try {
      return this.unifiedDataSourceManager.getQueue(QUEUE_ID_TO_TYPE[normalized]);
    } catch (error) {
      logger.error('Failed to get queue by id:', { queueId, error });
      return null;
    }
  }

  private async readQueueVisibleCount(
    queue: IReviewQueue | null,
    queueId: string,
  ): Promise<number> {
    if (!queue) {
      return 0;
    }

    if (
      queueId === 'neural-roam'
      && typeof (queue as { getSourceSnapshot?: () => unknown[] }).getSourceSnapshot === 'function'
    ) {
      try {
        return Math.max(0, ((queue as { getSourceSnapshot: () => unknown[] }).getSourceSnapshot() || []).length);
      } catch (error) {
        logger.debug('Failed to read neural-roam source snapshot, falling back to visible counters:', {
          queueId,
          error,
        });
      }
    }

    try {
      const snapshot = await queue.getCounterSnapshot();
      return Math.max(0, Number(snapshot.remaining) || 0);
    } catch (error) {
      logger.debug('Failed to read queue counter snapshot, falling back to size methods:', {
        queueId,
        error,
      });
    }

    try {
      return await queue.getRemainingSize();
    } catch (error) {
      logger.debug('Failed to read queue remaining size, falling back to getStats:', {
        queueId,
        error,
      });
    }

    try {
      const stats = await queue.getStats();
      return Math.max(0, Number(stats.due) || Number(stats.total) || 0);
    } catch (error) {
      logger.debug('Failed to read queue stats, fallback to getSize:', {
        queueId,
        error,
      });
    }

    return this.readQueueSize(queue, queueId);
  }

  private async readQueueSize(queue: IReviewQueue, queueId: string): Promise<number> {
    try {
      return await queue.getSize();
    } catch (error) {
      logger.error('Failed to read queue size:', { queueId, error });
      return 0;
    }
  }

  private resolveAffectedBrowserQueueIds(affectedQueueTypes?: QueueType[] | null): BrowserQueueId[] {
    if (!affectedQueueTypes || affectedQueueTypes.length === 0) {
      return Object.keys(QUEUE_ID_TO_TYPE)
        .filter((id) => id !== 'neural')
        .map((id) => id as BrowserQueueId);
    }

    return Array.from(new Set(
      affectedQueueTypes
        .map((queueType) => QUEUE_TYPE_TO_BROWSER_KEY[queueType])
        .filter((queueId): queueId is BrowserQueueId => Boolean(queueId)),
    ));
  }

  private async readSingleQueueCount(
    manager: IUnifiedDataSourceManagerFacade,
    queueId: BrowserQueueId,
    forceRefresh = false,
  ): Promise<number> {
    const cacheEntry = this.queueCountCache.get(queueId);
    const now = Date.now();
    if (!forceRefresh && cacheEntry && now - cacheEntry.timestamp < BrowserApplicationService.QUEUE_COUNTS_CACHE_TTL_MS) {
      return cacheEntry.value;
    }

    const inFlight = this.queueCountInFlight.get(queueId);
    if (inFlight) {
      return inFlight;
    }

    const queueType = QUEUE_ID_TO_TYPE[queueId];
    const request = this.readQueueVisibleCount(manager.getQueue(queueType), queueId)
      .then((value) => {
        const normalized = Math.max(0, Number(value) || 0);
        this.queueCountCache.set(queueId, {
          value: normalized,
          timestamp: Date.now(),
        });
        return normalized;
      })
      .catch((error) => {
        logger.error('Failed to get queue count:', { queueId, error });
        this.queueCountCache.set(queueId, {
          value: 0,
          timestamp: Date.now(),
        });
        return 0;
      })
      .finally(() => {
        this.queueCountInFlight.delete(queueId);
      });

    this.queueCountInFlight.set(queueId, request);
    return request;
  }

  invalidateQueueCountsCache(): void {
    this.queueCountInFlight.clear();
    this.queueCountCache.clear();
  }

  async getQueueCounts(request: BrowserQueueCountsRequest = {}): Promise<Record<string, number>> {
    const manager = this.unifiedDataSourceManager;
    if (!manager) {
      return { ...EMPTY_QUEUE_COUNTS };
    }

    const affectedQueueIds = this.resolveAffectedBrowserQueueIds(request.affectedQueueTypes);
    if (request.forceRefresh) {
      for (const queueId of affectedQueueIds) {
        this.queueCountCache.delete(queueId);
        this.queueCountInFlight.delete(queueId);
      }
    }

    const entries = await Promise.all(
      affectedQueueIds.map(async (queueId) => [
        queueId,
        await this.readSingleQueueCount(manager, queueId, Boolean(request.forceRefresh)),
      ] as const),
    );

    const counts = { ...EMPTY_QUEUE_COUNTS };
    for (const [queueId, value] of this.queueCountCache.entries()) {
      counts[queueId] = value.value;
    }
    for (const [queueId, value] of entries) {
      counts[queueId] = value;
    }

    return counts;
  }

  async setFilterGroupFilter(filter: CardFilter): Promise<boolean> {
    const filterGroupQueue = this.getQueueById('filter-group');
    if (!hasFilterSetter(filterGroupQueue)) {
      return false;
    }

    await filterGroupQueue.setFilter(filter);
    return true;
  }

  async rebuildFilterGroupQueue(): Promise<boolean> {
    const filterGroupQueue = this.getQueueById('filter-group');
    if (!hasRebuildAction(filterGroupQueue)) {
      return false;
    }

    await filterGroupQueue.rebuild();
    return true;
  }

  createDataSource(options: DataSourceOptions): ICardDataSource {
    const { type, preset, queryText, cardType, queueId, plugin } = options;

    if (type === 'deck') {
      return new DeckDataSource(
        this.unifiedDataSourceManager,
        { preset, queryText, cardType },
        plugin,
      );
    }

    if (type === 'queue') {
      const dataSource = createQueueDataSource(
        queueId!,
        this.unifiedDataSourceManager,
        { preset, queryText, cardType },
        plugin,
      );

      if (!dataSource) {
        throw new Error(`Unknown queue data source: ${queueId}`);
      }

      return dataSource;
    }

    if (type === 'query') {
      return createQueryDataSource(queryText!);
    }

    throw new Error(`Unknown data source type: ${type}`);
  }
}
