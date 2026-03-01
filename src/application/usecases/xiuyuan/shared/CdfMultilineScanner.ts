import { detectDescriptorOrDefinitionKind, type DescriptorOrDefinitionKind } from './DescriptorTemplateStrategy';

type SqlPort = {
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getBlockKramdown: (blockId: string) => Promise<{ kramdown: string }>;
};

type BlockRow = {
  id: string;
  type?: string;
  subtype?: string;
  parent_id?: string;
  content?: string;
  markdown?: string;
};

export type CdfNodeKind = DescriptorOrDefinitionKind;

export interface CdfScanNode {
  id: string;
  subtype: string;
  firstParagraphId: string;
  firstParagraphText: string;
  firstParagraphKramdown: string;
  markerKind: CdfNodeKind;
  explicitMarkerKind: CdfNodeKind;
  recursiveMarkerKind: CdfNodeKind;
  hasDocumentReference: boolean;
  orderedChildListItemIds: string[];
  unorderedChildListItemIds: string[];
}

export interface CdfScanResult {
  parentBlockId: string;
  parentParagraphId: string;
  parentParagraphText: string;
  parentParagraphKramdown: string;
  parentKramdown: string;
  nodes: CdfScanNode[];
  stoppedByDocumentReference: boolean;
  stopNodeId?: string;
}

function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

function toRows(result: unknown): BlockRow[] {
  return Array.isArray(result) ? result as BlockRow[] : [];
}

