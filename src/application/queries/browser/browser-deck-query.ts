import type { BrowserActionTarget, SortModel } from '@/application/interfaces/ICardDataSource';
import type { CardState } from '@/core/card/domain/services/CardScheduleService';
import type { FSRSCard } from '@/types/card';
import type { BrowserCard } from '@/types/browser';
import type { PresetFilter } from './GetBrowserCardsQuery';
import type { BrowserReadModelSnapshotMetadata } from './browser-read-model';

export interface BrowserDeckSnapshotQuery {
  preset?: PresetFilter;
  searchText?: string;
  docId?: string;
  scopeDocIds?: string[] | null;
  states?: CardState[];
  cardTypes?: string[];
  deckIds?: string[];
  tags?: string[];
  sortModel?: SortModel[];
  forceRefresh?: boolean;
  fullUniverseReason?: BrowserDeckFullUniverseReason;
}

export type BrowserDeckFullUniverseReason =
  | 'all-select'
  | 'bulk-action'
  | 'focus-snapshot'
  | 'export'
  | 'action-targets'
  | 'diagnostics'
  | 'all-rows-snapshot'
  | 'matched-ids';

export interface BrowserDeckLiteRow {
  id: string;
  blockId: string;
  fsrsCardId?: string;
  actionTarget?: BrowserActionTarget;
}

export interface BrowserDeckSnapshotResult {
  rows: BrowserDeckLiteRow[];
  total: number;
  readOwner?: BrowserReadModelSnapshotMetadata['readOwner'];
  queryFingerprint?: string;
  generation?: number | null;
  diagnostics?: BrowserReadModelSnapshotMetadata['diagnostics'];
}

export interface BrowserDeckPageRequest {
  startRow?: number;
  endRow?: number;
}

export interface BrowserDeckPageResult {
  rows: BrowserCard[];
  total: number;
}

export type BrowserDocumentCountsScopeKind = 'deck' | 'queue';

export interface BrowserDocumentCountsScope {
  kind: BrowserDocumentCountsScopeKind;
  preset?: PresetFilter | string | null;
  searchText?: string | null;
  docId?: string | null;
  scopeDocIds?: string[] | null;
  cardType?: string | null;
  queueType?: string | null;
}

export interface BrowserDocumentCountsQueueReadiness {
  status: 'ready' | 'refreshing' | 'unavailable';
  queueId: string;
  policyId: string;
  generation?: number;
  cause?: string;
  reason?: string;
  retryAfterMs?: number;
}

export interface BrowserDocumentCountRow {
  rootId: string;
  count: number;
}

export type BrowserDocumentCountsOwner =
  | 'sql-card-universe'
  | 'queue-projection';

export interface BrowserDocumentCountsDiagnostics {
  countOnly: true;
  rowsHydratedForHierarchy: number;
  countMs?: number | null;
  queueReadiness?: BrowserDocumentCountsQueueReadiness | null;
  projectionIdentity?: {
    queueId: string;
    policyId: string;
    generation: number;
  } | null;
}

export type BrowserDocumentCountsResult =
  | {
      status: 'ready';
      owner: BrowserDocumentCountsOwner;
      scope: BrowserDocumentCountsScope;
      rows: BrowserDocumentCountRow[];
      diagnostics: BrowserDocumentCountsDiagnostics;
    }
  | {
      status: 'unsupported' | 'unavailable';
      owner: BrowserDocumentCountsOwner | 'none';
      scope: BrowserDocumentCountsScope;
      rows: [];
      reason: string;
      diagnostics: BrowserDocumentCountsDiagnostics;
    };

export interface BrowserDeckCardPageResult {
  cards: FSRSCard[];
  total: number;
}
