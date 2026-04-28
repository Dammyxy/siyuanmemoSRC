import type { StorageLoadReason, UnifiedCardStore } from '@/core/storage/UnifiedStorageManager';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import { CardMapper } from '@/infrastructure/persistence/mappers/CardMapper';
import type { FSRSCard } from '@/types/card';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { StructuredCardQuery } from '@/types/card-query';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { stringifyJson, parseJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

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

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

export class SqlUnifiedStorageRepository {
  constructor(private readonly database: SqliteDatabaseService) {}

  async loadStore(_reason: StorageLoadReason = 'unspecified'): Promise<UnifiedCardStore> {
    return this.database.read(() => {
      const store = createEmptyStore();
      const cardRows = this.database.getAll<{
        id: string;
        payload_json: string;
        dto_json: string | null;
      }>('SELECT id, payload_json, dto_json FROM cards ORDER BY id');
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
        store.cards[row.id] = parseJson<FSRSCard>(row.payload_json, {} as FSRSCard);
        if (row.dto_json) {
          store.cardDTOs![row.id] = parseJson<CardPersistenceDTO>(row.dto_json, {} as CardPersistenceDTO);
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
      db.run('DELETE FROM cards');
      db.run('DELETE FROM xiuyuans');
      db.run('DELETE FROM tombstones');
      db.run('DELETE FROM riff_sync');
      db.run('DELETE FROM store_metadata WHERE key IN (?, ?)', ['sync_metadata', 'unified_store_version']);

      const cardDTOs = store.cardDTOs || {};
      for (const [id, card] of Object.entries(store.cards || {})) {
        const dto = cardDTOs[id];
        db.run(
          `INSERT INTO cards
          (id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type, updated_at, payload_json, dto_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            card.blockId || null,
            resolveXiuyuanId(card, dto),
            card.type || null,
            normalizeNumber(card.state),
            normalizeNumber(card.due),
            normalizeNumber(card.priority),
            card.schedulerType || null,
            normalizeNumber(card.updatedAt) || Date.now(),
            stringifyJson(card),
            dto ? stringifyJson(dto) : null,
          ],
        );
      }

      for (const [id, xiuyuan] of Object.entries(store.xiuyuans || {})) {
        const updatedAt = normalizeNumber((xiuyuan as { updatedAt?: unknown }).updatedAt) || Date.now();
        db.run(
          'INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)',
          [id, updatedAt, stringifyJson(xiuyuan)],
        );
      }

      for (const [id, tombstone] of Object.entries(store.deletedCardDTOs || {})) {
        db.run(
          `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
           VALUES (?, ?, ?, ?, ?)`,
          ['card', id, normalizeNumber(tombstone.deletedAt) || Date.now(), tombstone.deletedBy || null, stringifyJson(tombstone)],
        );
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

  upsertCards(cards: FSRSCard[]): void {
    for (const card of cards) {
      this.upsertCard(card);
    }
  }

  upsertCard(card: FSRSCard): void {
    const dto = CardMapper.toPersistence(card);
    this.database.run(
      `INSERT OR REPLACE INTO cards
        (id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type, updated_at, payload_json, dto_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.blockId || null,
        resolveXiuyuanId(card, dto),
        card.type || null,
        normalizeNumber(card.state),
        normalizeNumber(card.due),
        normalizeNumber(card.priority),
        card.schedulerType || null,
        normalizeNumber(card.updatedAt) || Date.now(),
        stringifyJson(card),
        stringifyJson(dto),
      ],
    );
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
      'SELECT payload_json FROM cards WHERE id = ?',
      [normalizedId],
    );
    return row ? this.parseCardRow(row) : undefined;
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

  queryCards(query?: StructuredCardQuery): FSRSCard[] {
    const clauses: string[] = [];
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

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = query?.dueDate?.lte !== undefined || query?.dueDate?.gte !== undefined
      ? 'ORDER BY due ASC, priority ASC, id ASC'
      : 'ORDER BY id ASC';
    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT payload_json FROM cards ${whereClause} ${orderBy}`,
      params,
    );

    return rows
      .map((row) => this.parseCardRow(row))
      .filter((card): card is FSRSCard => Boolean(card))
      .filter((card) => this.matchesStructuredQueryResiduals(card, query));
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

  private parseCardRow(row: { payload_json: string }): FSRSCard | null {
    const card = parseJson<FSRSCard | null>(row.payload_json, null);
    return card?.id ? card : null;
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
