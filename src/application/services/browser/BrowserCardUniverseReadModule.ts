import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDeckPageRequest,
  BrowserDeckPageResult,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type { BrowserDeckQueryKernel } from '@/application/queries/browser/shared/BrowserDeckQueryKernel';
import type { StructuredCardQuery } from '@/types/card-query';
import type { FSRSCard } from '@/types/card';
import type { BrowserCard } from '@/types/browser';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';

export type BrowserCardUniverseReadModuleDeps = {
  backendClient?: SrsBackendClient | null;
  browserDeckQueryKernel: BrowserDeckQueryKernel;
  scheduleSourceExistenceRefreshForCards: (
    cards: Array<{ blockId?: unknown }>,
    options?: { limit?: number },
  ) => void;
  markRowsFromBackendSourceExistence: <TRow extends { blockId?: unknown; blockType?: string | null; meta?: unknown }>(
    rows: TRow[],
  ) => Promise<TRow[]>;
  reuseBrowserRowProjections: (rows: BrowserCard[], reason: string) => BrowserCard[];
  scheduleSourceExistenceSweep: () => void;
  sourceExistenceBatchSize: number;
};

export function toBrowserCardUniverseUnavailable(operation: string, error?: unknown): Error {
  const message = error instanceof Error ? String(error.message || '') : String(error || '');
  if (message.startsWith('BACKEND_UNAVAILABLE:')) {
    return error instanceof Error ? error : new Error(message);
  }
  if (message) {
    return new Error(`BACKEND_UNAVAILABLE: ${operation} unavailable (${message})`);
  }
  return new Error(`BACKEND_UNAVAILABLE: ${operation} requires backend-worker ownership`);
}

export class BrowserCardUniverseReadModule {
  constructor(private readonly deps: BrowserCardUniverseReadModuleDeps) {}

  async readPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckPageResult> {
    const backend = this.requireBackend('browser.deck.page');
    try {
      const initialPage = await measureRuntimePerformance('browser', 'backend.deck-page', () => backend.browserDeckPage(query, page), {
        endRow: page.endRow,
        startRow: page.startRow,
      });
      const initialCards = initialPage.cards as FSRSCard[];
      this.deps.scheduleSourceExistenceRefreshForCards(initialCards, {
        limit: this.deps.sourceExistenceBatchSize,
      });
      const rows = await measureRuntimePerformance(
        'browser',
        'deck-page.map-browser-rows',
        () => this.deps.browserDeckQueryKernel.getBrowserCardsFromCards(initialCards, { markMissing: false }),
        { rowCount: initialCards.length },
      );
      return {
        rows: this.deps.reuseBrowserRowProjections(
          await this.deps.markRowsFromBackendSourceExistence(rows),
          'deck-page',
        ),
        total: initialPage.total,
      };
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.deck.page', error);
    }
  }

  async readMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[]> {
    const backend = this.requireBackend('browser.deck.matchedIds');
    try {
      return await backend.browserDeckMatchedIds(query);
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.deck.matchedIds', error);
    }
  }

  async readRowsByIds(ids: string[]): Promise<BrowserCard[]> {
    const backend = this.requireBackend('browser.deck.rowsByIds');
    try {
      const cards = await measureRuntimePerformance(
        'browser',
        'backend.deck-rows-by-ids',
        () => backend.browserDeckRowsByIds(ids),
        { idCount: ids.length },
      );
      const rows = await measureRuntimePerformance(
        'browser',
        'deck-rows-by-ids.map-browser-rows',
        () => this.deps.browserDeckQueryKernel.getBrowserCardsFromCards(cards, { markMissing: false }),
        { rowCount: cards.length },
      );
      return this.deps.reuseBrowserRowProjections(
        await this.deps.markRowsFromBackendSourceExistence(rows),
        'deck-rows-by-ids',
      );
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.deck.rowsByIds', error);
    }
  }

  async countCards(query?: StructuredCardQuery): Promise<number> {
    const backend = this.requireBackend('browser.count');
    try {
      return await backend.browserCountCards(query);
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.count', error);
    }
  }

  async readStats(): Promise<BrowserStats> {
    const backend = this.requireBackend('browser.stats');
    try {
      const stats = await measureRuntimePerformance('browser', 'backend.stats', () => backend.browserStats());
      this.deps.scheduleSourceExistenceSweep();
      return stats;
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.stats', error);
    }
  }

  private requireBackend(operation: string): SrsBackendClient {
    if (!this.deps.backendClient) {
      throw toBrowserCardUniverseUnavailable(operation);
    }
    return this.deps.backendClient;
  }
}
