export type ManagerCardType = 'topic' | 'item' | 'descriptor';

export type ManagerCardBlockIdFilter = {
  type: 'doc' | 'tree' | 'sql' | 'backlink';
  value: string;
};

export interface ManagerSiyuanPort {
  readonly BUILTIN_DECK_ID: string;
  readonly CARD_ID_ATTR: string;

  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
  sql(stmt: string): Promise<any[]>;

  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
  getBlockText(blockId: string): Promise<string>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;

  markBlockAsCard(
    blockId: string,
    cardId: string,
    priority?: number,
    cardType?: ManagerCardType
  ): Promise<void>;

  getCardBlockIds(filter: ManagerCardBlockIdFilter): Promise<string[]>;
  addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }>;
}
