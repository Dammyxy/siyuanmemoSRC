export type CardDeletionBlockAttrs = Record<string, string>;

export interface CardDeletionSiyuanPort {
  readonly BUILTIN_DECK_ID: string;

  getBlockAttrs(blockId: string): Promise<CardDeletionBlockAttrs>;
  setBlockAttrs(blockId: string, attrs: CardDeletionBlockAttrs): Promise<void>;
  removeRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }>;
}
