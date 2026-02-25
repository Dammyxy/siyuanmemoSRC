import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import { pushErrMsg, pushMsg, setBlockAttrs, sql } from './api';
import {
  ATTR_A_FACTOR,
  ATTR_CARD_ID,
  ATTR_CARD_TYPE,
  ATTR_PRIORITY,
  ATTR_SUSPENDED,
} from '@/core/siyuan/block';

export class BrowserSiyuanAdapter implements BrowserSiyuanPort {
  readonly ATTR_CARD_ID = ATTR_CARD_ID;
  readonly ATTR_PRIORITY = ATTR_PRIORITY;
  readonly ATTR_SUSPENDED = ATTR_SUSPENDED;
  readonly ATTR_CARD_TYPE = ATTR_CARD_TYPE;
  readonly ATTR_A_FACTOR = ATTR_A_FACTOR;

  async sql(stmt: string): Promise<any[]> {
    return sql(stmt);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async pushMsg(msg: string, timeout?: number): Promise<void> {
    await pushMsg(msg, timeout);
  }

  async pushErrMsg(msg: string, timeout?: number): Promise<void> {
    await pushErrMsg(msg, timeout);
  }
}
