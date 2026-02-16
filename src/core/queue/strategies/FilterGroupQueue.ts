/**
 * Filter Group Queue (V2 - Composite Architecture)
 *
 * @deprecated 此文件属于旧队列架构，将在未来版本中移除。
 * 请使用 src/queues/ 中的新架构。
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
 *
 * New implementation using BaseCompositeQueue pattern.
 * Manages multiple filter groups with weighted scheduling.
 *
 * Features:
 * - Multiple independent groups
 * - Weighted schedule (groups appear multiple times based on weight)
 * - Cursor tracking (advances after each item)
 * - Persistence support
 */

import type { PersistenceAdapter } from '../persistence';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types';
import { GroupDataSource } from '../datasource/GroupDataSource';
import { GroupSequencer } from '../sequencers/GroupSequencer';
import { NullScheduler } from '../schedulers/NullScheduler';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority';

export interface FilterGroupConfig {
  id: string;
  weight: number;
}

export interface FilterGroupSnapshot {
  groups: Record<string, QueueItem[]>;
  cursor: number;
  schedule: string[];
}

/**
 * Filter Group Queue (V2)
 *
 * New implementation using composite architecture.
 * Maintains full compatibility with V1.
 */
/**
 * @deprecated Old architecture queue. Use src/queues/FilterGroupQueue instead.
 */
