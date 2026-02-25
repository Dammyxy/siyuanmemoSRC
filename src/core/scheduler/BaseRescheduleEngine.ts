import type { FSRSCard } from '@/types/card';
import type { RescheduleLog } from '@/types/scheduler';
import type { CardUpdatePort, RescheduleStoragePort } from './ports';
import { BatchProcessor, type BatchResult } from './BatchProcessor';

type ProgressCallback = (processed: number, total: number, percentage: number) => void;

/**
 * Shared persistence + audit-log workflow for reschedule engines.
 * Keeps algorithm logic in concrete engines while centralizing write concerns.
 */
export abstract class BaseRescheduleEngine {
  private readonly batchProcessor = new BatchProcessor();

  constructor(
    protected readonly storage: RescheduleStoragePort,
    protected readonly cardUpdater: CardUpdatePort
  ) {}

  protected async persistAndLog(
    cards: FSRSCard[],
    action: RescheduleLog['action'],
    source: string
  ): Promise<void> {
    if (cards.length === 0) {
      return;
    }

    await this.cardUpdater.batchUpdateCardsWithoutEvents(cards);
    await this.storage.addRescheduleLog?.(this.createLog(cards, action, source));
  }

  protected async persistInBatches(
    cards: FSRSCard[],
    action: RescheduleLog['action'],
    source: string,
    onProgress?: ProgressCallback
  ): Promise<BatchResult<FSRSCard>> {
    if (cards.length === 0) {
      return {
        successes: [],
        failures: [],
        total: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    return this.batchProcessor.processBatchWithRetry(
      cards,
      async (batch) => {
        await this.persistAndLog(batch, action, source);
        return batch;
      },
      {
        batchSize: 200,
        parallelBatches: 3,
        onProgress,
      },
      2
    );
  }

  private createLog(
    cards: FSRSCard[],
    action: RescheduleLog['action'],
    source: string
  ): RescheduleLog {
    const sampleCards = cards.slice(0, Math.min(3, cards.length));
    return {
      ts: Date.now(),
      action,
      source,
      targets: cards.map(card => card.id),
      result: {
        updated: cards.length,
        skipped: 0,
      },
      sample: sampleCards.map(card => {
        const history = card.rescheduleHistory ?? [];
        const lastEntry = history[history.length - 1];
        return {
          cardId: card.id,
          blockId: card.blockId,
          oldDue: lastEntry?.oldDue
            ? new Date(lastEntry.oldDue).toISOString()
            : undefined,
          newDue: new Date(card.due).toISOString(),
        };
      }),
    };
  }
}
