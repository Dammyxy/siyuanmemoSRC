/**
 * Topic/Item Card Filter Utility
 * 
 * Provides shared Topic filtering logic that can be reused by queues and browsers.
 * This utility helps separate Topic cards (reading material) from Item cards (flashcards)
 * based on local card type metadata.
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

import type { QueueItem } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TopicFilter');

/**
 * Topic/Item card filter utility
 */
export class TopicFilter {
  private static resolveQueueItemCardType(item: QueueItem): string {
    const candidate = item as QueueItem & { type?: unknown };
    if (typeof candidate.type === 'string' && candidate.type.length > 0) {
      return candidate.type;
    }
    const meta = candidate.meta;
    if (meta && typeof meta === 'object') {
      const metaRecord = meta as Record<string, unknown>;
      const cardType = metaRecord.cardType;
      if (typeof cardType === 'string' && cardType.length > 0) {
        return cardType;
      }
      const type = metaRecord.type;
      if (typeof type === 'string' && type.length > 0) {
        return type;
      }
    }
    return 'item';
  }

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
      const filtered = items.filter(item => {
        const cardType = this.resolveQueueItemCardType(item);
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
      const filtered = items.filter(item => {
        const cardType = this.resolveQueueItemCardType(item);
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
      const topics: QueueItem[] = [];
      const itemCards: QueueItem[] = [];

      for (const item of items) {
        const cardType = this.resolveQueueItemCardType(item);
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

}
