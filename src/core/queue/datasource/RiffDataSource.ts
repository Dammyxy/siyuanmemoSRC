/**
 * Riff API Data Source
 *
 * Retrieves queue items from SiYuan's built-in Riff flashcard system.
 */

import type { IDataSource, DataSourceOptions } from './IDataSource';
import type { QueueItem } from '../types';
import { getRiffDueCards } from '../../siyuan/riff';

export type RiffDataSourceOptions = DataSourceOptions<QueueItem> & {
  deckId: string;
  notebook?: string;
  rootID?: string;
};

/**
 * Data source that reads from Riff API
 */
export class RiffDataSource implements IDataSource<QueueItem> {
  private readonly deckId: string;
  private readonly notebook?: string;
  private readonly rootID?: string;
  private readonly filterFn?: (item: QueueItem) => boolean;
  private readonly limit?: number;
  private cache: QueueItem[] = [];

  constructor(options: RiffDataSourceOptions) {
    this.deckId = options.deckId;
    this.notebook = options.notebook;
    this.rootID = options.rootID;
    this.filterFn = options.filter;
    this.limit = options.limit;
  }

  async getAll(): Promise<QueueItem[]> {
    try {
      const data = await getRiffDueCards(this.deckId, this.notebook, this.rootID);

      if (!data || !data.cards || data.cards.length === 0) {
        return [];
      }

      let items: QueueItem[] = data.cards.map(card => ({
        cardID: card.cardID,
        blockID: card.blockID,
        deckID: card.deckID,
        priority: 50, // Default priority for Riff cards
        nextDues: card.nextDues as any,
        state: card.state,
        lapses: card.lapses,
        reps: card.reps,
        lastReview: card.lastReview ? new Date(card.lastReview).getTime() : undefined,
      }));

      // Apply custom filter
      if (this.filterFn) {
        items = items.filter(this.filterFn);
      }

      // Apply limit
      if (this.limit && items.length > this.limit) {
        items = items.slice(0, this.limit);
      }

      this.cache = items;
      return items;
    } catch (error) {
      console.error('[RiffDataSource] Failed to load cards:', error);
      return [];
    }
  }

  async add(items: QueueItem[]): Promise<number> {
    // Riff API doesn't support adding cards through queue interface
    // Cards should be added via addRiffCards API
    console.warn('[RiffDataSource] Adding cards not supported, use addRiffCards API');
    return 0;
  }

  async remove(items: QueueItem[]): Promise<number> {
    // Riff API doesn't support removing cards from queue
    // Cards are removed after review/skip
    console.warn('[RiffDataSource] Removing cards not supported via queue interface');
    return 0;
  }
}
