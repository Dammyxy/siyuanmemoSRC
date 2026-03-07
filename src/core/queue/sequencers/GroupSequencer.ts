/**
 * Group Sequencer
 *
 * Sequences through multiple groups based on a schedule.
 * Useful for FilterGroupQueue and other multi-group scenarios.
 *
 * Features:
 * - Weighted schedule (groups appear multiple times based on weight)
 * - Cursor tracking (advances after each item)
 * - Automatic fallback to non-empty groups
 */

import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('GroupSequencer');

export type GroupSequencerConfig<TItem extends QueueItem> = {
  /**
   * Function to get all groups
   */
  getGroups: () => Record<string, TItem[]>;

  /**
   * Schedule (array of group IDs in visitation order)
   * Example: ['group1', 'group1', 'group2'] means group1 has weight=2
   */
  schedule: string[];

  /**
   * Should advance cursor after each item?
   * Default: true
   */
  advanceCursor?: boolean;

  /**
   * Callback when cursor advances
   */
  onCursorAdvance?: (newCursor: number) => void;
};

/**
 * Sequencer that cycles through groups based on schedule
 *
 * Example:
 * - Schedule: ['group1', 'group1', 'group2']
 * - Visit order: group1 → group1 → group2 → group1 → ...
 */
export class GroupSequencer<TItem extends QueueItem> implements ISequencer<TItem> {
  private readonly getGroups: () => Record<string, TItem[]>;
  private readonly schedule: string[];
  private readonly advanceCursor: boolean;
  private readonly onCursorAdvance?: (newCursor: number) => void;

  private cursor = 0;

  constructor(config: GroupSequencerConfig<TItem>) {
    this.getGroups = config.getGroups;
    this.schedule = config.schedule;
    this.advanceCursor = config.advanceCursor !== false;
    this.onCursorAdvance = config.onCursorAdvance;
  }

  /**
   * Get next item from groups based on schedule
   */
  async next(): Promise<TItem | null> {
    const groups = this.getGroups();

    // Try each group in schedule order starting from cursor
    for (let i = 0; i < this.schedule.length; i++) {
      const idx = (this.cursor + i) % this.schedule.length;
      const groupId = this.schedule[idx];
      const group = groups[groupId];

      if (group && group.length > 0) {
        const item = group[0];

        // Advance cursor if configured
        if (this.advanceCursor) {
          this.advanceCursorBy(i);
        }

        return item;
      }
    }

    // No items found in any group
    return null;
  }

  /**
   * Reorder items within groups (not supported)
   */
  reorder?(_orderedItems: TItem[]): void {
    // GroupSequencer doesn't support reordering across groups
    logger.warn('Reorder not supported');
  }

  /**
   * Get current cursor position
   */
  getCursor(): number {
    return this.cursor;
  }

  /**
   * Set cursor position
   */
  setCursor(cursor: number): void {
    this.cursor = cursor % this.schedule.length;
  }

  /**
   * Advance cursor by specified amount
   */
  advanceCursorBy(amount: number = 1): void {
    const oldCursor = this.cursor;
    this.cursor = (this.cursor + amount) % this.schedule.length;

    if (oldCursor !== this.cursor && this.onCursorAdvance) {
      this.onCursorAdvance(this.cursor);
    }
  }

  /**
   * Advance cursor to next position
   */
  advanceCursorToNext(): void {
    this.advanceCursorBy(1);
  }
}
