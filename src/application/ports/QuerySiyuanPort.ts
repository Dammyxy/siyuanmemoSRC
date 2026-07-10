export interface QuerySiyuanPort {
  readonly ATTR_PRIORITY: string;
  readonly ATTR_SUSPENDED: string;
  readonly ATTR_CARD_TYPE: string;

  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
}
