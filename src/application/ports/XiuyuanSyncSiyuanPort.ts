export type XiuyuanSyncRiffCard = {
  id?: string;
  due?: string;
  reps?: number;
  lapses?: number;
  state?: number;
  lastReview?: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
};

export type XiuyuanSyncRiffBlock = {
  id: string;
  content: string;
  ial?: Record<string, string>;
  riffCardID?: string;
  riffCardId?: string;
  riffCard?: XiuyuanSyncRiffCard;
};

export interface XiuyuanSyncSiyuanPort {
  readonly BUILTIN_DECK_ID: string;
  readonly ATTR_CARD_TYPE: string;

  getRiffCards(
    deckID: string,
    options?: { dueOnly?: boolean; notebook?: string; rootID?: string; includeNew?: boolean }
  ): Promise<XiuyuanSyncRiffBlock[]>;
  getRiffNewCards(deckID: string, since?: number): Promise<XiuyuanSyncRiffBlock[]>;
  getRiffCardsByBlockIDs?(blockIDs: string[]): Promise<XiuyuanSyncRiffBlock[]>;
  setBlockAttrs(blockID: string, attrs: Record<string, string>): Promise<void>;
  getBlockAttrs(blockID: string): Promise<Record<string, string>>;
}
