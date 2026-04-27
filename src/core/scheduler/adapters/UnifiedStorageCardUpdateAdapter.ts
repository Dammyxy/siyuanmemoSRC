import type { FSRSCard } from '@/types/card';
import type { ReviewLogV2 } from '@/types/review';
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
  constructor(
    private readonly storage: UnifiedStorageManager,
    private readonly reviewLogWriter?: { addReviewLogV2(log: ReviewLogV2): Promise<void> },
  ) {}

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

    await this.storage.runWriteTransaction('scheduler.batchUpdateCardsWithoutEvents', async () => {
      for (const [cardId, card] of dedupedCards.entries()) {
        const result = await this.storage.updateCard(card, { preferIncomingScheduling: true });
        if (isErr(result)) {
          throw new Error(
            `Failed to persist card "${cardId}" in scheduler adapter: ${result.error.message}`
          );
        }
        const persistedCard = this.resolvePersistedCard(card);
        logger.debug('Scheduler update persisted', {
          cardId,
          incoming: this.toSchedulingLog(card),
          persisted: persistedCard ? this.toSchedulingLog(persistedCard) : null,
        });
      }
    });
  }

  async addReviewLogV2(log: ReviewLogV2): Promise<void> {
    if (!this.reviewLogWriter) {
      return;
    }

    await this.reviewLogWriter.addReviewLogV2(log);
  }

  private resolvePersistedCard(card: FSRSCard): FSRSCard | null {
    const byId = this.storage.getCard(card.id);
    if (byId) {
      return byId;
    }

    const blockId = String(card.blockId || '').trim();
    if (blockId) {
      return this.storage.getCardsByBlockId(blockId)[0] ?? null;
    }

    const xiuyuanId = String(card.xiuyuanID || '').trim();
    if (xiuyuanId) {
      return this.storage.getCardsByXiuyuanId(xiuyuanId)[0] ?? null;
    }

    return null;
  }

  private toSchedulingLog(card: FSRSCard): Record<string, unknown> {
    return {
      id: card.id,
      blockId: card.blockId,
      xiuyuanID: card.xiuyuanID,
      due: card.due,
      state: card.state,
      reps: card.reps,
      lapses: card.lapses,
      scheduledDays: card.scheduledDays,
      learning_step: card.learning_step,
      stability: card.stability,
      difficulty: card.difficulty,
      lastReview: card.lastReview,
      elapsedDays: card.elapsedDays,
    };
  }
}
