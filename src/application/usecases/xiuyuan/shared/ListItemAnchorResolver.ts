type SqlPort = {
  sql: <T extends Record<string, unknown> = Record<string, unknown>>(stmt: string) => Promise<T[]>;
};

interface BlockRow extends Record<string, unknown> {
  id?: unknown;
  type?: unknown;
  parent_id?: unknown;
}

function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

export async function resolveListItemAnchorBlockId(
  selectedBlockId: string,
  siyuanApi: SqlPort,
): Promise<string | null> {
  const safeSelectedBlockId = escapeSqlValue(selectedBlockId);
  const selectedRows = await siyuanApi.sql<BlockRow>(`
    SELECT id, type, parent_id
    FROM blocks
    WHERE id = '${safeSelectedBlockId}'
    LIMIT 1
  `);
  if (!selectedRows || selectedRows.length === 0) {
    return null;
  }

  const selected = selectedRows[0];
  if (selected?.type === 'i' && typeof selected.id === 'string' && selected.id.length > 0) {
    return selected.id;
  }

  if (selected?.type !== 'p' || typeof selected.parent_id !== 'string' || selected.parent_id.length === 0) {
    return null;
  }

  const safeParentId = escapeSqlValue(selected.parent_id);
  const parentRows = await siyuanApi.sql<BlockRow>(`
    SELECT id, type
    FROM blocks
    WHERE id = '${safeParentId}'
    LIMIT 1
  `);
  if (!parentRows || parentRows.length === 0) {
    return null;
  }

  const parent = parentRows[0];
  if (parent?.type !== 'i' || typeof parent.id !== 'string' || parent.id.length === 0) {
    return null;
  }

  return parent.id;
}
