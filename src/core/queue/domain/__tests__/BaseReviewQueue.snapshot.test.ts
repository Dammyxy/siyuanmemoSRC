import { describe, expect, it, vi } from 'vitest';
import { BaseReviewQueue } from '../BaseReviewQueue';
import { QueueType, type QueueReviewResult } from '@/types/unified-data-source';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { buildQueueSnapshotRow } from '../queueCardProjection';

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

function createProjectionRolloutDiagnostic(queueType: QueueType, projectionBacked: boolean) {
  return [{
    queueType,
    projectionBacked,
    state: projectionBacked ? 'backend-projection' : 'existing-queue-strategy',
    readPath: projectionBacked ? 'backend-projection' : 'existing-queue-strategy',
    reason: projectionBacked ? 'rollout-enabled' : 'projection-rollout-pending',
    nextCoverageTask: projectionBacked ? null : 'explicit rollback',
  }];
}

class TestQueue extends BaseReviewQueue {
  public name = 'TestQueue';

  constructor(
    private sourceCards: FSRSCard[],
    managerOverrides: Record<string, unknown> = {},
    queueType: QueueType = QueueType.RetrievalPractice,
  ) {
    super({
      notifyObservers: vi.fn(),
      updateCard: vi.fn(),
      ...managerOverrides,
    } as never, queueType);
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

  it('uses projection-backed snapshots and hydration for rollout queues when the manager provides them', async () => {
    const cardA = buildCard('card-a', { riffCardId: 'row-a' });
    const cardB = buildCard('card-b', { riffCardId: 'row-b' });
    const projectionRows = [
      {
        id: 'row-b',
        fsrsCardId: 'card-b',
        blockId: 'block-card-b',
        deckId: 'deck-a',
        rootId: 'doc-a',
        content: 'content-card-b',
        fullContent: 'content-card-b',
        state: CardState.Review,
        due: cardB.due,
        stability: 4,
        difficulty: 5,
        retrievability: 0.9,
        reps: 1,
        lapses: 0,
        elapsedDays: 1,
        scheduledDays: 3,
        lastReview: cardB.lastReview,
        interval: 3,
        firstReview: cardB.createdAt,
        priority: 50,
        suspended: false,
        cardType: CardType.Item,
        queueIndex: 1,
        tags: [],
        blockType: 'paragraph',
      },
      {
        id: 'row-a',
        fsrsCardId: 'card-a',
        blockId: 'block-card-a',
        deckId: 'deck-a',
        rootId: 'doc-a',
        content: 'content-card-a',
        fullContent: 'content-card-a',
        state: CardState.Review,
        due: cardA.due,
        stability: 4,
        difficulty: 5,
        retrievability: 0.9,
        reps: 1,
        lapses: 0,
        elapsedDays: 1,
        scheduledDays: 3,
        lastReview: cardA.lastReview,
        interval: 3,
        firstReview: cardA.createdAt,
        priority: 50,
        suspended: false,
        cardType: CardType.Item,
        queueIndex: 2,
        tags: [],
        blockType: 'paragraph',
      },
    ];
    const readProjectionSnapshot = vi.fn(async () => ({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 5,
      rows: projectionRows,
      counters: {
        version: 5,
        remaining: 2,
        due: 2,
        total: 2,
        buckets: {
          all: 2,
          item: 2,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
        source: 'reconciled' as const,
      },
    }));
    const getProjectionCardsBySnapshotIds = vi.fn(async (_queueType: QueueType, ids: string[]) => {
      const cardById = new Map([
        ['row-a', cardA],
        ['card-a', cardA],
        ['row-b', cardB],
        ['card-b', cardB],
      ]);
      return ids.map((id) => cardById.get(id)).filter(Boolean);
    });
    const queue = new TestQueue([cardA, cardB], {
      readQueueProjectionSnapshot: readProjectionSnapshot,
      getQueueProjectionCardsBySnapshotIds: getProjectionCardsBySnapshotIds,
    });
    const getCardsSpy = vi.spyOn(queue, 'getCards');

    const rows = await queue.getSnapshotRows();
    const cards = await queue.getCardsBySnapshotIds(['row-a', 'row-b']);
    const counters = await queue.getCounterSnapshot();

    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-b', 'card-a']);
    expect(cards.map((card) => card.id)).toEqual(['card-a', 'card-b']);
    expect(counters).toMatchObject({ version: 5, remaining: 2, due: 2, total: 2 });
    expect(readProjectionSnapshot).toHaveBeenCalledWith(QueueType.RetrievalPractice, {
      forceRefresh: false,
    });
    expect(getProjectionCardsBySnapshotIds).toHaveBeenCalledWith(
      QueueType.RetrievalPractice,
      ['row-a', 'row-b'],
      { forceRefresh: false },
    );
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it.each([
    QueueType.FilterGroup,
    QueueType.FinalDrill,
    QueueType.Leech,
    QueueType.NeuralRoam,
  ])('keeps %s on existing strategy snapshot reads only for explicit rollback diagnostics', async (queueType) => {
    const cardA = buildCard('card-a', { riffCardId: 'riff-a' });
    const cardB = buildCard('card-b');
    const readProjectionSnapshot = vi.fn(async () => null);
    const getProjectionCardsBySnapshotIds = vi.fn(async () => []);
    const queue = new TestQueue([cardA, cardB], {
      readQueueProjectionSnapshot: readProjectionSnapshot,
      getQueueProjectionCardsBySnapshotIds: getProjectionCardsBySnapshotIds,
      getQueueProjectionRolloutDiagnostics: vi.fn(() => createProjectionRolloutDiagnostic(queueType, false)),
    }, queueType);
    const getCardsSpy = vi.spyOn(queue, 'getCards');

    const rows = await queue.getSnapshotRows();
    const cards = await queue.getCardsBySnapshotIds(['card-b', 'riff-a']);

    expect(rows.map((row) => row.id)).toEqual(['riff-a', 'card-b']);
    expect(cards.map((card) => card.id)).toEqual(['card-b', 'card-a']);
    expect(readProjectionSnapshot).toHaveBeenCalledWith(queueType, { forceRefresh: false });
    expect(getProjectionCardsBySnapshotIds).not.toHaveBeenCalled();
    expect(getCardsSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    QueueType.RetrievalPractice,
    QueueType.IncrementalLearning,
    QueueType.FilterGroup,
    QueueType.FinalDrill,
    QueueType.Leech,
    QueueType.NeuralRoam,
  ])('fails closed for %s when backend projection snapshot is unavailable', async (queueType) => {
    const cardA = buildCard('card-a', { riffCardId: 'riff-a' });
    const readProjectionSnapshot = vi.fn(async () => null);
    const queue = new TestQueue([cardA], {
      readQueueProjectionSnapshot: readProjectionSnapshot,
      getQueueProjectionRolloutDiagnostics: vi.fn(() => createProjectionRolloutDiagnostic(queueType, true)),
    }, queueType);
    const getCardsSpy = vi.spyOn(queue, 'getCards');

    await expect(queue.getSnapshotRows()).rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');
    await expect(queue.getCounterSnapshot()).rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');

    expect(readProjectionSnapshot).toHaveBeenCalledWith(queueType, { forceRefresh: false });
    expect(getCardsSpy).not.toHaveBeenCalled();
  });

  it('fails closed when projection row hydration is incomplete', async () => {
    const cardA = buildCard('card-a', { riffCardId: 'row-a' });
    const row = buildQueueSnapshotRow(cardA, { queueIndex: 1 });
    const readProjectionSnapshot = vi.fn(async () => ({
      queueType: QueueType.FilterGroup,
      policyHash: 'policy-a',
      generation: 7,
      rows: [row],
      counters: {
        version: 7,
        remaining: 1,
        due: 1,
        total: 1,
        buckets: {
          all: 1,
          item: 1,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
        source: 'reconciled' as const,
      },
    }));
    const getProjectionCardsBySnapshotIds = vi.fn(async () => []);
    const queue = new TestQueue([cardA], {
      readQueueProjectionSnapshot: readProjectionSnapshot,
      getQueueProjectionCardsBySnapshotIds: getProjectionCardsBySnapshotIds,
      getQueueProjectionRolloutDiagnostics: vi.fn(() => createProjectionRolloutDiagnostic(QueueType.FilterGroup, true)),
    }, QueueType.FilterGroup);
    const getCardsSpy = vi.spyOn(queue, 'getCards');

    await expect(queue.getCardsBySnapshotIds([row.id])).rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');

    expect(getProjectionCardsBySnapshotIds).toHaveBeenCalledWith(
      QueueType.FilterGroup,
      [row.id],
      { forceRefresh: false },
    );
    expect(getCardsSpy).not.toHaveBeenCalled();
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
