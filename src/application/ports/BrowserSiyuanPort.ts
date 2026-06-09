export interface BrowserBlockInfoRow extends Record<string, unknown> {
  id: string;
  root_id?: string | null;
  ial?: string | null;
  type?: string | null;
  content?: string | null;
}

export interface BrowserBlockAttributeRow extends Record<string, unknown> {
  block_id: string;
  name: string;
  value: string;
}

export interface BrowserDocTreeRow extends Record<string, unknown> {
  id: string;
  content?: string | null;
  hpath?: string | null;
}

export interface BrowserBlockMetaRow extends Record<string, unknown> {
  created?: unknown;
  updated?: unknown;
  tag?: unknown;
}

export interface BrowserRiffBlock {
  id: string;
  type?: string;
  riffCardID?: string;
  riffCardId?: string;
  riffCard?: {
    id?: string;
    blockID?: string;
  };
}

export interface BrowserSiyuanPort {
  readonly ATTR_CARD_ID: string;
  readonly ATTR_PRIORITY: string;
  readonly ATTR_SUSPENDED: string;
  readonly ATTR_CARD_TYPE: string;
  readonly ATTR_A_FACTOR: string;
  readonly BUILTIN_DECK_ID?: string;

  getBlockAttrs(blockId: string): Promise<Record<string, string>>;
  getBlockInfoRowsByIds(blockIds: string[]): Promise<BrowserBlockInfoRow[]>;
  getBlockAttributeRowsByIds(
    blockIds: string[],
    attrNames: string[],
  ): Promise<BrowserBlockAttributeRow[]>;
  getDocTreeRowsByIds(rootIds: string[]): Promise<BrowserDocTreeRow[]>;
  getBlockMeta(blockId: string): Promise<BrowserBlockMetaRow | null>;
  getRiffCards?(deckID: string, options?: { includeNew?: boolean }): Promise<BrowserRiffBlock[]>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
}
