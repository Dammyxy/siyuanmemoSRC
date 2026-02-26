export interface BrowserSiyuanPort {
  readonly ATTR_CARD_ID: string;
  readonly ATTR_PRIORITY: string;
  readonly ATTR_SUSPENDED: string;
  readonly ATTR_CARD_TYPE: string;
  readonly ATTR_A_FACTOR: string;

  sql(stmt: string): Promise<unknown[]>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
}
