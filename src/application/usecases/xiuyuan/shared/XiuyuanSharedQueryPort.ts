type SqlSource = {
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getBlockKramdown: (blockId: string) => Promise<{ kramdown: string }>;
};

type SharedRow = {
  id?: unknown;
  type?: unknown;
  subtype?: unknown;
  parent_id?: unknown;
  content?: unknown;
  markdown?: unknown;
};

export interface SharedParagraphRow {
  id: string;
  content: string;
  markdown: string;
}

export interface SharedListItemRow extends SharedParagraphRow {
  subtype: string;
}

export interface XiuyuanSharedQueryPort {
  getBlockType(blockId: string): Promise<string | null>;
  getParentId(blockId: string): Promise<string | null>;
  getBlockTypeAndContent(blockId: string): Promise<{ type: string | null; content: string } | null>;
  getBlockMarkdownAndContent(blockId: string): Promise<{ markdown: string; content: string } | null>;
  getXiuyuanBindingAttrs(blockId: string): Promise<Record<string, string>>;
  getFirstParagraphUnderParent(parentId: string): Promise<SharedParagraphRow | null>;
  getFirstListContainerId(parentId: string): Promise<string | null>;
  listListContainerIds(parentId: string): Promise<string[]>;
  listListItemIdsUnderParent(parentId: string): Promise<string[]>;
  listListItemsUnderParent(parentId: string): Promise<SharedListItemRow[]>;
  listDescendantParagraphs(rootId: string): Promise<SharedParagraphRow[]>;
  listBlockTypesByIds(blockIds: string[]): Promise<Array<{ id: string; type: string }>>;
  listRecursiveListItemsUnderParent(parentId: string): Promise<SharedListItemRow[]>;
  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
}

function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

