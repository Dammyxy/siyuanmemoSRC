import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import type { Rating } from '@/types';
import {
  getBlockAttrs,
  getBlockBreadcrumb,
  getBlockDOM,
  getBlockInfo,
  getBlockKramdown,
  getIconByType,
  pushErrMsg,
  pushMsg,
  setBlockAttrs,
  sql,
  updateBlock,
} from './api';
import { BUILTIN_DECK_ID, reviewRiffCard, skipReviewRiffCard } from '@/core/siyuan/riff';

export class ReviewSiyuanAdapter implements ReviewSiyuanPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async getBlockInfo(blockId: string): Promise<Record<string, unknown>> {
    return getBlockInfo(blockId);
  }

  async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
    return getBlockKramdown(blockId);
  }

  async getBlockDOM(blockId: string): Promise<{ dom: string }> {
    return getBlockDOM(blockId);
  }

  async getBlockBreadcrumb(blockId: string): Promise<Record<string, unknown>[]> {
    return getBlockBreadcrumb(blockId);
  }

  getIconByType(type: string, subType?: string): string {
    return getIconByType(type, subType);
  }

  async updateBlockMarkdown(blockId: string, markdown: string): Promise<string> {
    return updateBlock({
      dataType: 'markdown',
      data: markdown,
      id: blockId,
    });
  }

  async reviewRiffCard(deckID: string, cardID: string, rating: Rating): Promise<void> {
    await reviewRiffCard(deckID, cardID, rating);
  }

  async skipReviewRiffCard(deckID: string, cardID: string): Promise<void> {
    await skipReviewRiffCard(deckID, cardID);
  }

  async pushMsg(msg: string, timeout?: number): Promise<void> {
    await pushMsg(msg, timeout);
  }

  async pushErrMsg(msg: string, timeout?: number): Promise<void> {
    await pushErrMsg(msg, timeout);
  }
}
