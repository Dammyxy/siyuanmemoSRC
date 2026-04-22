import type { BrowserActionTarget, SortModel } from '@/application/interfaces/ICardDataSource';
import type { CardState } from '@/core/card/domain/services/CardScheduleService';
import type { PresetFilter } from './GetBrowserCardsQuery';

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
}

export interface BrowserDeckLiteRow {
  id: string;
  blockId: string;
  fsrsCardId?: string;
  actionTarget?: BrowserActionTarget;
}

export interface BrowserDeckSnapshotResult {
  rows: BrowserDeckLiteRow[];
  total: number;
}
