/**
 * Dual Queue Data Source
 *
 * Manages two separate data sources for different card types.
 * Useful for IncrementalLearningQueue (Topic + Item queues).
 *
 * Features:
 * - Separates data by card type (topic vs item)
 * - Maintains independent buffers for each type
 * - Provides unified getAll() interface
 */

import type { IDataSource, DataSourceOptions } from './IDataSource';
import type { QueueItem } from '../types';
import { ok, err, type Result } from '@/types/result';

export type DualQueueDataSourceConfig = {
  /**
   * Data source for Topic cards
   */
  topicSource: IDataSource<QueueItem>;

  /**
   * Data source for Item cards
   */
  itemSource: IDataSource<QueueItem>;

  /**
   * Filter function to determine card type
   */
  cardTypeFilter?: (item: QueueItem) => 'topic' | 'item';
};

/**
 * Extended queue item with card type
 */
export interface ExtendedQueueItem extends QueueItem {
  cardType?: 'topic' | 'item';
  aFactor?: number;
}

/**
 * Data source that manages two independent queues
 *
 * Maintains separate Topic and Item queues with type filtering.
 */
export class DualQueueDataSource implements IDataSource<ExtendedQueueItem> {
  private readonly topicSource: IDataSource<QueueItem>;
  private readonly itemSource: IDataSource<QueueItem>;
  private readonly cardTypeFilter: (item: QueueItem) => 'topic' | 'item';

  // Cached items
  private topicBuffer: ExtendedQueueItem[] = [];
  private itemBuffer: ExtendedQueueItem[] = [];
  private loaded = false;

  constructor(config: DualQueueDataSourceConfig) {
    this.topicSource = config.topicSource;
    this.itemSource = config.itemSource;
    this.cardTypeFilter = config.cardTypeFilter || this.defaultCardTypeFilter;
  }

  /**
   * Get all items from both sources
   */
  async getAll(): Promise<ExtendedQueueItem[]> {
    if (!this.loaded) {
      await this.load();
    }

    // Merge topic and item buffers
    return [...this.topicBuffer, ...this.itemBuffer];
  }

  /**
   * Get items from topic queue only
   */
  async getTopicItems(): Promise<ExtendedQueueItem[]> {
    if (!this.loaded) {
      await this.load();
    }
    return [...this.topicBuffer];
  }

  /**
   * Get items from item queue only
   */
  async getItemItems(): Promise<ExtendedQueueItem[]> {
    if (!this.loaded) {
      await this.load();
    }
    return [...this.itemBuffer];
  }

  /**
   * Add items to appropriate queue based on type
   */
  async add(items: ExtendedQueueItem[]): Promise<Result<number>> {
    console.log('[DualQueueDataSource] Starting add for', items.length, 'items');

    try {
      let addedCount = 0;

      const topics: ExtendedQueueItem[] = [];
      const items_queue: ExtendedQueueItem[] = [];

      // Separate by card type
      for (const item of items) {
        const cardType = item.cardType || this.cardTypeFilter(item);
        console.log('[DualQueueDataSource] Item', item.blockID, 'cardType:', cardType);
        if (cardType === 'topic') {
          topics.push(item);
        } else {
          items_queue.push(item);
        }
      }

      console.log('[DualQueueDataSource] Separated:', topics.length, 'topics,', items_queue.length, 'items');

      // Add to respective sources
      if (this.topicSource.add && topics.length > 0) {
        console.log('[DualQueueDataSource] Adding', topics.length, 'topics to topicSource');
        const topicResult = await this.topicSource.add(topics);
        const topicCount = topicResult.ok ? topicResult.value : 0;
        addedCount += topicCount;
        console.log('[DualQueueDataSource] topicSource added:', topicCount);
        this.topicBuffer.push(...topics);
      }

      if (this.itemSource.add && items_queue.length > 0) {
        console.log('[DualQueueDataSource] Adding', items_queue.length, 'items to itemSource');
        const itemResult = await this.itemSource.add(items_queue);
        const itemCount = itemResult.ok ? itemResult.value : 0;
        addedCount += itemCount;
        console.log('[DualQueueDataSource] itemSource added:', itemCount);
        this.itemBuffer.push(...items_queue);
      }

      console.log('[DualQueueDataSource] Total added:', addedCount, 'items');
      console.log('[DualQueueDataSource] Buffer sizes:', {
        topics: this.topicBuffer.length,
        items: this.itemBuffer.length,
      });

      return ok(addedCount);
    } catch (error) {
      console.error('[DualQueueDataSource] Failed to add items:', error);
      return err(error as Error);
    }
  }

