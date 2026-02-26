/**
 * Conditional Scheduler
 *
 * Executes different logic based on conditions.
 * Useful for queues that need special behavior based on rating or card state.
 *
 * Example: FinalDrillQueue removes cards when rating=4 (Easy).
 */

import type { IScheduler } from '../abstraction/types';

export type ConditionalSchedulerConfig<TCard, TGrade> = {
  /**
   * Base scheduler to use by default
   */
  base: IScheduler<TCard, TGrade>;

  /**
   * Condition check function
   * Returns true if special condition is met
   */
  condition: (card: TCard, grade: TGrade) => boolean;

  /**
   * Action to execute when condition is true
   * Can optionally remove card from queue (return null or original card)
   */
  onCondition: (card: TCard, grade: TGrade) => Promise<TCard | null>;

  /**
   * Should the card be removed from queue when condition is true?
   * If true, the scheduler returns null and the card should be removed.
   */
  removeOnCondition?: boolean;
};

/**
 * Scheduler that executes conditional logic
 *
 * Based on condition, either:
 * - Executes special action (e.g., remove card)
 * - Falls back to base scheduler
 */
export class ConditionalScheduler<TCard = unknown, TGrade = number> implements IScheduler<TCard, TGrade> {
  private readonly base: IScheduler<TCard, TGrade>;
  private readonly condition: (card: TCard, grade: TGrade) => boolean;
  private readonly onCondition: (card: TCard, grade: TGrade) => Promise<TCard | null>;
  private readonly removeOnCondition: boolean;

  constructor(config: ConditionalSchedulerConfig<TCard, TGrade>) {
    this.base = config.base;
    this.condition = config.condition;
    this.onCondition = config.onCondition;
    this.removeOnCondition = config.removeOnCondition ?? false;
  }

  async schedule(card: TCard, grade: TGrade): Promise<TCard> {
    // Check if condition is met
    if (this.condition(card, grade)) {
      const result = await this.onCondition(card, grade);

      // If removeOnCondition is true and result is null, card should be removed
      if (this.removeOnCondition && !result) {
        // Return card unchanged (will be removed by queue)
        return card;
      }

      // Return result if not null
      return result || card;
    }

    // Condition not met, use base scheduler
    return await this.base.schedule(card, grade);
  }
}
