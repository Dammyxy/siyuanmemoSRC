/**
 * Data Source Interface for Queue Strategies
 *
 * Provides abstraction over where queue items are stored and retrieved.
 * Allows different storage backends (Riff API, Local Storage, Graph traversal, etc.)
 */

/**
 * Data Source for Queue Items
 *
 * Provides read/write access to a collection of queue items.
 * All queue operations go through this abstraction.
 */
export interface IDataSource<TItem> {
  /**
   * Get all items from the data source
   *
   * @returns All items in the data source
   */
  getAll(): Promise<TItem[]>;

  /**
   * Add items to the data source (optional)
   *
   * @param items Items to add
   * @returns Number of items successfully added
   */
  add?(items: TItem[]): Promise<number>;

  /**
   * Remove items from the data source (optional)
   *
   * @param items Items to remove
   * @returns Number of items successfully removed
   */
  remove?(items: TItem[]): Promise<number>;

  /**
   * Get the size of the data source (optional)
   *
   * @returns Number of items in the data source
   */
  size?(): Promise<number> | number;

  /**
   * Check if the data source is empty (optional)
   *
   * @returns true if no items in the data source
   */
  isEmpty?(): Promise<boolean> | boolean;
}

/**
 * Options for creating data sources
 */
export type DataSourceOptions<TItem> = {
  /**
   * Filter function for items (optional)
   */
  filter?: (item: TItem) => boolean;

  /**
   * Transform function for items (optional)
   */
  transform?: (item: TItem) => TItem | Promise<TItem>;

  /**
   * Maximum number of items to return (optional)
   */
  limit?: number;
};

/**
 * Hybrid data source combining multiple sources
 */
export interface IHybridDataSource<TItem> extends IDataSource<TItem> {
  /**
   * Get items from a specific source
   *
   * @param sourceId Source identifier (e.g., 'riff', 'local', 'storage')
   * @returns Items from the specified source
   */
  getFromSource(sourceId: string): Promise<TItem[]>;

  /**
   * Get all source identifiers
   *
   * @returns Array of source IDs
   */
  getSourceIds(): string[];
}
