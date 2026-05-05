import type { FSRSCard } from '@/types/card';
import type { ReviewLogV2 } from '@/types/review';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite';
import type { CardUpdatePort } from '@/core/scheduler/ports';
import {
  canonicalizeSchedulingState,
  type SchedulingWriteSource,
} from '@/core/scheduler/schedulingStateCleanliness';
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
    private readonly sqlCards?: SqlUnifiedStorageRepository | null,
  ) {}

  async batchUpdateCardsWithoutEvents(
    cards: FSRSCard[],
    options: { schedulingWriteSource?: SchedulingWriteSource } = {},
  ): Promise<void> {
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
    const cardsToPersist = Array.from(dedupedCards.values()).map((card) => (
      canonicalizeSchedulingState(card, {
        source: options.schedulingWriteSource ?? 'review-commit',
        mode: 'assert-internal',
      }).card
    ));
    const schedulingWriteSource = options.schedulingWriteSource ?? 'review-commit';

    await this.storage.runWriteTransaction('scheduler.batchUpdateCardsWithoutEvents', async (transaction) => {
      const result = await this.storage.batchUpdateCards(cardsToPersist, {
          preferIncomingScheduling: true,
          schedulingWriteSource,
          suppressAutosave: Boolean(this.sqlCards),
          transaction,
        });
      if (isErr(result)) {
        throw new Error(
          `Failed to persist scheduler card batch: ${result.error.message}`
        );
      }

      if (this.sqlCards) {
        this.sqlCards.upsertCards(cardsToPersist);
      }
    });

    if (this.sqlCards) {
      await this.sqlCards.persist();
    }

    logger.debug('Scheduler batch update persisted', {
      attempted: cardsToPersist.length,
      sample: cardsToPersist.slice(0, 3).map(card => this.toSchedulingLog(card)),
    });
  }

  async addReviewLogV2(log: ReviewLogV2): Promise<void> {
    if (!this.reviewLogWriter) {
      return;
    }

    await this.reviewLogWriter.addReviewLogV2(log);
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
