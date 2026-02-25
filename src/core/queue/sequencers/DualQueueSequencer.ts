/**
 * Dual Queue Sequencer
 *
 * Merges two queues and selects items based on ratio.
 * Useful for IncrementalLearningQueue (Topic + Item queues).
 *
 * Example:
 * - Topic queue: 30% of items
 * - Item queue: 70% of items
 */

import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DualQueueSequencer');

export type DualQueueSequencerConfig<TItem extends QueueItem> = {
  /**
   * First queue (e.g., Topic queue)
   */
  queue1: ISequencer<TItem>;

  /**
   * Second queue (e.g., Item queue)
   */
  queue2: ISequencer<TItem>;

  /**
   * Ratio for queue1 (0.0 to 1.0)
   * Default: 0.5 (50/50 split)
   */
  queue1Ratio?: number;

  /**
   * Should we alternate between queues?
   * If true, alternates strictly (queue1, queue2, queue1, queue2, ...)
   * If false, uses ratio-based random selection
   */
  alternate?: boolean;
};

/**
 * Sequencer that merges two queues with configurable ratio
 */
export class DualQueueSequencer<TItem extends QueueItem> implements ISequencer<TItem> {
  private readonly queue1: ISequencer<TItem>;
  private readonly queue2: ISequencer<TItem>;
  private readonly queue1Ratio: number;
  private readonly alternate: boolean;

  private nextFromQueue1 = true; // Track which queue to use next

  constructor(config: DualQueueSequencerConfig<TItem>) {
    this.queue1 = config.queue1;
    this.queue2 = config.queue2;
    this.queue1Ratio = config.queue1Ratio ?? 0.5;
    this.alternate = config.alternate ?? false;
  }

  async next(): Promise<TItem | null> {
    // Decide which queue to pull from
    const useQueue1 = this.shouldUseQueue1();

    // Get item from selected queue
    let item: TItem | null;

    if (useQueue1) {
      item = await this.queue1.next();

      // Fallback to queue2 if queue1 is empty
      if (!item) {
        item = await this.queue2.next();
      }
    } else {
      item = await this.queue2.next();

      // Fallback to queue1 if queue2 is empty
      if (!item) {
        item = await this.queue1.next();
      }
    }

    // Update tracking
    if (this.alternate) {
      this.nextFromQueue1 = !this.nextFromQueue1;
    }

    return item;
  }

  reorder?(orderedItems: TItem[]): void {
    // Cannot reorder dual queue (no concept of order)
    logger.warn('Reorder not supported');
  }

  /**
   * Determine whether to use queue1 for next selection
   */
  private shouldUseQueue1(): boolean {
    if (this.alternate) {
      return this.nextFromQueue1;
    }

    // Ratio-based selection
    return Math.random() < this.queue1Ratio;
  }
}
