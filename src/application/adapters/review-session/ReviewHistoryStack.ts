import type { FSRSCard } from '@/types/card';
import type { ReviewTransaction } from './ReviewTransactionSafetyEnvelope';

export interface ReviewHistoryEntry {
  item: FSRSCard;
  transaction: ReviewTransaction | null;
}

export class ReviewHistoryStack {
  private readonly entries: ReviewHistoryEntry[] = [];

  constructor(private readonly maxSize = 100) {}

  canGoBack(): boolean {
    return this.entries.length > 0;
  }

  push(item: FSRSCard, transaction: ReviewTransaction | null): void {
    this.entries.push({
      item: cloneCard(item),
      transaction,
    });
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  pop(): ReviewHistoryEntry | null {
    return this.entries.pop() ?? null;
  }

  discardFailedEntry(item: FSRSCard, transaction: ReviewTransaction): boolean {
    const last = this.entries[this.entries.length - 1];
    if (!last || last.transaction !== transaction || last.item.id !== item.id) {
      return false;
    }
    this.entries.pop();
    return true;
  }

  clear(): void {
    this.entries.length = 0;
  }
}

function cloneCard(card: FSRSCard): FSRSCard {
  const cloned = JSON.parse(JSON.stringify(card)) as FSRSCard & { nextDues?: unknown };
  delete cloned.nextDues;
  return cloned;
}
