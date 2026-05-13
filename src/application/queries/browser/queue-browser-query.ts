import type { BrowserQueueId } from '@/types/browser-queue-identity';
import type { BrowserActionTarget, SortModel } from '@/application/interfaces/ICardDataSource';

export interface QueueBrowserSnapshotQuery {
  queueId: BrowserQueueId;
  preset?: string;
  searchText?: string;
  docId?: string;
  scopeDocIds?: string[] | null;
  cardType?: string;
  sortModel?: SortModel[];
}

export interface QueueBrowserLiteRow {
  id: string;
  blockId: string;
  fsrsCardId?: string;
  actionTarget?: BrowserActionTarget;
}

export interface QueueBrowserSnapshotResult {
  rows: QueueBrowserLiteRow[];
  total: number;
}
