import { ATTR_CARD_ID } from './block.ts';

export type CardBlockFilter =
  | { type: 'doc'; docId: string }
  | { type: 'tree'; box: string; pathPrefix: string }
  | { type: 'backlink'; defBlockId: string }
  | { type: 'sql'; stmt: string };

export function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

export function buildCardBlockIdStmt(filter: CardBlockFilter): string {
  if (filter.type === 'doc') {
    return `
    SELECT b.id FROM blocks b
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE b.root_id = '${escapeSql(filter.docId)}'
      AND a.name = '${ATTR_CARD_ID}'
      AND a.value != ''
  `;
  }
  if (filter.type === 'tree') {
    return `
    SELECT b.id FROM blocks b
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE b.box = '${escapeSql(filter.box)}'
      AND b.path LIKE '${escapeSql(filter.pathPrefix)}%'
      AND a.name = '${ATTR_CARD_ID}'
      AND a.value != ''
  `;
  }
  if (filter.type === 'backlink') {
    return `
    SELECT b.id FROM blocks b
    INNER JOIN refs r ON b.id = r.block_id
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE r.def_block_id = '${escapeSql(filter.defBlockId)}'
      AND a.name = '${ATTR_CARD_ID}'
      AND a.value != ''
  `;
  }
  return `
    SELECT b.id FROM (${filter.stmt}) b
    INNER JOIN attributes a ON b.id = a.block_id
    WHERE a.name = '${ATTR_CARD_ID}'
      AND a.value != ''
  `;
}

