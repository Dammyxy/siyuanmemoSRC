/**
 * Dynamic Draw Sequencer
 *
 * Implements dynamic draw algorithms for queue sequencing.
 * Unlike simple priority sorting, this uses weighted random selection.
 *
 * Useful for:
 * - Final Drill: Weighted random draw based on difficulty
 * - Leech Queue: Prioritize difficult cards
 * - Randomized Review: Shuffle with bias
 */

import type { ISequencer } from '../abstraction/types';

export type DrawStrategy = 'random' | 'random-weighted' | 'round-robin';

export type DynamicDrawSequencerConfig<TItem> = {
  /**
   * Function to get all items
   */
  getAll: () => Promise<TItem[]> | TItem[];

  /**
   * Function to get weight for an item (for weighted random)
   * Higher weight = higher probability of being selected
   */
  getWeight?: (item: TItem) => number;

  /**
   * Draw strategy
   * - random: Pure random selection
   * - random-weighted: Weighted random selection
   * - round-robin: Sequential iteration
   */
  strategy?: DrawStrategy;

  /**
   * Should items be removed after selection?
   * If false, items can be selected multiple times
   */
  removeAfterSelection?: boolean;
};

/**
 * Sequencer that uses dynamic draw algorithms
 */
export class DynamicDrawSequencer<TItem = any> implements ISequencer<TItem> {
  private readonly getAllFn: () => Promise<TItem[]> | TItem[];
  private readonly getWeight?: (item: TItem) => number;
  private readonly strategy: DrawStrategy;
  private readonly removeAfterSelection: boolean;

  private items: TItem[] = [];
  private loaded = false;

  constructor(config: DynamicDrawSequencerConfig<TItem>) {
    this.getAllFn = config.getAll;
    this.getWeight = config.getWeight;
    this.strategy = config.strategy || 'random';
    this.removeAfterSelection = config.removeAfterSelection !== false;
  }

  async next(): Promise<TItem | null> {
    // Load items if not loaded
    if (!this.loaded) {
      this.loaded = true;
      const fetched = await this.getAllFn();
      this.items = Array.isArray(fetched) ? [...fetched] : [];
    }

    // No items left
    if (this.items.length === 0) {
      return null;
    }

    // Select item based on strategy
    let selectedIndex: number;

    switch (this.strategy) {
      case 'random':
        selectedIndex = this.randomIndex();
        break;

      case 'random-weighted':
        selectedIndex = this.weightedRandomIndex();
        break;

      case 'round-robin':
        selectedIndex = 0; // Always first
        break;

      default:
        selectedIndex = 0;
    }

    // Get the selected item
    const item = this.items[selectedIndex];

    // Remove if configured to do so
    if (this.removeAfterSelection) {
      this.items.splice(selectedIndex, 1);
    }

    return item || null;
  }

  reorder?(orderedItems: TItem[]): void {
    this.items = orderedItems;
  }

  /**
   * Pure random selection
   */
  private randomIndex(): number {
    return Math.floor(Math.random() * this.items.length);
  }

  /**
   * Weighted random selection
   * Higher weight = higher probability
   */
  private weightedRandomIndex(): number {
    if (!this.getWeight) {
      return this.randomIndex();
    }

    // Calculate total weight
    let totalWeight = 0;
    const weights = this.items.map(item => {
      const weight = this.getWeight!(item) || 1;
      totalWeight += weight;
      return weight;
    });

    // Random point in total weight range
    const randomPoint = Math.random() * totalWeight;

    // Find the item at that point
    let currentWeight = 0;
    for (let i = 0; i < this.items.length; i++) {
      currentWeight += weights[i];
      if (randomPoint <= currentWeight) {
        return i;
      }
    }

    // Fallback (shouldn't reach here)
    return this.items.length - 1;
  }
}