export class FilterGroupQueue extends BaseCompositeQueue<QueueItem>
  implements IQueueStrategy<QueueItem>
{
  private readonly groupDataSource: GroupDataSource;
  private readonly groupSequencer: GroupSequencer<QueueItem>;
  private readonly configs: FilterGroupConfig[];

  constructor(
    configs: FilterGroupConfig[],
    persistence?: PersistenceAdapter<FilterGroupSnapshot>
  ) {
    // Build schedule from configs
    const schedule = FilterGroupQueue.buildSchedule(configs);
    const groupIds = configs.map((c) => c.id);

    // Create persistence adapter wrapper
    const persistenceWrapper = persistence
      ? {
          save: async (data: Record<string, QueueItem[]>) => {
            const snapshot: FilterGroupSnapshot = {
              groups: data,
              cursor: groupSequencer.getCursor(),
              schedule: [...groupSequencer['schedule']],
            };
            await persistence.save(snapshot);
          },
          load: async () => {
            const snap = await persistence.load();
            if (!snap) return null;
            return snap.groups;
          },
        }
      : undefined;

    // Create group data source
    const groupDataSource = new GroupDataSource({
      groupIds,
      persistence: persistenceWrapper,
    });

    // Create group sequencer with cursor tracking
    const groupSequencer = new GroupSequencer<QueueItem>({
      getGroups: () => groupDataSource.getAllGroups(),
      schedule,
      advanceCursor: true,
      onCursorAdvance: async (newCursor) => {
        // Save when cursor advances
        if (persistence) {
          const snapshot: FilterGroupSnapshot = {
            groups: groupDataSource.getAllGroups(),
            cursor: newCursor,
            schedule: [...schedule],
          };
          await persistence.save(snapshot);
        }
      },
    });

    // Create null scheduler (no algorithm)
    const scheduler = new NullScheduler<QueueItem>();

    // ⚠️ MUST call super() FIRST before using 'this'
    super({
      scheduler,
      sequencer: groupSequencer,
      dataSource: groupDataSource,
      uiConfig: {
        statsType: 'queue-size',
        showRatingButtons: true,
        allowSkip: true,
      },
      statsLabel: '筛选复习',
    });

    // Now safe to assign to 'this'
    this.configs = configs;
    this.groupDataSource = groupDataSource;
    this.groupSequencer = groupSequencer;
  }

  /**
   * Initialize queue from storage
   */
  async init(): Promise<void> {
    const stored = await this.groupDataSource['load']();

    if (stored) {
      // Groups are loaded by GroupDataSource
      const snap = await (this.groupDataSource['persistence'] as any)?.load();

      if (snap) {
        this.groupSequencer.setCursor(snap.cursor || 0);
      }
    }
  }

  /**
   * Override rotateToEnd to work with GroupDataSource
   * 
   * GroupDataSource.getAll() returns a new array, so we need to use
   * the add() method to properly persist the rotated item.
   */
  protected async rotateToEnd(item: QueueItem): Promise<void> {
    console.log('[SiyuanMemo][FilterGroupQueue] Rotating item to end of queue');
    
    // Remove the item from the queue
    const removed = await this.groupDataSource.remove([item]);
    console.log(`[SiyuanMemo][FilterGroupQueue] Removed ${removed} item(s) from queue`);

    // Add the item back (it will go to the end of its group)
    const added = await this.groupDataSource.add([item]);
    console.log(`[SiyuanMemo][FilterGroupQueue] Added ${added} item(s) back to queue`);
  }

  /**
   * Override onFeedback to use base class rating logic and advance cursor
   * 
   * This implementation:
   * 1. Delegates to BaseCompositeQueue for rating-based logic (rating < 3 rotates, >= 3 removes)
   * 2. Advances cursor after feedback (FilterGroupQueue-specific behavior)
   * 
   * Note: We don't call super.onFeedback() for custom actions to preserve original behavior
   */
  async onFeedback(currentItem: QueueItem | null, feedback: QueueFeedback): Promise<void> {
    if (!currentItem) return;

    // Custom actions don't remove cards
    if (feedback.action === 'custom') return;

    // Use base class rating logic (rating < 3 rotates, >= 3 removes)
    await super.onFeedback(currentItem, feedback);

    // Advance cursor after feedback (FilterGroupQueue-specific behavior)
    this.groupSequencer.advanceCursorToNext();
  }

  /**
   * Override getStats to provide queue statistics
   */
  async getStats(): Promise<QueueStats> {
    return {
      size: this.groupDataSource.size(),
      label: '',
    };
  }

  /**
   * Get all items from all groups
   */
  getAllItems(): QueueItem[] {
    const allItems: QueueItem[] = [];
    for (const group of Object.values(this.groupDataSource.getAllGroups())) {
      allItems.push(...group);
    }
    return allItems;
  }

  /**
   * Add items to queue (delegates to GroupDataSource)
   */
  async addItems(items: QueueItem[]): Promise<number> {
    return await this.groupDataSource.add(items);
  }

  /**
   * Reorder items within groups
   */
  async reorder(orderedItems: QueueItem[]): Promise<boolean> {
    try {
      const currentGroups = this.groupDataSource.getAllGroups();
      const groupIds = Object.keys(currentGroups);
      const allCurrent: QueueItem[] = [];

      for (const gid of groupIds) {
        allCurrent.push(...(currentGroups[gid] || []));
      }

      if (orderedItems.length !== allCurrent.length) return false;

      const byId = new Map(allCurrent.map((x) => [String((x as any)?.cardID || ''), x] as const));
      const idToGroup = new Map<string, string>();

      for (const gid of groupIds) {
        for (const it of currentGroups[gid] || []) {
          const id = String((it as any)?.cardID || '');
          if (!id) continue;
          idToGroup.set(id, gid);
        }
      }

      const nextGroups: Record<string, QueueItem[]> = {};
      for (const gid of groupIds) nextGroups[gid] = [];

      const seen = new Set<string>();
      for (const it of orderedItems) {
        const id = String((it as any)?.cardID || '');
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);

        const existing = byId.get(id);
        if (!existing) return false;

        const gid = idToGroup.get(id) || groupIds[0] || 'default';
        if (!nextGroups[gid]) nextGroups[gid] = [];
        nextGroups[gid].push(existing);
      }

      for (const gid of groupIds) {
        if ((nextGroups[gid] || []).length !== (currentGroups[gid] || []).length) {
          return false;
        }
      }

      // Update groups in data source
      Object.assign(currentGroups, nextGroups);

      return true;
    } catch (err) {
      console.error('[SiyuanMemo][FilterGroupQueue] reorder failed:', err);
      return false;
    }
  }

  /**
   * Build schedule from configs
   */
  private static buildSchedule(configs: FilterGroupConfig[]): string[] {
    const result: string[] = [];

    for (const cfg of configs) {
      const w = Math.max(1, Math.floor(cfg.weight || 1));
      for (let i = 0; i < w; i++) {
        result.push(cfg.id);
      }
    }

    return result.length ? result : ['default'];
  }
}
