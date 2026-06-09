import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';
import type { FSRSCard } from '@/types';
import { resolveBrowserCardFullContent, truncateContent } from '@/types/browser';
import { createLogger } from '@/utils/logger';
import { countMissingBlockCards, markMissingBlockRows } from './MissingBlockMarker';

interface BlockInfoRow extends Record<string, unknown> {
  id: string;
  root_id: string | null;
  content: string | null;
  attrs: string | null;
}

interface BlockIdRow extends Record<string, unknown> {
  id: string;
}

export interface BrowserDeckBlockInfoBatch {
  attrsMap: Map<string, Record<string, string>>;
  rootIdMap: Map<string, string>;
  tagsMap: Map<string, string[]>;
  contentMap: Map<string, string>;
}

type BlockMarkableRow = {
  blockId?: unknown;
  blockType?: string | null;
  meta?: unknown;
};

const logger = createLogger('BrowserDeckBlockQuerySource');

export class BrowserDeckBlockQuerySource {
  readonly ATTR_CARD_TYPE: string;

  constructor(
    private readonly siyuanApi: BrowserQuerySiyuanPort,
  ) {
    this.ATTR_CARD_TYPE = siyuanApi.ATTR_CARD_TYPE;
  }

  async loadBlockIdsByDocId(docId: string): Promise<string[]> {
    const normalizedDocId = this.escapeSqlString(docId.trim());
    if (!normalizedDocId) {
      return [];
    }

    const query = `
      SELECT id
      FROM blocks
      WHERE root_id = '${normalizedDocId}'
    `;

    const rows = await this.sql<BlockIdRow>(query);
    return this.normalizeBlockIds(rows.map((row) => row.id));
  }

  async loadBlockIdsByDocIds(docIds: string[]): Promise<string[]> {
    const normalizedDocIds = this.normalizeBlockIds(docIds);
    if (normalizedDocIds.length === 0) {
      return [];
    }

    const quotedDocIds = this.toSqlQuotedValues(normalizedDocIds);
    const query = `
      SELECT id
      FROM blocks
      WHERE root_id IN (${quotedDocIds})
    `;

    const rows = await this.sql<BlockIdRow>(query);
    return this.normalizeBlockIds(rows.map((row) => row.id));
  }

  async loadBlockIdsBySearchText(searchText: string): Promise<string[]> {
    const keyword = this.escapeSqlString(searchText.trim());
    if (!keyword) {
      return [];
    }

    const query = `
      SELECT id
      FROM blocks
      WHERE content LIKE '%${keyword}%'
         OR id LIKE '%${keyword}%'
    `;

    const rows = await this.sql<BlockIdRow>(query);
    return this.normalizeBlockIds(rows.map((row) => row.id));
  }

  async markMissingBlockRows<TRow extends BlockMarkableRow>(rows: TRow[]): Promise<TRow[]> {
    const sqlPort: Pick<BrowserQuerySiyuanPort, 'sql'> = {
      sql: (stmt) => this.sql(stmt),
    };
    return markMissingBlockRows(rows, sqlPort);
  }

  async countMissingBlockCards(cards: FSRSCard[]): Promise<number> {
    const sqlPort: Pick<BrowserQuerySiyuanPort, 'sql'> = {
      sql: (stmt) => this.sql(stmt),
    };
    return countMissingBlockCards(cards, sqlPort);
  }

  async hydrateMissingRootIds(cards: FSRSCard[]): Promise<void> {
    if (cards.length === 0) {
      return;
    }

    const cardsNeedingRootId = cards.filter((card) => !this.readMetaString(card, 'rootId'));
    if (cardsNeedingRootId.length === 0) {
      return;
    }

    try {
      const { rootIdMap } = await this.loadBlockInfoByIds(cardsNeedingRootId.map((card) => card.blockId));
      for (const card of cardsNeedingRootId) {
        const rootId = rootIdMap.get(String(card.blockId || '').trim());
        if (rootId) {
          const meta = this.ensureMetaObject(card);
          meta.rootId = rootId;
        }
      }
    } catch (error) {
      logger.error('Failed to fill rootIds:', error);
    }
  }

