export type XiuyuanBlockAttrs = Record<string, string>;

export interface XiuyuanSiyuanPort {
  readonly BUILTIN_DECK_ID: string;

  sql(stmt: string): Promise<unknown[]>;
  getBlockAttrs(blockId: string): Promise<XiuyuanBlockAttrs>;
  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
  getBlockText(blockId: string): Promise<string>;
  addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }>;
}
