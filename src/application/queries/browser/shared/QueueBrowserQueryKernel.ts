import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import {
  isRetrievalBrowserQueue,
  resolveBrowserQueueIdentity,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import { createLogger } from '@/utils/logger';
import { resolveBrowserCardStableId, type BrowserCard } from '@/types/browser';
import {
  applyQueueFiltersToSnapshotRows,
  sortQueueSnapshotRows,
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
    const queue = this.resolveQueue(query.queueId);
    const rows = await this.markMissingRows(await queue.getSnapshotRows());
    const filteredRows = applyQueueFiltersToSnapshotRows(
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
    const sortedRows = sortQueueSnapshotRows(filteredRows, query.sortModel || []);

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

    const queue = this.resolveQueue(queueId);
    const rows = await this.markMissingRows(await queue.getSnapshotRows());
    const rowById = new Map<string, QueueSnapshotRow>();
    for (const row of rows) {
      const snapshotId = String(row.id || '').trim();
      const fsrsCardId = String(row.fsrsCardId || '').trim();
      if (snapshotId) {
        rowById.set(snapshotId, row);
      }
      if (fsrsCardId) {
        rowById.set(fsrsCardId, row);
      }
    }

    const cards = await queue.getCardsBySnapshotIds(orderedIds);
    const browserRows = cards.map((card) => {
      const snapshotRow = rowById.get(String(card.riffCardId || card.id || '').trim());
      return mapQueueFsrsCardToBrowserCard(card, {
        firstReviewMode: isRetrievalBrowserQueue(queueId) ? 'created-or-last' : 'last-review',
        queueIndex: snapshotRow?.queueIndex,
        blockType: snapshotRow?.blockType,
      });
    });

    const browserRowById = new Map<string, typeof browserRows[number]>();
    for (const row of browserRows) {
      browserRowById.set(resolveBrowserCardStableId(row), row);
    }

    return orderedIds
      .map((id) => browserRowById.get(id))
      .filter((row): row is typeof browserRows[number] => Boolean(row));
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

  private async markMissingRows(rows: QueueSnapshotRow[]): Promise<QueueSnapshotRow[]> {
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

  private toLiteRow(row: QueueSnapshotRow): QueueBrowserLiteRow {
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
