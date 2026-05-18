import type { QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { FSRSCard } from '@/types/card';
import {
  ReviewHistoryStack,
  type ReviewHistoryEntry,
} from './ReviewHistoryStack';
import {
  ReviewTransactionSafetyEnvelope,
  type ReviewTransaction,
  type ReviewTransactionSafetyEnvelopeDependencies,
} from './ReviewTransactionSafetyEnvelope';

export interface ReviewGoBackResult {
  previous: FSRSCard;
  forwardItem: FSRSCard | null;
}

export class ReviewTransactionRuntime {
  private readonly history: ReviewHistoryStack;
  private readonly safetyEnvelope: ReviewTransactionSafetyEnvelope;

  constructor(
    dependencies: ReviewTransactionSafetyEnvelopeDependencies,
    options: { maxHistorySize?: number } = {},
  ) {
    this.history = new ReviewHistoryStack(options.maxHistorySize ?? 100);
    this.safetyEnvelope = new ReviewTransactionSafetyEnvelope(dependencies);
  }

  canGoBack(): boolean {
    return this.history.canGoBack();
  }

  async capture(
    currentItem: FSRSCard,
    feedback: QueueFeedback,
    options: { includeCardSnapshot?: boolean } = {},
  ): Promise<ReviewTransaction> {
    return this.safetyEnvelope.capture(currentItem, feedback, options);
  }

  record(item: FSRSCard, transaction: ReviewTransaction | null): void {
    this.history.push(item, transaction);
  }

  discardFailedEntry(item: FSRSCard, transaction: ReviewTransaction): boolean {
    return this.history.discardFailedEntry(item, transaction);
  }

  async goBack(activeItem: FSRSCard | null): Promise<ReviewGoBackResult | null> {
    const historyEntry = this.history.pop();
    if (!historyEntry) {
      return null;
    }

    await this.rollbackHistoryEntry(historyEntry);

    return {
      previous: historyEntry.item,
      forwardItem: activeItem,
    };
  }

  async rollback(transaction: ReviewTransaction): Promise<void> {
    await this.safetyEnvelope.rollback(transaction);
  }

  async compensateFailedFeedback(
    activeItem: FSRSCard,
    transaction: ReviewTransaction | null,
  ): Promise<FSRSCard> {
    return this.safetyEnvelope.compensateFailedFeedback(activeItem, transaction);
  }

  clear(): void {
    this.history.clear();
  }

  private async rollbackHistoryEntry(historyEntry: ReviewHistoryEntry): Promise<void> {
    if (historyEntry.transaction) {
      await this.rollback(historyEntry.transaction);
    }
  }
}
