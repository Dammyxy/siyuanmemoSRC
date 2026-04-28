import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';

export interface BrowserDeckReadPort {
  queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): BrowserDeckCardPageResult | null;

  queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): string[] | null;

  getDeckCardsByIds(ids: string[]): FSRSCard[];

  countCards(query?: StructuredCardQuery): number;

  getBrowserStats(now?: number): BrowserStats;
}