  async hydrateContentForSearch(cards: FSRSCard[]): Promise<void> {
    if (cards.length === 0) {
      return;
    }

    const cardsNeedingContent = cards.filter((card) => {
      const content = resolveBrowserCardFullContent({ meta: card.meta });
      return !content;
    });

    if (cardsNeedingContent.length === 0) {
      return;
    }

    try {
      const { contentMap } = await this.loadBlockInfoByIds(cardsNeedingContent.map((card) => card.blockId));
      for (const card of cardsNeedingContent) {
        const content = contentMap.get(String(card.blockId || '').trim());
        if (content) {
          const meta = this.ensureMetaObject(card);
          meta.content = content;
        }
      }
    } catch (error) {
      logger.error('Failed to fill content:', error);
    }
  }

  async loadBlockInfoByIds(blockIds: string[]): Promise<BrowserDeckBlockInfoBatch> {
    const normalizedBlockIds = this.normalizeBlockIds(blockIds);
    if (normalizedBlockIds.length === 0) {
      return {
        attrsMap: new Map(),
        rootIdMap: new Map(),
        tagsMap: new Map(),
        contentMap: new Map(),
      };
    }

    const attrsMap = new Map<string, Record<string, string>>();
    const rootIdMap = new Map<string, string>();
    const tagsMap = new Map<string, string[]>();
    const contentMap = new Map<string, string>();

    try {
      const BATCH_SIZE = 500;
      for (let i = 0; i < normalizedBlockIds.length; i += BATCH_SIZE) {
        const batchIds = normalizedBlockIds.slice(i, i + BATCH_SIZE);
        const idsStr = this.toSqlQuotedValues(batchIds);

        const query = `
          SELECT
            b.id,
            b.root_id,
            b.content,
            GROUP_CONCAT(a.name || '=' || a.value, '|||') as attrs
          FROM blocks b
          LEFT JOIN attributes a ON b.id = a.block_id
          WHERE b.id IN (${idsStr})
          GROUP BY b.id
        `;

        const result = await this.sql<BlockInfoRow>(query);

        for (const row of result) {
          const blockId = row.id;
          rootIdMap.set(blockId, row.root_id || '');
          contentMap.set(blockId, row.content || '');

          const attrs: Record<string, string> = {};
          if (row.attrs) {
            const attrPairs = row.attrs.split('|||');
            for (const pair of attrPairs) {
              const [name, value] = pair.split('=');
              if (name && value !== undefined) {
                attrs[name] = value;
              }
            }
          }
          attrsMap.set(blockId, attrs);

          const tags: string[] = [];
          const tagRegex = /#([^\s#]+)/g;
          let match: RegExpExecArray | null;
          while ((match = tagRegex.exec(row.content || '')) !== null) {
            tags.push(match[1]);
          }
          tagsMap.set(blockId, tags);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch block info:', error);
    }

    return { attrsMap, rootIdMap, tagsMap, contentMap };
  }

  private async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return this.siyuanApi.sql<TRow>(stmt);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private ensureMetaObject(card: FSRSCard): Record<string, unknown> {
    if (!this.isRecord(card.meta)) {
      card.meta = {};
    }
    return card.meta as Record<string, unknown>;
  }

  private readMetaString(card: FSRSCard, key: string): string | undefined {
    if (!this.isRecord(card.meta)) {
      return undefined;
    }
    const value = card.meta[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private normalizeBlockIds(blockIds: string[]): string[] {
    return Array.from(new Set(
      blockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean),
    ));
  }

  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private toSqlQuotedValues(values: string[]): string {
    return values
      .map((value) => `'${this.escapeSqlString(value)}'`)
      .join(',');
  }
}
