import {
  toXiuyuanSharedQueryPort,
  type XiuyuanSharedQueryPort,
} from './XiuyuanSharedQueryPort';

type SqlSource = {
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

function normalizeChildRow(row: ListItemRow): ResolvedListChild {
  return {
    id: row.id,
    content: typeof row.content === 'string' ? row.content : '',
    subtype: typeof row.subtype === 'string' ? row.subtype : '',
  };
}

export async function resolveListChildrenBySubtype(
  parentBlockId: string,
  queryPortOrSource: XiuyuanSharedQueryPort | SqlSource
): Promise<ResolvedListChildren> {
  const queryPort = toXiuyuanSharedQueryPort(queryPortOrSource);

  const parentType = await queryPort.getBlockType(parentBlockId);
  if (!parentType) {
    throw new Error('Block does not exist');
  }
  if (parentType !== 'i') {
    throw new Error(`Only list-item blocks are supported (current type: ${String(parentType || '')})`);
  }

  const paragraph = await queryPort.getFirstParagraphUnderParent(parentBlockId);
  if (!paragraph || typeof paragraph.id !== 'string') {
    throw new Error('Parent list-item is missing paragraph block');
  }
  const parentParagraphId = paragraph.id;

  const listContainerId = await queryPort.getFirstListContainerId(parentBlockId);
  if (!listContainerId) {
    throw new Error('List container not found under parent list-item');
  }

  const directChildrenRows = await queryPort.listListItemsUnderParent(listContainerId);

  let source: 'direct' | 'recursive' = 'direct';
  let listItemRows = (directChildrenRows || []) as ListItemRow[];

  if (listItemRows.length === 0) {
    source = 'recursive';
    const recursiveRows = await queryPort.listRecursiveListItemsUnderParent(listContainerId);
    listItemRows = (recursiveRows || []) as ListItemRow[];
  }

  const normalizedChildren = listItemRows.map(normalizeChildRow);
  const orderedChildren = normalizedChildren.filter((row) => row.subtype === 'o');
  const unorderedChildren = normalizedChildren.filter((row) => row.subtype !== 'o');
  const { kramdown } = await queryPort.getBlockKramdown(parentBlockId);

  return {
    parentParagraphId,
    parentKramdown: kramdown || '',
    orderedChildren,
    unorderedChildren,
    source,
  };
}