function extractBlockReferenceIds(content: string): string[] {
  const matches = [...content.matchAll(/\(\((\d{14}-[a-z0-9]{7})/g)];
  return Array.from(new Set(matches.map((match) => match[1])));
}

async function getParentParagraph(
  parentBlockId: string,
  siyuanApi: SqlPort
): Promise<{ id: string; text: string; kramdown: string }> {
  const safeParentBlockId = escapeSqlValue(parentBlockId);
  const paragraphRows = toRows(await siyuanApi.sql(`
    SELECT id, content, markdown
    FROM blocks
    WHERE parent_id = '${safeParentBlockId}'
      AND type = 'p'
    ORDER BY sort ASC, id ASC
    LIMIT 1
  `));
  if (paragraphRows.length === 0 || typeof paragraphRows[0].id !== 'string') {
    throw new Error('Parent list-item is missing paragraph block');
  }
  const kramdown = typeof paragraphRows[0].markdown === 'string' && paragraphRows[0].markdown.length > 0
    ? paragraphRows[0].markdown
    : typeof paragraphRows[0].content === 'string'
      ? paragraphRows[0].content
      : '';
  const text = typeof paragraphRows[0].content === 'string'
    ? paragraphRows[0].content
    : kramdown;
  return {
    id: paragraphRows[0].id,
    text,
    kramdown,
  };
}

async function getDirectChildListItems(parentBlockId: string, siyuanApi: SqlPort): Promise<BlockRow[]> {
  const safeParentBlockId = escapeSqlValue(parentBlockId);
  const listContainerRows = toRows(await siyuanApi.sql(`
    SELECT id
    FROM blocks
    WHERE parent_id = '${safeParentBlockId}'
      AND type = 'l'
    ORDER BY sort ASC, id ASC
  `));
  if (listContainerRows.length === 0) {
    return [];
  }

  const directChildren: BlockRow[] = [];
  for (const container of listContainerRows) {
    if (!container.id) {
      continue;
    }
    const safeContainerId = escapeSqlValue(container.id);
    const childRows = toRows(await siyuanApi.sql(`
      SELECT id, subtype
      FROM blocks
      WHERE parent_id = '${safeContainerId}'
        AND type = 'i'
      ORDER BY sort ASC, id ASC
    `));
    directChildren.push(...childRows);
  }

  return directChildren;
}

async function getFirstParagraph(childListItemId: string, siyuanApi: SqlPort): Promise<BlockRow | null> {
  const safeChildListItemId = escapeSqlValue(childListItemId);
  const paragraphRows = toRows(await siyuanApi.sql(`
    SELECT id, content, markdown
    FROM blocks
    WHERE parent_id = '${safeChildListItemId}'
      AND type = 'p'
    ORDER BY sort ASC, id ASC
    LIMIT 1
  `));
  return paragraphRows.length > 0 ? paragraphRows[0] : null;
}

async function detectRecursiveFirstKind(childListItemId: string, siyuanApi: SqlPort): Promise<CdfNodeKind> {
  const safeChildListItemId = escapeSqlValue(childListItemId);
  const paragraphRows = toRows(await siyuanApi.sql(`
    WITH RECURSIVE descendants AS (
      SELECT id, type, parent_id, sort, content, markdown, printf('%020d', COALESCE(sort, 0)) AS path
      FROM blocks
      WHERE id = '${safeChildListItemId}'
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

  for (const row of paragraphRows) {
    const source = typeof row.markdown === 'string' && row.markdown.length > 0
      ? row.markdown
      : typeof row.content === 'string'
        ? row.content
        : '';
    const kind = detectDescriptorOrDefinitionKind(source);
    if (kind !== 'none') {
      return kind;
    }
  }

  return 'none';
}

async function containsDocumentBlockReference(content: string, siyuanApi: SqlPort): Promise<boolean> {
  const refIds = extractBlockReferenceIds(content);
  if (refIds.length === 0) {
    return false;
  }

  const inClause = refIds.map((id) => `'${escapeSqlValue(id)}'`).join(',');
  const typeRows = toRows(await siyuanApi.sql(`
    SELECT id, type
    FROM blocks
    WHERE id IN (${inClause})
  `));

  return typeRows.some((row) => row.type === 'd');
}

async function resolveDescriptorMultilineChildren(
  childListItemId: string,
  siyuanApi: SqlPort
): Promise<{ orderedChildListItemIds: string[]; unorderedChildListItemIds: string[] }> {
  const safeChildListItemId = escapeSqlValue(childListItemId);
  const nestedContainerRows = toRows(await siyuanApi.sql(`
    SELECT id
    FROM blocks
    WHERE parent_id = '${safeChildListItemId}'
      AND type = 'l'
    ORDER BY sort ASC, id ASC
    LIMIT 1
  `));

  if (nestedContainerRows.length === 0 || !nestedContainerRows[0].id) {
    return { orderedChildListItemIds: [], unorderedChildListItemIds: [] };
  }

  const safeNestedContainerId = escapeSqlValue(nestedContainerRows[0].id);
  const nestedChildren = toRows(await siyuanApi.sql(`
    SELECT id, subtype
    FROM blocks
    WHERE parent_id = '${safeNestedContainerId}'
      AND type = 'i'
    ORDER BY sort ASC, id ASC
  `));

  const orderedChildListItemIds = nestedChildren
    .filter((row) => row.id && row.subtype === 'o')
    .map((row) => row.id);
  const unorderedChildListItemIds = nestedChildren
    .filter((row) => row.id && row.subtype !== 'o')
    .map((row) => row.id);

  return { orderedChildListItemIds, unorderedChildListItemIds };
}

export async function resolveCdfMultilineScan(
  parentBlockId: string,
  siyuanApi: SqlPort
): Promise<CdfScanResult> {
  const safeParentBlockId = escapeSqlValue(parentBlockId);
  const parentTypeRows = toRows(await siyuanApi.sql(`
    SELECT type
    FROM blocks
    WHERE id = '${safeParentBlockId}'
    LIMIT 1
  `));
  if (parentTypeRows.length === 0) {
    throw new Error('Block does not exist');
  }
  if (parentTypeRows[0].type !== 'i') {
    throw new Error(`Only list-item blocks are supported (current type: ${String(parentTypeRows[0].type || '')})`);
  }

  const parentParagraph = await getParentParagraph(parentBlockId, siyuanApi);
  const { kramdown } = await siyuanApi.getBlockKramdown(parentBlockId);
  const directChildren = await getDirectChildListItems(parentBlockId, siyuanApi);

  const nodes: CdfScanNode[] = [];
  let stoppedByDocumentReference = false;
  let stopNodeId: string | undefined;

  for (const child of directChildren) {
    if (!child.id) {
      continue;
    }
    const firstParagraph = await getFirstParagraph(child.id, siyuanApi);
    if (!firstParagraph || !firstParagraph.id) {
      continue;
    }

    const firstParagraphKramdown = typeof firstParagraph.markdown === 'string' && firstParagraph.markdown.length > 0
      ? firstParagraph.markdown
      : typeof firstParagraph.content === 'string'
        ? firstParagraph.content
        : '';
    const firstParagraphText = typeof firstParagraph.content === 'string'
      ? firstParagraph.content
      : firstParagraphKramdown;

    const hasDocumentReference = await containsDocumentBlockReference(firstParagraphKramdown, siyuanApi);
    if (hasDocumentReference) {
      stoppedByDocumentReference = true;
      stopNodeId = child.id;
      break;
    }

    const explicitMarkerKind = detectDescriptorOrDefinitionKind(firstParagraphKramdown);
    const recursiveMarkerKind = await detectRecursiveFirstKind(child.id, siyuanApi);
    const markerKind = explicitMarkerKind !== 'none' ? explicitMarkerKind : recursiveMarkerKind;

    let orderedChildListItemIds: string[] = [];
    let unorderedChildListItemIds: string[] = [];
    if (markerKind === 'descriptor-multiline') {
      const resolvedNested = await resolveDescriptorMultilineChildren(child.id, siyuanApi);
      orderedChildListItemIds = resolvedNested.orderedChildListItemIds;
      unorderedChildListItemIds = resolvedNested.unorderedChildListItemIds;
    }

    nodes.push({
      id: child.id,
      subtype: typeof child.subtype === 'string' ? child.subtype : '',
      firstParagraphId: firstParagraph.id,
      firstParagraphText,
      firstParagraphKramdown,
      markerKind,
      explicitMarkerKind,
      recursiveMarkerKind,
      hasDocumentReference,
      orderedChildListItemIds,
      unorderedChildListItemIds,
    });
  }

  return {
    parentBlockId,
    parentParagraphId: parentParagraph.id,
    parentParagraphText: parentParagraph.text,
    parentParagraphKramdown: parentParagraph.kramdown,
    parentKramdown: kramdown || '',
    nodes,
    stoppedByDocumentReference,
    ...(stopNodeId ? { stopNodeId } : {}),
  };
}
