import type { BrowserCardStoragePort } from '@/core/storage/ports';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import type { CardFilter, IReviewQueue, IUnifiedDataSourceManagerFacade, QueueType } from '@/types/unified-data-source';
import {
  getCanonicalBrowserQueueIds,
  isNeuralBrowserQueue,
  normalizeBrowserQueueId,
  resolveBrowserQueueIdForQueueType,
  resolveQueueTypeForBrowserQueueId,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
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
import { resolveBrowserCardStableId, type BrowserCard } from '@/types/browser';
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
} from '../interfaces/IBrowserApplicationService';
import type { ICardDataSource } from '../interfaces/ICardDataSource';
import { createLogger } from '@/utils/logger';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  recordRuntimePerformanceSpan,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import { hasFilterSetter, hasRebuildAction } from './browser/filterGroupQueueContract';
import { BrowserCardUniverseReadModule } from './browser/BrowserCardUniverseReadModule';

const EMPTY_QUEUE_COUNTS: Record<string, number> = Object.fromEntries(
  getCanonicalBrowserQueueIds().map((queueId) => [queueId, 0]),
);

const logger = createLogger('BrowserApplicationService');
const SOURCE_EXISTENCE_PAGE_REFRESH_DELAY_MS = 250;
const SOURCE_EXISTENCE_STATUS_CACHE_MAX_SIZE = 4096;

function normalizeSignatureValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeSignatureValue);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((normalized, key) => {
      normalized[key] = normalizeSignatureValue(record[key]);
      return normalized;
    }, {});
  }
  return value;
}

function createBrowserRowProjectionSignature(row: BrowserCard): string {
  const rowWithSourceStatus = row as BrowserCard & { blockType?: unknown };
  return JSON.stringify(normalizeSignatureValue({
    aFactor: row.aFactor,
    blockId: row.blockId,
    blockType: rowWithSourceStatus.blockType,
    cardType: row.cardType,
    content: row.content,
    deckId: row.deckId,
    difficulty: row.difficulty,
    due: row.due,
    dueFormatted: row.dueFormatted,
    elapsedDays: row.elapsedDays,
    firstReview: row.firstReview,
    firstReviewFormatted: row.firstReviewFormatted,
    fsrsCardId: row.fsrsCardId,
    fullContent: row.fullContent,
    id: row.id,
    interval: row.interval,
    lapses: row.lapses,
    lastReview: row.lastReview,
    lastReviewFormatted: row.lastReviewFormatted,
    meta: row.meta,
    note: row.note,
    priority: row.priority,
    queueIndex: row.queueIndex,
    reps: row.reps,
    retrievability: row.retrievability,
    rootId: row.rootId,
    scheduledDays: row.scheduledDays,
    stability: row.stability,
    state: row.state,
    stateLabel: row.stateLabel,
    suspended: row.suspended,
    tags: row.tags,
  })) || '';
}