  /**
   * Remove items from appropriate queue
   */
  async remove(items: ExtendedQueueItem[]): Promise<Result<number>> {
    try {
      let removedCount = 0;

      const topics: ExtendedQueueItem[] = [];
      const items_queue: ExtendedQueueItem[] = [];

      // Separate by card type
      for (const item of items) {
        const cardType = item.cardType || this.cardTypeFilter(item);
        if (cardType === 'topic') {
          topics.push(item);
        } else {
          items_queue.push(item);
        }
      }

      // Remove from respective sources
      if (this.topicSource.remove && topics.length > 0) {
        const topicResult = await this.topicSource.remove(topics);
        removedCount += topicResult.ok ? topicResult.value : 0;

        // Also remove from local buffer
        const topicIds = new Set(topics.map(t => t.cardID));
        this.topicBuffer = this.topicBuffer.filter(t => !topicIds.has(t.cardID));
      }

      if (this.itemSource.remove && items_queue.length > 0) {
        const itemResult = await this.itemSource.remove(items_queue);
        removedCount += itemResult.ok ? itemResult.value : 0;

        // Also remove from local buffer
        const itemIds = new Set(items_queue.map(i => i.cardID));
        this.itemBuffer = this.itemBuffer.filter(i => !itemIds.has(i.cardID));
      }

      return ok(removedCount);
    } catch (error) {
      console.error('[DualQueueDataSource] Failed to remove items:', error);
      return err(error as Error);
    }
  }

  /**
   * Remove from head of specific queue
   */
  removeFromHead(cardType: 'topic' | 'item'): void {
    if (cardType === 'topic') {
      this.topicBuffer.shift();
    } else {
      this.itemBuffer.shift();
    }
  }

  /**
   * Get size of specific queue
   */
  getQueueSize(cardType: 'topic' | 'item'): number {
    return cardType === 'topic' ? this.topicBuffer.length : this.itemBuffer.length;
  }

  /**
   * Get total size
   */
  size(): number {
    return this.topicBuffer.length + this.itemBuffer.length;
  }

  /**
   * Check if empty
   */
  isEmpty(): boolean {
    return this.topicBuffer.length === 0 && this.itemBuffer.length === 0;
  }

  /**
   * Load items from both sources
   */
  private async load(): Promise<void> {
    this.loaded = true;

    // Load from topic source
    const topicItems = await this.topicSource.getAll();
    this.topicBuffer = topicItems.map(item => ({
      ...item,
      cardType: 'topic' as const,
    }));

    // Load from item source
    const itemItems = await this.itemSource.getAll();
    this.itemBuffer = itemItems.map(item => ({
      ...item,
      cardType: 'item' as const,
    }));

    console.log('[DualQueueDataSource] Loaded:', {
      topicCount: this.topicBuffer.length,
      itemCount: this.itemBuffer.length,
    });
  }

  /**
   * Default card type filter
   * Checks custom-fsrs-type attribute
   */
  private defaultCardTypeFilter(item: QueueItem): 'topic' | 'item' {
    // Try to read from meta attributes
    const typeAttr = (item as any).meta?.['custom-fsrs-type'];
    if (typeAttr === 'topic') return 'topic';
    if (typeAttr === 'item') return 'item';

    // Default to item
    return 'item';
  }
}
