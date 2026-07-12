import type { FSRSCard } from '@/types/card';

interface CleanupLogger {
  info(...args: unknown[]): void;
}

interface ResolveExistingCardsOptions {
  onCleanup?: () => Promise<void>;
  cleanupLogger?: CleanupLogger;
  cleanupMessage?: (removedCount: number) => string;
  cleanupMissing?: boolean;
}

export class ManualCardSetStrategy {
  private ids = new Set<string>();

  public replace(cardIds: Iterable<string>): void {
    this.ids = new Set(cardIds);
  }

  public toArray(): string[] {
    return Array.from(this.ids);
  }

  public values(): IterableIterator<string> {
    return this.ids.values();
  }

  public has(cardId: string): boolean {
    return this.ids.has(cardId);
  }

  public add(cardId: string): void {
    this.ids.add(cardId);
  }

  public delete(cardId: string): boolean {
    return this.ids.delete(cardId);
  }

  public size(): number {
    return this.ids.size;
  }

  public async resolveExistingCards(
    resolveCard: (cardId: string) => Promise<FSRSCard | null>,
    options: ResolveExistingCardsOptions = {}
  ): Promise<FSRSCard[]> {
    const cards: FSRSCard[] = [];
    const missingIds: string[] = [];

    for (const cardId of this.ids) {
      const card = await resolveCard(cardId);
      if (card) {
        cards.push(card);
      } else {
        missingIds.push(cardId);
      }
    }

    if (missingIds.length === 0 || options.cleanupMissing === false) {
      return cards;
    }

    for (const cardId of missingIds) {
      this.ids.delete(cardId);
    }

    if (options.onCleanup) {
      await options.onCleanup();
    }

    if (options.cleanupLogger) {
      const messageFactory = options.cleanupMessage
        ?? ((removedCount: number) => `Removed ${removedCount} non-existent cards from manual additions`);
      options.cleanupLogger.info(messageFactory(missingIds.length));
    }

    return cards;
  }
}
