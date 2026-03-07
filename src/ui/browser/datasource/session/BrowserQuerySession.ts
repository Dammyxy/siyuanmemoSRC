import type { BrowserCard } from '../../types';
import { LRUCache } from '@/utils/queryCache';
import { createLogger } from '@/utils/logger';
import { PerformanceMonitor } from '@/utils/performance';
import { resolveBrowserCardStableId } from '../../utils/browserCardIdentity';

const logger = createLogger('BrowserQuerySession');

export interface LiteRow {
  id: string;
  blockId: string;
  fsrsCardId?: string;
  rowSnapshot?: BrowserCard;
}

interface BuildSessionOptions {
  queryFingerprint: string;
  buildLiteRows: () => Promise<LiteRow[]>;
  hydrateRows?: (ids: string[]) => Promise<BrowserCard[]>;
}

interface FetchRowsOptions extends BuildSessionOptions {
  startRow?: number;
  endRow?: number;
}

export interface BrowserQuerySessionStats {
  queryFingerprint: string;
  totalRows: number;
  hydratedCacheSize: number;
}

function normalizeBoundary(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(Number(value)));
}

function resolveSessionIdFromCard(card: BrowserCard): string {
  return resolveBrowserCardStableId(card);
}

function toUniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => String(id || '')).filter(Boolean)));
}

export function toLiteRowFromBrowserCard(card: BrowserCard): LiteRow {
  const id = resolveSessionIdFromCard(card);
  return {
    id,
    blockId: String(card.blockId || ''),
    fsrsCardId: String(card.fsrsCardId || ''),
    rowSnapshot: card,
  };
}

export class BrowserQuerySession {
  private queryFingerprint = '';
  private orderedIds: string[] = [];
  private liteRowById = new Map<string, LiteRow>();
  private hydratedRowCache: LRUCache<string, BrowserCard>;
  private buildPromise: Promise<void> | null = null;
  private sessionBuilt = false;

  constructor(
    private readonly scope: string,
    maxHydratedCacheSize = 4000
  ) {
    this.hydratedRowCache = new LRUCache<string, BrowserCard>(maxHydratedCacheSize);
  }

  invalidate(): void {
    this.queryFingerprint = '';
    this.orderedIds = [];
    this.liteRowById.clear();
    this.hydratedRowCache.clear();
    this.buildPromise = null;
    this.sessionBuilt = false;
  }

  getFingerprint(): string {
    return this.queryFingerprint;
  }

  getStats(): BrowserQuerySessionStats {
    return {
      queryFingerprint: this.queryFingerprint,
      totalRows: this.orderedIds.length,
      hydratedCacheSize: this.hydratedRowCache.size,
    };
  }

  async fetchRows(options: FetchRowsOptions): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    return PerformanceMonitor.measure('browser.rows.fetchBlock.ms', async () => {
      await this.ensureSession(options);
      const totalCount = this.orderedIds.length;
      const startRow = normalizeBoundary(options.startRow, 0);
      const endRowDefault = totalCount;
      const endRowCandidate = normalizeBoundary(options.endRow, endRowDefault);
      const endRow = options.endRow == null ? endRowDefault : endRowCandidate;
      const safeStart = Math.min(startRow, totalCount);
      const safeEnd = Math.max(safeStart, Math.min(endRow, totalCount));
      const targetIds = this.orderedIds.slice(safeStart, safeEnd);
      const rows = await this.materializeRows(targetIds, options.hydrateRows);
      return {
        rows,
        totalCount,
      };
    });
  }

  async getAllMatchedIds(options: BuildSessionOptions): Promise<string[]> {
    await this.ensureSession(options);
    return [...this.orderedIds];
  }

  async getRowsByIds(ids: string[], options: BuildSessionOptions): Promise<BrowserCard[]> {
    await this.ensureSession(options);
    const uniqueIds = toUniqueIds(ids);
    return this.materializeRows(uniqueIds, options.hydrateRows);
  }

  private async ensureSession(options: BuildSessionOptions): Promise<void> {
    const isSameSession = this.sessionBuilt && this.queryFingerprint === options.queryFingerprint;
    if (isSameSession) {
      return;
    }

    if (this.buildPromise) {
      await this.buildPromise;
      const stillSame = this.sessionBuilt && this.queryFingerprint === options.queryFingerprint;
      if (stillSame) {
        return;
      }
    }

    this.buildPromise = PerformanceMonitor.measure('browser.session.build.ms', async () => {
      const liteRows = await options.buildLiteRows();
      this.queryFingerprint = options.queryFingerprint;
      this.orderedIds = [];
      this.liteRowById.clear();
      this.hydratedRowCache.clear();
      this.sessionBuilt = true;

      for (const liteRow of liteRows) {
        if (!liteRow?.id) continue;
        this.orderedIds.push(liteRow.id);
        this.liteRowById.set(liteRow.id, liteRow);
        if (liteRow.rowSnapshot) {
          this.hydratedRowCache.set(liteRow.id, liteRow.rowSnapshot);
        }
      }

      logger.debug(`[${this.scope}] session built`, {
        queryFingerprint: options.queryFingerprint,
        rows: this.orderedIds.length,
      });
    }).finally(() => {
      this.buildPromise = null;
    });

    await this.buildPromise;
  }

  private async materializeRows(
    ids: string[],
    hydrateRows?: (ids: string[]) => Promise<BrowserCard[]>
  ): Promise<BrowserCard[]> {
    if (ids.length === 0) return [];

    const rowById = new Map<string, BrowserCard>();
    const unresolvedIds: string[] = [];

    for (const id of ids) {
      const fromCache = this.hydratedRowCache.get(id);
      if (fromCache) {
        rowById.set(id, fromCache);
        continue;
      }

      const liteRow = this.liteRowById.get(id);
      if (liteRow?.rowSnapshot) {
        this.hydratedRowCache.set(id, liteRow.rowSnapshot);
        rowById.set(id, liteRow.rowSnapshot);
        continue;
      }

      unresolvedIds.push(id);
    }

    if (unresolvedIds.length === 0 || typeof hydrateRows !== 'function') {
      return ids
        .map((id) => rowById.get(id))
        .filter((row): row is BrowserCard => Boolean(row));
    }

    const hydratedRows = await PerformanceMonitor.measure('browser.rows.hydrateBlock.ms', async () => {
      return hydrateRows(unresolvedIds);
    });
    const hydratedMap = new Map<string, BrowserCard>();
    for (const row of hydratedRows) {
      const rowId = resolveSessionIdFromCard(row);
      if (!rowId) continue;
      hydratedMap.set(rowId, row);
      this.hydratedRowCache.set(rowId, row);
    }

    for (const id of unresolvedIds) {
      const hydrated = hydratedMap.get(id);
      if (hydrated) {
        rowById.set(id, hydrated);
      }
    }

    return ids
      .map((id) => rowById.get(id))
      .filter((row): row is BrowserCard => Boolean(row));
  }
}
