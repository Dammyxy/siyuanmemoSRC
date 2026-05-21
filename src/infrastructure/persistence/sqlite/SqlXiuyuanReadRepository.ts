import type { XiuyuanSqlReadPort } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { CardPersistenceDTO } from '@/infrastructure/persistence/dto/CardPersistenceDTO';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import { parseJson } from './json';

const ACTIVE_XIUYUAN_SQL = `NOT EXISTS (
  SELECT 1 FROM tombstones t
  WHERE t.kind = 'xiuyuan' AND t.id = xiuyuans.id
)`;

const ACTIVE_CARD_SQL = `NOT EXISTS (
  SELECT 1 FROM tombstones t
  WHERE t.kind = 'card' AND t.id = cards.id
)`;

function parseXiuyuan(row: { payload_json: string } | null | undefined): IXiuyuan | null {
  const parsed = parseJson<IXiuyuan | null>(row?.payload_json, null);
  return parsed?.id ? parsed : null;
}

export class SqlXiuyuanReadRepository implements XiuyuanSqlReadPort {
  constructor(private readonly database: SqliteDatabaseService) {}

  findById(id: string): IXiuyuan | null {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return null;
    }

    return parseXiuyuan(this.database.getOne<{ payload_json: string }>(
      `SELECT payload_json FROM xiuyuans
       WHERE id = ? AND ${ACTIVE_XIUYUAN_SQL}`,
      [normalizedId],
    ));
  }

  findByBlockId(blockId: string): IXiuyuan[] {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return [];
    }

    const rows = this.database.getAll<{ payload_json: string }>(
      `SELECT DISTINCT xiuyuans.payload_json
       FROM cards
       INNER JOIN xiuyuans ON xiuyuans.id = cards.xiuyuan_id
       WHERE cards.block_id = ?
         AND cards.xiuyuan_id IS NOT NULL
         AND cards.xiuyuan_id != ''
         AND ${ACTIVE_CARD_SQL}
         AND ${ACTIVE_XIUYUAN_SQL}
       ORDER BY xiuyuans.id ASC`,
      [normalizedBlockId],
    );

    return rows
      .map((row) => parseXiuyuan(row))
      .filter((xiuyuan): xiuyuan is IXiuyuan => Boolean(xiuyuan));
  }

  getCardDTO(cardId: string): CardPersistenceDTO | null {
    const normalizedCardId = String(cardId || '').trim();
    if (!normalizedCardId) {
      return null;
    }

    const row = this.database.getOne<{ dto_json: string | null }>(
      `SELECT dto_json FROM cards
       WHERE id = ? AND ${ACTIVE_CARD_SQL}`,
      [normalizedCardId],
    );
    return parseJson<CardPersistenceDTO | null>(row?.dto_json, null);
  }
}