export class BrowserApplicationService implements IBrowserApplicationService {
  private readonly getBrowserCardsQueryHandler: GetBrowserCardsQueryHandler;
  private readonly browserDeckQueryKernel: BrowserDeckQueryKernel;
  private readonly browserCardUniverseReadModule: BrowserCardUniverseReadModule;
  private readonly queueBrowserQueryKernel: QueueBrowserQueryKernel | null;
  private readonly unifiedDataSourceManager: IUnifiedDataSourceManagerFacade | null;
  private readonly siyuanApi: BrowserSiyuanPort;
  private readonly queueCountInFlight = new Map<BrowserQueueId, Promise<number>>();
  private readonly queueCountCache = new Map<BrowserQueueId, { value: number; timestamp: number }>();
  private sourceExistenceSweepInFlight: Promise<unknown> | null = null;
  private readonly sourceExistenceUpdateListeners = new Set<(update: BrowserSourceExistenceUpdate) => void>();
  private readonly sourceExistenceStatusCache = new Map<string, boolean | null>();
  private static readonly QUEUE_COUNTS_CACHE_TTL_MS = 150;
  private static readonly BROWSER_ROW_PROJECTION_CACHE_MAX_SIZE = 4096;
  private readonly browserRowProjectionCache = new Map<string, { signature: string; row: BrowserCard }>();
  private readonly pendingSourceExistenceRefreshBlockIds = new Set<string>();
  private sourceExistencePageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private sourceExistencePageRefreshLimit = SOURCE_EXISTENCE_BATCH_SIZE;
  private sourceExistencePageRefreshCoalescedCount = 0;
  private sourceExistencePageRefreshSeq = 0;
  private sourceExistenceLatestRefreshSeq = 0;
  private sourceExistenceStaleCancellationCount = 0;

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
    this.browserCardUniverseReadModule = new BrowserCardUniverseReadModule({
      backendClient: srsBackendClient,
      browserDeckQueryKernel: this.browserDeckQueryKernel,
      scheduleSourceExistenceRefreshForCards: (cards, options) => this.scheduleSourceExistenceRefreshForBackendCards(cards, options),
      markRowsFromKnownSourceExistence: (rows) => this.markRowsFromKnownSourceExistence(rows),
      reuseBrowserRowProjections: (rows, reason) => this.reuseBrowserRowProjections(rows, reason),
      scheduleSourceExistenceSweep: () => this.scheduleSourceExistenceSweepFromBackend(),
      sourceExistenceBatchSize: SOURCE_EXISTENCE_BATCH_SIZE,
    });
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

  async getDeckAggregateSnapshot(query: BrowserDeckSnapshotQuery): Promise<BrowserDeckSnapshotResult> {
    return this.browserCardUniverseReadModule.readAggregateSnapshot(query);
  }

  async getDeckAggregatePage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckPageResult> {
    return this.browserCardUniverseReadModule.readAggregatePage(query, page);
  }

  async getDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckPageResult> {
    return this.browserCardUniverseReadModule.readPage(query, page);
  }

  async getDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[]> {
    return this.browserCardUniverseReadModule.readMatchedIds(query);
  }

  async getDeckRowsByIds(ids: string[]) {
    return this.browserCardUniverseReadModule.readRowsByIds(ids);
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
    return this.browserCardUniverseReadModule.countCards({
        dueDate: { lte: Date.now() },
        includeSuspended: false,
        sourceStatus: 'active',
      });
  }

  async getStats(): Promise<BrowserStats> {
    return this.browserCardUniverseReadModule.readStats();
  }

  subscribeSourceExistenceUpdates(listener: (update: BrowserSourceExistenceUpdate) => void): () => void {
    this.sourceExistenceUpdateListeners.add(listener);
    return () => {
      this.sourceExistenceUpdateListeners.delete(listener);
    };
  }

