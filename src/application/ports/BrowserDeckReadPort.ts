import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';

export interface SourceExistenceRefreshRequest {
  blockIds?: string[];
  limit?: number;
  staleBefore?: number;
  includeKnownMissing?: boolean;
}

export interface SourceExistenceRefreshCandidate {
  cardId: string;
  blockId: string;
  sourceExists: boolean | null;
  sourceCheckedAt: number | null;
}

export interface SourceExistenceUpdate {
  cardId?: string;
  blockId: string;
  exists: boolean;
}

export interface SourceExistenceSummary {
  unknown: number;
  stale: number;
  missing: number;
}

export interface BrowserDeckReadPort {
  queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): BrowserDeckCardPageResult | null;

  queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): string[] | null;

  getDeckCardsByIds(ids: string[]): FSRSCard[];

  countCards(query?: StructuredCardQuery): number;

  getBrowserStats(now?: number): BrowserStats;

  getSourceExistenceRefreshCandidates?(request?: SourceExistenceRefreshRequest): SourceExistenceRefreshCandidate[];

  updateSourceExistence?(updates: SourceExistenceUpdate[], checkedAt?: number): Promise<void> | void;

  getSourceExistenceSummary?(staleBefore?: number): SourceExistenceSummary;

  getSourceExistenceByBlockIds?(blockIds: string[]): Map<string, boolean | null>;

  queryCardIdsByRootIds?(rootIds: string[], options?: { excludeKnownMissing?: boolean }): string[];

  queryRootlessCardBlockIds?(limit?: number): string[];

  queryInconsistentCardTypeMarkerIds?(): string[];
}
