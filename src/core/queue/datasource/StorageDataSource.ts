/**
 * Storage-based Data Source
 *
 * Retrieves queue items from local storage (StorageManager).
 */

import type { IDataSource, DataSourceOptions } from './IDataSource';
import type { QueueItem } from '../types';
import type { StorageManager } from '../../storage/StorageManager';
import type { FSRSCard } from '@/types/card';
import { CardType } from '@/types/card';
import { ok, err, type Result } from '@/types/result';

export type StorageDataSourceOptions = DataSourceOptions<QueueItem> & {
  storage?: StorageManager;
  deckId?: string;
  state?: number; // Filter by state (0=New, 1=Learning, 2=Review, 3=Relearning)
};

/**
 * Data source that reads from StorageManager
 */
export class StorageDataSource implements IDataSource<QueueItem> {
  private readonly storage?: StorageManager;
  private readonly deckId?: string;
  private readonly stateFilter?: number;
  private readonly filterFn?: (item: QueueItem) => boolean;
  private readonly limit?: number;

  constructor(options?: StorageDataSourceOptions) {
    this.storage = options?.storage;
    this.deckId = options?.deckId;
    this.stateFilter = options?.state;
    this.filterFn = options?.filter;
    this.limit = options?.limit;
  }

  async getAll(): Promise<QueueItem[]> {
    if (!this.storage) {
      console.warn('[StorageDataSource] No storage configured');
      return [];
    }

    try {
      // Get all cards from storage
      const allCards = await this.storage.getAllCards();
      if (!allCards || allCards.length === 0) {
        return [];
      }

      let items: QueueItem[] = allCards.map(card => ({
        cardID: card.id,  // ✅ 修复：card.id 而非 card.cardID
        blockID: card.blockId,  // ✅ 修复：card.blockId 而非 card.blockID
        deckID: '', // Storage cards don't have deckID
        priority: card.priority || 50,
        nextDues: {
          1: new Date(card.due).toISOString(),
          2: new Date(card.due).toISOString(),
          3: new Date(card.due).toISOString(),
          4: new Date(card.due).toISOString(),
        }, // ✅ 从 due 生成 nextDues
        state: card.state,
        lapses: card.lapses,
        reps: card.reps,
        lastReview: card.lastReview,
        meta: card.meta, // ✅ 恢复 meta 字段（包含 cardType）
        cardType: card.meta?.['custom-fsrs-type'] || card.meta?.cardType, // ✅ 恢复 cardType
        aFactor: card.aFactor, // ✅ 恢复 aFactor（Topic 卡片）
      }));

      // Apply deck filter
      if (this.deckId) {
        items = items.filter(item => item.deckID === this.deckId);
      }

      // Apply state filter
      if (this.stateFilter !== undefined) {
        items = items.filter(item => item.state === this.stateFilter);
      }

      // Apply custom filter
      if (this.filterFn) {
        items = items.filter(this.filterFn);
      }

      // Apply limit
      if (this.limit && items.length > this.limit) {
        items = items.slice(0, this.limit);
      }

      return items;
    } catch (error) {
      console.error('[StorageDataSource] Failed to load cards:', error);
      return [];
    }
  }

  async add(items: QueueItem[]): Promise<Result<number>> {
    if (!this.storage) {
      console.warn('[StorageDataSource] No storage configured');
      return ok(0);
    }

    console.log('[StorageDataSource] Adding items:', {
      count: items.length,
      items: items.map(i => ({
        blockID: i.blockID,
        cardType: i.cardType,
        metaType: i.meta?.['custom-fsrs-type'],
      })),
    });

    try {
      let addedCount = 0;
      for (const item of items) {
        // Try to get existing card
        let card = this.storage.getCardByBlockId(item.blockID);

        if (card) {
          console.log('[StorageDataSource] Updating existing card:', item.blockID);
          // Update existing card
          card.meta = {
            ...card.meta,
            ...item.meta,
            'custom-fsrs-type': item.cardType || item.meta?.['custom-fsrs-type'] || card.meta?.['custom-fsrs-type'],
            cardType: item.cardType || card.meta?.cardType,
          };
          card.priority = item.priority ?? card.priority;
          if (item.aFactor !== undefined) {
            card.aFactor = item.aFactor;
          }
        } else {
          console.log('[StorageDataSource] Creating new card:', item.blockID);
          // Create new card from QueueItem
          // This is a minimal card for queue purposes
          card = {
            id: item.cardID,
            blockId: item.blockID,
            due: item.nextDues?.[3] ? Date.parse(item.nextDues[3]) : Date.now(),
            stability: 0,
            difficulty: 0,
            reps: item.reps || 0,
            lapses: item.lapses || 0,
            state: item.state ?? 0,
            lastReview: item.lastReview ?? 0,
            elapsedDays: 0,
            scheduledDays: 0,
            priority: item.priority ?? 50,
            type: item.meta?.['custom-fsrs-type'] === 'topic' ? 2 : 0, // CardType.Topic = 2, CardType.Deck = 0
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            meta: {
              ...item.meta,
              'custom-fsrs-type': item.cardType || item.meta?.['custom-fsrs-type'],
              cardType: item.cardType,
            },
            aFactor: item.aFactor,
          };
        }

        this.storage.setCard(card);
        addedCount++;
      }

      console.log('[StorageDataSource] Successfully added:', addedCount, 'items');
      return ok(addedCount);
    } catch (error) {
      console.error('[StorageDataSource] Failed to add items:', error);
      return err(error as Error);
    }
  }

  async remove(items: QueueItem[]): Promise<Result<number>> {
    if (!this.storage) {
      console.warn('[StorageDataSource] No storage configured');
      return ok(0);
    }

    try {
      // Storage doesn't support deletion, but we can mark as reviewed
      // This is a no-op for storage-based queues
      return ok(items.length);
    } catch (error) {
      console.error('[StorageDataSource] Failed to remove items:', error);
      return err(error as Error);
    }
  }
}
