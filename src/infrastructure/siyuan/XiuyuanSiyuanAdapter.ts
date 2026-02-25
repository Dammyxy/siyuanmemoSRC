import type { XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { getBlockAttrs, getBlockKramdown, sql } from './api';
import { getBlockText } from '@/core/siyuan/block';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';

export class XiuyuanSiyuanAdapter implements XiuyuanSiyuanPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async sql(stmt: string): Promise<any[]> {
    return sql(stmt);
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
    return getBlockKramdown(blockId);
  }

  async getBlockText(blockId: string): Promise<string> {
    return getBlockText(blockId);
  }

  async addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return addRiffCards(deckID, blockIDs);
  }
}
