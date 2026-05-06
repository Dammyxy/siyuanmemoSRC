import type {
  HostBlockAttrRow,
  HostBlockQueryPort,
  HostBlockRow,
  SharedListItemRow,
  SharedParagraphRow,
} from '@/application/ports/HostBlockQueryPort';
import { getBlockKramdown, sql } from './api';

type RawRow = Record<string, unknown>;

function escapeSql(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

function normalizeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ));
}

function toInClause(ids: string[]): string {
  return ids.map((id) => `'${escapeSql(id)}'`).join(',');
}

function normalizeBlockRow(row: RawRow): HostBlockRow | null {
  const id = normalizeId(row.id);
  if (!id) {
    return null;
  }
  return {
    id,
    type: normalizeString(row.type) || undefined,
    subtype: normalizeString(row.subtype) || undefined,
    parent_id: normalizeString(row.parent_id) || undefined,
    root_id: normalizeString(row.root_id) || undefined,
    content: normalizeString(row.content),
    markdown: normalizeString(row.markdown),
  };
}

function normalizeParagraphRow(row: RawRow): SharedParagraphRow | null {
  const normalized = normalizeBlockRow(row);
  if (!normalized) {
    return null;
  }
  return {
    id: normalized.id,
    content: normalized.content || '',
    markdown: normalized.markdown || '',
  };
}

function normalizeListItemRow(row: RawRow): SharedListItemRow | null {
  const normalized = normalizeBlockRow(row);
  if (!normalized) {
    return null;
  }
  return {
    id: normalized.id,
    subtype: normalized.subtype || '',
    content: normalized.content || '',
    markdown: normalized.markdown || '',
  };
}

export class HostBlockQuerySiyuanAdapter implements HostBlockQueryPort {
  async getBlock(blockId: string): Promise<HostBlockRow | null> {
    const safeId = escapeSql(blockId);
    const rows = await sql<RawRow>(`
      SELECT id, type, subtype, parent_id, root_id, content, markdown
      FROM blocks
      WHERE id = '${safeId}'
      LIMIT 1
    `);
    return rows.length > 0 ? normalizeBlockRow(rows[0]) : null;
  }

  async getBlockType(blockId: string): Promise<string | null> {
    const row = await this.getBlock(blockId);
    return row?.type || null;
  }

  async getParentId(blockId: string): Promise<string | null> {
    const row = await this.getBlock(blockId);
    return row?.parent_id || null;
  }

  async getBlockTypeAndContent(blockId: string): Promise<{ type: string | null; content: string } | null> {
    const row = await this.getBlock(blockId);
    if (!row) {
      return null;
    }
    return {
      type: row.type || null,
      content: row.content || '',
    };
  }

  async getBlockMarkdownAndContent(blockId: string): Promise<{ markdown: string; content: string } | null> {
    const row = await this.getBlock(blockId);
    if (!row) {
      return null;
    }
    return {
      markdown: row.markdown || '',
      content: row.content || '',
    };
  }

  async getDocumentRootId(blockId: string): Promise<string | null> {
    const row = await this.getBlock(blockId);
    return row?.root_id || null;
  }

  async getExistingBlockIds(blockIds: string[]): Promise<Set<string>> {
    const normalizedIds = uniqueIds(blockIds);
    const existing = new Set<string>();
    if (normalizedIds.length === 0) {
      return existing;
    }
    const rows = await sql<RawRow>(`
      SELECT id
      FROM blocks
      WHERE id IN (${toInClause(normalizedIds)})
      LIMIT ${normalizedIds.length}
    `);
    for (const row of rows) {
      const id = normalizeId(row.id);
      if (id) {
        existing.add(id);
      }
    }
    return existing;
  }

  async getSubtreeBlockIds(rootBlockIds: string[]): Promise<string[]> {
    const normalizedRoots = uniqueIds(rootBlockIds);
    if (normalizedRoots.length === 0) {
      return [];
    }
    const rows = await sql<RawRow>(`
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM blocks
        WHERE id IN (${toInClause(normalizedRoots)})
        UNION
        SELECT b.id
        FROM blocks b
        INNER JOIN descendants d ON b.parent_id = d.id
      )
      SELECT DISTINCT id
      FROM descendants
    `);
    return uniqueIds([
      ...normalizedRoots,
      ...rows.map((row) => normalizeId(row.id)),
    ]);
  }

  async getManagedBlockAttrs(attrNames: string[]): Promise<HostBlockAttrRow[]> {
    const normalizedNames = uniqueIds(attrNames);
    if (normalizedNames.length === 0) {
      return [];
    }
    const rows = await sql<RawRow>(`
      SELECT block_id, name, value
      FROM attributes
      WHERE name IN (${toInClause(normalizedNames)})
    `);
    return rows
      .map((row) => ({
        block_id: normalizeId(row.block_id),
        name: normalizeString(row.name).trim(),
        value: normalizeString(row.value),
      }))
      .filter((row) => row.block_id.length > 0 && row.name.length > 0);
  }

