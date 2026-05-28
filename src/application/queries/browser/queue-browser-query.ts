import type { BrowserQueueId } from '@/types/browser-queue-identity';
import type { BrowserActionTarget, SortModel } from '@/application/interfaces/ICardDataSource';
import type { BrowserReadModelSnapshotMetadata } from './browser-read-model';

export interface QueueBrowserSnapshotQuery {
  queueId: BrowserQueueId;
  preset?: string;
  searchText?: string;
  docId?: string;
  scopeDocIds?: string[] | null;
  cardType?: string;
  forceRefresh?: boolean;
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
  readOwner?: BrowserReadModelSnapshotMetadata['readOwner'];
  queryFingerprint?: string;
  generation?: number | null;
  diagnostics?: BrowserReadModelSnapshotMetadata['diagnostics'];
}
