import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import { sql } from './api';
import { ATTR_CARD_TYPE, ATTR_PRIORITY, ATTR_SUSPENDED } from '@/core/siyuan/block';

export class QuerySiyuanAdapter implements QuerySiyuanPort {
  readonly ATTR_PRIORITY = ATTR_PRIORITY;
  readonly ATTR_SUSPENDED = ATTR_SUSPENDED;
  readonly ATTR_CARD_TYPE = ATTR_CARD_TYPE;

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }
}
