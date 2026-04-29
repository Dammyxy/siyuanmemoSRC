import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import type { BrowserPreviewDocInfo, BrowserPreviewNotebookSummary, BrowserPreviewSiyuanPort } from '@/application/ports/BrowserPreviewSiyuanPort';
import { getBlockBreadcrumb, getDocInfo, listNotebooks, pushErrMsg, pushMsg, setBlockAttrs, sql } from './api';
import {
  ATTR_A_FACTOR,
  ATTR_CARD_ID,
  ATTR_CARD_TYPE,
  ATTR_PRIORITY,
  ATTR_SUSPENDED,
} from '@/core/siyuan/block';

export class BrowserSiyuanAdapter implements BrowserSiyuanPort, BrowserPreviewSiyuanPort {
  readonly ATTR_CARD_ID = ATTR_CARD_ID;
  readonly ATTR_PRIORITY = ATTR_PRIORITY;
  readonly ATTR_SUSPENDED = ATTR_SUSPENDED;
  readonly ATTR_CARD_TYPE = ATTR_CARD_TYPE;
  readonly ATTR_A_FACTOR = ATTR_A_FACTOR;

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getBlockBreadcrumb(blockId: string): Promise<Record<string, unknown>[]> {
    return getBlockBreadcrumb(blockId);
  }

  async getDocInfo(docId: string): Promise<BrowserPreviewDocInfo | null> {
    return getDocInfo(docId);
  }

  async listNotebooks(): Promise<BrowserPreviewNotebookSummary[]> {
    return listNotebooks();
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
