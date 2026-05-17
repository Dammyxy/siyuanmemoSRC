import type { FSRSCard } from '@/types/card';

export interface ReviewCurrentItemRestoreResult {
  currentItem: FSRSCard | null;
}

export class ReviewCurrentItemCommand {
  private item: FSRSCard | null = null;

  get current(): FSRSCard | null {
    return this.item;
  }

  resolveActive(provided: FSRSCard | null | undefined): FSRSCard | null {
    return provided || this.item;
  }

  select(card: FSRSCard): FSRSCard {
    this.item = card;
    return card;
  }

  restore(result: ReviewCurrentItemRestoreResult): FSRSCard | null {
    this.item = result.currentItem;
    return this.item;
  }

  clear(): null {
    this.item = null;
    return null;
  }
}
