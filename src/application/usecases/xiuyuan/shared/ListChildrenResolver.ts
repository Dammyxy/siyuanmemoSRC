type SqlPort = {
  sql: (stmt: string) => Promise<Array<Record<string, unknown>>>;
  getBlockKramdown: (blockId: string) => Promise<{ kramdown: string }>;
};

type ListItemRow = {
  id: string;
  content?: string;
  subtype?: string;
};

export interface ResolvedListChild {
  id: string;
  content: string;
  subtype: string;
}

export interface ResolvedListChildren {
  parentParagraphId: string;
  parentKramdown: string;
  orderedChildren: ResolvedListChild[];
  unorderedChildren: ResolvedListChild[];
  source: 'direct' | 'recursive';
}

function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeChildRow(row: ListItemRow): ResolvedListChild {
  return {
    id: row.id,
    content: typeof row.content === 'string' ? row.content : '',
    subtype: typeof row.subtype === 'string' ? row.subtype : '',
  };
}

export async function resolveListChildrenBySubtype(
  parentBlockId: string,
  siyuanApi: SqlPort
): Promise<ResolvedListChildren> {
  const safeParentBlockId = escapeSqlValue(parentBlockId);

  const parentTypeRows = await siyuanApi.sql(`
    SELECT type
    FROM blocks
    WHERE id = '${safeParentBlockId}'
    LIMIT 1
  `);
  if (!parentTypeRows || parentTypeRows.length === 0) {
    throw new Error('Block does not exist');
  }
  if (parentTypeRows[0]?.type !== 'i') {
    throw new Error(`Only list-item blocks are supported (current type: ${String(parentTypeRows[0]?.type || '')})`);
  }

  const paragraphRows = await siyuanApi.sql(`
    SELECT id
    FROM blocks
    WHERE parent_id = '${safeParentBlockId}'
      AND type = 'p'
    LIMIT 1
  `);
  if (!paragraphRows || paragraphRows.length === 0 || typeof paragraphRows[0]?.id !== 'string') {
    throw new Error('Parent list-item is missing paragraph block');
  }
  const parentParagraphId = paragraphRows[0].id as string;

  const listContainerRows = await siyuanApi.sql(`
    SELECT id
    FROM blocks
    WHERE parent_id = '${safeParentBlockId}'
      AND type = 'l'
    LIMIT 1
  `);
  if (!listContainerRows || listContainerRows.length === 0 || typeof listContainerRows[0]?.id !== 'string') {
    throw new Error('List container not found under parent list-item');
  }
  const listContainerId = listContainerRows[0].id as string;
  const safeListContainerId = escapeSqlValue(listContainerId);

  const directChildrenRows = await siyuanApi.sql(`
    SELECT id, content, subtype
    FROM blocks
    WHERE parent_id = '${safeListContainerId}'
      AND type = 'i'
    ORDER BY sort ASC, id ASC
  `);

  let source: 'direct' | 'recursive' = 'direct';
  let listItemRows = (directChildrenRows || []) as ListItemRow[];

  if (listItemRows.length === 0) {
    source = 'recursive';
    const recursiveRows = await siyuanApi.sql(`
      WITH RECURSIVE descendants AS (
        SELECT id, type, subtype, content, parent_id, sort
        FROM blocks
        WHERE parent_id = '${safeListContainerId}'
        UNION ALL
        SELECT b.id, b.type, b.subtype, b.content, b.parent_id, b.sort
        FROM blocks b
        INNER JOIN descendants d ON b.parent_id = d.id
      )
      SELECT id, content, subtype
      FROM descendants
      WHERE type = 'i'
      ORDER BY sort ASC, id ASC
    `);
    listItemRows = (recursiveRows || []) as ListItemRow[];
  }

  const normalizedChildren = listItemRows.map(normalizeChildRow);
  const orderedChildren = normalizedChildren.filter((row) => row.subtype === 'o');
  const unorderedChildren = normalizedChildren.filter((row) => row.subtype !== 'o');
  const { kramdown } = await siyuanApi.getBlockKramdown(parentBlockId);

  return {
    parentParagraphId,
    parentKramdown: kramdown || '',
    orderedChildren,
    unorderedChildren,
    source,
  };
}

