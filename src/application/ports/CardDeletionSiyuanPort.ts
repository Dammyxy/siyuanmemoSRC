export type CardDeletionBlockAttrs = Record<string, string>;

export interface CardDeletionSiyuanPort {
  getBlockAttrs(blockId: string): Promise<CardDeletionBlockAttrs>;
  setBlockAttrs(blockId: string, attrs: CardDeletionBlockAttrs): Promise<void>;
}
