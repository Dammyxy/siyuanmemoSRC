import type { AutoCardSiyuanPort, AutoCardType } from '@/application/ports/AutoCardSiyuanPort';
import {
  getBlockAttrs,
  getBlockKramdown,
  pushErrMsg,
  pushMsg,
  setBlockAttrs,
  sql,
} from './api';
import { markBlockAsCard } from '@/core/siyuan/block';

export class AutoCardSiyuanAdapter implements AutoCardSiyuanPort {
  async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
    return getBlockKramdown(blockId);
  }

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async pushMsg(msg: string, timeout?: number): Promise<void> {
    await pushMsg(msg, timeout);
  }

  async pushErrMsg(msg: string, timeout?: number): Promise<void> {
    await pushErrMsg(msg, timeout);
  }

  async markBlockAsCard(
    blockId: string,
    cardId: string,
    priority?: number,
    cardType?: AutoCardType
  ): Promise<void> {
    await markBlockAsCard(blockId, cardId, priority, cardType);
  }
}
