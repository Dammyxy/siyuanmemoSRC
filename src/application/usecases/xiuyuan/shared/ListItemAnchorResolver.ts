import {
  toXiuyuanSharedQueryPort,
  type XiuyuanSharedQueryPort,
} from './XiuyuanSharedQueryPort';

type SqlPort = {
  sql: <T extends Record<string, unknown> = Record<string, unknown>>(stmt: string) => Promise<T[]>;
};

export async function resolveListItemAnchorBlockId(
  selectedBlockId: string,
  siyuanApi: SqlPort | XiuyuanSharedQueryPort,
): Promise<string | null> {
  const queryPort = toXiuyuanSharedQueryPort(siyuanApi);
  const selectedType = await queryPort.getBlockType(selectedBlockId);
  if (!selectedType) {
    return null;
  }

  if (selectedType === 'i') {
    return selectedBlockId;
  }

  if (selectedType !== 'p') {
    return null;
  }

  const parentId = await queryPort.getParentId(selectedBlockId);
  if (!parentId) {
    return null;
  }

  const parentType = await queryPort.getBlockType(parentId);
  if (parentType !== 'i') {
    return null;
  }

  return parentId;
}
