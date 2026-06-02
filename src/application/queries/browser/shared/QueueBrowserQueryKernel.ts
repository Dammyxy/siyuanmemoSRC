import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type {
  IReviewQueue,
  IUnifiedDataSourceManagerFacade,
  QueueProjectionSnapshot,
  QueueProjectionRolloutDiagnostic,
  QueueType,
} from '@/types/unified-data-source';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { FSRSCard } from '@/types/card';
import {
  isRetrievalBrowserQueue,
  resolveBrowserQueueIdentity,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import { createLogger } from '@/utils/logger';
import type { BrowserCard } from '@/types/browser';
import {
  applyQueueFilters,
  applyQueueFiltersToSnapshotRows,
  sortQueueSnapshotRows,
  sortBrowserRows,
  type QuerySecondaryField,
} from './BrowserRowUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import type {
  QueueBrowserLiteRow,
  QueueBrowserSnapshotQuery,
  QueueBrowserSnapshotResult,
} from '../queue-browser-query';
import {
  type BrowserReadModelDiagnostic,
  type BrowserReadOwnerMetadata,
  type BrowserReadModelReadState,
  toBrowserCardReadModelSource,
  toBrowserReadModelLiteIdentity,
  toQueueSnapshotReadModelSource,
} from '../browser-read-model';
import { markMissingBlockRows } from './MissingBlockMarker';
import {
  markRowsFromSourceExistenceCache,
  scheduleSourceExistenceRefresh,
} from './SourceExistenceCache';
import { resolveQueueProjectionReadMode } from '@/core/queue/domain/queueProjectionReadPolicy';

const logger = createLogger('QueueBrowserQueryKernel');

type QueueReadModelRoute = {
  queue: IReviewQueue;
  queueType: QueueType;
  queueId: BrowserQueueId;
  projectionBacked: boolean;
  requiresManagerProjectionRead: boolean;
  readOwner: BrowserReadOwnerMetadata;
};

type QueueProjectionFreshnessEvidence = {
  checkedAt?: unknown;
  totalRows?: unknown;
  freshRows?: unknown;
  staleRows?: unknown;
  missingRows?: unknown;
  staleCardIds?: unknown;
  missingCardIds?: unknown;
};

type QueueProjectionSnapshotReadModelState = QueueProjectionSnapshot & {
  status?: unknown;
  freshness?: QueueProjectionFreshnessEvidence | null;
  stale?: unknown;
};

export type QueueProjectionBrowserReadModelError = Error & {
  browserReadModelState?: Exclude<BrowserReadModelReadState, 'ready'>;
  browserReadModelDiagnosticKind?: BrowserReadModelDiagnostic['kind'];
  browserReadModelRowIds?: string[];
  browserReadModelGeneration?: number | null;
};

function createQueueProjectionBrowserReadError(
  message: string,
  state: Exclude<BrowserReadModelReadState, 'ready'>,
  diagnosticKind: BrowserReadModelDiagnostic['kind'],
  options: {
    rowIds?: string[];
    generation?: number | null;
  } = {},
): QueueProjectionBrowserReadModelError {
  const error = new Error(message) as QueueProjectionBrowserReadModelError;
  error.browserReadModelState = state;
  error.browserReadModelDiagnosticKind = diagnosticKind;
  error.browserReadModelRowIds = options.rowIds;
  error.browserReadModelGeneration = options.generation ?? null;
  return error;
}

export class QueueBrowserQueryKernel {
  constructor(
    private readonly manager: IUnifiedDataSourceManagerFacade,
    private readonly siyuanApi: Pick<QuerySiyuanPort, 'sql'> | null = null,
    private readonly sourceExistencePort: BrowserDeckReadPort | null = null,
  ) {}

