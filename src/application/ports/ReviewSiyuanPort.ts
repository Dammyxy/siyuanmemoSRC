import type { Rating } from '@/types';

export interface ReviewSiyuanPort {
  readonly BUILTIN_DECK_ID: string;

  sql(stmt: string): Promise<any[]>;
  getBlockAttrs(blockId: string): Promise<Record<string, string>>;
  getBlockInfo(blockId: string): Promise<any>;
  getBlockDOM(blockId: string): Promise<{ dom: string }>;
  getBlockBreadcrumb(blockId: string): Promise<any[]>;
  getIconByType(type: string, subType?: string): string;

  reviewRiffCard(deckID: string, cardID: string, rating: Rating): Promise<void>;
  skipReviewRiffCard(deckID: string, cardID: string): Promise<void>;

  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
}