function asRows(result: unknown): SharedRow[] {
  return Array.isArray(result) ? result as SharedRow[] : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeParagraphRow(row: SharedRow): SharedParagraphRow | null {
  if (typeof row.id !== 'string' || row.id.length === 0) {
    return null;
  }
  return {
    id: row.id,
    content: asString(row.content),
    markdown: asString(row.markdown),
  };
}

function normalizeListItemRow(row: SharedRow): SharedListItemRow | null {
  if (typeof row.id !== 'string' || row.id.length === 0) {
    return null;
  }
  return {
    id: row.id,
    subtype: asString(row.subtype),
    content: asString(row.content),
    markdown: asString(row.markdown),
  };
}

function hasQueryMethods(candidate: XiuyuanSharedQueryPort | SqlSource): candidate is XiuyuanSharedQueryPort {
  return typeof (candidate as XiuyuanSharedQueryPort).getBlockType === 'function'
    && typeof (candidate as XiuyuanSharedQueryPort).listListItemsUnderParent === 'function';
}

function createQueryPortFromSqlSource(source: SqlSource): XiuyuanSharedQueryPort {
  return {
    async getBlockType(blockId: string): Promise<string | null> {
      const safeId = escapeSqlValue(blockId);
      const rows = asRows(await source.sql(`
        SELECT type FROM blocks
        WHERE id = '${safeId}'
        LIMIT 1
      `));
      if (rows.length === 0) {
        return null;
      }
      return typeof rows[0].type === 'string' ? rows[0].type : null;
    },

    async getParentId(blockId: string): Promise<string | null> {
      const safeId = escapeSqlValue(blockId);
      const rows = asRows(await source.sql(`
        SELECT parent_id
        FROM blocks
        WHERE id = '${safeId}'
        LIMIT 1
      `));
      if (rows.length === 0 || typeof rows[0].parent_id !== 'string') {
        return null;
      }
      return rows[0].parent_id;
    },

    async getBlockTypeAndContent(blockId: string): Promise<{ type: string | null; content: string } | null> {
      const safeId = escapeSqlValue(blockId);
      const rows = asRows(await source.sql(`
        SELECT type, content
        FROM blocks
        WHERE id = '${safeId}'
        LIMIT 1
      `));
      if (rows.length === 0) {
        return null;
      }
      return {
        type: typeof rows[0].type === 'string' ? rows[0].type : null,
        content: asString(rows[0].content),
      };
    },

    async getBlockMarkdownAndContent(blockId: string): Promise<{ markdown: string; content: string } | null> {
      const safeId = escapeSqlValue(blockId);
      const rows = asRows(await source.sql(`
        SELECT markdown, content
        FROM blocks
        WHERE id = '${safeId}'
        LIMIT 1
      `));
      if (rows.length === 0) {
        return null;
      }
      return {
        markdown: asString(rows[0].markdown),
        content: asString(rows[0].content),
      };
    },

    async getXiuyuanBindingAttrs(blockId: string): Promise<Record<string, string>> {
      const safeBlockId = escapeSqlValue(blockId);
      const rows = asRows(await source.sql(`
        SELECT name, value
        FROM attributes
        WHERE block_id = '${safeBlockId}'
          AND name IN ('custom-xiuyuan-id', 'custom-fsrs-xiuyuan-id')
      `));
      const attrs: Record<string, string> = {};
      for (const row of rows) {
        const raw = row as Record<string, unknown>;
        const name = typeof raw.name === 'string' ? raw.name : '';
        const value = typeof raw.value === 'string' ? raw.value : '';
        if (name.length > 0) {
          attrs[name] = value;
        }
      }
      return attrs;
    },

    async getFirstParagraphUnderParent(parentId: string): Promise<SharedParagraphRow | null> {
      const safeParentId = escapeSqlValue(parentId);
      const rows = asRows(await source.sql(`
        SELECT id, content, markdown
        FROM blocks
        WHERE parent_id = '${safeParentId}'
          AND type = 'p'
        ORDER BY sort ASC, id ASC
        LIMIT 1
      `));
      if (rows.length === 0) {
        return null;
      }
      return normalizeParagraphRow(rows[0]);
    },

    async listListContainerIds(parentId: string): Promise<string[]> {
      const safeParentId = escapeSqlValue(parentId);
      const rows = asRows(await source.sql(`
        SELECT id
        FROM blocks
        WHERE parent_id = '${safeParentId}'
          AND type = 'l'
        ORDER BY sort ASC, id ASC
      `));
      return rows
        .map((row) => (typeof row.id === 'string' ? row.id : ''))
        .filter((id) => id.length > 0);
    },

    async getFirstListContainerId(parentId: string): Promise<string | null> {
      const safeParentId = escapeSqlValue(parentId);
      const rows = asRows(await source.sql(`
        SELECT id
        FROM blocks
        WHERE parent_id = '${safeParentId}'
          AND type = 'l'
        ORDER BY sort ASC, id ASC
        LIMIT 1
      `));
      if (rows.length === 0 || typeof rows[0].id !== 'string') {
        return null;
      }
      return rows[0].id;
    },

    async listListItemsUnderParent(parentId: string): Promise<SharedListItemRow[]> {
      const safeParentId = escapeSqlValue(parentId);
      const rows = asRows(await source.sql(`
        SELECT id, subtype, content, markdown
        FROM blocks
        WHERE parent_id = '${safeParentId}'
          AND type = 'i'
        ORDER BY sort ASC, id ASC
      `));
      return rows
        .map((row) => normalizeListItemRow(row))
        .filter((row): row is SharedListItemRow => row !== null);
    },

    async listListItemIdsUnderParent(parentId: string): Promise<string[]> {
      const safeParentId = escapeSqlValue(parentId);
      const rows = asRows(await source.sql(`
        SELECT id FROM blocks
        WHERE parent_id = '${safeParentId}'
          AND type = 'i'
        ORDER BY id ASC
      `));
      return rows
        .map((row) => (typeof row.id === 'string' ? row.id : ''))
        .filter((id) => id.length > 0);
    },

    async listDescendantParagraphs(rootId: string): Promise<SharedParagraphRow[]> {
      const safeRootId = escapeSqlValue(rootId);
      const rows = asRows(await source.sql(`
        WITH RECURSIVE descendants AS (
          SELECT id, type, parent_id, sort, content, markdown, printf('%020d', COALESCE(sort, 0)) AS path
          FROM blocks
          WHERE id = '${safeRootId}'
          UNION ALL
          SELECT b.id, b.type, b.parent_id, b.sort, b.content, b.markdown, d.path || '/' || printf('%020d', COALESCE(b.sort, 0))
          FROM blocks b
          INNER JOIN descendants d ON b.parent_id = d.id
        )
        SELECT id, content, markdown
        FROM descendants
        WHERE type = 'p'
        ORDER BY path ASC, id ASC
      `));
      return rows
        .map((row) => normalizeParagraphRow(row))
        .filter((row): row is SharedParagraphRow => row !== null);
    },

    async listBlockTypesByIds(blockIds: string[]): Promise<Array<{ id: string; type: string }>> {
      if (blockIds.length === 0) {
        return [];
      }
      const inClause = blockIds.map((id) => `'${escapeSqlValue(id)}'`).join(',');
      const rows = asRows(await source.sql(`
        SELECT id, type
        FROM blocks
        WHERE id IN (${inClause})
      `));
      return rows
        .map((row) => {
          if (typeof row.id !== 'string' || typeof row.type !== 'string') {
            return null;
          }
          return { id: row.id, type: row.type };
        })
        .filter((row): row is { id: string; type: string } => row !== null);
    },

    async listRecursiveListItemsUnderParent(parentId: string): Promise<SharedListItemRow[]> {
      const safeParentId = escapeSqlValue(parentId);
      const rows = asRows(await source.sql(`
        WITH RECURSIVE descendants AS (
          SELECT id, type, subtype, content, markdown, parent_id, sort
          FROM blocks
          WHERE parent_id = '${safeParentId}'
          UNION ALL
          SELECT b.id, b.type, b.subtype, b.content, b.markdown, b.parent_id, b.sort
          FROM blocks b
          INNER JOIN descendants d ON b.parent_id = d.id
        )
        SELECT id, subtype, content, markdown
        FROM descendants
        WHERE type = 'i'
        ORDER BY sort ASC, id ASC
      `));
      return rows
        .map((row) => normalizeListItemRow(row))
        .filter((row): row is SharedListItemRow => row !== null);
    },

    async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
      return source.getBlockKramdown(blockId);
    },
  };
}

export function toXiuyuanSharedQueryPort(
  queryPortOrSource: XiuyuanSharedQueryPort | SqlSource
): XiuyuanSharedQueryPort {
  if (hasQueryMethods(queryPortOrSource)) {
    return queryPortOrSource;
  }
  return createQueryPortFromSqlSource(queryPortOrSource);
}
