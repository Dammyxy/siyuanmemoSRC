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
  SOURCE_EXISTENCE_BATCH_SIZE,
  SOURCE_EXISTENCE_BACKGROUND_LIMIT,
  SOURCE_EXISTENCE_TTL_MS,
} from '../queries/browser/shared/SourceExistenceCache';
import { applyKnownSourceExistenceToRows } from '../queries/browser/shared/MissingBlockMarker';
import type { SrsBackendClient } from '../clients/SrsBackendClient';
import type { FrontendInstanceRuntime } from '../clients/FrontendInstanceRuntime';
import type { FollowerCommandClient } from '../clients/FollowerCommandClient';
import type {
  BrowserStats,
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
} from '../queries/browser/GetBrowserCardsQuery';
import type {
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
  BrowserSourceExistenceStatus,
  BrowserSourceExistenceUpdate,
  BrowserDataSourceFactory,
  DataSourceOptions,
  BrowserQueueId,
} from '../interfaces/IBrowserApplicationService';
import type { ICardDataSource } from '../interfaces/ICardDataSource';
import { createLogger } from '@/utils/logger';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
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
  private readonly sourceExistenceUpdateListeners = new Set<(update: BrowserSourceExistenceUpdate) => void>();
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
    if (!this.srsBackendClient) {
      throw this.toBackendReadUnavailable('browser.deck.page');
    }
    try {
      const initialPage = await measureRuntimePerformance('browser', 'backend.deck-page', () => this.srsBackendClient!.browserDeckPage(query, page), {
        endRow: page.endRow,
        startRow: page.startRow,
      });
      const initialCards = initialPage.cards as FSRSCard[];
      this.scheduleSourceExistenceRefreshForBackendCards(initialCards, {
        limit: SOURCE_EXISTENCE_BATCH_SIZE,
      });
      const rows = await measureRuntimePerformance('browser', 'deck-page.map-browser-rows', () => this.browserDeckQueryKernel.getBrowserCardsFromCards(initialCards, { markMissing: false }), {
        rowCount: initialCards.length,
      });
      return {
        rows: await this.markRowsFromBackendSourceExistence(rows),
        total: initialPage.total,
      };
    } catch (error) {
      throw this.toBackendReadUnavailable('browser.deck.page', error);
    }
  }

  async getDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[]> {
    if (!this.srsBackendClient) {
      throw this.toBackendReadUnavailable('browser.deck.matchedIds');
    }
    try {
      return await this.srsBackendClient.browserDeckMatchedIds(query);
    } catch (error) {
      throw this.toBackendReadUnavailable('browser.deck.matchedIds', error);
    }
  }

  async getDeckRowsByIds(ids: string[]) {
    if (!this.srsBackendClient) {
      throw this.toBackendReadUnavailable('browser.deck.rowsByIds');
    }
    try {
      const cards = await measureRuntimePerformance('browser', 'backend.deck-rows-by-ids', () => this.srsBackendClient!.browserDeckRowsByIds(ids), {
        idCount: ids.length,
      });
      this.scheduleSourceExistenceRefreshForBackendCards(cards, {
        limit: SOURCE_EXISTENCE_BATCH_SIZE,
      });
      const rows = await measureRuntimePerformance('browser', 'deck-rows-by-ids.map-browser-rows', () => this.browserDeckQueryKernel.getBrowserCardsFromCards(cards, { markMissing: false }), {
        rowCount: cards.length,
      });
      return this.markRowsFromBackendSourceExistence(rows);
    } catch (error) {
      throw this.toBackendReadUnavailable('browser.deck.rowsByIds', error);
    }
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
    if (!this.srsBackendClient) {
      throw this.toBackendReadUnavailable('browser.count');
    }
    try {
      return await this.srsBackendClient.browserCountCards({
        dueDate: { lte: Date.now() },
        includeSuspended: false,
        sourceStatus: 'active',
      });
    } catch (error) {
      throw this.toBackendReadUnavailable('browser.count', error);
    }
  }

  async getStats(): Promise<BrowserStats> {
    if (!this.srsBackendClient) {
      throw this.toBackendReadUnavailable('browser.stats');
    }
    try {
      const stats = await measureRuntimePerformance('browser', 'backend.stats', () => this.srsBackendClient!.browserStats());
      this.scheduleSourceExistenceSweepFromBackend();
      return stats;
    } catch (error) {
      throw this.toBackendReadUnavailable('browser.stats', error);
    }
  }

  subscribeSourceExistenceUpdates(listener: (update: BrowserSourceExistenceUpdate) => void): () => void {
    this.sourceExistenceUpdateListeners.add(listener);
    return () => {
      this.sourceExistenceUpdateListeners.delete(listener);
    };
  }

  private toBackendReadUnavailable(operation: string, error?: unknown): Error {
    const message = error instanceof Error ? String(error.message || '') : String(error || '');
    if (message.startsWith('BACKEND_UNAVAILABLE:')) {
      return error instanceof Error ? error : new Error(message);
    }
    if (message) {
      return new Error(`BACKEND_UNAVAILABLE: ${operation} unavailable (${message})`);
    }
    return new Error(`BACKEND_UNAVAILABLE: ${operation} requires backend-worker ownership`);
  }

  private async refreshSourceExistenceForBackendCards(
    cards: Array<{ blockId?: unknown }>,
    options: { limit?: number } = {},
  ): Promise<{ changed: boolean; changedToMissing: boolean; changedBlockIds: string[] }> {
    if (!this.srsBackendClient) {
      return { changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    const blockIds = Array.from(new Set(cards.map((card) => String(card.blockId || '').trim()).filter(Boolean)));
    if (blockIds.length === 0) {
      return { changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    try {
      const sweep = await measureRuntimePerformance('source-existence', 'refresh-page-cards', () => this.invokeBackendSourceExistenceSweepHost({
        blockIds,
        limit: options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE,
        staleBefore: Date.now() - SOURCE_EXISTENCE_TTL_MS,
        includeKnownMissing: true,
      }, Date.now()), {
        blockCount: blockIds.length,
        limit: options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE,
      });
      const changedBlockIds = Array.from(new Set((sweep.changedBlockIds || [])
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean)));
      if (changedBlockIds.length > 0) {
        await this.emitSourceExistenceUpdateForBlockIds(changedBlockIds, 'page-refresh');
      }
      return {
        changed: sweep.changed,
        changedToMissing: sweep.changedToMissing,
        changedBlockIds,
      };
    } catch (error) {
      logger.debug('Worker source existence refresh failed; keeping cache fail-open', { error });
      return { changed: false, changedToMissing: false, changedBlockIds: [] };
    }
  }

  private scheduleSourceExistenceRefreshForBackendCards(
    cards: Array<{ blockId?: unknown }>,
    options: { limit?: number } = {},
  ): void {
    if (!this.srsBackendClient || cards.length === 0) {
      return;
    }

    setTimeout(() => {
      void this.refreshSourceExistenceForBackendCards(cards, options).catch((error) => {
        logger.debug('Worker source existence background refresh failed; keeping cache fail-open', { error });
      });
    }, 0);
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
      const statusByBlockId = await measureRuntimePerformance(
        'source-existence',
        'mark-rows.status-by-block-ids',
        () => this.srsBackendClient!.browserSourceExistenceByBlockIds(blockIds),
        { blockCount: blockIds.length },
      );
      return applyKnownSourceExistenceToRows(rows, statusByBlockId.entries());
    } catch (error) {
      logger.debug('Worker source existence mark failed; keeping rows fail-open', { error });
      return rows;
    }
  }

  private async emitSourceExistenceUpdateForBlockIds(
    blockIds: string[],
    source: BrowserSourceExistenceUpdate['source'],
  ): Promise<void> {
    if (!this.srsBackendClient || this.sourceExistenceUpdateListeners.size === 0 || blockIds.length === 0) {
      return;
    }

    const uniqueBlockIds = Array.from(new Set(blockIds.map((blockId) => String(blockId || '').trim()).filter(Boolean)));
    if (uniqueBlockIds.length === 0) {
      return;
    }

    try {
      const statusByBlockId = await measureRuntimePerformance(
        'source-existence',
        'visible-patch.status-by-block-ids',
        () => this.srsBackendClient!.browserSourceExistenceByBlockIds(uniqueBlockIds),
        {
          blockCount: uniqueBlockIds.length,
          source,
        },
      );
      const statuses: BrowserSourceExistenceStatus[] = uniqueBlockIds.map((blockId) => ({
        blockId,
        exists: statusByBlockId.get(blockId) ?? null,
      }));
      const update: BrowserSourceExistenceUpdate = {
        source,
        statuses,
      };
      for (const listener of Array.from(this.sourceExistenceUpdateListeners)) {
        try {
          listener(update);
        } catch (error) {
          logger.debug('Browser source-existence listener failed', { error });
        }
      }
    } catch (error) {
      logger.debug('Worker source existence visible patch status read failed; keeping visible rows unchanged', { error });
    }
  }

  private scheduleSourceExistenceSweepFromBackend(): void {
    if (!this.srsBackendClient || this.sourceExistenceSweepInFlight) {
      return;
    }

    this.sourceExistenceSweepInFlight = (async () => {
      const finishSweepSpan = startRuntimePerformanceSpan('source-existence', 'background-sweep');
      let candidateCount = 0;
      let status = 'started';
      const request = {
        limit: SOURCE_EXISTENCE_BACKGROUND_LIMIT,
        staleBefore: Date.now() - SOURCE_EXISTENCE_TTL_MS,
        includeKnownMissing: true,
      };
      try {
        const candidates = await measureRuntimePerformance(
          'source-existence',
          'background-sweep.refresh-candidates',
          () => this.srsBackendClient!.browserSourceExistenceRefreshCandidates(request),
          { limit: SOURCE_EXISTENCE_BACKGROUND_LIMIT },
        );
        candidateCount = candidates.length;
        incrementRuntimePerformanceCounter('source-existence', 'background-sweep-candidates', candidates.length);
        if (candidates.length === 0) {
          status = 'empty';
          return;
        }

        const scopedRequest = {
          ...request,
          blockIds: candidates.map((candidate) => candidate.blockId),
        };
        const sweep = await this.invokeBackendSourceExistenceSweepHost(scopedRequest, Date.now());
        if (sweep.changedBlockIds?.length) {
          await this.emitSourceExistenceUpdateForBlockIds(sweep.changedBlockIds, 'background-sweep');
        }
        status = 'swept';
      } catch (error) {
        status = 'error';
        throw error;
      } finally {
        finishSweepSpan({
          candidateCount,
          status,
        }, {
          ok: status === 'swept' || status === 'empty',
          errorName: status === 'error' ? 'SourceExistenceSweepError' : undefined,
        });
      }
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
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean; changedBlockIds?: string[] }> {
    if (!this.srsBackendClient) {
      return { checked: 0, updated: 0, changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    const relaySweepHost = async () => {
      if (!this.frontendInstanceRuntime || !this.followerCommandClient) {
        throw new Error('worker relay applySweepHost is unavailable');
      }
      const relayed = await measureRuntimePerformance('source-existence', 'apply-sweep-host.relay-submit-wait', () => this.followerCommandClient!.submitAndWait<unknown>({
        instanceId: this.frontendInstanceRuntime.getInstanceId(),
        method: 'browser.sourceExistence.applySweepHost',
        params: {
          request,
          checkedAt,
        },
      }), {
        blockCount: request.blockIds?.length ?? 0,
        method: 'browser.sourceExistence.applySweepHost',
      });
      if (!relayed || typeof relayed !== 'object') {
        throw new Error('worker relay applySweepHost returned invalid payload');
      }
      const payload = relayed as {
        checked?: unknown;
        updated?: unknown;
        changed?: unknown;
        changedToMissing?: unknown;
        changedBlockIds?: unknown;
      };
      return {
        checked: Number(payload.checked || 0),
        updated: Number(payload.updated || 0),
        changed: Boolean(payload.changed),
        changedToMissing: Boolean(payload.changedToMissing),
        changedBlockIds: Array.isArray(payload.changedBlockIds)
          ? payload.changedBlockIds.map((blockId) => String(blockId || '').trim()).filter(Boolean)
          : [],
      };
    };

    if (
      this.frontendInstanceRuntime?.getMode() === 'follower'
      && this.followerCommandClient
    ) {
      return relaySweepHost();
    }

    if (this.frontendInstanceRuntime) {
      try {
        await measureRuntimePerformance('relay', 'ensure-writable.source-existence-sweep', () => this.frontendInstanceRuntime!.ensureWritable(), {
          method: 'browser.sourceExistence.applySweepHost',
        });
      } catch (error) {
        if (
          this.frontendInstanceRuntime.getMode() === 'follower'
          && this.followerCommandClient
        ) {
          return relaySweepHost();
        }
        throw error;
      }
      if (
        this.frontendInstanceRuntime.getMode() === 'follower'
        && this.followerCommandClient
      ) {
        return relaySweepHost();
      }
    }

    return measureRuntimePerformance(
      'source-existence',
      'apply-sweep-host.local',
      () => this.srsBackendClient!.browserSourceExistenceApplySweepHost(request, checkedAt),
      { blockCount: request.blockIds?.length ?? 0 },
    );
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
