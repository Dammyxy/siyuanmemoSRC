/**
 * Composite Scheduler
 *
 * Selects the appropriate scheduler based on item type.
 * Useful for queues that handle multiple card types with different algorithms.
 *
 * Example: IncrementalLearningQueue needs:
 * - Topic cards → A-Factor scheduler
 * - Item cards → FSRS scheduler
 */

import type { IScheduler } from '../abstraction/types';

export type SchedulerSelector<TCard> = (card: TCard) => string;

export type CompositeSchedulerConfig<TCard, TGrade> = {
  /**
   * Map of scheduler IDs to scheduler implementations
   */
  schedulers: Record<string, IScheduler<TCard, TGrade>>;

  /**
   * Function to determine which scheduler to use for a given card
   * Returns the scheduler ID
   */
  selector: SchedulerSelector<TCard>;

  /**
   * Default scheduler ID (used if selector returns unknown ID)
   */
  defaultScheduler?: string;
};

/**
 * Scheduler that delegates to different schedulers based on card type
 */
export class CompositeScheduler<TCard = unknown, TGrade = number> implements IScheduler<TCard, TGrade> {
  private readonly schedulers: Record<string, IScheduler<TCard, TGrade>>;
  private readonly selector: SchedulerSelector<TCard>;
  private readonly defaultScheduler?: string;

  constructor(config: CompositeSchedulerConfig<TCard, TGrade>) {
    this.schedulers = config.schedulers;
    this.selector = config.selector;
    this.defaultScheduler = config.defaultScheduler;
  }

  async schedule(card: TCard, grade: TGrade): Promise<TCard> {
    // Determine which scheduler to use
    const schedulerId = this.selector(card);

    // Get the scheduler
    let scheduler = this.schedulers[schedulerId];

    // Fallback to default if scheduler not found
    if (!scheduler && this.defaultScheduler) {
      scheduler = this.schedulers[this.defaultScheduler];
    }

    // Error if no scheduler found
    if (!scheduler) {
      throw new Error(`No scheduler found for ID '${schedulerId}' and no default configured`);
    }

    // Delegate to the selected scheduler
    return await scheduler.schedule(card, grade);
  }
}