  async getXiuyuanBindingAttrs(blockId: string): Promise<Record<string, string>> {
    const safeBlockId = escapeSql(blockId);
    const rows = await sql<RawRow>(`
      SELECT name, value
      FROM attributes
      WHERE block_id = '${safeBlockId}'
        AND name IN ('custom-xiuyuan-id', 'custom-fsrs-xiuyuan-id')
    `);
    const attrs: Record<string, string> = {};
    for (const row of rows) {
      const name = normalizeString(row.name).trim();
      if (name) {
        attrs[name] = normalizeString(row.value);
      }
    }
    return attrs;
  }

  async getFirstParagraphUnderParent(parentId: string): Promise<SharedParagraphRow | null> {
    const safeParentId = escapeSql(parentId);
    const rows = await sql<RawRow>(`
      SELECT id, content, markdown
      FROM blocks
      WHERE parent_id = '${safeParentId}'
        AND type = 'p'
      ORDER BY sort ASC, id ASC
      LIMIT 1
    `);
    return rows.length > 0 ? normalizeParagraphRow(rows[0]) : null;
  }

  async listListContainerIds(parentId: string): Promise<string[]> {
    const safeParentId = escapeSql(parentId);
    const rows = await sql<RawRow>(`
      SELECT id
      FROM blocks
      WHERE parent_id = '${safeParentId}'
        AND type = 'l'
      ORDER BY sort ASC, id ASC
    `);
    return rows.map((row) => normalizeId(row.id)).filter(Boolean);
  }

  async getFirstListContainerId(parentId: string): Promise<string | null> {
    const ids = await this.listListContainerIds(parentId);
    return ids[0] || null;
  }

  async listListItemIdsUnderParent(parentId: string): Promise<string[]> {
    const rows = await this.listListItemsUnderParent(parentId);
    return rows.map((row) => row.id);
  }

  async listListItemsUnderParent(parentId: string): Promise<SharedListItemRow[]> {
    const safeParentId = escapeSql(parentId);
    const rows = await sql<RawRow>(`
      SELECT id, subtype, content, markdown
      FROM blocks
      WHERE parent_id = '${safeParentId}'
        AND type = 'i'
      ORDER BY sort ASC, id ASC
    `);
    return rows
      .map((row) => normalizeListItemRow(row))
      .filter((row): row is SharedListItemRow => row !== null);
  }

  async listRecursiveListItemsUnderParent(parentId: string): Promise<SharedListItemRow[]> {
    const safeParentId = escapeSql(parentId);
    const rows = await sql<RawRow>(`
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
    `);
    return rows
      .map((row) => normalizeListItemRow(row))
      .filter((row): row is SharedListItemRow => row !== null);
  }

  async listDescendantParagraphs(rootId: string): Promise<SharedParagraphRow[]> {
    const safeRootId = escapeSql(rootId);
    const rows = await sql<RawRow>(`
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
    `);
    return rows
      .map((row) => normalizeParagraphRow(row))
      .filter((row): row is SharedParagraphRow => row !== null);
  }

  async listBlockTypesByIds(blockIds: string[]): Promise<Array<{ id: string; type: string }>> {
    const normalizedIds = uniqueIds(blockIds);
    if (normalizedIds.length === 0) {
      return [];
    }
    const rows = await sql<RawRow>(`
      SELECT id, type
      FROM blocks
      WHERE id IN (${toInClause(normalizedIds)})
    `);
    return rows
      .map((row) => {
        const id = normalizeId(row.id);
        const type = normalizeString(row.type);
        return id && type ? { id, type } : null;
      })
      .filter((row): row is { id: string; type: string } => row !== null);
  }

  async listBlocksByRoot(rootId: string, types: string[]): Promise<HostBlockRow[]> {
    const normalizedTypes = uniqueIds(types);
    if (!String(rootId || '').trim() || normalizedTypes.length === 0) {
      return [];
    }
    const rows = await sql<RawRow>(`
      SELECT id, type, parent_id, content, markdown
      FROM blocks
      WHERE root_id = '${escapeSql(rootId)}'
        AND type IN (${toInClause(normalizedTypes)})
      ORDER BY id ASC
    `);
    return rows
      .map((row) => normalizeBlockRow(row))
      .filter((row): row is HostBlockRow => row !== null);
  }

  async listParagraphChildren(parentId: string): Promise<HostBlockRow[]> {
    const safeParentId = escapeSql(parentId);
    const rows = await sql<RawRow>(`
      SELECT id, type, parent_id, content, markdown
      FROM blocks
      WHERE parent_id = '${safeParentId}'
        AND type = 'p'
      ORDER BY sort ASC, id ASC
    `);
    return rows
      .map((row) => normalizeBlockRow(row))
      .filter((row): row is HostBlockRow => row !== null);
  }

  async listParentIdsWithParagraphChild(parentIds: string[]): Promise<Set<string>> {
    const normalizedIds = uniqueIds(parentIds);
    const result = new Set<string>();
    if (normalizedIds.length === 0) {
      return result;
    }
    const rows = await sql<RawRow>(`
      SELECT DISTINCT parent_id
      FROM blocks
      WHERE parent_id IN (${toInClause(normalizedIds)})
        AND type = 'p'
    `);
    for (const row of rows) {
      const parentId = normalizeId(row.parent_id);
      if (parentId) {
        result.add(parentId);
      }
    }
    return result;
  }

  async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
    return getBlockKramdown(blockId);
  }
}
