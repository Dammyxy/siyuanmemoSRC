import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import type { Rating } from '@/types';
import {
  getBlockAttrs,
  getBlockBreadcrumb,
  getBlockDOM,
  getBlockInfo,
  getIconByType,
  pushErrMsg,
  pushMsg,
  sql,
} from './api';
import { BUILTIN_DECK_ID, reviewRiffCard, skipReviewRiffCard } from '@/core/siyuan/riff';

export class ReviewSiyuanAdapter implements ReviewSiyuanPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async sql(stmt: string): Promise<any[]> {
    return sql(stmt);
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async getBlockInfo(blockId: string): Promise<any> {
    return getBlockInfo(blockId);
  }

  async getBlockDOM(blockId: string): Promise<{ dom: string }> {
    return getBlockDOM(blockId);
  }

  async getBlockBreadcrumb(blockId: string): Promise<any[]> {
    return getBlockBreadcrumb(blockId);
  }

  getIconByType(type: string, subType?: string): string {
    return getIconByType(type, subType);
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
