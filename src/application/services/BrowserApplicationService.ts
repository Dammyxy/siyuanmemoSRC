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
  DataSourceOptions,
  BrowserQueueId,
} from '../interfaces/IBrowserApplicationService';
import type { ICardDataSource } from '../interfaces/ICardDataSource';
import { DeckDataSource } from '@/ui/browser/datasource/DeckDataSource';
import { createQueueDataSource, createQueryDataSource } from '@/ui/browser/utils/dataSourceFactory';
import { createLogger } from '@/utils/logger';

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

const logger = createLogger('BrowserApplicationService');

export class BrowserApplicationService implements IBrowserApplicationService {
  private readonly getBrowserCardsQueryHandler: GetBrowserCardsQueryHandler;
  private readonly unifiedDataSourceManager: IUnifiedDataSourceManagerFacade | null;
  private readonly siyuanApi: BrowserSiyuanPort;
  private queueCountsInFlight: Promise<Record<string, number>> | null = null;
  private queueCountsCache = {
    value: { ...EMPTY_QUEUE_COUNTS },
    timestamp: 0,
  };
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

  private async readQueueCountsFromManager(manager: IUnifiedDataSourceManagerFacade): Promise<Record<string, number>> {
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
  }

  async getQueueCounts(): Promise<Record<string, number>> {
    const manager = this.unifiedDataSourceManager;
    if (!manager) {
      return { ...EMPTY_QUEUE_COUNTS };
    }

    if (this.queueCountsInFlight) {
      return this.queueCountsInFlight;
    }

    const now = Date.now();
    if (now - this.queueCountsCache.timestamp < BrowserApplicationService.QUEUE_COUNTS_CACHE_TTL_MS) {
      return { ...this.queueCountsCache.value };
    }

    this.queueCountsInFlight = this.readQueueCountsFromManager(manager)
      .then((counts) => {
        this.queueCountsCache = { value: counts, timestamp: Date.now() };
        return { ...counts };
      })
      .catch((error) => {
        logger.error('Failed to get queue counts:', error);
        this.queueCountsCache = { value: { ...EMPTY_QUEUE_COUNTS }, timestamp: Date.now() };
        return { ...EMPTY_QUEUE_COUNTS };
      })
      .finally(() => {
        this.queueCountsInFlight = null;
      });

    return this.queueCountsInFlight;
  }

  async setFilterGroupFilter(filter: CardFilter): Promise<boolean> {
    const filterGroupQueue = this.getQueueById('filter-group') as any;
    if (!filterGroupQueue || typeof filterGroupQueue.setFilter !== 'function') {
      return false;
    }

    await filterGroupQueue.setFilter(filter);
    return true;
  }

  async rebuildFilterGroupQueue(): Promise<boolean> {
    const filterGroupQueue = this.getQueueById('filter-group') as any;
    if (!filterGroupQueue || typeof filterGroupQueue.rebuild !== 'function') {
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
