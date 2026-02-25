import type {
  ManagerCardBlockIdFilter,
  ManagerCardType,
  ManagerSiyuanPort,
} from '@/application/ports/ManagerSiyuanPort';
import {
  getBlockKramdown,
  pushErrMsg,
  pushMsg,
  setBlockAttrs,
  sql,
} from './api';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import { ATTR_CARD_ID, getCardBlockIds, getBlockText, markBlockAsCard } from '@/core/siyuan/block';

export class ManagerSiyuanAdapter implements ManagerSiyuanPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;
  readonly CARD_ID_ATTR = ATTR_CARD_ID;

  async pushMsg(msg: string, timeout?: number): Promise<void> {
    await pushMsg(msg, timeout);
  }

  async pushErrMsg(msg: string, timeout?: number): Promise<void> {
    await pushErrMsg(msg, timeout);
  }

  async sql(stmt: string): Promise<any[]> {
    return sql(stmt);
  }

  async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
    return getBlockKramdown(blockId);
  }

  async getBlockText(blockId: string): Promise<string> {
    return getBlockText(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async markBlockAsCard(
    blockId: string,
    cardId: string,
    priority?: number,
    cardType?: ManagerCardType
  ): Promise<void> {
    await markBlockAsCard(blockId, cardId, priority, cardType as any);
  }

  async getCardBlockIds(filter: ManagerCardBlockIdFilter): Promise<string[]> {
    return getCardBlockIds(filter as any);
  }

  async addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return addRiffCards(deckID, blockIDs);
  }
}
