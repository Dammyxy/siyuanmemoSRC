export type XiuyuanBlockAttrs = Record<string, string>;

export interface XiuyuanSiyuanPort {
  readonly BUILTIN_DECK_ID: string;

  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getBlockAttrs(blockId: string): Promise<XiuyuanBlockAttrs>;
  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
  getBlockText(blockId: string): Promise<string>;
}
