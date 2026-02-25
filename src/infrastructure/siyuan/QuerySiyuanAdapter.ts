import type { QuerySiyuanPort, RiffDueTimeUpdate } from '@/application/ports/QuerySiyuanPort';
import { sql } from './api';
import { batchSetRiffCardsDueTime } from '@/core/siyuan/riff';
import { ATTR_CARD_TYPE, ATTR_PRIORITY, ATTR_SUSPENDED } from '@/core/siyuan/block';

export class QuerySiyuanAdapter implements QuerySiyuanPort {
  readonly ATTR_PRIORITY = ATTR_PRIORITY;
  readonly ATTR_SUSPENDED = ATTR_SUSPENDED;
  readonly ATTR_CARD_TYPE = ATTR_CARD_TYPE;

  async sql(stmt: string): Promise<any[]> {
    return sql(stmt);
  }

  async batchSetRiffCardsDueTime(cards: RiffDueTimeUpdate[]): Promise<void> {
    await batchSetRiffCardsDueTime(cards);
  }
}
