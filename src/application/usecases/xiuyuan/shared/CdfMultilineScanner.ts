import { detectDescriptorOrDefinitionKind, type DescriptorOrDefinitionKind } from './DescriptorTemplateStrategy';
import {
  toXiuyuanSharedQueryPort,
  type XiuyuanSharedQueryPort,
} from './XiuyuanSharedQueryPort';

type SqlSource = {
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
  descriptorMeta?: {
    groupHint: string;
    cue: string;
    answer: string;
  };
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

function extractBlockReferenceIds(content: string): string[] {
  const matches = [...content.matchAll(/\(\((\d{14}-[a-z0-9]{7})/g)];
  return Array.from(new Set(matches.map((match) => match[1])));
}

async function getParentParagraph(
  parentBlockId: string,
  queryPort: XiuyuanSharedQueryPort
): Promise<{ id: string; text: string; kramdown: string }> {
  const paragraph = await queryPort.getFirstParagraphUnderParent(parentBlockId);
  if (!paragraph) {
    throw new Error('Parent list-item is missing paragraph block');
  }
  const kramdown = paragraph.markdown.length > 0
    ? paragraph.markdown
    : paragraph.content.length > 0
      ? paragraph.content
      : '';
  const text = paragraph.content.length > 0
    ? paragraph.content
    : kramdown;
  return {
    id: paragraph.id,
    text,
    kramdown,
  };
}

async function getDirectChildListItems(parentBlockId: string, queryPort: XiuyuanSharedQueryPort): Promise<BlockRow[]> {
  const listContainerIds = await queryPort.listListContainerIds(parentBlockId);
  const listContainerRows = listContainerIds.map((id) => ({ id }));
  if (listContainerRows.length === 0) {
    return [];
  }

  const directChildren: BlockRow[] = [];
  for (const container of listContainerRows) {
    if (!container.id) {
      continue;
    }
    const childRows = await queryPort.listListItemsUnderParent(container.id);
    directChildren.push(...childRows);
  }

  return directChildren;
}

async function getFirstParagraph(childListItemId: string, queryPort: XiuyuanSharedQueryPort): Promise<BlockRow | null> {
  const paragraph = await queryPort.getFirstParagraphUnderParent(childListItemId);
  return paragraph ? { ...paragraph } : null;
}

async function detectRecursiveFirstKind(childListItemId: string, queryPort: XiuyuanSharedQueryPort): Promise<CdfNodeKind> {
  const paragraphRows = await queryPort.listDescendantParagraphs(childListItemId);

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

async function containsDocumentBlockReference(content: string, queryPort: XiuyuanSharedQueryPort): Promise<boolean> {
  const refIds = extractBlockReferenceIds(content);
  if (refIds.length === 0) {
    return false;
  }

  const typeRows = await queryPort.listBlockTypesByIds(refIds);

  return typeRows.some((row) => row.type === 'd');
}

async function resolveDescriptorMultilineChildren(
  childListItemId: string,
  queryPort: XiuyuanSharedQueryPort
): Promise<{ orderedChildListItemIds: string[]; unorderedChildListItemIds: string[] }> {
  const nestedContainerId = await queryPort.getFirstListContainerId(childListItemId);
  if (!nestedContainerId) {
    return { orderedChildListItemIds: [], unorderedChildListItemIds: [] };
  }

  const nestedChildren = await queryPort.listListItemsUnderParent(nestedContainerId);

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
  queryPortOrSource: XiuyuanSharedQueryPort | SqlSource
): Promise<CdfScanResult> {
  const queryPort = toXiuyuanSharedQueryPort(queryPortOrSource);
  const parentType = await queryPort.getBlockType(parentBlockId);
  if (!parentType) {
    throw new Error('Block does not exist');
  }
  if (parentType !== 'i') {
    throw new Error(`Only list-item blocks are supported (current type: ${String(parentType || '')})`);
  }

  const parentParagraph = await getParentParagraph(parentBlockId, queryPort);
  const { kramdown } = await queryPort.getBlockKramdown(parentBlockId);
  const directChildren = await getDirectChildListItems(parentBlockId, queryPort);

  const nodes: CdfScanNode[] = [];
  let stoppedByDocumentReference = false;
  let stopNodeId: string | undefined;

  for (const child of directChildren) {
    if (!child.id) {
      continue;
    }
    const firstParagraph = await getFirstParagraph(child.id, queryPort);
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

    const hasDocumentReference = await containsDocumentBlockReference(firstParagraphKramdown, queryPort);
    if (hasDocumentReference) {
      stoppedByDocumentReference = true;
      stopNodeId = child.id;
      break;
    }

    const explicitMarkerKind = detectDescriptorOrDefinitionKind(firstParagraphKramdown);
    const recursiveMarkerKind = await detectRecursiveFirstKind(child.id, queryPort);
    const markerKind = explicitMarkerKind !== 'none' ? explicitMarkerKind : recursiveMarkerKind;

    let orderedChildListItemIds: string[] = [];
    let unorderedChildListItemIds: string[] = [];
    if (markerKind === 'descriptor-multiline') {
      const resolvedNested = await resolveDescriptorMultilineChildren(child.id, queryPort);
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
