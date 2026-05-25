import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDeckLiteRow,
  BrowserDeckPageRequest,
  BrowserDeckPageResult,
  BrowserDeckSnapshotQuery,
  BrowserDeckSnapshotResult,
} from '@/application/queries/browser/browser-deck-query';
import type { BrowserDeckQueryKernel } from '@/application/queries/browser/shared/BrowserDeckQueryKernel';
import type { BackendBrowserAggregateIdentity } from '../../../../packages/contracts/src/backend-rpc';
import type { StructuredCardQuery } from '@/types/card-query';
import type { FSRSCard } from '@/types/card';
import type { BrowserCard } from '@/types/browser';
import { resolveBrowserCardStableId } from '@/types/browser';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';

export type BrowserCardUniverseReadModuleDeps = {
  backendClient?: SrsBackendClient | null;
  browserDeckQueryKernel: BrowserDeckQueryKernel;
  scheduleSourceExistenceRefreshForCards: (
    cards: Array<{ blockId?: unknown }>,
    options?: { limit?: number },
  ) => void;
  markRowsFromKnownSourceExistence: <TRow extends { blockId?: unknown; blockType?: string | null; meta?: unknown }>(
    rows: TRow[],
  ) => TRow[];
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
  private readonly aggregateSnapshots = new Map<string, BackendBrowserAggregateIdentity>();
  private readonly aggregateSnapshotInFlight = new Map<string, Promise<BackendBrowserAggregateIdentity>>();
  private readonly aggregateSnapshotForceInFlightKeys = new Set<string>();

  constructor(private readonly deps: BrowserCardUniverseReadModuleDeps) {}

  async readAggregatePage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckPageResult> {
    const startRow = Math.max(0, Math.floor(Number(page.startRow) || 0));
    const endRow = Math.max(startRow, Math.floor(Number(page.endRow) || startRow));
    const limit = Math.max(1, endRow - startRow);
    const identity = await this.ensureAggregateSnapshot(query, limit);
    try {
      const aggregatePage = await measureRuntimePerformance('browser', 'backend.aggregate-page', () => this.requireBackend('browser.aggregate.page').browserAggregatePage<FSRSCard>({
        requestId: `browser-aggregate-page:${Date.now()}`,
        identity,
        offset: startRow,
        limit,
      }), {
        endRow,
        startRow,
      });
      if (aggregatePage.status === 'stale-generation') {
        this.forgetAggregateSnapshot(query, identity);
        throw toBrowserCardUniverseUnavailable('browser.aggregate.page', aggregatePage.reason || 'stale aggregate generation');
      }
      if (aggregatePage.status !== 'ready' && aggregatePage.status !== 'ready-empty') {
        throw toBrowserCardUniverseUnavailable('browser.aggregate.page', aggregatePage.reason || aggregatePage.status);
      }
      const cards = aggregatePage.rows as FSRSCard[];
      this.deps.scheduleSourceExistenceRefreshForCards(cards, {
        limit: this.deps.sourceExistenceBatchSize,
      });
      return {
        rows: await this.mapBackendCards(cards, 'aggregate-page'),
        total: aggregatePage.totalCount ?? cards.length,
      };
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.aggregate.page', error);
    }
  }

  async readAggregateSnapshot(query: BrowserDeckSnapshotQuery): Promise<BrowserDeckSnapshotResult> {
    const pageSize = 256;
    const identity = await this.ensureAggregateSnapshot(query, pageSize);
    const rows: BrowserDeckLiteRow[] = [];
    let offset = 0;
    let total = 0;
    try {
      while (true) {
        const page = await measureRuntimePerformance('browser', 'backend.aggregate-snapshot-page', () => this.requireBackend('browser.aggregate.page').browserAggregatePage<FSRSCard>({
          requestId: `browser-aggregate-snapshot-page:${Date.now()}:${offset}`,
          identity,
          offset,
          limit: pageSize,
        }), { offset, pageSize });
        if (page.status === 'stale-generation') {
          this.forgetAggregateSnapshot(query, identity);
          throw toBrowserCardUniverseUnavailable('browser.aggregate.snapshot', page.reason || 'stale aggregate generation');
        }
        if (page.status !== 'ready' && page.status !== 'ready-empty') {
          throw toBrowserCardUniverseUnavailable('browser.aggregate.snapshot', page.reason || page.status);
        }
        total = page.totalCount ?? total;
        const browserRows = await this.mapBackendCards(page.rows as FSRSCard[], 'aggregate-snapshot');
        rows.push(...browserRows.map((row) => ({
          id: resolveBrowserCardStableId(row),
          blockId: String(row.blockId || ''),
          fsrsCardId: String(row.fsrsCardId || ''),
          actionTarget: {
            id: String(row.id || ''),
            blockId: String(row.blockId || ''),
            fsrsCardId: String(row.fsrsCardId || '') || undefined,
            cardType: row.cardType,
            priority: typeof row.priority === 'number' ? row.priority : undefined,
          },
        })));
        if (!page.nextCursor || rows.length >= total) {
          break;
        }
        offset = Number(page.nextCursor);
        if (!Number.isFinite(offset)) {
          break;
        }
      }
      return { rows, total };
    } catch (error) {
      throw toBrowserCardUniverseUnavailable('browser.aggregate.snapshot', error);
    }
  }

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
          this.deps.markRowsFromKnownSourceExistence(rows),
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
        this.deps.markRowsFromKnownSourceExistence(rows),
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

  private async ensureAggregateSnapshot(
    query: BrowserDeckSnapshotQuery,
    pageSize: number,
  ): Promise<BackendBrowserAggregateIdentity> {
    const key = this.aggregateKey(query);
    if (query.forceRefresh) {
      const forceInFlight = this.aggregateSnapshotForceInFlightKeys.has(key)
        ? this.aggregateSnapshotInFlight.get(key)
        : null;
      if (forceInFlight) {
        return forceInFlight;
      }
      this.aggregateSnapshots.delete(key);
      this.aggregateSnapshotInFlight.delete(key);
      this.aggregateSnapshotForceInFlightKeys.delete(key);
    }
    const current = this.aggregateSnapshots.get(key);
    if (current) {
      return current;
    }
    const inFlight = this.aggregateSnapshotInFlight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const request = measureRuntimePerformance('browser', 'backend.aggregate-snapshot', () => this.requireBackend('browser.aggregate.snapshot').browserAggregateSnapshot({
        requestId: `browser-aggregate-snapshot:${Date.now()}`,
        datasourceId: `deck:${key}`,
        scope: {
          preset: query.preset,
          docId: query.docId,
          scopeDocIds: query.scopeDocIds ?? null,
          pageSize,
        },
        filter: {
          searchText: query.searchText,
          states: query.states,
          cardTypes: query.cardTypes,
          deckIds: query.deckIds,
          tags: query.tags,
        },
        sort: {
          sortModel: query.sortModel,
        },
      }), { pageSize })
      .then((snapshot) => {
        if ((snapshot.status !== 'ready' && snapshot.status !== 'ready-empty') || !snapshot.identity) {
          throw toBrowserCardUniverseUnavailable('browser.aggregate.snapshot', snapshot.reason || snapshot.status);
        }
        if (this.aggregateSnapshotInFlight.get(key) === request) {
          this.aggregateSnapshots.set(key, snapshot.identity);
        }
        return snapshot.identity;
      })
      .finally(() => {
        if (this.aggregateSnapshotInFlight.get(key) === request) {
          this.aggregateSnapshotInFlight.delete(key);
          this.aggregateSnapshotForceInFlightKeys.delete(key);
        }
      });

    this.aggregateSnapshotInFlight.set(key, request);
    if (query.forceRefresh) {
      this.aggregateSnapshotForceInFlightKeys.add(key);
    }
    return request;
  }

  private async mapBackendCards(cards: FSRSCard[], reason: string): Promise<BrowserCard[]> {
    const rows = await measureRuntimePerformance(
      'browser',
      `${reason}.map-browser-rows`,
      () => this.deps.browserDeckQueryKernel.getBrowserCardsFromCards(cards, { markMissing: false }),
      { rowCount: cards.length },
    );
    return this.deps.reuseBrowserRowProjections(
      this.deps.markRowsFromKnownSourceExistence(rows),
      reason,
    );
  }

  private aggregateKey(query: BrowserDeckSnapshotQuery): string {
    return JSON.stringify({
      preset: query.preset ?? null,
      searchText: query.searchText ?? '',
      docId: query.docId ?? null,
      scopeDocIds: query.scopeDocIds ?? null,
      states: query.states ?? null,
      cardTypes: query.cardTypes ?? null,
      deckIds: query.deckIds ?? null,
      tags: query.tags ?? null,
      sortModel: query.sortModel ?? [],
    });
  }

  private forgetAggregateSnapshot(
    query: BrowserDeckSnapshotQuery,
    staleIdentity: BackendBrowserAggregateIdentity,
  ): void {
    const key = this.aggregateKey(query);
    const current = this.aggregateSnapshots.get(key);
    if (!current || current.snapshotId !== staleIdentity.snapshotId || current.generation !== staleIdentity.generation) {
      return;
    }
    this.aggregateSnapshots.delete(key);
  }
}