  async buildSnapshot(query: QueueBrowserSnapshotQuery): Promise<QueueBrowserSnapshotResult> {
    const route = this.resolveQueueRoute(query.queueId);
    if (route.projectionBacked) {
      return this.buildProjectionSnapshot(query, route);
    }

    const rows = await this.readLocalBrowserQueueRows(route);
    const filteredRows = this.applyQueueBrowserFilters(rows, query);
    const sortedRows = sortBrowserRows(filteredRows, query.sortModel || []);

    logger.debug('Queue browser snapshot built', {
      queueId: query.queueId,
      readOwner: route.readOwner.kind,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      sortedRows: sortedRows.length,
    });

    return {
      rows: sortedRows.map((row) => this.toLiteRowFromBrowserCard(row)),
      total: sortedRows.length,
      readOwner: route.readOwner,
      queryFingerprint: this.buildQueueQueryFingerprint(query, route.readOwner),
      generation: null,
    };
  }

  async getQueueRowsByIds(queueId: BrowserQueueId, ids: string[]) {
    const orderedIds = ids
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (orderedIds.length === 0) {
      return [];
    }

    const route = this.resolveQueueRoute(queueId);
    if (route.projectionBacked) {
      const snapshotRows = await this.readProjectionSnapshotRows(route, false);
      const snapshotRowById = this.buildSnapshotRowLookup(snapshotRows);
      const rows = await this.readProjectionCardsBySnapshotIds(route, orderedIds, false);
      const browserRows = await this.markMissingRows(rows.map((card) => {
        const projectionRow = snapshotRowById.get(String(card.id || '').trim())
          || snapshotRowById.get(String(card.riffCardId || '').trim())
          || snapshotRowById.get(String(card.blockId || '').trim());
        return mapQueueFsrsCardToBrowserCard(card, {
          firstReviewMode: isRetrievalBrowserQueue(queueId) ? 'created-or-last' : 'last-review',
          queueIndex: projectionRow?.queueIndex,
          blockType: projectionRow?.blockType,
        });
      }));
      const rowById = new Map<string, BrowserCard>();
      for (const row of browserRows) {
        const id = String(row.id || '').trim();
        const fsrsCardId = String(row.fsrsCardId || '').trim();
        const blockId = String(row.blockId || '').trim();
        if (id) {
          rowById.set(id, row);
        }
        if (fsrsCardId) {
          rowById.set(fsrsCardId, row);
        }
        if (blockId) {
          rowById.set(blockId, row);
        }
      }
      const missingIds = orderedIds.filter((id) => !rowById.has(id));
      if (missingIds.length > 0) {
        throw createQueueProjectionBrowserReadError(
          `QUEUE_PROJECTION_UNAVAILABLE: ${queueId} projection row hydration missed requested ids (${missingIds.join(', ')})`,
          'repair-required',
          'missing-row',
          { rowIds: missingIds },
        );
      }
      return orderedIds
        .map((id) => rowById.get(id))
        .filter((row): row is BrowserCard => Boolean(row));
    }

    const rows = await this.readLocalBrowserQueueRows(route);
    const rowById = new Map<string, BrowserCard>();
    for (const row of rows) {
      const snapshotId = String(row.id || '').trim();
      const fsrsCardId = String(row.fsrsCardId || row.id || '').trim();
      if (snapshotId) {
        rowById.set(snapshotId, row);
      }
      if (fsrsCardId) {
        rowById.set(fsrsCardId, row);
      }
    }

    return orderedIds
      .map((id) => rowById.get(id))
      .filter((row): row is BrowserCard => Boolean(row));
  }

