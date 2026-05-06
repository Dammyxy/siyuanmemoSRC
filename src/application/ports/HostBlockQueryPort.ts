import type {
  XiuyuanSharedQueryPort,
  SharedParagraphRow,
  SharedListItemRow,
} from '@/application/usecases/xiuyuan/shared/XiuyuanSharedQueryPort';

export interface HostBlockRow {
  id: string;
  type?: string;
  subtype?: string;
  parent_id?: string;
  root_id?: string;
  content?: string;
  markdown?: string;
}

export interface HostBlockAttrRow {
  block_id: string;
  name: string;
  value: string;
}

export interface HostBlockQueryPort extends XiuyuanSharedQueryPort {
  getBlock(blockId: string): Promise<HostBlockRow | null>;
  getDocumentRootId(blockId: string): Promise<string | null>;
  getExistingBlockIds(blockIds: string[]): Promise<Set<string>>;
  getSubtreeBlockIds(rootBlockIds: string[]): Promise<string[]>;
  getManagedBlockAttrs(attrNames: string[]): Promise<HostBlockAttrRow[]>;
  listBlocksByRoot(rootId: string, types: string[]): Promise<HostBlockRow[]>;
  listParagraphChildren(parentId: string): Promise<HostBlockRow[]>;
  listParentIdsWithParagraphChild(parentIds: string[]): Promise<Set<string>>;
}

export type {
  SharedParagraphRow,
  SharedListItemRow,
};

export function createUnavailableHostBlockQueryPort(reason: string): HostBlockQueryPort {
  const fail = async (): Promise<never> => {
    throw new Error(`BACKEND_UNAVAILABLE: host block query port unavailable (${reason})`);
  };
  return {
    getBlock: fail,
    getDocumentRootId: fail,
    getExistingBlockIds: fail,
    getSubtreeBlockIds: fail,
    getManagedBlockAttrs: fail,
    listBlocksByRoot: fail,
    listParagraphChildren: fail,
    listParentIdsWithParagraphChild: fail,
    getBlockType: fail,
    getParentId: fail,
    getBlockTypeAndContent: fail,
    getBlockMarkdownAndContent: fail,
    getXiuyuanBindingAttrs: fail,
    getFirstParagraphUnderParent: fail,
    getFirstListContainerId: fail,
    listListContainerIds: fail,
    listListItemIdsUnderParent: fail,
    listListItemsUnderParent: fail,
    listDescendantParagraphs: fail,
    listBlockTypesByIds: fail,
    listRecursiveListItemsUnderParent: fail,
    getBlockKramdown: fail,
  };
}
