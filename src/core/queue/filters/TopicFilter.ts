/**
 * Topic/Item Card Filter Utility
 * 
 * Provides shared Topic filtering logic that can be reused by queues and browsers.
 * This utility helps separate Topic cards (reading material) from Item cards (flashcards)
 * based on the 'custom-fsrs-card-type' attribute.
 * 
 * ## Use Cases
 * 
 * 1. **Retrieval Practice Queue**: Filters out Topic cards, only keeps Items
 * 2. **Incremental Learning Queue**: Separates Topics and Items for mixed review
 * 3. **Browser**: Provides user filtering options (All / Topics Only / Items Only)
 * 
 * ## Design Philosophy
 * 
 * - **Data Source Layer**: Returns all cards (no filtering)
 * - **Queue Layer**: Decides which cards to use (applies filtering)
 * - **Browser Layer**: Provides user filtering options
 * 
 * @example
 * ```typescript
 * // Retrieval Practice Queue - only Items
 * const allCards = await dataSource.getAll();
 * const itemCards = await TopicFilter.filterItemsOnly(allCards);
 * 
 * // Incremental Learning Queue - separate Topics and Items
 * const { topics, items } = await TopicFilter.separateTopicAndItem(allCards);
 * 
 * // Browser - user selects filter
 * if (userSelection === 'item-only') {
 *   const itemCards = await TopicFilter.filterItemsOnly(allCards);
 * }
 * ```
 */

import { sql } from '@/core/siyuan/api';
import type { QueueItem } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TopicFilter');

type CardTypeRow = {
  block_id?: string;
  blockId?: string;
  value?: string;
};

/**
 * Topic/Item card filter utility
 */
export class TopicFilter {
  /**
   * Filters out Topic cards, only keeps Item cards
   * 
   * This is used by Retrieval Practice Queue to exclude reading material
   * and focus only on flashcards that need active recall.
   * 
   * ## Error Handling
   * If the query fails, this method throws.
   * Callers should surface the error and fix the source issue instead of silently degrading.
   * 
   * @param items - Queue items to filter
   * @returns Filtered items with Topic cards removed
   * 
   * @example
   * ```typescript
   * const allCards = await dataSource.getAll();
   * const itemCards = await TopicFilter.filterItemsOnly(allCards);
   * // itemCards only contains flashcards, no reading material
   * ```
   */
  static async filterItemsOnly(items: QueueItem[]): Promise<QueueItem[]> {
    if (items.length === 0) return items;

    try {
      const cardTypes = await this.batchGetCardTypes(
        items.map(item => item.blockID)
      );

      const filtered = items.filter(item => {
        const cardType = cardTypes.get(item.blockID);
        // Cards without the attribute are treated as Items (backward compatible)
        return cardType !== 'topic';
      });

      logger.debug('Filtered items only', {
        total: items.length,
        filtered: filtered.length,
        topicCount: items.length - filtered.length,
      });

      return filtered;
    } catch (error) {
      logger.error('Failed to filter items', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Filters out Item cards, only keeps Topic cards
   * 
   * This is used when users want to review only reading material
   * without the pressure of active recall testing.
   * 
   * ## Error Handling
   * If the query fails, this method throws.
   * 
   * @param items - Queue items to filter
   * @returns Filtered items with only Topic cards
   * 
   * @example
   * ```typescript
   * const allCards = await dataSource.getAll();
   * const topicCards = await TopicFilter.filterTopicsOnly(allCards);
   * // topicCards only contains reading material
   * ```
   */
  static async filterTopicsOnly(items: QueueItem[]): Promise<QueueItem[]> {
    if (items.length === 0) return items;

    try {
      const cardTypes = await this.batchGetCardTypes(
        items.map(item => item.blockID)
      );

      const filtered = items.filter(item => {
        const cardType = cardTypes.get(item.blockID);
        return cardType === 'topic';
      });

      logger.debug('Filtered topics only', {
        total: items.length,
        filtered: filtered.length,
        itemCount: items.length - filtered.length,
      });

      return filtered;
    } catch (error) {
      logger.error('Failed to filter topics', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Separates Topic and Item cards into two arrays
   * 
   * This is used by Incremental Learning Queue to mix Topics and Items
   * according to a configurable ratio (e.g., 25% Topics, 75% Items).
   * 
   * ## Error Handling
   * If the query fails, this method throws.
   * 
   * @param items - Queue items to separate
   * @returns Object with separated topics and items arrays
   * 
   * @example
   * ```typescript
   * const allCards = await dataSource.getAll();
   * const { topics, items } = await TopicFilter.separateTopicAndItem(allCards);
   * 
   * // Mix according to ratio
   * const shouldPickTopic = Math.random() < 0.25;
   * const nextCard = shouldPickTopic 
   *   ? selectFrom(topics) 
   *   : selectFrom(items);
   * ```
   */
  static async separateTopicAndItem(items: QueueItem[]): Promise<{
    topics: QueueItem[];
    items: QueueItem[];
  }> {
    if (items.length === 0) {
      return { topics: [], items: [] };
    }

    try {
      const cardTypes = await this.batchGetCardTypes(
        items.map(item => item.blockID)
      );

      const topics: QueueItem[] = [];
      const itemCards: QueueItem[] = [];

      for (const item of items) {
        const cardType = cardTypes.get(item.blockID);
        if (cardType === 'topic') {
          topics.push(item);
        } else {
          // Cards without the attribute are treated as Items
          itemCards.push(item);
        }
      }

      logger.debug('Separated cards', {
        total: items.length,
        topics: topics.length,
        items: itemCards.length,
      });

      return { topics, items: itemCards };
    } catch (error) {
      logger.error('Failed to separate cards', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Batch queries card types from block attributes
   * 
   * Efficiently retrieves card types for multiple blocks using batched SQL queries.
   * Each batch processes up to 200 block IDs to balance performance and query size.
   * 
   * ## Performance Optimization
   * - Processes blocks in batches of 200 to avoid query size limits
   * - Uses SQL IN clause for efficient batch querying
   * - Returns a Map for O(1) lookup performance
   * 
   * ## Error Handling
   * If the query fails, this method throws.
   * 
   * @param blockIds - Array of block IDs to query
   * @returns Map of block ID to card type ('topic' or undefined for items)
   * 
   * @private
   * @internal
   */
  private static async batchGetCardTypes(blockIds: string[]): Promise<Map<string, string>> {
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

        for (const row of rows as CardTypeRow[]) {
          const blockId = String(row?.block_id || row?.blockId || '');
          const cardType = String(row?.value || '');
          if (blockId && cardType) {
            result.set(blockId, cardType);
          }
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to batch get card types', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Escapes SQL string values to prevent SQL injection
   * 
   * Replaces single quotes with double single quotes, following SQL standard escaping.
   * This is a critical security measure when building dynamic SQL queries.
   * 
   * @param value - String value to escape
   * @returns Escaped string safe for SQL queries
   * 
   * @example
   * ```typescript
   * escapeSQL("O'Brien") // Returns "O''Brien"
   * escapeSQL("Normal text") // Returns "Normal text"
   * ```
   * 
   * @private
   * @internal
   */
  private static escapeSQL(value: string): string {
    return String(value || '').replace(/'/g, "''");
  }
}
