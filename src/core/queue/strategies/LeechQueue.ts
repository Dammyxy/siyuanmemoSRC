/**
 * Leech Queue (V2 - Composite Architecture)
 *
 * @deprecated 此文件属于旧队列架构，将在未来版本中移除。
 * 请使用 src/queues/ 中的新架构。
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
 *
 * New implementation using BaseCompositeQueue pattern.
 * Filters cards with high lapse count (difficult cards).
 *
 * Features:
 * - Filters cards where lapses >= threshold (default: 8)
 * - Three leech actions: notify, suspend, tag
 * - Priority-based ordering
 * - Uses LeechScheduler for special handling
 */

import * as riff from '../../siyuan/riff';
import { pushMsg, setBlockAttrs } from '../../siyuan/api';
import { ATTR_PRIORITY } from '../../siyuan/block';
import { LeechScheduler } from '../schedulers/LeechScheduler';
import { RiffScheduler } from '../schedulers/RiffScheduler';
import { PrioritySequencer } from '../sequencers/PrioritySequencer';
import { RiffDataSource } from '../datasource/RiffDataSource';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority';

type LeechAction = 'notify' | 'suspend' | 'tag';

const ATTR_SUSPENDED = 'custom-fsrs-suspended';
const ATTR_LEECH_TAG = 'custom-fsrs-leech-tag';

/**
 * Leech Queue Configuration
 */
export interface LeechQueueConfig {
  /** Deck ID (optional, defaults to built-in deck) */
  deckID?: string;
  /** Lapse threshold (default: 8) */
  threshold?: number;
  /** Action when leech detected (default: 'notify') */
  action?: LeechAction;
  /** Tag name for 'tag' action (default: 'leech') */
  tagName?: string;
}

/**
 * Leech Queue (V2)
 *
 * New implementation using composite architecture.
 * Maintains full compatibility with V1 while using cleaner structure.
 */
/**
 * @deprecated Old architecture queue. Use src/queues/ instead when possible.
 */
export class LeechQueue extends BaseCompositeQueue<QueueItem> {
  private readonly config: Required<LeechQueueConfig>;
  private readonly deckID: string;

  constructor(config: LeechQueueConfig = {}) {
    // ℹ️ Prepare config before using it (can't use 'this' yet)
    const finalConfig: Required<LeechQueueConfig> = {
      deckID: config.deckID || riff.BUILTIN_DECK_ID,
      threshold: Math.max(1, Math.floor(Number(config.threshold ?? 8))),
      action: (config.action || 'notify') as LeechAction,
      tagName: String(config.tagName || 'leech'),
    };
    const deckID = finalConfig.deckID;

    // Create data source with lapse filter
    const dataSource = new RiffDataSource({
      deckId: deckID,
      filter: (item) => {
        // Only include cards with lapses >= threshold
        const lapses = Number(item.lapses) || 0;
        return lapses >= finalConfig.threshold;
      },
    });

    // Create base scheduler (Riff API)
    const baseScheduler = new RiffScheduler<QueueItem, 1 | 2 | 3 | 4>(async (card, grade) => {
      await riff.reviewRiffCard(card.deckID || deckID, card.cardID, grade);
      return card;
    });

    // Create leech scheduler with action handling
    const leechScheduler = new LeechScheduler<QueueItem, 1 | 2 | 3 | 4>({
      base: baseScheduler,
      isLeech: (c) => (Number((c as any).lapses) || 0) >= finalConfig.threshold,
      onLeech: async (c, grade) => {
        const blockID = String((c as any).blockID || '');

        // Execute leech action
        if (finalConfig.action === 'notify') {
          await pushMsg(`Leech: lapses>=${finalConfig.threshold}`);
        } else if (finalConfig.action === 'suspend') {
          if (blockID) {
            await setBlockAttrs(blockID, { [ATTR_SUSPENDED]: 'true' } as any);
          }
          await pushMsg('Leech: suspended');
        } else if (finalConfig.action === 'tag') {
          if (blockID) {
            await setBlockAttrs(blockID, { [ATTR_LEECH_TAG]: finalConfig.tagName } as any);
          }
          await pushMsg(`Leech: tagged ${finalConfig.tagName}`);
        }

        // Still schedule through base scheduler
        return await baseScheduler.schedule(c, grade);
      },
    });

    // Create priority sequencer
    const sequencer = new PrioritySequencer<QueueItem>({
      fetchAll: async () => {
        const items = await dataSource.getAll();
        // Sort by priority
        return items.sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
      },
      getDueMs: (item) => {
        const nextDue = item.nextDues?.[3];
        return nextDue ? Date.parse(nextDue) : Date.now();
      },
      getPriority: (item) => {
        return item.priority ?? DEFAULT_PRIORITY;
      },
    });

    // 🆕 Task 1.5: Register sequencer as observer of data source
    // This ensures the sequencer's cache is automatically invalidated when data changes
    dataSource.addObserver(sequencer);
    console.log('[LeechQueue] ✅ Registered sequencer as observer of data source');

    // ⚠️ MUST call super() FIRST before using 'this'
    super({
      scheduler: leechScheduler,
      sequencer,
      dataSource,
      uiConfig: {
        statsType: 'queue-size',
        showRatingButtons: true,
        allowSkip: true,
      },
      statsLabel: `L>=${finalConfig.threshold}`,
    });

    // Now safe to assign to 'this'
    this.config = finalConfig;
    this.deckID = deckID;
  }

  /**
   * Override getStats to provide leech-specific statistics
   */
  async getStats(): Promise<QueueStats> {
    const stats = await super.getStats();

    return {
      ...stats,
      label: `L>=${this.config.threshold}`,
    };
  }
}