  private resolveQueueRoute(queueId: BrowserQueueId): QueueReadModelRoute {
    const identity = resolveBrowserQueueIdentity(queueId);
    if (!identity.ok) {
      throw new Error(`Queue snapshot kernel does not support queueId=${queueId}`);
    }

    const queue = this.manager.getQueue(identity.queueType);
    const explicitMode = resolveQueueProjectionReadMode(queue);
    const diagnostic = this.resolveQueueProjectionDiagnostic(identity.queueType);
    const explicitLocal = explicitMode === 'local-queue';
    const explicitBackendProjection = explicitMode === 'backend-projection';
    const diagnosticProjectionBacked = !explicitLocal
      && diagnostic?.readPath === 'backend-projection'
      && diagnostic?.projectionBacked === true;
    const diagnosticExplicitLocal = diagnostic?.readPath === 'existing-queue-strategy'
      && diagnostic?.projectionBacked === false;
    const projectionBacked = explicitBackendProjection
      || diagnosticProjectionBacked
      || (!explicitLocal && !diagnosticExplicitLocal);
    const readOwner = this.buildQueueReadOwner({
      queueId: identity.queueId,
      queueType: identity.queueType,
      projectionBacked,
      explicitMode,
      diagnostic,
    });

    return {
      queue,
      queueId: identity.queueId,
      queueType: identity.queueType,
      projectionBacked,
      requiresManagerProjectionRead: projectionBacked && explicitMode !== 'backend-projection',
      readOwner,
    };
  }

  private resolveQuerySecondaryField(queueId: BrowserQueueId): QuerySecondaryField {
    if (queueId === 'incremental-learning') {
      return 'fullContent';
    }

    return 'headline';
  }

  private async buildProjectionSnapshot(
    query: QueueBrowserSnapshotQuery,
    route: QueueReadModelRoute,
  ): Promise<QueueBrowserSnapshotResult> {
    const projectionSnapshot = await this.readProjectionSnapshot(route, Boolean(query.forceRefresh));
    const rows = projectionSnapshot.rows;
    const markedRows = await this.markSnapshotMissingRows(rows);
    const filteredRows = applyQueueFiltersToSnapshotRows(
      markedRows,
      {
        docId: query.docId,
        scopeDocIds: query.scopeDocIds,
        preset: query.preset,
        queryText: query.searchText,
        cardType: query.cardType,
      },
      this.resolveQuerySecondaryField(query.queueId),
    );
    const sortedRows = sortQueueSnapshotRows(filteredRows, query.sortModel || []);

    logger.debug('Queue browser projection snapshot built', {
      queueId: query.queueId,
      readOwner: route.readOwner.kind,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      sortedRows: sortedRows.length,
    });

    return {
      rows: sortedRows.map((row) => this.toLiteRowFromSnapshotRow(row)),
      total: sortedRows.length,
      readOwner: route.readOwner,
      queryFingerprint: this.buildQueueQueryFingerprint(query, route.readOwner),
      generation: projectionSnapshot.generation,
    };
  }

  private async readProjectionSnapshot(
    route: QueueReadModelRoute,
    forceRefresh: boolean,
  ): Promise<QueueProjectionSnapshot> {
    if (typeof this.manager.readQueueProjectionSnapshot === 'function') {
      const snapshot = await this.manager.readQueueProjectionSnapshot(route.queueType, { forceRefresh });
      if (snapshot) {
        this.assertProjectionSnapshotReadable(route, snapshot);
        return snapshot;
      }
      throw createQueueProjectionBrowserReadError(
        `QUEUE_PROJECTION_UNAVAILABLE: ${route.queueId} Browser projection snapshot unavailable`,
        'preparing',
        'refresh-required',
      );
    }

    if (route.requiresManagerProjectionRead) {
      throw createQueueProjectionBrowserReadError(
        `QUEUE_PROJECTION_UNAVAILABLE: ${route.queueId} Browser projection snapshot reader unavailable`,
        'unavailable',
        'owner-unavailable',
      );
    }

    return {
      queueType: route.queueType,
      policyHash: route.readOwner.reason ?? `${route.queueType}:queue-snapshot`,
      generation: null,
      rows: await route.queue.getSnapshotRows(forceRefresh),
      counters: null,
    };
  }

  private async readProjectionSnapshotRows(
    route: QueueReadModelRoute,
    forceRefresh: boolean,
  ): Promise<QueueSnapshotRow[]> {
    return (await this.readProjectionSnapshot(route, forceRefresh)).rows;
  }

