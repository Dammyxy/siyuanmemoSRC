import { describe, expect, it, vi } from 'vitest';
import { BaseReviewQueue } from '../BaseReviewQueue';
import { QueueType, type QueueReviewResult } from '@/types/unified-data-source';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function buildCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id,
    xiuyuanID: '',
    blockId: overrides.blockId ?? `block-${id}`,
    due: overrides.due ?? now,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 1,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 60_000,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 3,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? ['tag-a'],
    riffCardId: overrides.riffCardId,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now - 120_000,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {
      content: `content-${id}`,
      rootId: 'doc-a',
      deckId: 'deck-a',
      blockType: 'paragraph',
      note: `note-${id}`,
    },
  };
}

class TestQueue extends BaseReviewQueue {
  public name = 'TestQueue';

  constructor(private sourceCards: FSRSCard[]) {
    super({
      notifyObservers: vi.fn(),
      updateCard: vi.fn(),
    } as never, QueueType.RetrievalPractice);
  }

  async getCards(): Promise<FSRSCard[]> {
    return this.applyCustomOrder([...this.sourceCards]);
  }

  async addCard(): Promise<void> {
    return undefined;
  }

  async removeCard(): Promise<void> {
    return undefined;
  }

  async handleReview(): Promise<QueueReviewResult> {
    throw new Error('not implemented');
  }

  isDynamic(): boolean {
    return true;
  }

  override async clear(): Promise<void> {
    this.sourceCards = [];
    await super.clear();
  }
}

describe('BaseReviewQueue snapshot rows', () => {
  it('builds and caches snapshot rows with stable riff ids and queue indexes', async () => {
    const cardA = buildCard('card-a', { riffCardId: 'riff-a' });
    const cardB = buildCard('card-b');
    const queue = new TestQueue([cardA, cardB]);
    const getCardsSpy = vi.spyOn(queue, 'getCards');

    const first = await queue.getSnapshotRows();
    const second = await queue.getSnapshotRows();

    expect(first.map((row) => row.id)).toEqual(['riff-a', 'card-b']);
    expect(first.map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);
    expect(first.map((row) => row.queueIndex)).toEqual([1, 2]);
    expect(first[0]?.tags).toEqual(['tag-a']);
    expect(second.map((row) => row.id)).toEqual(['riff-a', 'card-b']);
    expect(getCardsSpy).toHaveBeenCalledTimes(1);
  });

  it('getCardsBySnapshotIds preserves requested order and resolves riff ids', async () => {
    const cardA = buildCard('card-a', { riffCardId: 'riff-a' });
    const cardB = buildCard('card-b');
    const queue = new TestQueue([cardA, cardB]);

    const resolved = await queue.getCardsBySnapshotIds(['card-b', 'riff-a']);

    expect(resolved.map((card) => card.id)).toEqual(['card-b', 'card-a']);
  });

  it('rebuilds snapshot rows after reorder, insertAt, clear, and force refresh', async () => {
    const cardA = buildCard('card-a');
    const cardB = buildCard('card-b');
    const queue = new TestQueue([cardA, cardB]);
    const getCardsSpy = vi.spyOn(queue, 'getCards');

    expect((await queue.getSnapshotRows()).map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);

    await queue.reorder([cardB, cardA]);
    expect((await queue.getSnapshotRows()).map((row) => row.fsrsCardId)).toEqual(['card-b', 'card-a']);

    await queue.insertAt('card-a', 1);
    expect((await queue.getSnapshotRows()).map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);

    queue.clearCustomOrder();
    expect((await queue.getSnapshotRows()).map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);

    await queue.clear();
    expect(await queue.getSnapshotRows()).toEqual([]);

    await queue.getSnapshotRows(true);
    expect(getCardsSpy).toHaveBeenCalledTimes(5);
  });
});
