import type { StorageLoadReason, UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type {
  BrowserDeckReadPort,
  SourceExistenceRefreshCandidate,
  SourceExistenceRefreshRequest,
  SourceExistenceSummary,
  SourceExistenceUpdate,
} from '@/application/ports/BrowserDeckReadPort';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardMapper } from '@/infrastructure/persistence/mappers/CardMapper';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import { CardState, type FSRSCard } from '@/types/card';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { StructuredCardQuery } from '@/types/card-query';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { parseQuery, resolveBrowserCardFullContent } from '@/types/browser';
import { stringifyJson, parseJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import {
  ACTIVE_ALGORITHM_IDS,
  applyAlgorithmCardState,
  deriveAlgorithmCardState,
  diagnoseAlgorithmCardStateRow,
  resolveActiveAlgorithmId,
  stringifyAlgorithmCardState,
  type AlgorithmCardStateRow,
} from './algorithmCardState';

interface CardProjection {
  deckId: string | null;
  rootId: string | null;
  contentText: string | null;
  tags: string | null;
  suspended: number;
  lapses: number | null;
  reps: number | null;
  lastReview: number | null;
  createdAt: number | null;
  scheduledDays: number | null;
  stability: number | null;
  difficulty: number | null;
  aFactor: number | null;
  searchText: string | null;
  cardTypeMarker: string | null;
}

interface SourceExistenceProjection {
  blockId: string | null;
  sourceExists: number | null;
  sourceCheckedAt: number | null;
  sourceMissingAt: number | null;
}

interface DeletionTombstone {
  deletedAt: number;
  deletedBy?: string;
}

interface DomainSyncLedgerRecorder {
  appendCardDeleted(input: {
    cardId: string;
    blockId?: string | null;
    deletedAt: number;
    deletedBy?: string | null;
    idempotencyKey?: string | null;
    payload?: unknown;
  }): void;
}

interface WhereClause {
  sql: string;
  params: Array<string | number>;
}

interface BrowserDeckSqlQuery {
  where: WhereClause | null;
  orderBy: string;
}

interface CardPageRequest {
  startRow?: number;
  endRow?: number;
}

interface CardPageResult {
  cards: FSRSCard[];
  total: number;
}

const FNV1A_64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV1A_64_PRIME = 0x100000001b3n;
const ACTIVE_CARD_NOT_TOMBSTONED_SQL = `NOT EXISTS (
  SELECT 1
  FROM tombstones card_tombstone
  WHERE card_tombstone.kind = 'card'
    AND card_tombstone.id = cards.id
    AND card_tombstone.deleted_at >= COALESCE(cards.updated_at, 0)
)`;
const CARD_HAS_RENDERABLE_CONTENT_SQL = "TRIM(COALESCE(content_text, '')) != ''";
const ACTIVE_SOURCE_STATUS_SQL = `(source_exists IS NULL OR source_exists = 1)`;
const MISSING_SOURCE_STATUS_SQL = `source_exists = 0`;

export interface AlgorithmCardStateDiagnosticSummary {
  total: number;
  dirty: number;
  missingStateRows: number;
  invalidStateRows: number;
  cardStateMismatches: number;
  orphanStateRows: number;
  reasons: Record<string, number>;
}

export interface AlgorithmCardStateBackfillSummary extends AlgorithmCardStateDiagnosticSummary {
  backfilled: number;
  repaired: number;
  afterDirty: number;
}

function createEmptyStore(): UnifiedCardStore {
  return {
    version: 2,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
    riffBlacklist: [],
    riffSyncState: {},
  };
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (valueType === 'boolean' || valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'undefined') {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',');
    return `{${body}}`;
  }

  return 'null';
}

function fnv1aHash(input: string): string {
  let hash = FNV1A_64_OFFSET_BASIS;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * FNV1A_64_PRIME);
  }
  return hash.toString(16).padStart(16, '0');
}

