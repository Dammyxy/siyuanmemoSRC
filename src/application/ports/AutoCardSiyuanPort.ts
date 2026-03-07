export type AutoCardBlockAttrs = Record<string, string>;
export type AutoCardType = 'topic' | 'item' | 'descriptor';

export interface AutoCardSiyuanPort {
  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getBlockAttrs(blockId: string): Promise<AutoCardBlockAttrs>;
  setBlockAttrs(blockId: string, attrs: AutoCardBlockAttrs): Promise<void>;
  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
  markBlockAsCard(
    blockId: string,
    cardId: string,
    priority?: number,
    cardType?: AutoCardType
  ): Promise<void>;
}
