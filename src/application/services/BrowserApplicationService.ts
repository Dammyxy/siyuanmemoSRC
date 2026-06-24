import type { BrowserCardStoragePort } from '@/core/storage/ports';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { QueueType } from '@/types/unified-data-source';
import type {
  CardFilter,
  DataChangeEvent,
  FilterGroupQueueSessionSnapshot,
  IDataSourceObserver,
  IReviewQueue,
  IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import {
  getCanonicalBrowserQueueIds,
  isNeuralBrowserQueue,
  normalizeBrowserQueueId,
  resolveBrowserQueueIdForQueueType,
  resolveQueueTypeForBrowserQueueId,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { BrowserAdvancedSqlQuerySourcePort } from '@/application/ports/BrowserAdvancedSqlQuerySourcePort';
import type { FSRSCard } from '@/types/card';
import { GetBrowserCardsQueryHandler } from '../queries/browser/GetBrowserCardsQueryHandler';
import { BrowserDeckQueryKernel } from '../queries/browser/shared/BrowserDeckQueryKernel';
import { BrowserDeckBlockQuerySource } from '../queries/browser/shared/BrowserDeckBlockQuerySource';
import { QueueBrowserQueryKernel, type QueueProjectionBrowserReadModelError } from '../queries/browser/shared/QueueBrowserQueryKernel';
import {
  SOURCE_EXISTENCE_BATCH_SIZE,
  SOURCE_EXISTENCE_BACKGROUND_LIMIT,
  SOURCE_EXISTENCE_TTL_MS,
} from '../queries/browser/shared/SourceExistenceCache';
import { applyKnownSourceExistenceToRows } from '../queries/browser/shared/MissingBlockMarker';
import type { BackendBrowserClientFacet } from '@/application/clients/backend';
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
  BrowserDocumentCountsResult,
  BrowserDocumentCountsScope,
  BrowserDeckSnapshotQuery,
  BrowserDeckSnapshotResult,
} from '../queries/browser/browser-deck-query';
import type {
  QueueBrowserSnapshotQuery,
  QueueBrowserSnapshotResult,
} from '../queries/browser/queue-browser-query';
import type {
  BrowserReadModel,
  BrowserReadModelActionTargetsByIdsOptions,
  BrowserReadModelDiagnostic,
  BrowserReadModelMatchedIdsOptions,
  BrowserReadModelPageResponse,
  BrowserReadModelQuery,
  BrowserReadModelReadState,
  BrowserReadModelRowsByIdsQuery,
  BrowserReadModelSnapshotMetadata,
} from '../queries/browser/browser-read-model';
import { toBrowserReadModelActionTarget } from '../queries/browser/browser-read-model';
import type { QueueProjectionReadiness, QueueProjectionReadinessRequest } from '../../../packages/contracts/src/backend-rpc';
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
import { BrowserCardUniverseReadModule, type BrowserCardUniverseIdentityLike } from './browser/BrowserCardUniverseReadModule';
import {
  CdfLiveRelationRefreshService,
  CdfLiveRelationSqlSourceLoader,
  type CdfLiveRelationRefreshResult,
} from './CdfLiveRelationRefreshService';
import {
  CdfLiveRelationSqlCandidateSourceScanner,
  CdfLiveRelationWriteRepairService,
  type CdfLiveRelationCardCreatorPort,
  type CdfLiveRelationFullRepairDryRunOptions,
  type CdfLiveRelationFullRepairDryRunResult,
  type CdfLiveRelationFullRepairExecuteOptions,
  type CdfLiveRelationFullRepairExecuteResult,
  type CdfLiveRelationSingleSourceRepairOptions,
  type CdfLiveRelationSingleSourceRepairResult,
  type CdfLiveRelationWriteRepairOptions,
  type CdfLiveRelationWriteRepairResult,
  type CdfLiveRelationWriteRepairSourceLoader,
} from './CdfLiveRelationWriteRepairService';

const EMPTY_QUEUE_COUNTS: Record<string, number> = Object.fromEntries(
  getCanonicalBrowserQueueIds().map((queueId) => [queueId, 0]),
);

const logger = createLogger('BrowserApplicationService');
const SOURCE_EXISTENCE_PAGE_REFRESH_DELAY_MS = 250;
const SOURCE_EXISTENCE_STATUS_CACHE_MAX_SIZE = 4096;
const BROWSER_LOCAL_DELETION_IDENTITY_MAX_SIZE = 4096;

type BrowserApplicationBackendClient = Pick<
  BackendBrowserClientFacet,
  | 'browserAggregatePage'
  | 'browserAggregateSnapshot'
  | 'browserCountCards'
  | 'browserDeckDocumentCounts'
  | 'browserDeckMatchedIds'
  | 'browserDeckPage'
  | 'browserDeckRowsByIds'
  | 'browserSourceExistenceApplySweepHost'
  | 'browserSourceExistenceByBlockIds'
  | 'browserSourceExistenceRefreshCandidates'
  | 'browserStats'
>;

type FilterGroupSessionSnapshotProvider = {
  serializeSessionSnapshot(): FilterGroupQueueSessionSnapshot;
};

function hasFilterGroupSessionSnapshotProvider(queue: unknown): queue is FilterGroupSessionSnapshotProvider {
  return Boolean(
    queue
    && typeof queue === 'object'
    && typeof (queue as FilterGroupSessionSnapshotProvider).serializeSessionSnapshot === 'function',
  );
}

function normalizeOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

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

function createCdfWriteRepairSourceLoader(
  source: BrowserQuerySiyuanPort,
): CdfLiveRelationWriteRepairSourceLoader {
  const loader = new CdfLiveRelationSqlSourceLoader(source);
  return {
    loadSourceTree: (sourceBlockId, options) => loader.loadSourceTree(
      sourceBlockId,
      options
        ? {
            reconciliationScope: options.reconciliationScope === 'block-edit' ? 'block-edit' : 'source',
            changedBlockId: options.changedBlockId,
          }
        : undefined,
    ),
  };
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
  private browserReadModelFacade: BrowserReadModel | null = null;
  private readonly locallyDeletedBrowserCardIds = new Set<string>();
  private readonly locallyDeletedBrowserBlockIds = new Set<string>();
  private readonly locallyDeletedBrowserStatsIdentityIds = new Set<string>();
  private readonly browserLocalDeletionObserver: IDataSourceObserver = {
    onDataChanged: (event) => this.handleBrowserLocalDeletionEvent(event),
  };
  private readonly cdfLiveRelationRefresh: CdfLiveRelationRefreshService | null;
  private readonly cdfLiveRelationWriteRepair: CdfLiveRelationWriteRepairService | null;

  constructor(
    storageManager: BrowserCardStoragePort,
    cardScheduleService: CardScheduleService,
    cardFilterService: CardFilterService,
    cardSortService: CardSortService,
    unifiedDataSourceManager: IUnifiedDataSourceManagerFacade | null,
    siyuanApi: BrowserSiyuanPort,
    querySiyuanApi: BrowserQuerySiyuanPort,
    private readonly dataSourceFactory?: BrowserDataSourceFactory | null,
    private readonly browserDeckReadPort?: BrowserDeckReadPort | null,
    private readonly srsBackendClient?: BrowserApplicationBackendClient | null,
    private readonly frontendInstanceRuntime?: FrontendInstanceRuntime | null,
    private readonly followerCommandClient?: FollowerCommandClient | null,
    private readonly browserAdvancedSqlQuerySource?: BrowserAdvancedSqlQuerySourcePort | null,
    cdfLiveRelationCardCreator?: CdfLiveRelationCardCreatorPort | null,
  ) {
    this.browserDeckQueryKernel = new BrowserDeckQueryKernel(
      storageManager,
      cardScheduleService,
      cardFilterService,
      new BrowserDeckBlockQuerySource(querySiyuanApi),
    );
    this.queueBrowserQueryKernel = unifiedDataSourceManager
      ? new QueueBrowserQueryKernel(
        unifiedDataSourceManager,
        querySiyuanApi,
        browserDeckReadPort,
      )
      : null;

    this.getBrowserCardsQueryHandler = new GetBrowserCardsQueryHandler(
      storageManager,
      cardScheduleService,
      cardFilterService,
      cardSortService,
      querySiyuanApi,
    );

    this.unifiedDataSourceManager = unifiedDataSourceManager ?? null;
    this.siyuanApi = siyuanApi;
    this.cdfLiveRelationRefresh = unifiedDataSourceManager
      ? new CdfLiveRelationRefreshService({
        manager: unifiedDataSourceManager,
        source: querySiyuanApi,
      })
      : null;
    this.cdfLiveRelationWriteRepair = unifiedDataSourceManager && cdfLiveRelationCardCreator
      ? new CdfLiveRelationWriteRepairService({
        manager: unifiedDataSourceManager,
        cardCreator: cdfLiveRelationCardCreator,
        sourceLoader: createCdfWriteRepairSourceLoader(querySiyuanApi),
        candidateScanner: new CdfLiveRelationSqlCandidateSourceScanner(querySiyuanApi),
      })
      : null;
    this.browserCardUniverseReadModule = new BrowserCardUniverseReadModule({
      backendClient: srsBackendClient,
      browserDeckQueryKernel: this.browserDeckQueryKernel,
      filterLocallyDeletedRows: (rows, reason) => this.filterLocallyDeletedBrowserRows(rows, reason),
      filterLocallyDeletedIds: (ids, reason) => this.filterLocallyDeletedBrowserIds(ids, reason),
      adjustTotalForLocalDeletion: (total, removedPageRows, query, reason) => this.adjustBrowserDeckTotalForLocalDeletion(
        total,
        removedPageRows,
        query,
        reason,
      ),
      adjustStatsForLocalDeletion: (stats) => this.adjustBrowserStatsForLocalDeletion(stats),
      scheduleSourceExistenceRefreshForCards: (cards, options) => this.scheduleSourceExistenceRefreshForBackendCards(cards, options),
      markRowsFromKnownSourceExistence: (rows) => this.markRowsFromKnownSourceExistence(rows),
      reuseBrowserRowProjections: (rows, reason) => this.reuseBrowserRowProjections(rows, reason),
      scheduleSourceExistenceSweep: () => this.scheduleSourceExistenceSweepFromBackend(),
      sourceExistenceBatchSize: SOURCE_EXISTENCE_BATCH_SIZE,
    });
    this.registerBrowserLocalDeletionObserver();
  }

  getUnifiedDataSourceManager(): IUnifiedDataSourceManagerFacade | null {
    return this.unifiedDataSourceManager;
  }

  getSiyuanApi(): BrowserSiyuanPort {
    return this.siyuanApi;
  }

  async refreshCdfLiveRelationOnOpen(card: FSRSCard | string): Promise<CdfLiveRelationRefreshResult> {
    if (!this.cdfLiveRelationRefresh) {
      return {
        attempted: false,
        card: null,
        updatedCard: null,
        actions: [],
        derivedRelationCount: 0,
        currentReviewDuplicateOutcome: null,
        reason: 'source-unavailable',
      };
    }
    return this.cdfLiveRelationRefresh.refreshCurrentCardOnOpen(card, {
      surface: 'browser-open',
    });
  }

  async reconcileCdfLiveRelationsInWriteRepairFlow(
    options: CdfLiveRelationWriteRepairOptions,
  ): Promise<CdfLiveRelationWriteRepairResult> {
    if (!this.cdfLiveRelationWriteRepair) {
      throw new Error('CDF_LIVE_RELATION_CREATE_UNAVAILABLE: Browser CDF write/repair creator is unavailable');
    }
    return this.cdfLiveRelationWriteRepair.reconcileWriteOrRepair(options);
  }

  async previewFullCdfLiveRelationRepair(
    options: CdfLiveRelationFullRepairDryRunOptions = {},
  ): Promise<CdfLiveRelationFullRepairDryRunResult> {
    if (!this.cdfLiveRelationWriteRepair) {
      throw new Error('CDF_LIVE_RELATION_REPAIR_PREVIEW_UNAVAILABLE: Browser CDF repair preview is unavailable');
    }
    return this.cdfLiveRelationWriteRepair.previewFullRepairDryRun(options);
  }

  async executeFullCdfLiveRelationRepair(
    options: CdfLiveRelationFullRepairExecuteOptions = {},
  ): Promise<CdfLiveRelationFullRepairExecuteResult> {
    if (!this.cdfLiveRelationWriteRepair) {
      throw new Error('CDF_LIVE_RELATION_REPAIR_EXECUTE_UNAVAILABLE: Browser CDF repair execute is unavailable');
    }
    return this.cdfLiveRelationWriteRepair.executeFullRepair(options);
  }

  async previewSingleSourceCdfLiveRelationRepair(
    options: CdfLiveRelationSingleSourceRepairOptions,
  ): Promise<CdfLiveRelationSingleSourceRepairResult> {
    if (!this.cdfLiveRelationWriteRepair) {
      throw new Error('CDF_LIVE_RELATION_SINGLE_SOURCE_REPAIR_PREVIEW_UNAVAILABLE: Browser CDF single-source repair preview is unavailable');
    }
    return this.cdfLiveRelationWriteRepair.previewSingleSourceRepairDryRun(options);
  }

  async executeSingleSourceCdfLiveRelationRepair(
    options: CdfLiveRelationSingleSourceRepairOptions,
  ): Promise<CdfLiveRelationSingleSourceRepairResult> {
    if (!this.cdfLiveRelationWriteRepair) {
      throw new Error('CDF_LIVE_RELATION_SINGLE_SOURCE_REPAIR_EXECUTE_UNAVAILABLE: Browser CDF single-source repair execute is unavailable');
    }
    return this.cdfLiveRelationWriteRepair.executeSingleSourceRepair(options);
  }

  getBrowserReadModel(): BrowserReadModel {
    if (this.browserReadModelFacade) {
      return this.browserReadModelFacade;
    }
    this.browserReadModelFacade = {
      page: (query, range) => this.readBrowserPage(query, range),
      matchedIds: (query, options) => this.readBrowserMatchedIds(query, options),
      rowsByIds: (ids, query) => this.readBrowserRowsByIds(ids, query),
      actionTargetsByIds: (ids, options) => this.readBrowserActionTargetsByIds(ids, options),
      documentCounts: (scope) => this.getBrowserDocumentCounts(scope),
    };
    return this.browserReadModelFacade;
  }

  private registerBrowserLocalDeletionObserver(): void {
    if (typeof this.unifiedDataSourceManager?.registerObserver !== 'function') {
      return;
    }
    this.unifiedDataSourceManager.registerObserver(this.browserLocalDeletionObserver);
  }

  private handleBrowserLocalDeletionEvent(event: DataChangeEvent): void {
    switch (event.type) {
      case 'card-deleted':
        this.recordLocallyDeletedBrowserIdentities(event.cardIds, event.blockIds);
        break;
      case 'card-created':
      case 'card-updated':
        this.clearLocallyDeletedBrowserIdentities(event.cardIds, event.blockIds);
        break;
    }
  }

  private normalizeBrowserLocalDeletionIds(values: readonly unknown[] | null | undefined): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return Array.from(new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));
  }

  private recordLocallyDeletedBrowserIdentities(
    cardIds: readonly unknown[] | null | undefined,
    blockIds: readonly unknown[] | null | undefined,
  ): void {
    for (const cardId of this.normalizeBrowserLocalDeletionIds(cardIds)) {
      this.locallyDeletedBrowserCardIds.add(cardId);
    }
    for (const blockId of this.normalizeBrowserLocalDeletionIds(blockIds)) {
      this.locallyDeletedBrowserBlockIds.add(blockId);
    }
    this.trimLocallyDeletedBrowserIdentities();
  }

  private clearLocallyDeletedBrowserIdentities(
    cardIds: readonly unknown[] | null | undefined,
    blockIds: readonly unknown[] | null | undefined,
  ): void {
    for (const cardId of this.normalizeBrowserLocalDeletionIds(cardIds)) {
      this.locallyDeletedBrowserCardIds.delete(cardId);
      this.locallyDeletedBrowserStatsIdentityIds.delete(cardId);
    }
    for (const blockId of this.normalizeBrowserLocalDeletionIds(blockIds)) {
      this.locallyDeletedBrowserBlockIds.delete(blockId);
      this.locallyDeletedBrowserStatsIdentityIds.delete(blockId);
    }
  }

  private trimLocallyDeletedBrowserIdentities(): void {
    while (
      this.locallyDeletedBrowserCardIds.size + this.locallyDeletedBrowserBlockIds.size
      > BROWSER_LOCAL_DELETION_IDENTITY_MAX_SIZE
    ) {
      const firstCardId = this.locallyDeletedBrowserCardIds.values().next().value as string | undefined;
      if (firstCardId) {
        this.locallyDeletedBrowserCardIds.delete(firstCardId);
        this.locallyDeletedBrowserStatsIdentityIds.delete(firstCardId);
        continue;
      }
      const firstBlockId = this.locallyDeletedBrowserBlockIds.values().next().value as string | undefined;
      if (!firstBlockId) {
        break;
      }
      this.locallyDeletedBrowserBlockIds.delete(firstBlockId);
      this.locallyDeletedBrowserStatsIdentityIds.delete(firstBlockId);
    }
  }

  private hasLocallyDeletedBrowserIdentities(): boolean {
    return this.locallyDeletedBrowserCardIds.size > 0 || this.locallyDeletedBrowserBlockIds.size > 0;
  }

  private getBrowserCardUniverseCardIdentity(row: BrowserCardUniverseIdentityLike): string {
    return String(row.fsrsCardId || row.cardId || row.id || row.riffCardId || '').trim();
  }

  private getBrowserCardUniverseBlockIdentity(row: BrowserCardUniverseIdentityLike): string {
    return String(row.blockId || '').trim();
  }

  private isLocallyDeletedBrowserRow(row: BrowserCardUniverseIdentityLike): boolean {
    const cardId = this.getBrowserCardUniverseCardIdentity(row);
    if (cardId && this.locallyDeletedBrowserCardIds.has(cardId)) {
      return true;
    }
    const blockId = this.getBrowserCardUniverseBlockIdentity(row);
    return Boolean(blockId && this.locallyDeletedBrowserBlockIds.has(blockId));
  }

  private rememberLocallyDeletedBrowserStatsIdentity(row: BrowserCardUniverseIdentityLike): void {
    const cardId = this.getBrowserCardUniverseCardIdentity(row);
    const blockId = this.getBrowserCardUniverseBlockIdentity(row);
    const identity = cardId || blockId;
    if (identity) {
      this.locallyDeletedBrowserStatsIdentityIds.add(identity);
    }
  }

  private filterLocallyDeletedBrowserRows<TRow extends BrowserCardUniverseIdentityLike>(
    rows: TRow[],
    reason: string,
  ): TRow[] {
    if (!this.hasLocallyDeletedBrowserIdentities() || rows.length === 0) {
      return rows;
    }

    const visibleRows: TRow[] = [];
    let removed = 0;
    for (const row of rows) {
      if (this.isLocallyDeletedBrowserRow(row)) {
        removed += 1;
        this.rememberLocallyDeletedBrowserStatsIdentity(row);
        continue;
      }
      visibleRows.push(row);
    }

    if (removed > 0) {
      logger.debug('Suppressed locally deleted Browser deck rows', {
        reason,
        removed,
        remaining: visibleRows.length,
      });
    }

    return visibleRows;
  }

  private filterLocallyDeletedBrowserIds(ids: string[], reason: string): string[] {
    if (!this.hasLocallyDeletedBrowserIdentities() || ids.length === 0) {
      return ids;
    }

    const visibleIds = ids.filter((id) => {
      const normalized = String(id || '').trim();
      return normalized
        && !this.locallyDeletedBrowserCardIds.has(normalized)
        && !this.locallyDeletedBrowserBlockIds.has(normalized);
    });

    if (visibleIds.length !== ids.length) {
      logger.debug('Suppressed locally deleted Browser deck ids', {
        reason,
        removed: ids.length - visibleIds.length,
        remaining: visibleIds.length,
      });
    }

    return visibleIds;
  }

  private adjustBrowserDeckTotalForLocalDeletion(
    total: number,
    removedPageRows: number,
    query: BrowserDeckSnapshotQuery,
    reason: string,
  ): number {
    void query;
    void reason;
    const normalizedTotal = Math.max(0, Number(total) || 0);
    const removed = Math.max(0, Number(removedPageRows) || 0);
    return Math.max(0, normalizedTotal - removed);
  }

  private adjustBrowserStatsForLocalDeletion(stats: BrowserStats): BrowserStats {
    const suppressedTotal = this.locallyDeletedBrowserStatsIdentityIds.size;
    if (suppressedTotal <= 0) {
      return stats;
    }
    return {
      ...stats,
      totalCards: Math.max(0, Number(stats.totalCards) - suppressedTotal),
    };
  }

  private async readBrowserPage(
    readQuery: BrowserReadModelQuery,
    range: BrowserDeckPageRequest,
  ): Promise<BrowserReadModelPageResponse> {
    if (readQuery.source === 'deck') {
      const page = await this.getDeckPage(readQuery.query, range);
      return {
        status: 'ready',
        rows: page.rows,
        total: page.total,
        ...this.buildDeckReadModelMetadata(readQuery.query, page.generation),
      };
    }

    if (readQuery.source === 'queue') {
      try {
        const snapshot = await this.getQueueQuerySnapshot(readQuery.query);
        const startRow = Math.max(0, Math.floor(Number(range.startRow) || 0));
        const endRow = Math.max(startRow, Math.floor(Number(range.endRow) || startRow));
        const ids = snapshot.rows.slice(startRow, endRow).map((row) => row.id);
        const rows = await this.getQueueRowsByIds(readQuery.query.queueId, ids);
        return {
          status: 'ready',
          rows,
          total: snapshot.total,
          readOwner: snapshot.readOwner ?? {
            kind: 'queue-projection',
            queueId: readQuery.query.queueId,
            projectionBacked: true,
          },
          queryFingerprint: snapshot.queryFingerprint ?? this.buildReadModelFingerprint({
            source: 'queue',
            query: readQuery.query,
          }),
          generation: snapshot.generation ?? null,
          diagnostics: snapshot.diagnostics,
        };
      } catch (error) {
        return this.buildQueueReadModelUnavailablePage(readQuery.query, error);
      }
    }

    return this.readAdvancedSqlPage(readQuery, range);
  }

  private async readBrowserMatchedIds(
    readQuery: BrowserReadModelQuery,
    options: BrowserReadModelMatchedIdsOptions = {},
  ): Promise<string[]> {
    if (readQuery.source === 'deck') {
      return this.getDeckMatchedIds({
        ...readQuery.query,
        fullUniverseReason: options.reason ?? readQuery.query.fullUniverseReason ?? 'matched-ids',
      });
    }
    if (readQuery.source === 'queue') {
      const snapshot = await this.getQueueQuerySnapshot({
        ...readQuery.query,
        forceRefresh: true,
      });
      return snapshot.rows.map((row) => row.id);
    }
    return this.readAdvancedSqlMatchedIds(readQuery.statement);
  }

  private async readBrowserRowsByIds(
    ids: string[],
    query: BrowserReadModelRowsByIdsQuery = { source: 'deck' },
  ): Promise<BrowserCard[]> {
    if (query.source === 'queue') {
      return this.getQueueRowsByIds(query.queueId, ids);
    }
    return this.getDeckRowsByIds(ids);
  }

  private async readBrowserActionTargetsByIds(
    ids: string[],
    options: BrowserReadModelActionTargetsByIdsOptions,
  ) {
    const rows = await this.readBrowserRowsByIds(ids, options);
    return rows.map((row) => toBrowserReadModelActionTarget(row));
  }

  private buildDeckReadModelMetadata(
    query: BrowserDeckSnapshotQuery,
    generation?: number | null,
  ): BrowserReadModelSnapshotMetadata {
    return {
      readOwner: {
        kind: 'sql-card-universe',
      },
      queryFingerprint: this.buildReadModelFingerprint({
        source: 'deck',
        query,
      }),
      generation: generation ?? 0,
    };
  }

  private buildAdvancedSqlUnavailableMetadata(statement: string): BrowserReadModelSnapshotMetadata {
    return {
      readOwner: {
        kind: 'block-id-intersection',
        reason: 'advanced-sql-query-source',
      },
      queryFingerprint: this.buildReadModelFingerprint({
        source: 'advanced-sql',
        statement,
      }),
      generation: null,
    };
  }

  private buildQueueReadModelUnavailablePage(
    query: Extract<BrowserReadModelQuery, { source: 'queue' }>['query'],
    error: unknown,
  ): BrowserReadModelPageResponse {
    const projectionError = error as QueueProjectionBrowserReadModelError | null | undefined;
    const status = this.resolveQueueBrowserReadState(error);
    const reason = error instanceof Error ? error.message : String(error);
    const diagnosticKind = projectionError?.browserReadModelDiagnosticKind
      ?? (status === 'unavailable' ? 'owner-unavailable' : 'refresh-required');
    const rowIds = Array.isArray(projectionError?.browserReadModelRowIds)
      ? projectionError.browserReadModelRowIds
      : this.extractQueueProjectionErrorRowIds(reason);
    const diagnostics: BrowserReadModelDiagnostic[] = [{
      kind: diagnosticKind,
      message: reason,
      ...(rowIds.length > 0 ? { rowIds } : {}),
    }];
    const queueType = resolveQueueTypeForBrowserQueueId(query.queueId);
    const errorReadOwner = projectionError?.browserReadOwner;

    return {
      status,
      rows: [],
      total: 0,
      reason,
      readOwner: {
        kind: 'queue-projection',
        queueId: query.queueId,
        queueType: queueType ?? undefined,
        projectionBacked: true,
        readPath: 'backend-projection',
        ...errorReadOwner,
        state: errorReadOwner?.state ?? (status === 'unavailable' ? 'projection-unavailable' : 'backend-projection'),
        reason: errorReadOwner?.reason ?? (status === 'repair-required' ? 'refresh-required' : null),
        unavailableReason: errorReadOwner?.unavailableReason ?? (status === 'unavailable' ? reason : null),
      },
      queryFingerprint: this.buildReadModelFingerprint({
        source: 'queue',
        query,
      }),
      generation: typeof projectionError?.browserReadModelGeneration === 'number'
        ? projectionError.browserReadModelGeneration
        : null,
      diagnostics,
    };
  }

  private resolveQueueBrowserReadState(error: unknown): Exclude<BrowserReadModelReadState, 'ready'> {
    const tagged = (error as QueueProjectionBrowserReadModelError | null | undefined)?.browserReadModelState;
    if (tagged === 'preparing' || tagged === 'repair-required' || tagged === 'unavailable') {
      return tagged;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('QUEUE_PROJECTION_REPAIR_REQUIRED') || message.includes('missed requested ids')) {
      return 'repair-required';
    }
    if (message.includes('QUEUE_PROJECTION_NOT_READY') || message.includes('Browser projection snapshot unavailable')) {
      return 'preparing';
    }
    return 'unavailable';
  }

  private extractQueueProjectionErrorRowIds(reason: string): string[] {
    const match = /\(([^()]+)\)\s*$/.exec(reason);
    if (!match) {
      return [];
    }
    return match[1]
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  private async readAdvancedSqlPage(
    readQuery: Extract<BrowserReadModelQuery, { source: 'advanced-sql' }>,
    range: BrowserDeckPageRequest,
  ): Promise<BrowserReadModelPageResponse> {
    const metadata = this.buildAdvancedSqlUnavailableMetadata(readQuery.statement);
    try {
      const matchedIds = await this.readAdvancedSqlMatchedIds(readQuery.statement);
      const startRow = Math.max(0, Math.floor(Number(range.startRow) || 0));
      const endRow = Math.max(startRow, Math.floor(Number(range.endRow) || startRow));
      const pageIds = matchedIds.slice(startRow, endRow);
      const rows = pageIds.length > 0
        ? await this.readBrowserRowsByIds(pageIds, { source: 'deck' })
        : [];
      return {
        status: 'ready',
        rows,
        total: matchedIds.length,
        ...metadata,
      };
    } catch (error) {
      return {
        status: 'unavailable',
        rows: [],
        total: 0,
        reason: error instanceof Error ? error.message : String(error),
        ...metadata,
        diagnostics: [{
          kind: 'owner-unavailable',
          message: 'Advanced SQL Browser read source failed behind application ownership',
        }],
      };
    }
  }

  private async readAdvancedSqlMatchedIds(statement: string): Promise<string[]> {
    if (!this.browserAdvancedSqlQuerySource) {
      throw new Error('BROWSER_ADVANCED_SQL_QUERY_SOURCE_UNAVAILABLE');
    }
    return this.browserAdvancedSqlQuerySource.matchedIds(statement);
  }

  private buildReadModelFingerprint(value: unknown): string {
    return JSON.stringify(normalizeSignatureValue(value));
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

  async getBrowserDocumentCounts(scope: BrowserDocumentCountsScope): Promise<BrowserDocumentCountsResult> {
    return this.browserCardUniverseReadModule.readDocumentCounts(scope);
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

  async ensureQueueReadModelReady(request: QueueProjectionReadinessRequest): Promise<QueueProjectionReadiness> {
    const queueType = resolveQueueTypeForBrowserQueueId(resolveBrowserQueueIdForQueueType(request.queueType as QueueType) ?? request.queueType);
    if (!queueType || !this.unifiedDataSourceManager) {
      return {
        status: 'unavailable',
        queueId: String(request.queueType || ''),
        policyId: 'browser-queue-read-model',
        cause: 'invalid_queue',
        reason: `Browser queue read model is unavailable for ${String(request.queueType || '')}`,
        recoverable: false,
      };
    }
    if (typeof this.unifiedDataSourceManager.ensureQueueProjectionReady !== 'function') {
      return {
        status: 'unavailable',
        queueId: queueType,
        policyId: 'browser-queue-read-model',
        cause: 'backend_unavailable',
        reason: `Browser queue read model readiness is unavailable for ${queueType}`,
        recoverable: true,
        retryAfterMs: 300,
      };
    }
    try {
      return await this.unifiedDataSourceManager.ensureQueueProjectionReady(
        this.buildSubmittedQueueProjectionReadinessRequest(queueType, request),
      );
    } catch (error) {
      return {
        status: 'unavailable',
        queueId: queueType,
        policyId: 'browser-queue-read-model',
        cause: 'backend_unavailable',
        reason: error instanceof Error ? error.message : String(error),
        recoverable: true,
        retryAfterMs: 300,
      };
    }
  }

  async repairQueueReadModel(request: QueueProjectionReadinessRequest): Promise<boolean> {
    const queueType = resolveQueueTypeForBrowserQueueId(resolveBrowserQueueIdForQueueType(request.queueType as QueueType) ?? request.queueType);
    if (!queueType || !this.unifiedDataSourceManager) {
      return false;
    }
    if (typeof this.unifiedDataSourceManager.materializeQueueProjection !== 'function') {
      return false;
    }

    const result = await this.unifiedDataSourceManager.materializeQueueProjection(
      queueType,
      null,
      {
        readinessRequest: this.buildSubmittedQueueProjectionReadinessRequest(queueType, request),
        reason: 'browser-warmup-repair',
      },
    );
    return result?.status === 'ready';
  }

  private buildSubmittedQueueProjectionReadinessRequest(
    queueType: QueueType,
    request: QueueProjectionReadinessRequest,
  ): QueueProjectionReadinessRequest {
    const base: QueueProjectionReadinessRequest = {
      ...request,
      queueType,
    };
    if (queueType !== QueueType.FilterGroup || !this.unifiedDataSourceManager) {
      return base;
    }

    const queue = this.unifiedDataSourceManager.getQueue(QueueType.FilterGroup);
    if (!hasFilterGroupSessionSnapshotProvider(queue)) {
      return base;
    }

    const snapshot = queue.serializeSessionSnapshot();
    const rollback = snapshot.rollbackSnapshot;
    const snapshotCustomOrder = normalizeOptionalStringList(snapshot.visibleCardIds)
      ?? normalizeOptionalStringList(rollback?.customOrder)
      ?? [];

    return {
      ...base,
      filterHash: base.filterHash ?? this.buildReadModelFingerprint(snapshot.filter ?? {}),
      manualCardIds: base.manualCardIds ?? normalizeOptionalStringList(rollback?.manualCards) ?? [],
      temporaryBlacklistIds: base.temporaryBlacklistIds ?? normalizeOptionalStringList(rollback?.temporaryBlacklist) ?? [],
      customOrder: base.customOrder ?? snapshotCustomOrder,
      commitPolicy: base.commitPolicy ?? 'preview-only',
    };
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

    if (isNeuralBrowserQueue(queueId)) {
      try {
        return Math.max(0, await queue.getSize());
      } catch (error) {
        logger.error('QUEUE_COUNT_UNAVAILABLE: failed to read neural-roam queue size:', {
          queueId,
          error,
        });
        throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} queue size unavailable`);
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
      const visibleTotal = Math.max(0, Number(snapshot.total) || 0);
      const counterSnapshot = await queue.getCounterSnapshot(false);
      const counterTotal = counterSnapshot.total == null
        ? Number(counterSnapshot.remaining)
        : Number(counterSnapshot.total);
      const normalizedCounterTotal = Math.max(0, Number.isFinite(counterTotal) ? counterTotal : 0);
      return normalizedCounterTotal === visibleTotal
        ? normalizedCounterTotal
        : visibleTotal;
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
          if (!forceRefresh) {
            throw error;
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
      affectedQueueIds.map(async (queueId) => {
        try {
          return [
            queueId,
            await this.readSingleQueueCount(manager, queueId, Boolean(request.forceRefresh)),
          ] as const;
        } catch (error) {
          if (this.isTransientQueueCountUnavailableError(error)) {
            logger.info('QUEUE_COUNT_UNAVAILABLE: passive queue count unavailable; keeping empty count until projection is readable', {
              queueId,
              error: error instanceof Error ? error.message : String(error),
            });
            return [queueId, null] as const;
          }
          throw error;
        }
      }),
    );

    const counts = { ...EMPTY_QUEUE_COUNTS };
    for (const [queueId, value] of this.queueCountCache.entries()) {
      counts[queueId] = value.value;
    }
    for (const [queueId, value] of entries) {
      if (value != null) {
        counts[queueId] = value;
      }
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
