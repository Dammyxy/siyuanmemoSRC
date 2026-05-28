import type {
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregateFocusResult,
  BackendBrowserAggregateIdentity,
  BackendBrowserAggregatePageRequest,
  BackendBrowserAggregatePageResult,
  BackendBrowserAggregateSnapshotRequest,
  BackendBrowserAggregateSnapshotResult,
  BackendUnavailableClass,
} from '../../packages/contracts/src/backend-rpc';
import type { BrowserDeckSnapshotQuery } from '@/application/queries/browser/browser-deck-query';
import type { FSRSCard } from '@/types/card';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';

interface BrowserAggregateSnapshotRecord {
  identity: BackendBrowserAggregateIdentity;
  query: BrowserDeckSnapshotQuery;
  totalCount: number;
  matchedIds: string[];
  pageSize: number;
  recordedAt: number;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}

function normalizeArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => normalizeString(entry)).filter(Boolean)))
    : [];
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSortObject(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = stableSortObject((value as Record<string, unknown>)[key]);
      return accumulator;
    }, {});
}

function hashText(input: string): string {
  let hash = 0x811c9dc5;
  for (const char of input) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildQueryFingerprint(input: {
  datasourceId: string;
  queueType?: string | null;
  scope?: Record<string, unknown> | null;
  sort?: Record<string, unknown> | null;
  filter?: Record<string, unknown> | null;
}): string {
  return JSON.stringify(stableSortObject({
    datasourceId: normalizeString(input.datasourceId),
    queueType: normalizeString(input.queueType),
    scope: normalizeRecord(input.scope),
    sort: normalizeRecord(input.sort),
    filter: normalizeRecord(input.filter),
  }));
}

function buildIdentity(request: BackendBrowserAggregateSnapshotRequest, generation: number): BackendBrowserAggregateIdentity {
  const queryFingerprint = buildQueryFingerprint(request);
  const snapshotSeed = `${normalizeString(request.datasourceId)}:${queryFingerprint}:${generation}`;
  return {
    snapshotId: `browser-aggregate:${hashText(snapshotSeed)}`,
    generation,
    datasourceId: normalizeString(request.datasourceId),
    policyHash: hashText(queryFingerprint),
    queryFingerprint,
  };
}

function buildDeckSnapshotQuery(request: BackendBrowserAggregateSnapshotRequest): BrowserDeckSnapshotQuery {
  const scope = normalizeRecord(request.scope);
  const filter = normalizeRecord(request.filter);
  const sort = normalizeRecord(request.sort);
  const sortModel = Array.isArray(sort.sortModel) ? sort.sortModel : [];

  return {
    preset: typeof scope.preset === 'string'
      ? scope.preset as BrowserDeckSnapshotQuery['preset']
      : undefined,
    searchText: typeof filter.searchText === 'string' ? filter.searchText : undefined,
    docId: typeof scope.docId === 'string' ? scope.docId : undefined,
    scopeDocIds: Array.isArray(scope.scopeDocIds) ? normalizeArray(scope.scopeDocIds) : undefined,
    states: Array.isArray(filter.states)
      ? filter.states.map((state) => Number(state)).filter((state) => Number.isFinite(state))
      : undefined,
    cardTypes: Array.isArray(filter.cardTypes)
      ? normalizeArray(filter.cardTypes)
      : undefined,
    deckIds: Array.isArray(filter.deckIds)
      ? normalizeArray(filter.deckIds)
      : undefined,
    tags: Array.isArray(filter.tags)
      ? normalizeArray(filter.tags)
      : undefined,
    sortModel: Array.isArray(sortModel) ? sortModel : undefined,
    fullUniverseReason: typeof request.fullUniverseReason === 'string'
      ? request.fullUniverseReason
      : typeof scope.fullUniverseReason === 'string'
        ? scope.fullUniverseReason
        : undefined,
  };
}

function makeUnavailable(
  reason: string,
  unavailableClass: BackendUnavailableClass = 'BACKEND_UNAVAILABLE',
): BackendBrowserAggregateSnapshotResult & BackendBrowserAggregatePageResult<FSRSCard> & BackendBrowserAggregateFocusResult<FSRSCard> {
  return {
    status: 'unavailable',
    identity: null,
    totalCount: 0,
    pageSize: 0,
    rows: [],
    focusFound: false,
    unavailableClass,
    reason,
  };
}

function normalizeCardId(card: FSRSCard): string {
  return normalizeString(card.id) || normalizeString(card.blockId);
}

function normalizeCardRows(cards: FSRSCard[], ids: string[]): FSRSCard[] {
  const rowById = new Map<string, FSRSCard>();
  for (const card of cards) {
    const stableId = normalizeCardId(card);
    if (stableId) {
      rowById.set(stableId, card);
    }
  }
  return ids
    .map((id) => rowById.get(id))
    .filter((card): card is FSRSCard => Boolean(card));
}

export class WorkerBrowserAggregateReadService {
  private readonly snapshotsById = new Map<string, BrowserAggregateSnapshotRecord>();
  private readonly currentSnapshotByKey = new Map<string, BrowserAggregateSnapshotRecord>();

  constructor(private readonly database: WorkerSqliteDatabaseService) {}

  async snapshot(request: BackendBrowserAggregateSnapshotRequest): Promise<BackendBrowserAggregateSnapshotResult> {
    const datasourceId = normalizeString(request.datasourceId);
    if (!datasourceId) {
      return makeUnavailable('browser aggregate snapshot requires datasource identity');
    }

    const query = buildDeckSnapshotQuery(request);
    const matchedIds = await this.database.queryDeckMatchedIds(query);
    if (matchedIds == null) {
      return makeUnavailable('browser aggregate snapshot query unavailable');
    }

    const totalCount = matchedIds.length;
    const generation = (this.currentSnapshotByKey.get(this.snapshotKey(request))?.identity.generation ?? 0) + 1;
    const identity = buildIdentity(request, generation);
    const pageSize = Math.max(1, normalizeNumber((normalizeRecord(request.scope).pageSize), 200));
    const record: BrowserAggregateSnapshotRecord = {
      identity,
      query,
      totalCount,
      matchedIds,
      pageSize,
      recordedAt: Date.now(),
    };
    this.snapshotsById.set(identity.snapshotId, record);
    this.currentSnapshotByKey.set(this.snapshotKey(request), record);

    return {
      status: totalCount === 0 ? 'ready-empty' : 'ready',
      identity,
      totalCount,
      pageSize,
    };
  }

  async page(request: BackendBrowserAggregatePageRequest): Promise<BackendBrowserAggregatePageResult<FSRSCard>> {
    const record = this.resolveSnapshot(request.identity);
    if (!record) {
      return this.stalePage(request.identity);
    }

    const limit = Math.max(1, normalizeNumber(request.limit, record.pageSize));
    const offset = this.resolveOffset(request);
    const ids = record.matchedIds.slice(offset, offset + limit);
    const cards = ids.length > 0 ? await this.database.getDeckRowsByIds(ids) : [];
    const rows = normalizeCardRows(cards, ids);
    const nextOffset = offset + rows.length;

    return {
      status: record.totalCount === 0 ? 'ready-empty' : 'ready',
      identity: record.identity,
      rows,
      nextCursor: nextOffset < record.totalCount ? String(nextOffset) : null,
      totalCount: record.totalCount,
    };
  }

  async focus(request: BackendBrowserAggregateFocusRequest): Promise<BackendBrowserAggregateFocusResult<FSRSCard>> {
    const record = this.resolveSnapshot(request.identity);
    if (!record) {
      return this.staleFocus(request.identity);
    }

    const targetId = this.resolveFocusId(request.focus);
    const focusIndex = targetId ? record.matchedIds.indexOf(targetId) : -1;
    if (focusIndex < 0) {
      return {
        status: record.totalCount === 0 ? 'ready-empty' : 'ready',
        identity: record.identity,
        focusFound: false,
        rows: [],
        hierarchy: {
          focusId: targetId,
          matchCount: record.totalCount,
          window: { before: 0, after: 0 },
          ancestors: [],
        },
        sourceExistence: {},
      };
    }

    const before = Math.max(0, normalizeNumber(request.limitBefore, 25));
    const after = Math.max(0, normalizeNumber(request.limitAfter, 25));
    const start = Math.max(0, focusIndex - before);
    const end = Math.min(record.matchedIds.length, focusIndex + after + 1);
    const ids = record.matchedIds.slice(start, end);
    const cards = ids.length > 0 ? await this.database.getDeckRowsByIds(ids) : [];
    const rows = normalizeCardRows(cards, ids);
    const sourceExistenceRows = await this.database.getSourceExistenceByBlockIds(rows.map((card) => card.blockId));
    const sourceExistence = Object.fromEntries(sourceExistenceRows.map((entry) => [entry.blockId, entry.exists]));
    const focusedCard = rows.find((row) => normalizeCardId(row) === targetId) ?? null;

    return {
      status: 'ready',
      identity: record.identity,
      focusFound: Boolean(focusedCard),
      rows,
      hierarchy: {
        focusId: targetId,
        focusIndex,
        window: { start, end, before, after },
        rootId: focusedCard?.meta && typeof focusedCard.meta.rootId === 'string' ? focusedCard.meta.rootId : null,
        parentId: focusedCard?.meta && typeof focusedCard.meta.parentId === 'string' ? focusedCard.meta.parentId : null,
      },
      sourceExistence,
    };
  }

  private snapshotKey(request: BackendBrowserAggregateSnapshotRequest): string {
    return buildQueryFingerprint(request);
  }

  private resolveSnapshot(identity: BackendBrowserAggregateIdentity): BrowserAggregateSnapshotRecord | null {
    const snapshotId = normalizeString(identity.snapshotId);
    const record = snapshotId ? this.snapshotsById.get(snapshotId) ?? null : null;
    if (!record) {
      return null;
    }
    const key = this.currentSnapshotByKey.get(record.identity.queryFingerprint);
    if (!key || key.identity.snapshotId !== record.identity.snapshotId) {
      return null;
    }
    if (
      key.identity.snapshotId !== snapshotId
      || key.identity.generation !== identity.generation
      || key.identity.datasourceId !== identity.datasourceId
      || key.identity.queryFingerprint !== identity.queryFingerprint
    ) {
      return null;
    }
    return record;
  }

  private resolveOffset(request: BackendBrowserAggregatePageRequest): number {
    if (typeof request.offset === 'number' && Number.isFinite(request.offset)) {
      return Math.max(0, Math.floor(request.offset));
    }
    if (typeof request.cursor === 'string' && request.cursor.trim()) {
      const parsed = Number(request.cursor);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 0;
  }

  private resolveFocusId(focus: BackendBrowserAggregateFocusRequest['focus']): string | null {
    switch (focus.type) {
      case 'card':
        return normalizeString(focus.cardId);
      case 'block':
        return normalizeString(focus.blockId);
      case 'source':
        return normalizeString(focus.sourceId);
      default:
        return null;
    }
  }

  private stalePage(identity: BackendBrowserAggregateIdentity): BackendBrowserAggregatePageResult<FSRSCard> {
    return {
      status: 'stale-generation',
      identity,
      rows: [],
      nextCursor: null,
      totalCount: null,
      unavailableClass: 'INVALID_REQUEST',
      reason: 'stale browser aggregate snapshot generation',
    };
  }

  private staleFocus(identity: BackendBrowserAggregateIdentity): BackendBrowserAggregateFocusResult<FSRSCard> {
    return {
      status: 'stale-generation',
      identity,
      focusFound: false,
      rows: [],
      hierarchy: null,
      sourceExistence: null,
      unavailableClass: 'INVALID_REQUEST',
      reason: 'stale browser aggregate snapshot generation',
    };
  }
}