  private assertProjectionSnapshotReadable(
    route: QueueReadModelRoute,
    snapshot: QueueProjectionSnapshot,
  ): void {
    const stateSnapshot = snapshot as QueueProjectionSnapshotReadModelState;
    const status = typeof stateSnapshot.status === 'string' ? stateSnapshot.status : 'ready';
    if (status === 'unavailable') {
      throw createQueueProjectionBrowserReadError(
        `QUEUE_PROJECTION_UNAVAILABLE: ${route.queueId} Browser projection snapshot unavailable`,
        'unavailable',
        'owner-unavailable',
        { generation: normalizeProjectionGeneration(snapshot.generation) },
      );
    }
    if (status !== 'ready') {
      throw createQueueProjectionBrowserReadError(
        `QUEUE_PROJECTION_NOT_READY: ${route.queueId} Browser projection snapshot ${status}`,
        'preparing',
        'refresh-required',
        { generation: normalizeProjectionGeneration(snapshot.generation) },
      );
    }

    const freshness = stateSnapshot.freshness;
    const staleRows = Math.max(0, Number(freshness?.staleRows) || 0);
    const missingRows = Math.max(0, Number(freshness?.missingRows) || 0);
    if (stateSnapshot.stale === true || staleRows > 0 || missingRows > 0) {
      const rowIds = normalizeProjectionFreshnessRowIds(freshness);
      throw createQueueProjectionBrowserReadError(
        `QUEUE_PROJECTION_REPAIR_REQUIRED: ${route.queueId} projection_stale`,
        'repair-required',
        'refresh-required',
        {
          rowIds,
          generation: normalizeProjectionGeneration(snapshot.generation),
        },
      );
    }
  }

  private async readProjectionCardsBySnapshotIds(
    route: QueueReadModelRoute,
    orderedIds: string[],
    forceRefresh: boolean,
  ): Promise<FSRSCard[]> {
    if (typeof this.manager.getQueueProjectionCardsBySnapshotIds === 'function') {
      return this.manager.getQueueProjectionCardsBySnapshotIds(route.queueType, orderedIds, { forceRefresh });
    }

    if (route.requiresManagerProjectionRead) {
      throw createQueueProjectionBrowserReadError(
        `QUEUE_PROJECTION_UNAVAILABLE: ${route.queueId} Browser projection row hydration unavailable`,
        'unavailable',
        'owner-unavailable',
      );
    }

    return route.queue.getCardsBySnapshotIds(orderedIds, forceRefresh);
  }

  private async readLocalBrowserQueueRows(route: QueueReadModelRoute): Promise<BrowserCard[]> {
    const cards = await route.queue.getCards();
    const rows = cards.map((card, index) => mapQueueFsrsCardToBrowserCard(card, {
      firstReviewMode: isRetrievalBrowserQueue(route.queueId) ? 'created-or-last' : 'last-review',
      queueIndex: index + 1,
    }));
    return this.markMissingRows(rows);
  }

  private async markSnapshotMissingRows(rows: QueueSnapshotRow[]): Promise<QueueSnapshotRow[]> {
    if (this.sourceExistencePort?.getSourceExistenceByBlockIds) {
      scheduleSourceExistenceRefresh(
        this.sourceExistencePort,
        this.siyuanApi,
        rows.map((row) => row.blockId),
      );
      return markRowsFromSourceExistenceCache(rows, this.sourceExistencePort);
    }
    if (!this.siyuanApi) {
      return rows;
    }
    return markMissingBlockRows(rows, this.siyuanApi);
  }

  private buildSnapshotRowLookup(rows: QueueSnapshotRow[]): Map<string, QueueSnapshotRow> {
    const rowById = new Map<string, QueueSnapshotRow>();
    for (const row of rows) {
      const rowId = String(row.id || '').trim();
      const fsrsCardId = String(row.fsrsCardId || '').trim();
      const blockId = String(row.blockId || '').trim();
      if (rowId) {
        rowById.set(rowId, row);
      }
      if (fsrsCardId) {
        rowById.set(fsrsCardId, row);
      }
      if (blockId) {
        rowById.set(blockId, row);
      }
    }
    return rowById;
  }

