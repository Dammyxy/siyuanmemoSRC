import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import {
  isRetrievalBrowserQueue,
  resolveBrowserQueueIdentity,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import { createLogger } from '@/utils/logger';
import type { BrowserCard } from '@/types/browser';
import {
  applyQueueFilters,
  sortBrowserRows,
  type QuerySecondaryField,
} from './BrowserRowUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import type {
  QueueBrowserLiteRow,
  QueueBrowserSnapshotQuery,
  QueueBrowserSnapshotResult,
} from '../queue-browser-query';
import { markMissingBlockRows } from './MissingBlockMarker';
import {
  markRowsFromSourceExistenceCache,
  scheduleSourceExistenceRefresh,
} from './SourceExistenceCache';

const logger = createLogger('QueueBrowserQueryKernel');

export class QueueBrowserQueryKernel {
  constructor(
    private readonly manager: IUnifiedDataSourceManagerFacade,
    private readonly siyuanApi: Pick<QuerySiyuanPort, 'sql'> | null = null,
    private readonly sourceExistencePort: BrowserDeckReadPort | null = null,
  ) {}

  async buildSnapshot(query: QueueBrowserSnapshotQuery): Promise<QueueBrowserSnapshotResult> {
    const rows = await this.readBrowserQueueRows(query.queueId);
    const filteredRows = applyQueueFilters(
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
    const sortedRows = sortBrowserRows(filteredRows, query.sortModel || []);

    logger.debug('Queue browser snapshot built', {
      queueId: query.queueId,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      sortedRows: sortedRows.length,
    });

    return {
      rows: sortedRows.map((row) => this.toLiteRow(row)),
      total: sortedRows.length,
    };
  }

  async getQueueRowsByIds(queueId: BrowserQueueId, ids: string[]) {
    const orderedIds = ids
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (orderedIds.length === 0) {
      return [];
    }

    const rows = await this.readBrowserQueueRows(queueId);
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

  private resolveQueue(queueId: BrowserQueueId) {
    const identity = resolveBrowserQueueIdentity(queueId);
    if (!identity.ok) {
      throw new Error(`Queue snapshot kernel does not support queueId=${queueId}`);
    }

    return this.manager.getQueue(identity.queueType);
  }

  private resolveQuerySecondaryField(queueId: BrowserQueueId): QuerySecondaryField {
    if (queueId === 'incremental-learning') {
      return 'fullContent';
    }

    return 'headline';
  }

  private async readBrowserQueueRows(queueId: BrowserQueueId): Promise<BrowserCard[]> {
    const queue = this.resolveQueue(queueId);
    const cards = await queue.getCards();
    const rows = cards.map((card, index) => mapQueueFsrsCardToBrowserCard(card, {
      firstReviewMode: isRetrievalBrowserQueue(queueId) ? 'created-or-last' : 'last-review',
      queueIndex: index + 1,
    }));
    return this.markMissingRows(rows);
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

  private toLiteRow(row: BrowserCard): QueueBrowserLiteRow {
    const fsrsCardId = String(row.fsrsCardId || '').trim();
    return {
      id: fsrsCardId || String(row.id || '').trim(),
      blockId: String(row.blockId || '').trim(),
      fsrsCardId: fsrsCardId || undefined,
      actionTarget: {
        id: String(row.id || '').trim(),
        blockId: String(row.blockId || '').trim(),
        fsrsCardId: fsrsCardId || undefined,
        cardType: row.cardType as BrowserCard['cardType'],
        priority: typeof row.priority === 'number' ? row.priority : undefined,
      },
    };
  }
}
