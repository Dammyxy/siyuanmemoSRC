import type {
  XiuyuanSyncRiffBlock,
  XiuyuanSyncSiyuanPort,
} from '@/application/ports/XiuyuanSyncSiyuanPort';
import { getBlockAttrs, setBlockAttrs } from './api';
import { ATTR_CARD_TYPE } from '@/core/siyuan/block';
import { normalizeBlockId } from '@/core/siyuan/riff/normalizers';
import {
  BUILTIN_DECK_ID,
  getRiffCards,
  getRiffNewCards,
  removeRiffCards,
} from '@/core/siyuan/riff';

function normalizeXiuyuanSyncRiffBlock(block: XiuyuanSyncRiffBlock): XiuyuanSyncRiffBlock {
  const normalizedId = String(normalizeBlockId(block) || '').trim();
  if (!normalizedId || normalizedId === block.id) {
    return block;
  }

  return {
    ...block,
    id: normalizedId,
  };
}

export class XiuyuanSyncSiyuanAdapter implements XiuyuanSyncSiyuanPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;
  readonly ATTR_CARD_TYPE = ATTR_CARD_TYPE;

  async getRiffCards(
    deckID: string,
    options?: { dueOnly?: boolean; notebook?: string; rootID?: string; includeNew?: boolean }
  ): Promise<XiuyuanSyncRiffBlock[]> {
    const blocks = await getRiffCards(deckID, options);
    return (blocks as XiuyuanSyncRiffBlock[]).map(normalizeXiuyuanSyncRiffBlock);
  }

  async getRiffNewCards(deckID: string, since?: number): Promise<XiuyuanSyncRiffBlock[]> {
    const blocks = await getRiffNewCards(deckID, since);
    return (blocks as XiuyuanSyncRiffBlock[]).map(normalizeXiuyuanSyncRiffBlock);
  }

  async removeRiffCards(deckID: string, blockIDs: string[]): Promise<void> {
    await removeRiffCards(deckID, blockIDs);
  }

  async setBlockAttrs(blockID: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockID, attrs);
  }

  async getBlockAttrs(blockID: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockID);
  }
}