  private async markMissingRows(rows: BrowserCard[]): Promise<BrowserCard[]> {
    if (this.sourceExistencePort?.getSourceExistenceByBlockIds) {
      scheduleSourceExistenceRefresh(
        this.sourceExistencePort,
        this.siyuanApi,
        rows.map((row) => row.blockId),
      );
      return markRowsFromSourceExistenceCache(rows, this.sourceExistencePort);
    }
    if (!this.siyuanApi) {
      return rows;
    }
    return markMissingBlockRows(rows, this.siyuanApi);
  }

  private applyQueueBrowserFilters(
    rows: BrowserCard[],
    query: QueueBrowserSnapshotQuery,
  ): BrowserCard[] {
    return applyQueueFilters(
      rows,
      {
        docId: query.docId,
        scopeDocIds: query.scopeDocIds,
        preset: query.preset,
        queryText: query.searchText,
        cardType: query.cardType,
      },
      this.resolveQuerySecondaryField(query.queueId),
    );
  }

  private resolveQueueProjectionDiagnostic(queueType: QueueType): QueueProjectionRolloutDiagnostic | null {
    const diagnostics = this.manager.getQueueProjectionRolloutDiagnostics?.(queueType);
    return Array.isArray(diagnostics) ? diagnostics[0] ?? null : null;
  }

  private buildQueueReadOwner(input: {
    queueId: BrowserQueueId;
    queueType: QueueType;
    projectionBacked: boolean;
    explicitMode: ReturnType<typeof resolveQueueProjectionReadMode>;
    diagnostic: QueueProjectionRolloutDiagnostic | null;
  }): BrowserReadOwnerMetadata {
    if (input.projectionBacked) {
      return {
        kind: 'queue-projection',
        queueId: input.queueId,
        queueType: input.queueType,
        projectionBacked: true,
        readPath: 'backend-projection',
        state: input.diagnostic?.state ?? 'backend-projection',
        reason: input.diagnostic?.reason ?? null,
        unavailableReason: input.diagnostic?.unavailableReason ?? null,
      };
    }

    return {
      kind: 'explicit-local-queue',
      queueId: input.queueId,
      queueType: input.queueType,
      projectionBacked: false,
      readPath: input.explicitMode ?? input.diagnostic?.readPath ?? 'local-queue',
      state: input.explicitMode ?? input.diagnostic?.state ?? 'local-queue',
      reason: input.diagnostic?.reason ?? null,
      unavailableReason: input.diagnostic?.unavailableReason ?? null,
    };
  }

  private buildQueueQueryFingerprint(
    query: QueueBrowserSnapshotQuery,
    readOwner: BrowserReadOwnerMetadata,
  ): string {
    return JSON.stringify({
      owner: readOwner,
      queueId: query.queueId,
      preset: query.preset ?? null,
      searchText: query.searchText ?? '',
      docId: query.docId ?? null,
      scopeDocIds: query.scopeDocIds ?? null,
      cardType: query.cardType ?? null,
      sortModel: query.sortModel ?? [],
      forceRefresh: query.forceRefresh === true,
    });
  }

  private toLiteRowFromBrowserCard(row: BrowserCard): QueueBrowserLiteRow {
    return toBrowserReadModelLiteIdentity(toBrowserCardReadModelSource(row));
  }

  private toLiteRowFromSnapshotRow(row: QueueSnapshotRow): QueueBrowserLiteRow {
    return toBrowserReadModelLiteIdentity(toQueueSnapshotReadModelSource(row));
  }
}

function normalizeProjectionGeneration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeProjectionFreshnessRowIds(
  freshness: QueueProjectionFreshnessEvidence | null | undefined,
): string[] {
  const ids = [
    ...(Array.isArray(freshness?.staleCardIds) ? freshness.staleCardIds : []),
    ...(Array.isArray(freshness?.missingCardIds) ? freshness.missingCardIds : []),
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}
