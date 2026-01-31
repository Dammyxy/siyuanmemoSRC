/**
 * Riff API Data Source
 *
 * Retrieves queue items from SiYuan's built-in Riff flashcard system.
 */

import type { IDataSource, DataSourceOptions } from './IDataSource';
import type { QueueItem } from '../types';
import { getRiffDueCards } from '../../siyuan/riff';
import { sql } from '../../siyuan/api';

export type RiffDataSourceOptions = DataSourceOptions<QueueItem> & {
  deckId: string;
  notebook?: string;
  rootID?: string;
  blacklistProvider?: () => Set<string>;
};

/**
 * Data source that reads from Riff API
 */
export class RiffDataSource implements IDataSource<QueueItem> {
  private readonly deckId: string;
  private readonly notebook?: string;
  private readonly rootID?: string;
  private readonly filterFn?: (item: QueueItem) => boolean;
  private readonly limit?: number;
  private readonly blacklistProvider?: () => Set<string>;
  private cache: QueueItem[] = [];

  constructor(options: RiffDataSourceOptions) {
    this.deckId = options.deckId;
    this.notebook = options.notebook;
    this.rootID = options.rootID;
    this.filterFn = options.filter;
    this.limit = options.limit;
    this.blacklistProvider = options.blacklistProvider;
  }

  /**
   * Filter out Topic cards from Riff data source
   */
  private async filterTopicCards(items: QueueItem[]): Promise<QueueItem[]> {
    if (items.length === 0) return items;

    try {
      const blockIds = items.map(item => item.blockID);
      const cardTypes = await this.batchGetCardTypes(blockIds);

      // 🆕 详细日志：显示每个块 ID 的卡片类型
      console.log('[RiffDataSource] Card types query result:', {
        totalBlocks: blockIds.length,
        foundTypes: cardTypes.size,
        typeBreakdown: Array.from(cardTypes.entries()).reduce((acc, [blockId, type]) => {
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });

      const filtered = items.filter(item => {
        const cardType = cardTypes.get(item.blockID);
        // 未找到类型属性的卡片默认为 Item（向后兼容）
        return cardType !== 'topic';
      });

      console.log('[RiffDataSource] Topic filter result:', {
        total: items.length,
        filtered: filtered.length,
        topicCount: items.length - filtered.length,
      });

      return filtered;
    } catch (error) {
      console.error('[RiffDataSource] Failed to filter topic cards:', error);
      // Fallback: return all cards
      return items;
    }
  }

  /**
   * Batch query card types from block attributes
   */
  private async batchGetCardTypes(blockIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (blockIds.length === 0) return result;

    try {
      // Batch query (200 per batch)
      for (let i = 0; i < blockIds.length; i += 200) {
        const batch = blockIds.slice(i, i + 200);
        const inList = batch.map(id => `'${this.escapeSQL(id)}'`).join(',');
        const stmt = `
          SELECT block_id, value
          FROM attributes
          WHERE name = 'custom-fsrs-card-type'
          AND block_id IN (${inList})
        `;

        const rows = await sql(stmt);

        for (const row of rows as any[]) {
          const blockId = String(row?.block_id || row?.blockId || '');
          const cardType = String(row?.value || '');
          if (blockId && cardType) {
            result.set(blockId, cardType);
          }
        }
      }

      return result;
    } catch (error) {
      console.error('[RiffDataSource] Failed to batch get card types:', error);
      return result;
    }
  }

  /**
   * Escape SQL string to prevent injection
   */
  private escapeSQL(value: string): string {
    return String(value || '').replace(/'/g, "''");
  }

  async getAll(): Promise<QueueItem[]> {
    try {
      const data = await getRiffDueCards(this.deckId, this.notebook, this.rootID);

      if (!data || !data.cards || data.cards.length === 0) {
        return [];
      }

      let items: QueueItem[] = data.cards.map(card => ({
        cardID: card.cardID,
        blockID: card.blockID,
        deckID: card.deckID,
        priority: 50, // Default priority for Riff cards
        nextDues: card.nextDues as any,
        state: card.state,
        lapses: card.lapses,
        reps: card.reps,
        lastReview: card.lastReview ? new Date(card.lastReview).getTime() : undefined,
      }));

      // Filter Topic cards
      items = await this.filterTopicCards(items);

      // Filter blacklist cards
      if (this.blacklistProvider) {
        const blacklist = this.blacklistProvider();
        const beforeCount = items.length;
        items = items.filter(item => !blacklist.has(item.blockID));
        const afterCount = items.length;
        if (beforeCount !== afterCount) {
          console.log('[RiffDataSource] Blacklist filter result:', {
            before: beforeCount,
            after: afterCount,
            filtered: beforeCount - afterCount,
          });
        }
      }

      // Apply custom filter
      if (this.filterFn) {
        items = items.filter(this.filterFn);
      }

      // Apply limit
      if (this.limit && items.length > this.limit) {
        items = items.slice(0, this.limit);
      }

      this.cache = items;
      return items;
    } catch (error) {
      console.error('[RiffDataSource] Failed to load cards:', error);
      return [];
    }
  }

  async add(items: QueueItem[]): Promise<number> {
    // Riff API doesn't support adding cards through queue interface
    // Cards should be added via addRiffCards API
    console.warn('[RiffDataSource] Adding cards not supported, use addRiffCards API');
    return 0;
  }

  async remove(items: QueueItem[]): Promise<number> {
    // Riff API doesn't support removing cards from queue
    // Cards are removed after review/skip
    console.warn('[RiffDataSource] Removing cards not supported via queue interface');
    return 0;
  }
}