function calculateStoreContentHash(store: UnifiedCardStore): string {
  return fnv1aHash(stableStringify({
    version: store.version,
    xiuyuans: store.xiuyuans,
    cardDTOs: store.cardDTOs || {},
    deletedCardDTOs: store.deletedCardDTOs || {},
    deletedXiuyuans: store.deletedXiuyuans || {},
    riffBlacklist: store.riffBlacklist || [],
    riffSyncState: store.riffSyncState || {},
  }));
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTombstoneDeletedAt(tombstone: DeletionTombstone | undefined): number | null {
  return tombstone ? normalizeNumber(tombstone.deletedAt) : null;
}

function resolveCardUpdatedAt(card: FSRSCard | undefined): number {
  return normalizeNumber(card?.updatedAt) || 0;
}

function isCardDeletedByActiveTombstone(card: FSRSCard | undefined, tombstone: DeletionTombstone | undefined): boolean {
  const deletedAt = normalizeTombstoneDeletedAt(tombstone);
  if (deletedAt === null) {
    return false;
  }
  return deletedAt >= resolveCardUpdatedAt(card);
}

function resolveXiuyuanId(card: FSRSCard, dto?: CardPersistenceDTO): string | null {
  const metaXiuyuan = typeof card.meta?.xiuyuanID === 'string' ? card.meta.xiuyuanID : '';
  const dtoXiuyuan = typeof dto?.xiuyuanID === 'string' ? dto.xiuyuanID : '';
  return metaXiuyuan || dtoXiuyuan || null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStringArray(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeSearchText(value: unknown): string | null {
  const normalized = normalizeString(value).toLowerCase();
  return normalized || null;
}

function normalizeSqlLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function readStringField(record: unknown, key: string): string {
  if (!isObjectRecord(record)) {
    return '';
  }
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProjectionTags(card: FSRSCard): string | null {
  const tags = new Set<string>();
  for (const tag of Array.isArray(card.tags) ? card.tags : []) {
    const normalized = normalizeString(tag);
    if (normalized) {
      tags.add(normalized);
    }
  }

  const metaTags = isObjectRecord(card.meta) && Array.isArray(card.meta.tags)
    ? card.meta.tags
    : [];
  for (const tag of metaTags) {
    const normalized = normalizeString(tag);
    if (normalized) {
      tags.add(normalized);
    }
  }

  if (tags.size === 0) {
    return null;
  }
  return `\n${Array.from(tags).sort().join('\n')}\n`;
}

function resolveCardTypeMarker(card: FSRSCard, dto?: CardPersistenceDTO): string | null {
  const directMarker = normalizeString((card as { cardTypeMarker?: unknown }).cardTypeMarker);
  const metaMarker = isObjectRecord(card.meta)
    ? normalizeString(card.meta.cardTypeMarker)
    : '';
  const dtoMarker = normalizeString(dto?.cardTypeMarker);
  return directMarker || metaMarker || dtoMarker || null;
}

function createCardProjection(card: FSRSCard, dto?: CardPersistenceDTO): CardProjection {
  const meta = card.meta;
  const deckId = readStringField(meta, 'deckId')
    || readStringField(card, 'deckId')
    || readStringField(card, 'deckID');
  const rootId = readStringField(meta, 'rootId')
    || readStringField(card, 'rootId');
  const contentText = resolveBrowserCardFullContent({
    meta: isObjectRecord(meta) ? meta : null,
    content: readStringField(card, 'content'),
  });
  const aFactor = normalizeNumber(card.aFactor ?? dto?.aFactor);

  return {
    deckId: deckId || null,
    rootId: rootId || null,
    contentText: contentText || null,
    tags: normalizeProjectionTags(card),
    suspended: isCardDismissed(card) ? 1 : 0,
    lapses: normalizeNumber(card.lapses ?? dto?.lapses),
    reps: normalizeNumber(card.reps ?? dto?.reps),
    lastReview: normalizeNumber(card.lastReview ?? dto?.lastReview),
    createdAt: normalizeNumber(card.createdAt ?? dto?.createdAt),
    scheduledDays: normalizeNumber(card.scheduledDays ?? dto?.scheduledDays),
    stability: normalizeNumber(card.stability ?? dto?.stability),
    difficulty: normalizeNumber(card.difficulty ?? dto?.difficulty),
    aFactor,
    searchText: normalizeSearchText(contentText),
    cardTypeMarker: resolveCardTypeMarker(card, dto),
  };
}

function canonicalizeSqlCard(card: FSRSCard): FSRSCard {
  return canonicalizeSchedulingState(card, {
    source: 'sql-repository',
    mode: 'repair-external',
  }).card;
}

function canonicalizeSqlDTO(dto: CardPersistenceDTO): CardPersistenceDTO {
  return CardMapper.toPersistence(CardMapper.toDomain(dto));
}

function appendInClause(
  clauses: string[],
  params: Array<string | number>,
  column: string,
  values: string[] | number[],
): void {
  if (values.length === 0) {
    return;
  }
  clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`);
  params.push(...values);
}

function addReason(summary: Pick<AlgorithmCardStateDiagnosticSummary, 'reasons'>, reason: string): void {
  summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
}

function stateRowKey(cardId: string, algorithmId: string): string {
  return `${cardId}\u0000${algorithmId}`;
}

export class SqlUnifiedStorageRepository implements BrowserDeckReadPort {
  constructor(
    private readonly database: SqliteDatabaseService,
    private readonly options: { domainSyncLedger?: DomainSyncLedgerRecorder } = {},
  ) {}

  async loadStore(_reason: StorageLoadReason = 'unspecified'): Promise<UnifiedCardStore> {
    return this.database.read(() => {
      const store = createEmptyStore();
      const cardRows = this.database.getAll<{
        id: string;
        payload_json: string;
        dto_json: string | null;
      }>(`SELECT id, payload_json, dto_json FROM cards WHERE ${ACTIVE_CARD_NOT_TOMBSTONED_SQL} ORDER BY id`);
      const stateRows = this.loadAlgorithmStateRowMap(cardRows.map((row) => row.id));
      const xiuyuanRows = this.database.getAll<{
        id: string;
        payload_json: string;
      }>('SELECT id, payload_json FROM xiuyuans ORDER BY id');
      const tombstoneRows = this.database.getAll<{
        kind: string;
        id: string;
        payload_json: string;
      }>('SELECT kind, id, payload_json FROM tombstones ORDER BY kind, id');

      for (const row of xiuyuanRows) {
        store.xiuyuans[row.id] = parseJson<IXiuyuan>(row.payload_json, {} as IXiuyuan);
      }
      for (const row of cardRows) {
        const baseCard = this.parseBaseCardRow(row);
        if (baseCard?.id) {
          const cleanCard = this.hydrateWithAlgorithmState(baseCard, stateRows);
          store.cards[row.id] = cleanCard;
          store.cardDTOs![row.id] = CardMapper.toPersistence(cleanCard);
        }
      }
      for (const row of tombstoneRows) {
        const tombstone = parseJson<{ deletedAt: number; deletedBy?: string }>(row.payload_json, { deletedAt: Date.now() });
        if (row.kind === 'card') {
          store.deletedCardDTOs![row.id] = tombstone;
        } else if (row.kind === 'xiuyuan') {
          store.deletedXiuyuans![row.id] = tombstone;
        }
      }

      const riffBlacklist = this.database.getOne<{ value_json: string }>(
        'SELECT value_json FROM riff_sync WHERE key = ?',
        ['blacklist'],
      );
      const riffSyncState = this.database.getOne<{ value_json: string }>(
        'SELECT value_json FROM riff_sync WHERE key = ?',
        ['sync_state'],
      );
      const syncMetadata = this.database.getOne<{ value_json: string }>(
        'SELECT value_json FROM store_metadata WHERE key = ?',
        ['sync_metadata'],
      );
      store.riffBlacklist = parseJson<string[]>(riffBlacklist?.value_json, []);
      store.riffSyncState = parseJson<Record<string, unknown>>(riffSyncState?.value_json, {});
      store.syncMetadata = parseJson<UnifiedCardStore['syncMetadata'] | undefined>(syncMetadata?.value_json, undefined);
      return store;
    });
  }

  async saveStore(store: UnifiedCardStore): Promise<void> {
    await this.database.write((db) => {
      const existingSource = this.loadSourceExistenceByCardId();
      db.run('DELETE FROM cards');
      db.run('DELETE FROM algorithm_card_state WHERE algorithm_id IN (?, ?)', [...ACTIVE_ALGORITHM_IDS]);
      db.run('DELETE FROM xiuyuans');
      db.run('DELETE FROM tombstones');
      db.run('DELETE FROM riff_sync');
      db.run('DELETE FROM store_metadata WHERE key IN (?, ?)', ['sync_metadata', 'unified_store_version']);

      const cardDTOs = store.cardDTOs || {};
      for (const [id, card] of Object.entries(store.cards || {})) {
        if (isCardDeletedByActiveTombstone(card, store.deletedCardDTOs?.[id])) {
          continue;
        }
        const dto = cardDTOs[id];
        this.writeCardRecord(db, { ...card, id }, dto, existingSource.get(id));
      }

      for (const [id, xiuyuan] of Object.entries(store.xiuyuans || {})) {
        const updatedAt = normalizeNumber((xiuyuan as { updatedAt?: unknown }).updatedAt) || Date.now();
        db.run(
          'INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)',
          [id, updatedAt, stringifyJson(xiuyuan)],
        );
      }

      for (const [id, tombstone] of Object.entries(store.deletedCardDTOs || {})) {
        if (!isCardDeletedByActiveTombstone(store.cards?.[id], tombstone)) {
          continue;
        }
        const deletedAt = normalizeNumber(tombstone.deletedAt) || Date.now();
        const card = store.cards?.[id];
        const dto = store.cardDTOs?.[id];
        const blockId = normalizeString(card?.blockId || dto?.blockId) || null;
        db.run(
          `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
           VALUES (?, ?, ?, ?, ?)`,
          ['card', id, deletedAt, tombstone.deletedBy || null, stringifyJson(tombstone)],
        );
        this.options.domainSyncLedger?.appendCardDeleted({
          cardId: id,
          blockId,
          deletedAt,
          deletedBy: tombstone.deletedBy || null,
          idempotencyKey: `card-delete:${id}:${deletedAt}`,
          payload: tombstone,
        });
      }
      for (const [id, tombstone] of Object.entries(store.deletedXiuyuans || {})) {
        db.run(
          `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
           VALUES (?, ?, ?, ?, ?)`,
          ['xiuyuan', id, normalizeNumber(tombstone.deletedAt) || Date.now(), tombstone.deletedBy || null, stringifyJson(tombstone)],
        );
      }

      const now = Date.now();
      db.run(
        'INSERT OR REPLACE INTO riff_sync (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['blacklist', stringifyJson(store.riffBlacklist || []), now],
      );
      db.run(
        'INSERT OR REPLACE INTO riff_sync (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['sync_state', stringifyJson(store.riffSyncState || {}), now],
      );
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['sync_metadata', stringifyJson(store.syncMetadata || null), now],
      );
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['unified_store_version', stringifyJson(store.version || 2), now],
      );
    });
  }

  async touchSyncMetadata(input: {
    modifiedAt?: number;
    modifiedBy?: string;
  } = {}): Promise<void> {
    const current = this.database.getOne<{ value_json: string }>(
      'SELECT value_json FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );
    const previous = parseJson<UnifiedCardStore['syncMetadata'] | undefined>(
      current?.value_json,
      undefined,
    );
    const store = await this.loadStore();
    const now = input.modifiedAt ?? Date.now();
    const metadata = {
      revision: Math.max(Number(previous?.revision) || 0, Number(store.syncMetadata?.revision) || 0) + 1,
      contentHash: calculateStoreContentHash(store),
      lastModifiedAt: now,
      lastModifiedBy: String(input.modifiedBy || previous?.lastModifiedBy || store.syncMetadata?.lastModifiedBy || 'srs-backend-worker'),
    };

    this.database.run(
      'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['sync_metadata', stringifyJson(metadata), now],
    );
    this.database.run(
      'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['unified_store_version', stringifyJson(store.version || 2), now],
    );
  }

  upsertCards(cards: FSRSCard[]): void {
    for (const card of cards) {
      this.upsertCard(card);
    }
  }

  upsertCard(card: FSRSCard): void {
    const existingSource = this.loadSourceExistenceForCard(card.id);
    this.writeCardRecord(this.database, card, undefined, existingSource);
  }

  getAllCards(): FSRSCard[] {
    return this.queryCards();
  }

  getCard(cardId: string): FSRSCard | undefined {
    const normalizedId = String(cardId || '').trim();
    if (!normalizedId) {
      return undefined;
    }
    const row = this.database.getOne<{ payload_json: string }>(
      `SELECT payload_json FROM cards WHERE id = ? AND ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}`,
      [normalizedId],
    );
    return row ? this.parseCardRows([row])[0] : undefined;
  }

  getCardByBlockId(blockId: string): FSRSCard | undefined {
    return this.getCardsByBlockId(blockId)[0];
  }

  getCardsByBlockId(blockId: string): FSRSCard[] {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return [];
    }
    return this.queryCards({ blockIds: [normalizedBlockId] });
  }

  getDueCards(limit = 100): FSRSCard[] {
    return this.queryCards({
      dueDate: { lte: Date.now() },
      includeSuspended: false,
    }).slice(0, Math.max(1, Math.floor(Number(limit) || 100)));
  }

  getCardsByIds(ids: string[]): FSRSCard[] {
    const orderedIds = normalizeStringArray(ids);
    if (orderedIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(orderedIds));
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM cards
       WHERE (id IN (${placeholders}) OR block_id IN (${placeholders}))
         AND ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}
         AND ${ACTIVE_SOURCE_STATUS_SQL}`,
      [...uniqueIds, ...uniqueIds],
    );
    const cardById = new Map<string, FSRSCard>();
    for (const card of this.parseCardRows(rows)) {
      cardById.set(normalizeString(card.id), card);
      cardById.set(normalizeString(card.blockId), card);
    }
    return orderedIds
      .map((id) => cardById.get(id))
      .filter((card): card is FSRSCard => Boolean(card));
  }

  getDeckCardsByIds(ids: string[]): FSRSCard[] {
    return this.getCardsByIds(ids);
  }

  queryCards(query?: StructuredCardQuery): FSRSCard[] {
    const where = this.buildStructuredWhereClause(query);
    const whereClause = this.toWhereSql(where);
    const orderBy = query?.dueDate?.lte !== undefined || query?.dueDate?.gte !== undefined
      ? 'ORDER BY due ASC, priority ASC, id ASC'
      : 'ORDER BY id ASC';
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM cards ${whereClause} ${orderBy}`,
      where?.params,
    );

    return this.parseCardRows(rows)
      .filter((card) => this.matchesStructuredQueryResiduals(card, query));
  }

  queryCardIds(query?: StructuredCardQuery): string[] {
    if (query?.customFilter) {
      return this.queryCards(query).map((card) => card.id);
    }
    const where = this.buildStructuredWhereClause(query);
    const rows = this.database.getAll<{ id: string }>(
      `SELECT id FROM cards ${this.toWhereSql(where)} ORDER BY id ASC`,
      where?.params,
    );
    return rows.map((row) => row.id).filter(Boolean);
  }

  queryCardsPage(query?: StructuredCardQuery, page: CardPageRequest = {}): CardPageResult {
    if (query?.customFilter) {
      const cards = this.queryCards(query);
      const { startRow, endRow } = this.normalizePageRequest(page, cards.length);
      return {
        cards: cards.slice(startRow, endRow),
        total: cards.length,
      };
    }

    const where = this.buildStructuredWhereClause(query);
    const total = this.countCards(query);
    const { startRow, limit } = this.normalizePageRequest(page, total);
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM cards ${this.toWhereSql(where)} ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...(where?.params || []), limit, startRow],
    );
    return {
      cards: this.parseCardRows(rows),
      total,
    };
  }

  countCards(query?: StructuredCardQuery): number {
    if (query?.customFilter) {
      return this.queryCards(query).length;
    }
    const where = this.buildStructuredWhereClause(query);
    const row = this.database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM cards ${this.toWhereSql(where)}`,
      where?.params,
    );
    return Math.max(0, Number(row?.count) || 0);
  }

  queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest = {},
  ): BrowserDeckCardPageResult | null {
    const deckQuery = this.buildBrowserDeckSqlQuery(query);
    if (!deckQuery) {
      return null;
    }

    const total = this.countByWhere(deckQuery.where);
    const { startRow, limit } = this.normalizePageRequest(page, total);
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM cards ${this.toWhereSql(deckQuery.where)} ${deckQuery.orderBy} LIMIT ? OFFSET ?`,
      [...(deckQuery.where?.params || []), limit, startRow],
    );
    return {
      cards: this.parseCardRows(rows),
      total,
    };
  }

  queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): string[] | null {
    const deckQuery = this.buildBrowserDeckSqlQuery(query);
    if (!deckQuery) {
      return null;
    }

    const rows = this.database.getAll<{ id: string }>(
      `SELECT id FROM cards ${this.toWhereSql(deckQuery.where)} ${deckQuery.orderBy}`,
      deckQuery.where?.params,
    );
    return rows.map((row) => row.id).filter(Boolean);
  }

  getBrowserStats(now = Date.now()): BrowserStats {
    const row = this.database.getOne<{
      totalCards: number;
      dueCards: number;
      newCards: number;
      learningCards: number;
      reviewCards: number;
      suspendedCards: number;
      lostCards: number;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} THEN 1 ELSE 0 END), 0) AS totalCards,
        COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND due <= ? AND suspended = 0 THEN 1 ELSE 0 END), 0) AS dueCards,
        COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND state = ? THEN 1 ELSE 0 END), 0) AS newCards,
        COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND state = ? THEN 1 ELSE 0 END), 0) AS learningCards,
        COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND state = ? THEN 1 ELSE 0 END), 0) AS reviewCards,
        COALESCE(SUM(CASE WHEN ${ACTIVE_SOURCE_STATUS_SQL} AND suspended = 1 THEN 1 ELSE 0 END), 0) AS suspendedCards,
        COALESCE(SUM(CASE WHEN ${MISSING_SOURCE_STATUS_SQL} THEN 1 ELSE 0 END), 0) AS lostCards
       FROM cards
       WHERE ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}`,
      [now, CardState.New, CardState.Learning, CardState.Review],
    );

    return {
      totalCards: Math.max(0, Number(row?.totalCards) || 0),
      dueCards: Math.max(0, Number(row?.dueCards) || 0),
      newCards: Math.max(0, Number(row?.newCards) || 0),
      learningCards: Math.max(0, Number(row?.learningCards) || 0),
      reviewCards: Math.max(0, Number(row?.reviewCards) || 0),
      suspendedCards: Math.max(0, Number(row?.suspendedCards) || 0),
      lostCards: Math.max(0, Number(row?.lostCards) || 0),
    };
  }

  getSourceExistenceRefreshCandidates(
    request: SourceExistenceRefreshRequest = {},
  ): SourceExistenceRefreshCandidate[] {
    const clauses = ["block_id IS NOT NULL", "block_id != ''"];
    const params: Array<string | number> = [];
    clauses.push(ACTIVE_CARD_NOT_TOMBSTONED_SQL);
    const blockIds = normalizeStringArray(request.blockIds);
    if (blockIds.length > 0) {
      appendInClause(clauses, params, 'block_id', blockIds);
    }

    const forceRefresh = request.force === true;
    const staleBefore = normalizeNumber(request.staleBefore);
    const freshnessClauses = ['source_checked_at IS NULL'];
    if (!forceRefresh && staleBefore !== null) {
      freshnessClauses.push('source_checked_at < ?');
      params.push(staleBefore);
    }
    if (request.includeKnownMissing !== true) {
      clauses.push('(source_exists IS NULL OR source_exists != 0)');
    }
    if (!forceRefresh) {
      clauses.push(`(${freshnessClauses.join(' OR ')})`);
    }

    const limit = Math.max(1, Math.floor(Number(request.limit) || 500));
    const rows = this.database.getAll<{
      id: string;
      block_id: string;
      source_exists: number | null;
      source_checked_at: number | null;
    }>(
      `SELECT id, block_id, source_exists, source_checked_at
       FROM cards
       WHERE ${clauses.join(' AND ')}
       ORDER BY source_checked_at IS NOT NULL ASC, source_checked_at ASC, id ASC
       LIMIT ?`,
      [...params, limit],
    );

    return rows
      .map((row) => ({
        cardId: normalizeString(row.id),
        blockId: normalizeString(row.block_id),
        sourceExists: row.source_exists == null ? null : Number(row.source_exists) === 1,
        sourceCheckedAt: normalizeNumber(row.source_checked_at),
      }))
      .filter((row) => row.cardId && row.blockId);
  }

  async updateSourceExistence(updates: SourceExistenceUpdate[], checkedAt = Date.now()): Promise<void> {
    const normalizedUpdates = updates
      .map((update) => ({
        cardId: normalizeString(update.cardId),
        blockId: normalizeString(update.blockId),
        exists: update.exists === true,
      }))
      .filter((update) => update.blockId);
    if (normalizedUpdates.length === 0) {
      return;
    }

    await this.database.write((db) => {
      for (const update of normalizedUpdates) {
        const sourceExists = update.exists ? 1 : 0;
        const sourceMissingAt = update.exists ? null : checkedAt;
        if (update.cardId) {
          db.run(
            `UPDATE cards
             SET source_exists = ?, source_checked_at = ?, source_missing_at = ?
             WHERE id = ? AND block_id = ?`,
            [sourceExists, checkedAt, sourceMissingAt, update.cardId, update.blockId],
          );
        } else {
          db.run(
            `UPDATE cards
             SET source_exists = ?, source_checked_at = ?, source_missing_at = ?
             WHERE block_id = ?`,
            [sourceExists, checkedAt, sourceMissingAt, update.blockId],
          );
        }
      }
    });
  }

  getSourceExistenceSummary(staleBefore = Date.now() - 24 * 60 * 60 * 1000): SourceExistenceSummary {
    const row = this.database.getOne<{
      unknown: number;
      stale: number;
      missing: number;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN source_checked_at IS NULL THEN 1 ELSE 0 END), 0) AS unknown,
        COALESCE(SUM(CASE WHEN source_checked_at IS NOT NULL AND source_checked_at < ? THEN 1 ELSE 0 END), 0) AS stale,
        COALESCE(SUM(CASE WHEN ${MISSING_SOURCE_STATUS_SQL} THEN 1 ELSE 0 END), 0) AS missing
       FROM cards
       WHERE ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}`,
      [staleBefore],
    );
    return {
      unknown: Math.max(0, Number(row?.unknown) || 0),
      stale: Math.max(0, Number(row?.stale) || 0),
      missing: Math.max(0, Number(row?.missing) || 0),
    };
  }

  getSourceExistenceByBlockIds(blockIds: string[]): Map<string, boolean | null> {
    const normalized = normalizeStringArray(blockIds);
    const result = new Map<string, boolean | null>();
    if (normalized.length === 0) {
      return result;
    }

    const placeholders = normalized.map(() => '?').join(', ');
    const rows = this.database.getAll<{
      block_id: string;
      source_exists: number | null;
    }>(
      `SELECT block_id,
              CASE
                WHEN source_exists = 0 AND ${CARD_HAS_RENDERABLE_CONTENT_SQL} THEN NULL
                ELSE source_exists
              END AS source_exists
       FROM cards
       WHERE block_id IN (${placeholders})
         AND ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}`,
      normalized,
    );
    for (const row of rows) {
      const blockId = normalizeString(row.block_id);
      if (!blockId) {
        continue;
      }
      result.set(blockId, row.source_exists == null ? null : Number(row.source_exists) === 1);
    }
    return result;
  }

  queryCardIdsByRootIds(rootIds: string[], options: { excludeKnownMissing?: boolean } = {}): string[] {
    const normalizedRootIds = normalizeStringArray(rootIds);
    if (normalizedRootIds.length === 0) {
      return [];
    }

    const clauses: string[] = [];
    const params: Array<string | number> = [];
    clauses.push(ACTIVE_CARD_NOT_TOMBSTONED_SQL);
    appendInClause(clauses, params, 'root_id', normalizedRootIds);
    if (options.excludeKnownMissing !== false) {
      this.appendSourceStatusClause(clauses, 'active');
    }
    const rows = this.database.getAll<{ id: string }>(
      `SELECT id FROM cards ${this.toWhereSql({ sql: clauses.join(' AND '), params })} ORDER BY id ASC`,
      params,
    );
    return rows.map((row) => row.id).filter(Boolean);
  }

  queryRootlessCardBlockIds(limit = 5000): string[] {
    const rows = this.database.getAll<{ block_id: string }>(
      `SELECT block_id
       FROM cards
       WHERE (root_id IS NULL OR root_id = '')
         AND block_id IS NOT NULL
         AND block_id != ''
         AND ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}
         AND ${ACTIVE_SOURCE_STATUS_SQL}
       ORDER BY id ASC
       LIMIT ?`,
      [Math.max(1, Math.floor(Number(limit) || 5000))],
    );
    return rows.map((row) => normalizeString(row.block_id)).filter(Boolean);
  }

  queryInconsistentCardTypeMarkerIds(): string[] {
    const rows = this.database.getAll<{ id: string }>(
      `SELECT id
       FROM cards
       WHERE ${ACTIVE_CARD_NOT_TOMBSTONED_SQL}
         AND ((card_type_marker = 'concept' AND (type IS NULL OR type != 'concept'))
          OR (card_type_marker = 'descriptor' AND (type IS NULL OR type != 'descriptor')))
       ORDER BY id ASC`,
    );
    return rows.map((row) => row.id).filter(Boolean);
  }

  async persist(): Promise<void> {
    await this.database.persist();
  }

  hasCardsOrXiuyuans(): boolean {
    const row = this.database.getOne<{ count: number }>(
      'SELECT (SELECT COUNT(*) FROM cards) + (SELECT COUNT(*) FROM xiuyuans) AS count',
    );
    return Number(row?.count) > 0;
  }

  createAlgorithmCardStateMigrationBackup(): {
    cards: Array<{ id: string; payload_json: string; dto_json: string | null }>;
    algorithmCardStates: Array<{ card_id: string; algorithm_id: string; state_json: string; updated_at: number }>;
  } {
    return {
      cards: this.database.getAll<{ id: string; payload_json: string; dto_json: string | null }>(
        'SELECT id, payload_json, dto_json FROM cards ORDER BY id',
      ),
      algorithmCardStates: this.database.getAll<{
        card_id: string;
        algorithm_id: string;
        state_json: string;
        updated_at: number;
      }>(
        'SELECT card_id, algorithm_id, state_json, updated_at FROM algorithm_card_state ORDER BY card_id, algorithm_id',
      ),
    };
  }

  getAlgorithmCardStateDiagnostic(): AlgorithmCardStateDiagnosticSummary {
    const rows = this.database.getAll<{
      id: string;
      payload_json: string;
      dto_json: string | null;
    }>('SELECT id, payload_json, dto_json FROM cards ORDER BY id');
    const stateRows = this.loadAlgorithmStateRowMap(rows.map((row) => row.id));
    const summary: AlgorithmCardStateDiagnosticSummary = {
      total: 0,
      dirty: 0,
      missingStateRows: 0,
      invalidStateRows: 0,
      cardStateMismatches: 0,
      orphanStateRows: this.countOrphanActiveAlgorithmRows(),
      reasons: {},
    };

    for (const row of rows) {
      const baseCard = this.parseBaseCardRow(row);
      if (!baseCard?.id) {
        continue;
      }
      summary.total += 1;
      let dirtyCard = false;
      const rawCard = parseJson<FSRSCard | null>(row.payload_json, null);
      if (rawCard?.id) {
        const cleanResult = canonicalizeSchedulingState(rawCard, {
          source: 'sql-repository',
          mode: 'repair-external',
        });
        if (cleanResult.changed) {
          dirtyCard = true;
          for (const reason of cleanResult.reasons) {
            addReason(summary, reason);
          }
        }
      }

      const diagnostic = diagnoseAlgorithmCardStateRow(
        baseCard,
        this.getStateRowForCard(baseCard, stateRows),
      );
      if (diagnostic.missing) {
        summary.missingStateRows += 1;
        dirtyCard = true;
      }
      if (diagnostic.invalid) {
        summary.invalidStateRows += 1;
        dirtyCard = true;
      }
      if (diagnostic.mismatch) {
        summary.cardStateMismatches += 1;
        dirtyCard = true;
      }
      for (const reason of diagnostic.reasons) {
        addReason(summary, reason);
      }
      if (dirtyCard) {
        summary.dirty += 1;
      }
    }

    return summary;
  }

  backfillAlgorithmCardStates(now = Date.now()): AlgorithmCardStateBackfillSummary {
    const before = this.getAlgorithmCardStateDiagnostic();
    const rows = this.database.getAll<{
      id: string;
      payload_json: string;
      dto_json: string | null;
    }>('SELECT id, payload_json, dto_json FROM cards ORDER BY id');
    const stateRows = this.loadAlgorithmStateRowMap(rows.map((row) => row.id));
    const existingSource = this.loadSourceExistenceByCardId();

    for (const row of rows) {
      const baseCard = this.parseBaseCardRow(row);
      if (!baseCard?.id) {
        continue;
      }
      const hydrated = applyAlgorithmCardState(
        baseCard,
        this.getStateRowForCard(baseCard, stateRows),
      );
      this.writeCardRecord(
        this.database,
        hydrated.card,
        undefined,
        existingSource.get(row.id),
        now,
      );
    }
    this.database.run(
      `DELETE FROM algorithm_card_state
       WHERE algorithm_id IN (?, ?)
         AND card_id NOT IN (SELECT id FROM cards)`,
      [...ACTIVE_ALGORITHM_IDS],
    );

    const after = this.getAlgorithmCardStateDiagnostic();
    return {
      ...after,
      backfilled: before.missingStateRows,
      repaired: before.dirty,
      afterDirty: after.dirty,
    };
  }

  private writeCardRecord(
    db: Pick<SqliteDatabaseService, 'run'>,
    card: FSRSCard,
    dto?: CardPersistenceDTO,
    existingSource?: SourceExistenceProjection | null,
    now = Date.now(),
  ): void {
    const dtoDomain = dto ? CardMapper.toDomain(canonicalizeSqlDTO(dto)) : null;
    const sourceCard = dtoDomain
      ? {
        ...dtoDomain,
        ...card,
        meta: {
          ...(dtoDomain.meta || {}),
          ...(card.meta || {}),
        },
      } as FSRSCard
      : card;
    const derived = deriveAlgorithmCardState(sourceCard);
    const cleanCard = derived.card;
    const cleanDto = CardMapper.toPersistence(cleanCard);
    const projection = createCardProjection(cleanCard, cleanDto);
    db.run(
      `INSERT OR REPLACE INTO cards
        (
          id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type, updated_at,
          deck_id, root_id, content_text, tags, suspended, lapses, reps, last_review, created_at,
          scheduled_days, stability, difficulty, a_factor, search_text, card_type_marker,
          source_exists, source_checked_at, source_missing_at, payload_json, dto_json
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanCard.id,
        cleanCard.blockId || null,
        resolveXiuyuanId(cleanCard, cleanDto),
        cleanCard.type || null,
        normalizeNumber(cleanCard.state),
        normalizeNumber(cleanCard.due),
        normalizeNumber(cleanCard.priority),
        cleanCard.schedulerType || null,
        normalizeNumber(cleanCard.updatedAt) || now,
        projection.deckId,
        projection.rootId,
        projection.contentText,
        projection.tags,
        projection.suspended,
        projection.lapses,
        projection.reps,
        projection.lastReview,
        projection.createdAt,
        projection.scheduledDays,
        projection.stability,
        projection.difficulty,
        projection.aFactor,
        projection.searchText,
        projection.cardTypeMarker,
        ...this.resolvePreservedSourceValues(existingSource, cleanCard.blockId),
        stringifyJson(cleanCard),
        stringifyJson(cleanDto),
      ],
    );
    db.run(
      `DELETE FROM algorithm_card_state
       WHERE card_id = ?
         AND algorithm_id IN (?, ?)
         AND algorithm_id != ?`,
      [cleanCard.id, ...ACTIVE_ALGORITHM_IDS, derived.algorithmId],
    );
    db.run(
      `INSERT OR REPLACE INTO algorithm_card_state
        (card_id, algorithm_id, state_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [
        cleanCard.id,
        derived.algorithmId,
        stringifyAlgorithmCardState(derived.state),
        now,
      ],
    );
  }

  private loadAlgorithmStateRowMap(cardIds: string[]): Map<string, AlgorithmCardStateRow> {
    const normalizedIds = normalizeStringArray(cardIds);
    const result = new Map<string, AlgorithmCardStateRow>();
    if (normalizedIds.length === 0) {
      return result;
    }

    const chunkSize = 400;
    for (let index = 0; index < normalizedIds.length; index += chunkSize) {
      const chunk = normalizedIds.slice(index, index + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.database.getAll<{
        card_id: string;
        algorithm_id: string;
        state_json: string;
      }>(
        `SELECT card_id, algorithm_id, state_json
         FROM algorithm_card_state
         WHERE card_id IN (${placeholders})
           AND algorithm_id IN (?, ?)`,
        [...chunk, ...ACTIVE_ALGORITHM_IDS],
      );
      for (const row of rows) {
        result.set(stateRowKey(row.card_id, row.algorithm_id), {
          cardId: row.card_id,
          algorithmId: row.algorithm_id,
          stateJson: row.state_json,
        });
      }
    }
    return result;
  }

  private getStateRowForCard(
    card: Pick<FSRSCard, 'id' | 'type'>,
    stateRows: Map<string, AlgorithmCardStateRow>,
  ): AlgorithmCardStateRow | null {
    return stateRows.get(stateRowKey(card.id, resolveActiveAlgorithmId(card))) || null;
  }

  private hydrateWithAlgorithmState(
    card: FSRSCard,
    stateRows: Map<string, AlgorithmCardStateRow>,
  ): FSRSCard {
    return applyAlgorithmCardState(card, this.getStateRowForCard(card, stateRows)).card;
  }

  private countOrphanActiveAlgorithmRows(): number {
    const row = this.database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM algorithm_card_state state
       LEFT JOIN cards card ON card.id = state.card_id
       WHERE card.id IS NULL
         AND state.algorithm_id IN (?, ?)`,
      [...ACTIVE_ALGORITHM_IDS],
    );
    return Math.max(0, Number(row?.count) || 0);
  }

  private parseBaseCardRow(row: { payload_json: string; dto_json?: string | null }): FSRSCard | null {
    if (row.dto_json) {
      const dto = parseJson<CardPersistenceDTO | null>(row.dto_json, null);
      if (dto?.id) {
        return CardMapper.toDomain(dto);
      }
    }
    const card = parseJson<FSRSCard | null>(row.payload_json, null);
    return card?.id ? canonicalizeSqlCard(card) : null;
  }

  private parseCardRows(rows: Array<{ payload_json: string }>): FSRSCard[] {
    const baseCards = rows
      .map((row) => {
        const card = parseJson<FSRSCard | null>(row.payload_json, null);
        return card?.id ? canonicalizeSqlCard(card) : null;
      })
      .filter((card): card is FSRSCard => Boolean(card));
    const stateRows = this.loadAlgorithmStateRowMap(baseCards.map((card) => card.id));
    return baseCards.map((card) => this.hydrateWithAlgorithmState(card, stateRows));
  }

  private loadSourceExistenceByCardId(): Map<string, SourceExistenceProjection> {
    const rows = this.database.getAll<{
      id: string;
      block_id: string | null;
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT id, block_id, source_exists, source_checked_at, source_missing_at FROM cards',
    );
    const result = new Map<string, SourceExistenceProjection>();
    for (const row of rows) {
      const id = normalizeString(row.id);
      if (!id) {
        continue;
      }
      result.set(id, {
        blockId: row.block_id,
        sourceExists: row.source_exists,
        sourceCheckedAt: row.source_checked_at,
        sourceMissingAt: row.source_missing_at,
      });
    }
    return result;
  }

  private loadSourceExistenceForCard(cardId: string): SourceExistenceProjection | null {
    const normalizedId = normalizeString(cardId);
    if (!normalizedId) {
      return null;
    }
    const row = this.database.getOne<{
      block_id: string | null;
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT block_id, source_exists, source_checked_at, source_missing_at FROM cards WHERE id = ?',
      [normalizedId],
    );
    return row
      ? {
        blockId: row.block_id,
        sourceExists: row.source_exists,
        sourceCheckedAt: row.source_checked_at,
        sourceMissingAt: row.source_missing_at,
      }
      : null;
  }

  private resolvePreservedSourceValues(
    existing: SourceExistenceProjection | null | undefined,
    nextBlockId: unknown,
  ): [number | null, number | null, number | null] {
    const existingBlockId = normalizeString(existing?.blockId);
    const normalizedNextBlockId = normalizeString(nextBlockId);
    if (!existing || !existingBlockId || existingBlockId !== normalizedNextBlockId) {
      return [null, null, null];
    }
    return [
      existing.sourceExists == null ? null : Number(existing.sourceExists),
      normalizeNumber(existing.sourceCheckedAt),
      normalizeNumber(existing.sourceMissingAt),
    ];
  }

  private buildStructuredWhereClause(query?: StructuredCardQuery): WhereClause | null {
    const clauses: string[] = [ACTIVE_CARD_NOT_TOMBSTONED_SQL];
    const params: Array<string | number> = [];

    appendInClause(clauses, params, 'block_id', normalizeStringArray(query?.blockIds));
    appendInClause(clauses, params, 'type', normalizeStringArray(query?.cardTypes));
    appendInClause(
      clauses,
      params,
      'state',
      Array.isArray(query?.states)
        ? query!.states
          .map((state) => Number(state))
          .filter((state) => Number.isFinite(state))
        : [],
    );

    if (query?.dueDate?.lte !== undefined) {
      const dueLte = Number(query.dueDate.lte);
      if (Number.isFinite(dueLte)) {
        clauses.push('due <= ?');
        params.push(dueLte);
      }
    }
    if (query?.dueDate?.gte !== undefined) {
      const dueGte = Number(query.dueDate.gte);
      if (Number.isFinite(dueGte)) {
        clauses.push('due >= ?');
        params.push(dueGte);
      }
    }
    if (query?.priority?.min !== undefined) {
      const priorityMin = Number(query.priority.min);
      if (Number.isFinite(priorityMin)) {
        clauses.push('priority >= ?');
        params.push(priorityMin);
      }
    }
    if (query?.priority?.max !== undefined) {
      const priorityMax = Number(query.priority.max);
      if (Number.isFinite(priorityMax)) {
        clauses.push('priority <= ?');
        params.push(priorityMax);
      }
    }

    if (query?.suspended === true) {
      clauses.push('suspended = 1');
    } else if (query?.suspended === false || query?.includeSuspended === false) {
      clauses.push('suspended = 0');
    }

    this.appendSourceStatusClause(clauses, query?.sourceStatus);

    const tags = normalizeStringArray(query?.tags);
    if (tags.length > 0) {
      clauses.push(`(${tags.map(() => "tags LIKE ? ESCAPE '\\'").join(' OR ')})`);
      params.push(...tags.map((tag) => `%\n${escapeLike(tag)}\n%`));
    }

    return {
      sql: clauses.join(' AND '),
      params,
    };
  }

  private buildBrowserDeckSqlQuery(query: BrowserDeckSnapshotQuery): BrowserDeckSqlQuery | null {
    const clauses: string[] = [ACTIVE_CARD_NOT_TOMBSTONED_SQL];
    const params: Array<string | number> = [];
    const normalizedDocId = normalizeString(query.docId);
    const normalizedCardTypes = normalizeStringArray(query.cardTypes);
    const isMissingBlockScope = normalizedDocId === '__lost__' || normalizedCardTypes.includes('missing-block-only');

    this.appendPresetClauses(clauses, params, query.preset);
    this.appendStateClauses(clauses, params, query.states);
    if (!this.appendBrowserCardTypeClauses(
      clauses,
      params,
      isMissingBlockScope
        ? normalizedCardTypes.filter((cardType) => cardType !== 'missing-block-only')
        : normalizedCardTypes,
    )) {
      return null;
    }
    this.appendStringInClause(clauses, params, 'deck_id', query.deckIds);
    this.appendAllTagsClause(clauses, params, query.tags);
    this.appendSourceStatusClause(clauses, isMissingBlockScope ? 'missing' : 'active');

    if (normalizedDocId && normalizedDocId !== '__lost__') {
      clauses.push('root_id = ?');
      params.push(normalizedDocId);
    }
    this.appendStringInClause(clauses, params, 'root_id', query.scopeDocIds || undefined);

    const searchApplied = this.appendSearchTextClauses(clauses, params, query.searchText);
    if (!searchApplied) {
      return null;
    }

    const orderBy = this.buildBrowserDeckOrderBy(query.sortModel || []);
    if (!orderBy) {
      return null;
    }

    return {
      where: clauses.length > 0 ? { sql: clauses.join(' AND '), params } : null,
      orderBy,
    };
  }

  private appendPresetClauses(
    clauses: string[],
    params: Array<string | number>,
    preset?: string,
  ): void {
    switch (preset) {
      case 'due':
        clauses.push('due <= ?');
        params.push(Date.now());
        break;
      case 'overdue':
        clauses.push('due < ?');
        params.push(Date.now());
        clauses.push('state != ?');
        params.push(CardState.New);
        break;
      case 'new':
        clauses.push('state = ?');
        params.push(CardState.New);
        break;
      case 'learning':
        clauses.push('state = ?');
        params.push(CardState.Learning);
        break;
      case 'review':
        clauses.push('state = ?');
        params.push(CardState.Review);
        break;
      case 'leech':
        clauses.push('lapses > 0');
        break;
      case 'suspended':
        clauses.push('suspended = 1');
        break;
      default:
        break;
    }
  }

  private appendStateClauses(
    clauses: string[],
    params: Array<string | number>,
    states?: number[],
  ): void {
    const normalizedStates = Array.isArray(states)
      ? states.map((state) => Number(state)).filter((state) => Number.isFinite(state))
      : [];
    appendInClause(clauses, params, 'state', normalizedStates);
  }

  private appendSourceStatusClause(
    clauses: string[],
    sourceStatus: StructuredCardQuery['sourceStatus'],
  ): void {
    switch (sourceStatus) {
      case 'active':
        clauses.push(ACTIVE_SOURCE_STATUS_SQL);
        break;
      case 'missing':
        clauses.push(MISSING_SOURCE_STATUS_SQL);
        break;
      case 'all':
      default:
        break;
    }
  }

  private appendBrowserCardTypeClauses(
    clauses: string[],
    params: Array<string | number>,
    cardTypes?: string[],
  ): boolean {
    const normalized = normalizeStringArray(cardTypes);
    if (normalized.length === 0) {
      return true;
    }

    const typeClauses: string[] = [];
    for (const cardType of normalized) {
      if (cardType === 'item') {
        typeClauses.push("(type = ? OR type IS NULL OR type = '')");
        params.push('item');
        continue;
      }
      if (
        cardType === 'topic'
        || cardType === 'concept'
        || cardType === 'descriptor'
        || cardType === 'incremental'
        || cardType === 'webpage'
      ) {
        typeClauses.push('type = ?');
        params.push(cardType);
        continue;
      }
      return false;
    }

    if (typeClauses.length > 0) {
      clauses.push(`(${typeClauses.join(' OR ')})`);
    }
    return true;
  }

  private appendStringInClause(
    clauses: string[],
    params: Array<string | number>,
    column: string,
    values?: string[] | null,
  ): void {
    const normalized = normalizeStringArray(values || undefined);
    appendInClause(clauses, params, column, normalized);
  }

  private appendAllTagsClause(
    clauses: string[],
    params: Array<string | number>,
    tags?: string[],
  ): void {
    const normalizedTags = normalizeStringArray(tags);
    for (const tag of normalizedTags) {
      clauses.push("tags LIKE ? ESCAPE '\\'");
      params.push(`%\n${escapeLike(tag)}\n%`);
    }
  }

  private appendSearchTextClauses(
    clauses: string[],
    params: Array<string | number>,
    searchText?: string,
  ): boolean {
    const normalizedSearch = normalizeString(searchText);
    if (!normalizedSearch) {
      return true;
    }

    const parsed = parseQuery(normalizedSearch);
    this.appendAllTagsClause(clauses, params, parsed.tags);
    this.appendStringInClause(clauses, params, 'deck_id', parsed.decks);
    this.appendStringInClause(clauses, params, 'root_id', parsed.docs);
    this.appendStateClauses(clauses, params, parsed.states);

    if (!this.appendNumberConditions(clauses, params, 'priority', parsed.conditions.priority)) return false;
    if (!this.appendNumberConditions(clauses, params, 'scheduled_days', parsed.conditions.interval)) return false;
    if (!this.appendNumberConditions(clauses, params, 'reps', parsed.conditions.reps)) return false;
    if (!this.appendNumberConditions(clauses, params, 'lapses', parsed.conditions.lapses)) return false;
    if (!this.appendNumberConditions(clauses, params, 'difficulty', parsed.conditions.difficulty)) return false;
    if (!this.appendNumberConditions(clauses, params, 'stability', parsed.conditions.stability)) return false;
    if (parsed.conditions.retrievability?.length) {
      return false;
    }

    if (parsed.text) {
      const like = `%${escapeLike(parsed.text.toLowerCase())}%`;
      clauses.push("search_text LIKE ? ESCAPE '\\'");
      params.push(like);
    }

    return true;
  }

  private appendNumberConditions(
    clauses: string[],
    params: Array<string | number>,
    column: string,
    conditions?: Array<{ operator: string; value: number }>,
  ): boolean {
    if (!conditions?.length) {
      return true;
    }
    const operatorMap: Record<string, string> = {
      '<': '<',
      '>': '>',
      '<=': '<=',
      '>=': '>=',
      '=': '=',
      '!=': '!=',
    };
    for (const condition of conditions) {
      const operator = operatorMap[condition.operator];
      const value = Number(condition.value);
      if (!operator || !Number.isFinite(value)) {
        return false;
      }
      clauses.push(`${column} ${operator} ?`);
      params.push(value);
    }
    return true;
  }

  private buildBrowserDeckOrderBy(sortModel: SortModel[]): string | null {
    const orderItems: string[] = [];
    for (const sort of sortModel || []) {
      if (!sort || (sort.sort !== 'asc' && sort.sort !== 'desc')) {
        continue;
      }
      const column = this.resolveSortColumn(sort.colId);
      if (!column) {
        return null;
      }
      const direction = sort.sort === 'desc' ? 'DESC' : 'ASC';
      orderItems.push(`${column} IS NULL ASC`, `${column} ${direction}`);
    }

    if (orderItems.length === 0) {
      return 'ORDER BY id ASC';
    }

    orderItems.push('block_id ASC', 'id ASC');
    return `ORDER BY ${orderItems.join(', ')}`;
  }

  private resolveSortColumn(colId: unknown): string | null {
    const normalized = normalizeString(colId);
    const now = Date.now();
    const columns: Record<string, string | null> = {
      id: 'id',
      fsrsCardId: 'id',
      blockId: 'block_id',
      deckId: 'deck_id',
      rootId: 'root_id',
      content: 'content_text',
      fullContent: 'content_text',
      priority: 'priority',
      state: 'state',
      stateLabel: 'state',
      cardType: 'type',
      type: 'type',
      due: 'due',
      dueFormatted: 'due',
      interval: 'scheduled_days',
      scheduledDays: 'scheduled_days',
      reps: 'reps',
      lapses: 'lapses',
      difficulty: 'difficulty',
      stability: 'stability',
      lastReview: 'last_review',
      lastReviewFormatted: 'last_review',
      firstReview: 'created_at',
      firstReviewFormatted: 'created_at',
      retrievability: `(CASE
        WHEN stability IS NULL OR stability <= 0 THEN 0
        ELSE 1.0 / (
          1.0 + (
            CASE
              WHEN last_review IS NULL OR last_review <= 0 THEN 0
              ELSE CAST(((${now} - last_review) / 86400000.0) AS INTEGER)
            END
          ) / (9.0 * stability)
        )
      END)`,
      suspended: 'suspended',
      aFactor: 'a_factor',
    };
    return Object.prototype.hasOwnProperty.call(columns, normalized)
      ? columns[normalized]
      : null;
  }

  private normalizePageRequest(page: CardPageRequest, total: number): { startRow: number; endRow: number; limit: number } {
    const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
    const startRow = Math.min(normalizeSqlLimit(page.startRow, 0), safeTotal);
    const defaultEnd = page.endRow == null ? Math.min(startRow + 50, safeTotal) : safeTotal;
    const endRow = Math.max(startRow, Math.min(normalizeSqlLimit(page.endRow, defaultEnd), safeTotal));
    return {
      startRow,
      endRow,
      limit: Math.max(0, endRow - startRow),
    };
  }

  private countByWhere(where: WhereClause | null): number {
    const row = this.database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM cards ${this.toWhereSql(where)}`,
      where?.params,
    );
    return Math.max(0, Number(row?.count) || 0);
  }

  private toWhereSql(where?: WhereClause | null): string {
    return where?.sql ? `WHERE ${where.sql}` : '';
  }

  private matchesStructuredQueryResiduals(card: FSRSCard, query?: StructuredCardQuery): boolean {
    if (!query) {
      return true;
    }

    const dismissed = isCardDismissed(card);

    if (query.suspended === true && !dismissed) {
      return false;
    }

    if (query.suspended === false && dismissed) {
      return false;
    }

    if (query.includeSuspended === false && dismissed) {
      return false;
    }

    if (query.tags && query.tags.length > 0) {
      const cardTags = new Set<string>(Array.isArray(card.tags) ? card.tags : []);
      const metaTags = isObjectRecord(card.meta) && Array.isArray(card.meta.tags)
        ? card.meta.tags
        : [];
      for (const tag of metaTags) {
        if (typeof tag === 'string') {
          cardTags.add(tag);
        }
      }
      if (!query.tags.some((tag) => cardTags.has(tag))) {
        return false;
      }
    }

    if (query.customFilter && !query.customFilter(card)) {
      return false;
    }

    return true;
  }
}
