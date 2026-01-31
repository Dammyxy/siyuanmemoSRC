/**
 * Group Data Source
 *
 * Manages multiple groups of items independently.
 * Useful for FilterGroupQueue and other multi-group scenarios.
 *
 * Features:
 * - Separate groups by ID
 * - Add/remove items per group
 * - Get items from specific group
 * - Track group sizes
 */

import type { IDataSource } from './IDataSource';
import type { QueueItem } from '../types';

export type GroupDataSourceConfig = {
  /**
   * Group IDs to manage
   */
  groupIds: string[];

  /**
   * Persistence adapter (optional)
   */
  persistence?: {
    save: (data: Record<string, QueueItem[]>) => Promise<void>;
    load: () => Promise<Record<string, QueueItem[]> | null>;
  };
};

/**
 * Data source that manages multiple independent groups
 */
export class GroupDataSource implements IDataSource<QueueItem> {
  private readonly groupIds: string[];
  private readonly persistence?: GroupDataSourceConfig['persistence'];

  // Groups storage
  private groups: Record<string, QueueItem[]> = {};
  private loaded = false;

  constructor(config: GroupDataSourceConfig) {
    this.groupIds = config.groupIds;
    this.persistence = config.persistence;

    // Initialize empty groups
    for (const groupId of this.groupIds) {
      this.groups[groupId] = [];
    }
  }

  /**
   * Get all items from all groups
   */
  async getAll(): Promise<QueueItem[]> {
    if (!this.loaded) {
      await this.load();
    }

    const allItems: QueueItem[] = [];
    for (const groupId of this.groupIds) {
      allItems.push(...this.groups[groupId]);
    }
    return allItems;
  }

  /**
   * Get items from a specific group
   */
  async getGroup(groupId: string): Promise<QueueItem[]> {
    if (!this.loaded) {
      await this.load();
    }
    return [...(this.groups[groupId] || [])];
  }

  /**
   * Get all groups
   */
  getAllGroups(): Record<string, QueueItem[]> {
    return { ...this.groups };
  }

  /**
   * Add items to appropriate groups
   */
  async add(items: QueueItem[]): Promise<number> {
    console.log('[GroupDataSource] ========== add 被调用 ==========');
    console.log('[GroupDataSource] items 数量:', items?.length);
    console.log('[GroupDataSource] loaded:', this.loaded);
    console.log('[GroupDataSource] groupIds:', this.groupIds);
    console.log('[GroupDataSource] 当前 groups:', Object.keys(this.groups));
    
    if (!this.loaded) {
      console.log('[GroupDataSource] 首次加载，调用 load()');
      await this.load();
    }

    let addedCount = 0;

    for (const item of items || []) {
      const metaGroupId = (item as any).meta?.groupId;
      const fallbackGroupId = this.groupIds[0] || 'default';
      const groupId = String(metaGroupId || fallbackGroupId);
      
      console.log('[GroupDataSource] 处理 item:', {
        cardID: item.cardID,
        metaGroupId,
        fallbackGroupId,
        finalGroupId: groupId,
      });

      if (!this.groups[groupId]) {
        console.log('[GroupDataSource] ⚠️ 组不存在，创建新组:', groupId);
        this.groups[groupId] = [];
      }

      // Check for duplicates
      if (this.groups[groupId].some((x) => x.cardID === item.cardID)) {
        console.log('[GroupDataSource] ❌ 卡片已存在，跳过:', item.cardID);
        continue;
      }

      this.groups[groupId].push(item);
      addedCount++;
      console.log('[GroupDataSource] ✅ 成功添加到组:', groupId, '当前组大小:', this.groups[groupId].length);
    }

    console.log('[GroupDataSource] 添加完成，共添加:', addedCount);
    console.log('[GroupDataSource] 所有组大小:', Object.entries(this.groups).map(([id, items]) => `${id}: ${items.length}`));

    if (addedCount > 0) {
      console.log('[GroupDataSource] 保存到持久化存储');
      await this.save();
    }

    return addedCount;
  }

  /**
   * Remove items from groups
   */
  async remove(items: QueueItem[]): Promise<number> {
    if (!this.loaded) {
      await this.load();
    }

    const removeSet = new Set((items || []).map((x) => String((x as any)?.cardID || '')).filter(Boolean));

    if (removeSet.size === 0) return 0;

    let removedCount = 0;

    for (const groupId of this.groupIds) {
      const beforeLength = this.groups[groupId].length;
      this.groups[groupId] = this.groups[groupId].filter((x) => !removeSet.has(String(x.cardID)));
      removedCount += beforeLength - this.groups[groupId].length;
    }

    if (removedCount > 0) {
      await this.save();
    }

    return removedCount;
  }

  /**
   * Remove from head of specific group
   */
  removeFromGroupHead(groupId: string): QueueItem | null {
    const group = this.groups[groupId];
    if (!group || group.length === 0) return null;

    const item = group.shift();
    this.save(); // Async but fire-and-forget
    return item || null;
  }

  /**
   * Get size of specific group
   */
  getGroupSize(groupId: string): number {
    return this.groups[groupId]?.length || 0;
  }

  /**
   * Get total size
   */
  size(): number {
    return Object.values(this.groups).reduce((total, group) => total + group.length, 0);
  }

  /**
   * Check if empty
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Load from persistence
   */
  private async load(): Promise<void> {
    this.loaded = true;

    if (!this.persistence) return;

    try {
      const stored = await this.persistence.load();
      if (stored) {
        for (const [groupId, items] of Object.entries(stored)) {
          this.groups[groupId] = items || [];
        }
      }
    } catch (error) {
      console.error('[GroupDataSource] Failed to load:', error);
    }
  }

  /**
   * Save to persistence
   */
  private async save(): Promise<void> {
    if (!this.persistence) return;

    try {
      await this.persistence.save(this.groups);
    } catch (error) {
      console.error('[GroupDataSource] Failed to save:', error);
    }
  }
}
