import type { FSRSCard } from '@/types/card';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { CardUpdatePort } from '@/core/scheduler/ports';
import { createLogger } from '@/utils/logger';
import { isErr } from '@/types/result';

const logger = createLogger('UnifiedStorageCardUpdateAdapter');

/**
 * Scheduler persistence adapter.
 *
 * Keeps scheduler/reschedule write path independent from CardApplicationService
 * legacy compatibility methods.
 */
export class UnifiedStorageCardUpdateAdapter implements CardUpdatePort {
  constructor(private readonly storage: UnifiedStorageManager) {}

  async batchUpdateCardsWithoutEvents(cards: FSRSCard[]): Promise<void> {
    if (!cards || cards.length === 0) {
      return;
    }

    // Last-write-wins de-dup to avoid redundant updates in the same batch.
    const dedupedCards = new Map<string, FSRSCard>();
    for (const card of cards) {
      if (!card?.id) {
        logger.warn('Skip card update because id is missing', { card });
        continue;
      }
      dedupedCards.set(card.id, card);
    }

    for (const [cardId, card] of dedupedCards.entries()) {
      const result = await this.storage.updateCard(card);
      if (isErr(result)) {
        throw new Error(
          `Failed to persist card "${cardId}" in scheduler adapter: ${result.error.message}`
        );
      }
    }
  }
}
