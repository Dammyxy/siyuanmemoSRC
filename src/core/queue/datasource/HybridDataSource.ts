/**
 * Hybrid Data Source
 *
 * Combines multiple data sources into a single unified source.
 * Useful for queues that need to merge Riff + Local storage, or multiple decks.
 */

import type { IDataSource, IHybridDataSource, DataSourceOptions } from './IDataSource';
import type { QueueItem } from '../types';

export type HybridDataSourceConfig = {
  [sourceId: string]: IDataSource<QueueItem>;
};

export type HybridDataSourceOptions = DataSourceOptions<QueueItem> & {
  sources: HybridDataSourceConfig;
  priority?: string[]; // Source priority order (higher priority first)
};

/**
 * Data source that combines multiple sources
 *
 * Merges items from all sources, with optional priority ordering.
 */
export class HybridDataSource implements IHybridDataSource<QueueItem> {
  private readonly sources: HybridDataSourceConfig;
  private readonly priority: string[];
  private readonly filterFn?: (item: QueueItem) => boolean;
  private readonly limit?: number;

  constructor(options: HybridDataSourceOptions) {
    this.sources = options.sources;
    this.priority = options.priority || Object.keys(options.sources);
    this.filterFn = options.filter;
    this.limit = options.limit;
  }

  async getAll(): Promise<QueueItem[]> {
    const allItems: QueueItem[] = [];

    // Fetch from all sources in priority order
    for (const sourceId of this.priority) {
      const source = this.sources[sourceId];
      if (!source) continue;

      const items = await source.getAll();
      allItems.push(...items);
    }

    // Apply custom filter
    let filtered = this.filterFn ? allItems.filter(this.filterFn) : allItems;

    // Apply limit
    if (this.limit && filtered.length > this.limit) {
      filtered = filtered.slice(0, this.limit);
    }

    return filtered;
  }

  async add(items: QueueItem[]): Promise<number> {
    console.log('[HybridDataSource] Starting add for', items.length, 'items');
    console.log('[HybridDataSource] Priority order:', this.priority);
    console.log('[HybridDataSource] Available sources:', Object.keys(this.sources));

    let addedCount = 0;

    // Try to add to ALL sources that support add operation
    // Don't stop at first success, because some sources (like Riff) may return 0
    for (const sourceId of this.priority) {
      const source = this.sources[sourceId];
      if (!source) {
        console.log('[HybridDataSource] Source not found:', sourceId);
        continue;
      }
      if (!source.add) {
        console.log('[HybridDataSource] Source does not support add:', sourceId);
        continue;
      }

      console.log('[HybridDataSource] Trying to add to source:', sourceId);
      const count = await source.add(items);
      console.log('[HybridDataSource] Source', sourceId, 'added:', count, 'items');
      if (count > 0) {
        addedCount += count;
      }
    }

    console.log('[HybridDataSource] Total added:', addedCount, 'items');
    return addedCount;
  }

  async remove(items: QueueItem[]): Promise<number> {
    let removedCount = 0;

    // Try to remove from all sources that support remove operation
    for (const sourceId of this.priority) {
      const source = this.sources[sourceId];
      if (!source || !source.remove) continue;

      const count = await source.remove(items);
      removedCount += count;
    }

    return removedCount;
  }

  async getFromSource(sourceId: string): Promise<QueueItem[]> {
    const source = this.sources[sourceId];
    if (!source) {
      console.warn(`[HybridDataSource] Source '${sourceId}' not found`);
      return [];
    }

    return source.getAll();
  }

  getSourceIds(): string[] {
    return Object.keys(this.sources);
  }

  size(): number {
    // Estimated size (sum of all sources)
    let total = 0;
    for (const source of Object.values(this.sources)) {
      if (source.size) {
        const size = typeof source.size === 'function' ? source.size() : source.size;
        total += size;
      }
    }
    return total;
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }
}
