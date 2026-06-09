import type {
  BrowserBlockAttributeRow,
  BrowserBlockInfoRow,
  BrowserBlockMetaRow,
  BrowserDocTreeRow,
  BrowserSiyuanPort,
} from '@/application/ports/BrowserSiyuanPort';
import type {
  BrowserPreviewDocInfo,
  BrowserPreviewDocumentBreadcrumbRow,
  BrowserPreviewNotebookSummary,
  BrowserPreviewSiyuanPort,
} from '@/application/ports/BrowserPreviewSiyuanPort';
import { getBlockAttrs, getBlockBreadcrumb, getDocInfo, listNotebooks, pushErrMsg, pushMsg, setBlockAttrs, sql } from './api';
import {
  ATTR_A_FACTOR,
  ATTR_CARD_ID,
  ATTR_CARD_TYPE,
  ATTR_PRIORITY,
  ATTR_SUSPENDED,
} from '@/core/siyuan/block';
import { BUILTIN_DECK_ID, getRiffCards, type RiffBlock } from '@/core/siyuan/riff';
import { buildInClause, escapeSQL } from '@/utils/sqlOptimizer';

export class BrowserSiyuanAdapter implements BrowserSiyuanPort, BrowserPreviewSiyuanPort {
  readonly ATTR_CARD_ID = ATTR_CARD_ID;
  readonly ATTR_PRIORITY = ATTR_PRIORITY;
  readonly ATTR_SUSPENDED = ATTR_SUSPENDED;
  readonly ATTR_CARD_TYPE = ATTR_CARD_TYPE;
  readonly ATTR_A_FACTOR = ATTR_A_FACTOR;
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async getBlockInfoRowsByIds(blockIds: string[]): Promise<BrowserBlockInfoRow[]> {
    const ids = normalizeIds(blockIds);
    if (ids.length === 0) {
      return [];
    }
    return this.sql<BrowserBlockInfoRow>(
      `SELECT id, root_id, ial, type, content FROM blocks WHERE id IN (${buildInClause(ids)})`,
    );
  }

  async getBlockAttributeRowsByIds(
    blockIds: string[],
    attrNames: string[],
  ): Promise<BrowserBlockAttributeRow[]> {
    const ids = normalizeIds(blockIds);
    const names = normalizeIds(attrNames);
    if (ids.length === 0 || names.length === 0) {
      return [];
    }
    return this.sql<BrowserBlockAttributeRow>(`
      SELECT block_id, name, value
      FROM attributes
      WHERE block_id IN (${buildInClause(ids)})
      AND name IN (${buildInClause(names)})
    `);
  }

  async getDocTreeRowsByIds(rootIds: string[]): Promise<BrowserDocTreeRow[]> {
    const ids = normalizeIds(rootIds);
    if (ids.length === 0) {
      return [];
    }
    return this.sql<BrowserDocTreeRow>(
      `SELECT id, content, hpath FROM blocks WHERE id IN (${buildInClause(ids)})`,
    );
  }

  async getBlockMeta(blockId: string): Promise<BrowserBlockMetaRow | null> {
    const id = String(blockId || '').trim();
    if (!id) {
      return null;
    }
    const rows = await this.sql<BrowserBlockMetaRow>(
      `SELECT created, updated, tag FROM blocks WHERE id = '${escapeSQL(id)}'`,
    );
    return rows[0] ?? null;
  }

  async getBlockBreadcrumb(blockId: string): Promise<Record<string, unknown>[]> {
    return getBlockBreadcrumb(blockId);
  }

  async getDocInfo(docId: string): Promise<BrowserPreviewDocInfo | null> {
    return getDocInfo(docId);
  }

  async getRiffCards(deckID: string, options?: { includeNew?: boolean }): Promise<RiffBlock[]> {
    return getRiffCards(deckID, options) as Promise<RiffBlock[]>;
  }

  async listNotebooks(): Promise<BrowserPreviewNotebookSummary[]> {
    return listNotebooks();
  }

  async getDocumentBreadcrumbRowsByPaths(
    box: string,
    ancestorPaths: string[],
  ): Promise<BrowserPreviewDocumentBreadcrumbRow[]> {
    const notebookId = String(box || '').trim();
    const paths = normalizeIds(ancestorPaths);
    if (!notebookId || paths.length === 0) {
      return [];
    }
    return this.sql<BrowserPreviewDocumentBreadcrumbRow>(`
      SELECT id, content, hpath, path, type
      FROM blocks
      WHERE box = '${escapeSQL(notebookId)}'
      AND type = 'd'
      AND path IN (${buildInClause(paths)})
    `);
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

function normalizeIds(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}
