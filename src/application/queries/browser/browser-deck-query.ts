import type { BrowserActionTarget, SortModel } from '@/application/interfaces/ICardDataSource';
import type { CardState } from '@/core/card/domain/services/CardScheduleService';
import type { FSRSCard } from '@/types/card';
import type { BrowserCard } from '@/types/browser';
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
  forceRefresh?: boolean;
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

export interface BrowserDeckPageRequest {
  startRow?: number;
  endRow?: number;
}

export interface BrowserDeckPageResult {
  rows: BrowserCard[];
  total: number;
}

export interface BrowserDeckCardPageResult {
  cards: FSRSCard[];
  total: number;
}
