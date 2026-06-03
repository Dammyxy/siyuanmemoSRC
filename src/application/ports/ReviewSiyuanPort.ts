import type { Rating } from '@/types';

export type SiyuanRecord = Record<string, unknown>;

export interface ReviewSiyuanPort {
  readonly BUILTIN_DECK_ID: string;

  sql<TRow extends SiyuanRecord = SiyuanRecord>(stmt: string): Promise<TRow[]>;
  getBlockAttrs(blockId: string): Promise<Record<string, string>>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
  getBlockInfo(blockId: string): Promise<SiyuanRecord>;
  getEditableBlockMarkdown(blockId: string): Promise<string>;
  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
  getBlockDOM(blockId: string): Promise<{ dom: string }>;
  getBlockBreadcrumb(blockId: string): Promise<SiyuanRecord[]>;
  getIconByType(type: string, subType?: string): string;
  updateBlockMarkdown(blockId: string, markdown: string): Promise<string>;

  reviewRiffCard(deckID: string, cardID: string, rating: Rating): Promise<void>;
  skipReviewRiffCard(deckID: string, cardID: string): Promise<void>;

  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
}
