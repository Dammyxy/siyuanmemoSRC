export type RiffDueTimeUpdate = {
  id: string;
  due: string;
};

export interface QuerySiyuanPort {
  readonly ATTR_PRIORITY: string;
  readonly ATTR_SUSPENDED: string;
  readonly ATTR_CARD_TYPE: string;

  sql(stmt: string): Promise<any[]>;
  batchSetRiffCardsDueTime(cards: RiffDueTimeUpdate[]): Promise<void>;
}
