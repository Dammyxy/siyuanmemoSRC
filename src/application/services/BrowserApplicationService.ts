import type { BrowserCardStoragePort } from '@/core/storage/ports';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { QueueType, type CardFilter, type IReviewQueue, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { FSRSCard } from '@/types/card';
import { GetBrowserCardsQueryHandler } from '../queries/browser/GetBrowserCardsQueryHandler';
import { BrowserDeckQueryKernel } from '../queries/browser/shared/BrowserDeckQueryKernel';
import { QueueBrowserQueryKernel } from '../queries/browser/shared/QueueBrowserQueryKernel';
import {
  markRowsFromSourceExistenceCache,
  refreshSourceExistenceForBlockIds,
  refreshSourceExistenceSweep,
  SOURCE_EXISTENCE_BATCH_SIZE,
  SOURCE_EXISTENCE_BACKGROUND_LIMIT,
  SOURCE_EXISTENCE_TTL_MS,
} from '../queries/browser/shared/SourceExistenceCache';
import { markKnownMissingBlockRows } from '../queries/browser/shared/MissingBlockMarker';
import type { SrsBackendClient } from '../clients/SrsBackendClient';
import type { FrontendInstanceRuntime } from '../clients/FrontendInstanceRuntime';
import type { FollowerCommandClient } from '../clients/FollowerCommandClient';
import type {
  BrowserStats,
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
} from '../queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckPageResult,
  BrowserDeckSnapshotQuery,
  BrowserDeckSnapshotResult,
} from '../queries/browser/browser-deck-query';
import type {
  QueueBrowserSnapshotQuery,
  QueueBrowserSnapshotResult,
} from '../queries/browser/queue-browser-query';
import type {
  IBrowserApplicationService,
  BrowserQueueCountsRequest,
  BrowserDataSourceFactory,
  DataSourceOptions,
  BrowserQueueId,
} from '../interfaces/IBrowserApplicationService';
import type { ICardDataSource } from '../interfaces/ICardDataSource';
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
  private readonly browserDeckQueryKernel: BrowserDeckQueryKernel;
  private readonly queueBrowserQueryKernel: QueueBrowserQueryKernel | null;
  private readonly unifiedDataSourceManager: IUnifiedDataSourceManagerFacade | null;
  private readonly siyuanApi: BrowserSiyuanPort;
  private readonly queueCountInFlight = new Map<BrowserQueueId, Promise<number>>();
  private readonly queueCountCache = new Map<BrowserQueueId, { value: number; timestamp: number }>();
  private sourceExistenceSweepInFlight: Promise<unknown> | null = null;
  private static readonly QUEUE_COUNTS_CACHE_TTL_MS = 150;

  constructor(
    storageManager: BrowserCardStoragePort,
    cardScheduleService: CardScheduleService,
    cardFilterService: CardFilterService,
    cardSortService: CardSortService,
    unifiedDataSourceManager?: IUnifiedDataSourceManagerFacade | null,
    siyuanApi: BrowserSiyuanPort,
    private readonly dataSourceFactory?: BrowserDataSourceFactory | null,
    private readonly browserDeckReadPort?: BrowserDeckReadPort | null,
    private readonly srsBackendClient?: SrsBackendClient | null,
    private readonly frontendInstanceRuntime?: FrontendInstanceRuntime | null,
    private readonly followerCommandClient?: FollowerCommandClient | null,
  ) {
    this.browserDeckQueryKernel = new BrowserDeckQueryKernel(
      storageManager,
      cardScheduleService,
      cardFilterService,
      siyuanApi as unknown as QuerySiyuanPort,
    );
    this.queueBrowserQueryKernel = unifiedDataSourceManager
      ? new QueueBrowserQueryKernel(
        unifiedDataSourceManager,
        siyuanApi as unknown as QuerySiyuanPort,
        browserDeckReadPort,
      )
      : null;

    this.getBrowserCardsQueryHandler = new GetBrowserCardsQueryHandler(
      storageManager,
      cardScheduleService,
      cardFilterService,
      cardSortService,
      siyuanApi as unknown as QuerySiyuanPort,
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
    if (this.browserDeckReadPort) {
      const page = query.page || 1;
      const pageSize = query.pageSize || 50;
      const startRow = (page - 1) * pageSize;
      const pageResult = await this.getDeckPage(
        {
          preset: query.preset,
          searchText: query.searchText,
          docId: query.docId,
          states: query.states,
          cardTypes: query.cardTypes,
          deckIds: query.deckIds,
          tags: query.tags,
          sortModel: [{
            colId: query.sortBy || 'due',
            sort: query.sortOrder || 'asc',
          }],
        },
        {
          startRow,
          endRow: startRow + pageSize,
        },
      );
      return {
        cards: pageResult.rows,
        total: pageResult.total,
        page,
        pageSize,
        stats: await this.getStats(),
      };
    }
    return this.getBrowserCardsQueryHandler.execute(query);
  }

  async getDeckQuerySnapshot(query: BrowserDeckSnapshotQuery): Promise<BrowserDeckSnapshotResult> {
    return this.browserDeckQueryKernel.buildSnapshot(query);
  }

  async getDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckPageResult> {
    if (this.srsBackendClient) {
      try {
        const initialPage = await this.srsBackendClient.browserDeckPage(query, page);
        const initialCards = initialPage.cards as FSRSCard[];
        const refreshResult = await this.refreshSourceExistenceForBackendCards(initialCards, {
          limit: SOURCE_EXISTENCE_BATCH_SIZE,
        });
        const finalPage = refreshResult.changed
          ? await this.srsBackendClient.browserDeckPage(query, page)
          : initialPage;
        const finalCards = finalPage.cards as FSRSCard[];
        const rows = await this.browserDeckQueryKernel.getBrowserCardsFromCards(finalCards, { markMissing: false });
        return {
          rows: await this.markRowsFromBackendSourceExistence(rows),
          total: finalPage.total,
        };
      } catch (error) {
        logger.debug('Worker deck page query failed; falling back to SQL/legacy snapshot', { error });
      }
    }

    const sqlPage = this.tryReadSqlDeckPage(query, page);
    if (sqlPage) {
      const refreshResult = await this.refreshSourceExistenceForCards(sqlPage.cards, {
        limit: SOURCE_EXISTENCE_BATCH_SIZE,
      });
      const finalSqlPage = refreshResult.changed
        ? this.tryReadSqlDeckPage(query, page) || sqlPage
        : sqlPage;
      const rows = markRowsFromSourceExistenceCache(
        await this.browserDeckQueryKernel.getBrowserCardsFromCards(finalSqlPage.cards, { markMissing: false }),
        this.browserDeckReadPort,
      );
      return {
        rows,
        total: finalSqlPage.total,
      };
    }

    const snapshot = await this.browserDeckQueryKernel.buildSnapshot(query);
    const startRow = Math.max(0, Math.floor(Number(page.startRow) || 0));
    const endRow = Math.max(startRow, Math.min(
      page.endRow == null ? snapshot.total : Math.floor(Number(page.endRow) || 0),
      snapshot.total,
    ));
    const ids = snapshot.rows.slice(startRow, endRow).map((row) => row.id);
    return {
      rows: await this.browserDeckQueryKernel.getBrowserCardsByIds(ids),
      total: snapshot.total,
    };
  }

  async getDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[]> {
    if (this.srsBackendClient) {
      try {
        return await this.srsBackendClient.browserDeckMatchedIds(query);
      } catch (error) {
        logger.debug('Worker deck matched-id query failed; falling back to SQL/legacy snapshot', { error });
      }
    }
    if (this.browserDeckReadPort) {
      try {
        const sqlIds = this.browserDeckReadPort.queryDeckMatchedIds(query);
        if (sqlIds) {
          return sqlIds;
        }
      } catch (error) {
        logger.debug('SQL deck matched-id query failed; falling back to legacy snapshot', { error });
      }
    }
    const snapshot = await this.browserDeckQueryKernel.buildSnapshot(query);
    return snapshot.rows.map((row) => row.id);
  }

  async getDeckRowsByIds(ids: string[]) {
    if (this.srsBackendClient) {
      try {
        const cards = await this.srsBackendClient.browserDeckRowsByIds(ids);
        await this.refreshSourceExistenceForBackendCards(cards, {
          limit: SOURCE_EXISTENCE_BATCH_SIZE,
        });
        const rows = await this.browserDeckQueryKernel.getBrowserCardsFromCards(cards, { markMissing: false });
        return this.markRowsFromBackendSourceExistence(rows);
      } catch (error) {
        logger.debug('Worker deck hydrate-by-id query failed; falling back to SQL/legacy hydrate', { error });
      }
    }

    if (this.browserDeckReadPort) {
      try {
        const cards = this.browserDeckReadPort.getDeckCardsByIds(ids);
        await this.refreshSourceExistenceForCards(cards, {
          limit: SOURCE_EXISTENCE_BATCH_SIZE,
        });
        return markRowsFromSourceExistenceCache(
          await this.browserDeckQueryKernel.getBrowserCardsFromCards(cards, { markMissing: false }),
          this.browserDeckReadPort,
        );
      } catch (error) {
        logger.debug('SQL deck hydrate-by-id query failed; falling back to legacy hydrate', { error });
      }
    }
    return this.browserDeckQueryKernel.getBrowserCardsByIds(ids);
  }

  async getQueueQuerySnapshot(query: QueueBrowserSnapshotQuery): Promise<QueueBrowserSnapshotResult> {
    if (!this.queueBrowserQueryKernel) {
      throw new Error('QueueBrowserQueryKernel is unavailable without UnifiedDataSourceManager');
    }
    return this.queueBrowserQueryKernel.buildSnapshot(query);
  }

  async getQueueRowsByIds(queueId: BrowserQueueId, ids: string[]) {
    if (!this.queueBrowserQueryKernel) {
      throw new Error('QueueBrowserQueryKernel is unavailable without UnifiedDataSourceManager');
    }
    return this.queueBrowserQueryKernel.getQueueRowsByIds(queueId, ids);
  }

  async getDueCount(): Promise<number> {
    if (this.srsBackendClient) {
      try {
        return await this.srsBackendClient.browserCountCards({
          dueDate: { lte: Date.now() },
          includeSuspended: false,
          sourceStatus: 'active',
        });
      } catch (error) {
        logger.debug('Worker due count failed; falling back to SQL/legacy snapshot', { error });
      }
    }

    if (this.browserDeckReadPort) {
      try {
        return this.browserDeckReadPort.countCards({
          dueDate: { lte: Date.now() },
          includeSuspended: false,
          sourceStatus: 'active',
        });
      } catch (error) {
        logger.debug('SQL due count failed; falling back to legacy snapshot', { error });
      }
    }
    const result = await this.browserDeckQueryKernel.buildSnapshot({
      preset: 'due',
    });
    return result.total;
  }

  async getStats(): Promise<BrowserStats> {
    if (this.srsBackendClient) {
      try {
        const stats = await this.srsBackendClient.browserStats();
        this.scheduleSourceExistenceSweepFromBackend();
        return stats;
      } catch (error) {
        logger.debug('Worker browser stats failed; falling back to SQL/legacy stats', { error });
      }
    }

    if (this.browserDeckReadPort) {
      try {
        const stats = this.browserDeckReadPort.getBrowserStats();
        this.scheduleSourceExistenceSweep();
        return stats;
      } catch (error) {
        logger.debug('SQL browser stats failed; falling back to legacy stats', { error });
      }
    }
    return this.browserDeckQueryKernel.getStats();
  }

  private tryReadSqlDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): BrowserDeckCardPageResult | null {
    if (!this.browserDeckReadPort) {
      return null;
    }
    try {
      return this.browserDeckReadPort.queryDeckPage(query, page);
    } catch (error) {
      logger.debug('SQL deck page query failed; falling back to legacy snapshot', { error });
      return null;
    }
  }

  private refreshSourceExistenceForCards(
    cards: Array<{ blockId?: unknown }>,
    options: { limit?: number } = {},
  ) {
    return refreshSourceExistenceForBlockIds(
      this.browserDeckReadPort,
      this.siyuanApi as unknown as QuerySiyuanPort,
      cards.map((card) => card.blockId),
      {
        limit: options.limit,
        staleBefore: Date.now() - SOURCE_EXISTENCE_TTL_MS,
        includeKnownMissing: true,
      },
    );
  }

  private scheduleSourceExistenceSweep(): void {
    if (!this.browserDeckReadPort || this.sourceExistenceSweepInFlight) {
      return;
    }

    this.sourceExistenceSweepInFlight = refreshSourceExistenceSweep(
      this.browserDeckReadPort,
      this.siyuanApi as unknown as QuerySiyuanPort,
      {
        limit: SOURCE_EXISTENCE_BACKGROUND_LIMIT,
        staleBefore: Date.now() - SOURCE_EXISTENCE_TTL_MS,
      },
    ).finally(() => {
      this.sourceExistenceSweepInFlight = null;
    });
  }

  private async refreshSourceExistenceForBackendCards(
    cards: Array<{ blockId?: unknown }>,
    options: { limit?: number } = {},
  ): Promise<{ changed: boolean; changedToMissing: boolean }> {
    if (!this.srsBackendClient) {
      return { changed: false, changedToMissing: false };
    }

    const blockIds = Array.from(new Set(cards.map((card) => String(card.blockId || '').trim()).filter(Boolean)));
    if (blockIds.length === 0) {
      return { changed: false, changedToMissing: false };
    }

    try {
      const sweep = await this.invokeBackendSourceExistenceSweepHost({
        blockIds,
        limit: options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE,
        staleBefore: Date.now() - SOURCE_EXISTENCE_TTL_MS,
        includeKnownMissing: true,
      }, Date.now());
      return {
        changed: sweep.changed,
        changedToMissing: sweep.changedToMissing,
      };
    } catch (error) {
      logger.debug('Worker source existence refresh failed; keeping cache fail-open', { error });
      return { changed: false, changedToMissing: false };
    }
  }

  private async markRowsFromBackendSourceExistence<TRow extends { blockId?: unknown; blockType?: string | null; meta?: unknown }>(
    rows: TRow[],
  ): Promise<TRow[]> {
    if (!this.srsBackendClient || rows.length === 0) {
      return rows;
    }

    try {
      const blockIds = Array.from(new Set(rows.map((row) => String(row.blockId || '').trim()).filter(Boolean)));
      if (blockIds.length === 0) {
        return rows;
      }
      const statusByBlockId = await this.srsBackendClient.browserSourceExistenceByBlockIds(blockIds);
      const missingBlockIds = Array.from(statusByBlockId.entries())
        .filter(([, exists]) => exists === false)
        .map(([blockId]) => blockId);
      return markKnownMissingBlockRows(rows, missingBlockIds);
    } catch (error) {
      logger.debug('Worker source existence mark failed; keeping rows fail-open', { error });
      return rows;
    }
  }

  private scheduleSourceExistenceSweepFromBackend(): void {
    if (!this.srsBackendClient || this.sourceExistenceSweepInFlight) {
      return;
    }

    this.sourceExistenceSweepInFlight = (async () => {
      const request = {
        limit: SOURCE_EXISTENCE_BACKGROUND_LIMIT,
        staleBefore: Date.now() - SOURCE_EXISTENCE_TTL_MS,
        includeKnownMissing: true,
      };
      const candidates = await this.srsBackendClient!.browserSourceExistenceRefreshCandidates(request);
      if (candidates.length === 0) {
        return;
      }

      const scopedRequest = {
        ...request,
        blockIds: candidates.map((candidate) => candidate.blockId),
      };
      await this.invokeBackendSourceExistenceSweepHost(scopedRequest, Date.now());
    })().finally(() => {
      this.sourceExistenceSweepInFlight = null;
    });
  }

  private async invokeBackendSourceExistenceSweepHost(
    request: {
      blockIds?: string[];
      limit?: number;
      staleBefore?: number;
      includeKnownMissing?: boolean;
    },
    checkedAt: number,
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean }> {
    if (!this.srsBackendClient) {
      return { checked: 0, updated: 0, changed: false, changedToMissing: false };
    }

    if (
      this.frontendInstanceRuntime?.getMode() === 'follower'
      && this.followerCommandClient
    ) {
      const relayed = await this.followerCommandClient.submitAndWait<unknown>({
        instanceId: this.frontendInstanceRuntime.getInstanceId(),
        method: 'browser.sourceExistence.applySweepHost',
        params: {
          request,
          checkedAt,
        },
      });
      if (!relayed || typeof relayed !== 'object') {
        throw new Error('worker relay applySweepHost returned invalid payload');
      }
      const payload = relayed as {
        checked?: unknown;
        updated?: unknown;
        changed?: unknown;
        changedToMissing?: unknown;
      };
      return {
        checked: Number(payload.checked || 0),
        updated: Number(payload.updated || 0),
        changed: Boolean(payload.changed),
        changedToMissing: Boolean(payload.changedToMissing),
      };
    }

    return this.srsBackendClient.browserSourceExistenceApplySweepHost(request, checkedAt);
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
      && typeof (queue as { getConceptBlocks?: () => unknown[] }).getConceptBlocks === 'function'
    ) {
      try {
        return Math.max(0, ((queue as { getConceptBlocks: () => unknown[] }).getConceptBlocks() || []).length);
      } catch (error) {
        logger.debug('Failed to read neural-roam concept blocks, falling back to visible counters:', {
          queueId,
          error,
        });
      }
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
    const dataSource = this.dataSourceFactory?.(options, {
      browserService: this,
      manager: this.unifiedDataSourceManager,
      siyuanApi: this.siyuanApi,
    });

    if (dataSource) {
      return dataSource;
    }

    throw new Error(`Browser data source factory is not configured for type=${options.type}`);
  }
}