  private async refreshSourceExistenceForBackendBlockIds(
    blockIds: string[],
    options: { limit?: number; coalescedCount?: number } = {},
  ): Promise<{ changed: boolean; changedToMissing: boolean; changedBlockIds: string[] }> {
    if (!this.srsBackendClient) {
      return { changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    if (blockIds.length === 0) {
      return { changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    const sequence = ++this.sourceExistencePageRefreshSeq;
    this.sourceExistenceLatestRefreshSeq = sequence;
    const limit = options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE;
    const coalescedCount = options.coalescedCount ?? 0;
    try {
      const sweep = await measureRuntimePerformance('source-existence', 'refresh-page-cards', () => this.invokeBackendSourceExistenceSweepHost({
        blockIds,
        limit,
        includeKnownMissing: true,
        force: true,
      }, Date.now()), {
        blockCount: blockIds.length,
        coalescedCount,
        limit,
        sequence,
      });
      const changedBlockIds = Array.from(new Set((sweep.changedBlockIds || [])
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean)));
      if (sequence !== this.sourceExistenceLatestRefreshSeq) {
        this.sourceExistenceStaleCancellationCount += 1;
        recordRuntimePerformanceSpan('source-existence', 'refresh-page-cards.stale-cancel', 0, {
          changedBlockCount: changedBlockIds.length,
          latestSequence: this.sourceExistenceLatestRefreshSeq,
          sequence,
          staleCancellationCount: this.sourceExistenceStaleCancellationCount,
        });
        return { changed: false, changedToMissing: false, changedBlockIds: [] };
      }
      recordRuntimePerformanceSpan('source-existence', 'refresh-page-cards.result', 0, {
        blockCount: blockIds.length,
        changedBlockCount: changedBlockIds.length,
        coalescedCount,
        sequence,
        staleCancellationCount: this.sourceExistenceStaleCancellationCount,
      });
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

    const blockIds = this.normalizeSourceExistenceRefreshBlockIds(cards.map((card) => card.blockId));
    if (blockIds.length === 0) {
      return;
    }

    for (const blockId of blockIds) {
      this.pendingSourceExistenceRefreshBlockIds.add(blockId);
    }
    this.sourceExistencePageRefreshLimit = Math.max(
      this.sourceExistencePageRefreshLimit,
      options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE,
    );

    if (this.sourceExistencePageRefreshTimer) {
      this.sourceExistencePageRefreshCoalescedCount += 1;
      recordRuntimePerformanceSpan('source-existence', 'refresh-page-cards.coalesced', 0, {
        blockCount: this.pendingSourceExistenceRefreshBlockIds.size,
        coalescedCount: this.sourceExistencePageRefreshCoalescedCount,
      });
      return;
    }

    this.sourceExistencePageRefreshTimer = setTimeout(() => {
      const pendingBlockIds = Array.from(this.pendingSourceExistenceRefreshBlockIds);
      const limit = this.sourceExistencePageRefreshLimit;
      const coalescedCount = this.sourceExistencePageRefreshCoalescedCount;
      this.pendingSourceExistenceRefreshBlockIds.clear();
      this.sourceExistencePageRefreshTimer = null;
      this.sourceExistencePageRefreshLimit = SOURCE_EXISTENCE_BATCH_SIZE;
      this.sourceExistencePageRefreshCoalescedCount = 0;

      void this.refreshSourceExistenceForBackendBlockIds(pendingBlockIds, {
        coalescedCount,
        limit,
      }).catch((error) => {
        logger.debug('Worker source existence background refresh failed; keeping cache fail-open', { error });
      });
    }, SOURCE_EXISTENCE_PAGE_REFRESH_DELAY_MS);
  }

  private normalizeSourceExistenceRefreshBlockIds(blockIds: unknown[]): string[] {
    return Array.from(new Set(blockIds.map((blockId) => String(blockId || '').trim()).filter(Boolean)));
  }

  private markRowsFromKnownSourceExistence<TRow extends { blockId?: unknown; blockType?: string | null; meta?: unknown }>(
    rows: TRow[],
  ): TRow[] {
    if (rows.length === 0 || this.sourceExistenceStatusCache.size === 0) {
      return rows;
    }

    const statusEntries: Array<[string, boolean | null]> = [];
    for (const row of rows) {
      const blockId = String(row.blockId || '').trim();
      if (!blockId || !this.sourceExistenceStatusCache.has(blockId)) {
        continue;
      }
      statusEntries.push([blockId, this.sourceExistenceStatusCache.get(blockId) ?? null]);
    }
    if (statusEntries.length === 0) {
      return rows;
    }
    return applyKnownSourceExistenceToRows(rows, statusEntries);
  }

  private cacheSourceExistenceStatuses(statuses: Iterable<readonly [string, boolean | null]>): void {
    for (const [rawBlockId, exists] of statuses) {
      const blockId = String(rawBlockId || '').trim();
      if (!blockId) {
        continue;
      }
      this.sourceExistenceStatusCache.set(blockId, exists);
    }

    while (this.sourceExistenceStatusCache.size > SOURCE_EXISTENCE_STATUS_CACHE_MAX_SIZE) {
      const oldestKey = this.sourceExistenceStatusCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.sourceExistenceStatusCache.delete(oldestKey);
    }
  }

  private reuseBrowserRowProjections(rows: BrowserCard[], reason: string): BrowserCard[] {
    if (rows.length === 0) {
      return rows;
    }

    let reuseHits = 0;
    let reuseMisses = 0;
    let changed = false;
    const nextRows = rows.map((row) => {
      const rowId = resolveBrowserCardStableId(row);
      if (!rowId) {
        reuseMisses += 1;
        return row;
      }

      const signature = createBrowserRowProjectionSignature(row);
      const cached = this.browserRowProjectionCache.get(rowId);
      if (cached?.signature === signature) {
        reuseHits += 1;
        changed = changed || cached.row !== row;
        return cached.row;
      }

      reuseMisses += 1;
      this.browserRowProjectionCache.set(rowId, { signature, row });
      return row;
    });

    this.trimBrowserRowProjectionCache();
    recordRuntimePerformanceSpan('browser', 'row-projection-cache', 0, {
      cacheSize: this.browserRowProjectionCache.size,
      reason,
      reuseHits,
      reuseMisses,
      rowCount: rows.length,
    });

    return changed ? nextRows : rows;
  }

  private trimBrowserRowProjectionCache(): void {
    while (this.browserRowProjectionCache.size > BrowserApplicationService.BROWSER_ROW_PROJECTION_CACHE_MAX_SIZE) {
      const oldestKey = this.browserRowProjectionCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.browserRowProjectionCache.delete(oldestKey);
    }
  }

  private async emitSourceExistenceUpdateForBlockIds(
    blockIds: string[],
    source: BrowserSourceExistenceUpdate['source'],
  ): Promise<void> {
    if (!this.srsBackendClient || blockIds.length === 0) {
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
      this.cacheSourceExistenceStatuses(statusByBlockId.entries());
      const statuses: BrowserSourceExistenceStatus[] = uniqueBlockIds.map((blockId) => ({
        blockId,
        exists: statusByBlockId.get(blockId) ?? null,
      }));
      if (this.sourceExistenceUpdateListeners.size === 0) {
        return;
      }
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
      force?: boolean;
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

  getQueueById(queueId: string): IReviewQueue | null {
    if (!this.unifiedDataSourceManager) return null;

    const normalized = normalizeBrowserQueueId(queueId);
    if (!normalized) return null;

    try {
      const queueType = resolveQueueTypeForBrowserQueueId(normalized);
      return queueType ? this.unifiedDataSourceManager.getQueue(queueType) : null;
    } catch (error) {
      logger.error('QUEUE_UNAVAILABLE: failed to get queue by id:', { queueId, error });
      const unavailable = new Error(`QUEUE_UNAVAILABLE: ${queueId} queue lookup failed`);
      (unavailable as Error & { cause?: unknown }).cause = error;
      throw unavailable;
    }
  }

  private async readQueueVisibleCount(
    queue: IReviewQueue | null,
    queueId: string,
    forceRefresh = false,
  ): Promise<number> {
    if (!queue) {
      return 0;
    }

    if (
      isNeuralBrowserQueue(queueId)
      && typeof (queue as { getConceptBlocks?: () => unknown[] }).getConceptBlocks === 'function'
    ) {
      try {
        return Math.max(0, ((queue as { getConceptBlocks: () => unknown[] }).getConceptBlocks() || []).length);
      } catch (error) {
        logger.error('QUEUE_COUNT_UNAVAILABLE: failed to read neural-roam concept blocks:', {
          queueId,
          error,
        });
        throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} concept block count unavailable`);
      }
    }

    if (
      isNeuralBrowserQueue(queueId)
      && typeof (queue as { getSourceSnapshot?: () => unknown[] }).getSourceSnapshot === 'function'
    ) {
      try {
        return Math.max(0, ((queue as { getSourceSnapshot: () => unknown[] }).getSourceSnapshot() || []).length);
      } catch (error) {
        logger.error('QUEUE_COUNT_UNAVAILABLE: failed to read neural-roam source snapshot:', {
          queueId,
          error,
        });
        throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} source snapshot count unavailable`);
      }
    }

    try {
      const snapshot = await this.getQueueQuerySnapshot({
        queueId: queueId as BrowserQueueId,
        preset: 'all',
        searchText: '',
        docId: null,
        scopeDocIds: null,
        cardType: 'all',
        forceRefresh,
      });
      return Math.max(0, Number(snapshot.total) || 0);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const unavailable = new Error(
        reason
          ? `QUEUE_COUNT_UNAVAILABLE: ${queueId} queue snapshot unavailable (${reason})`
          : `QUEUE_COUNT_UNAVAILABLE: ${queueId} queue snapshot unavailable`,
      );
      (unavailable as Error & { cause?: unknown }).cause = error;
      throw unavailable;
    }
  }

  private isTransientQueueCountUnavailableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
    if (
      candidate.code === 'QUEUE_PROJECTION_NOT_READY'
      || candidate.code === 'QUEUE_PROJECTION_UNAVAILABLE'
    ) {
      return true;
    }

    if (typeof candidate.message === 'string') {
      if (
        candidate.message.startsWith('QUEUE_PROJECTION_NOT_READY:')
        || candidate.message.startsWith('QUEUE_PROJECTION_UNAVAILABLE:')
      ) {
        return true;
      }

      if (
        candidate.message.startsWith('QUEUE_COUNT_UNAVAILABLE:')
        && (
          candidate.message.includes('QUEUE_PROJECTION_NOT_READY')
          || candidate.message.includes('QUEUE_PROJECTION_UNAVAILABLE')
        )
      ) {
        return true;
      }
    }

    if (candidate.cause && candidate.cause !== error) {
      return this.isTransientQueueCountUnavailableError(candidate.cause);
    }

    return false;
  }

  private resolveAffectedBrowserQueueIds(affectedQueueTypes?: QueueType[] | null): BrowserQueueId[] {
    if (!affectedQueueTypes || affectedQueueTypes.length === 0) {
      return getCanonicalBrowserQueueIds();
    }

    return Array.from(new Set(
      affectedQueueTypes
        .map((queueType) => resolveBrowserQueueIdForQueueType(queueType))
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

    const queueType = resolveQueueTypeForBrowserQueueId(queueId);
    if (!queueType) {
      throw new Error(`QUEUE_UNAVAILABLE: ${queueId} queue identity unsupported`);
    }
    const request = this.readQueueVisibleCount(manager.getQueue(queueType), queueId, forceRefresh)
      .then((value) => {
        const normalized = Math.max(0, Number(value) || 0);
        this.queueCountCache.set(queueId, {
          value: normalized,
          timestamp: Date.now(),
        });
        return normalized;
      })
      .catch((error) => {
        if (this.isTransientQueueCountUnavailableError(error)) {
          const cached = this.queueCountCache.get(queueId);
          if (cached) {
            this.queueCountCache.set(queueId, {
              value: cached.value,
              timestamp: Date.now(),
            });
            return cached.value;
          }
          return this.readQueueVisibleCount(manager.getQueue(queueType), queueId, true)
            .then((value) => {
              const normalized = Math.max(0, Number(value) || 0);
              this.queueCountCache.set(queueId, {
                value: normalized,
                timestamp: Date.now(),
              });
              return normalized;
            })
            .catch((retryError) => {
              if (!this.isTransientQueueCountUnavailableError(retryError)) {
                throw retryError;
              }
              const stale = Math.max(0, Number(this.queueCountCache.get(queueId)?.value) || 0);
              this.queueCountCache.set(queueId, {
                value: stale,
                timestamp: Date.now(),
              });
              return stale;
            });
        }

        this.queueCountCache.delete(queueId);
        logger.error('QUEUE_COUNT_UNAVAILABLE: failed to get queue count:', { queueId, error });
        throw error;
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
