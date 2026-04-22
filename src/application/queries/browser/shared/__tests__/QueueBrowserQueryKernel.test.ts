import { describe, expect, it, vi } from 'vitest';
import { QueueBrowserQueryKernel } from '../QueueBrowserQueryKernel';
import type { BrowserQueueId } from '@/application/interfaces/IBrowserApplicationService';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function buildSnapshotRow(id: string, overrides: Partial<QueueSnapshotRow> = {}): QueueSnapshotRow {
  return {
    id,
    fsrsCardId: overrides.fsrsCardId ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
    deckId: overrides.deckId ?? 'deck-a',
    rootId: overrides.rootId ?? 'doc-a',
    content: overrides.content ?? `content-${id}`,
    fullContent: overrides.fullContent ?? `full-content-${id}`,
    state: overrides.state ?? CardState.Review,
    due: overrides.due ?? Date.now(),
    stability: overrides.stability ?? 3,
    difficulty: overrides.difficulty ?? 4,
    retrievability: overrides.retrievability ?? 0.7,
    reps: overrides.reps ?? 2,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 2,
    lastReview: overrides.lastReview ?? Date.now() - 60_000,
    interval: overrides.interval ?? 2,
    firstReview: overrides.firstReview ?? Date.now() - 120_000,
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    cardType: overrides.cardType ?? CardType.Item,
    aFactor: overrides.aFactor,
    queueIndex: overrides.queueIndex,
    tags: overrides.tags ?? [],
    blockType: overrides.blockType ?? 'paragraph',
  };
}

function buildCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: '',
    blockId: overrides.blockId ?? `block-${id}`,
    due: overrides.due ?? now,
    stability: overrides.stability ?? 3,
    difficulty: overrides.difficulty ?? 4,
    reps: overrides.reps ?? 2,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now - 60_000,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 2,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now - 120_000,
    updatedAt: overrides.updatedAt ?? now,
    riffCardId: overrides.riffCardId,
    meta: overrides.meta ?? {
      content: `full-content-${id}`,
      rootId: 'doc-a',
      deckId: 'deck-a',
      note: `note-${id}`,
    },
  };
}

describe('QueueBrowserQueryKernel', () => {
  it.each([
    'retrieval',
    'final-drill',
    'filter-group',
    'incremental-learning',
  ] as const)('builds snapshot and hydrates rows for %s', async (queueId: BrowserQueueId) => {
    const snapshotRows = [
      buildSnapshotRow('row-a', {
        fsrsCardId: 'card-a',
        priority: 10,
        queueIndex: 2,
        content: 'alpha',
        fullContent: queueId === 'incremental-learning' ? 'needle alpha' : 'alpha',
      }),
      buildSnapshotRow('row-b', {
        fsrsCardId: 'card-b',
        priority: 90,
        queueIndex: 1,
        content: 'beta',
        fullContent: queueId === 'incremental-learning' ? 'needle beta' : 'beta',
      }),
      buildSnapshotRow('row-c', {
        fsrsCardId: 'card-c',
        rootId: 'doc-other',
        priority: 40,
        cardType: CardType.Descriptor,
        content: 'gamma',
        fullContent: 'gamma',
      }),
    ];
    const cards = [
      buildCard('card-a', { riffCardId: 'row-a', meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' } }),
      buildCard('card-b', { riffCardId: 'row-b', meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' } }),
      buildCard('card-c', { riffCardId: 'row-c', meta: { content: 'gamma', rootId: 'doc-other', deckId: 'deck-a' }, type: CardType.Descriptor }),
    ];
    const queue = {
      getSnapshotRows: vi.fn(async () => snapshotRows),
      getCardsBySnapshotIds: vi.fn(async (ids: string[]) => {
        const cardById = new Map([
          ['card-a', cards[0]],
          ['card-b', cards[1]],
          ['card-c', cards[2]],
          ['row-a', cards[0]],
          ['row-b', cards[1]],
          ['row-c', cards[2]],
        ]);
        return ids.map((id) => cardById.get(id)).filter(Boolean);
      }),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;

    const kernel = new QueueBrowserQueryKernel(manager);
    const snapshot = await kernel.buildSnapshot({
      queueId,
      docId: 'doc-a',
      cardType: 'item-only',
      searchText: queueId === 'incremental-learning' ? 'needle' : undefined,
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    });

    expect(snapshot.total).toBe(2);
    expect(snapshot.rows.map((row) => row.id)).toEqual(['card-b', 'card-a']);

    const hydrated = await kernel.getQueueRowsByIds(queueId, ['card-a', 'card-b']);
    expect(hydrated.map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(['card-a', 'card-b']);
    expect(queue.getSnapshotRows).toHaveBeenCalled();
  });

  it('marks missing source blocks before queue filtering and hydration', async () => {
    const snapshotRows = [
      buildSnapshotRow('row-existing', {
        fsrsCardId: 'card-existing',
        blockId: 'block-existing',
        content: 'existing',
        fullContent: 'existing',
      }),
      buildSnapshotRow('row-missing', {
        fsrsCardId: 'card-missing',
        blockId: 'block-missing',
        content: '',
        fullContent: '',
      }),
    ];
    const cards = [
      buildCard('card-existing', {
        riffCardId: 'row-existing',
        blockId: 'block-existing',
        meta: { content: 'existing', rootId: 'doc-a', deckId: 'deck-a' },
      }),
      buildCard('card-missing', {
        riffCardId: 'row-missing',
        blockId: 'block-missing',
        meta: { content: '', rootId: 'doc-a', deckId: 'deck-a' },
      }),
    ];
    const queue = {
      getSnapshotRows: vi.fn(async () => snapshotRows),
      getCardsBySnapshotIds: vi.fn(async (ids: string[]) => {
        const cardById = new Map([
          ['card-existing', cards[0]],
          ['card-missing', cards[1]],
          ['row-existing', cards[0]],
          ['row-missing', cards[1]],
        ]);
        return ids.map((id) => cardById.get(id)).filter(Boolean);
      }),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;
    const siyuanApi = {
      sql: vi.fn(async () => [{ id: 'block-existing' }]),
    };

    const kernel = new QueueBrowserQueryKernel(manager, siyuanApi as never);

    const normalSnapshot = await kernel.buildSnapshot({
      queueId: 'retrieval',
      preset: 'all',
    });
    expect(normalSnapshot.rows.map((row) => row.id)).toEqual(['card-existing']);

    const lostSnapshot = await kernel.buildSnapshot({
      queueId: 'retrieval',
      docId: '__lost__',
      preset: 'all',
    });
    expect(lostSnapshot.rows.map((row) => row.id)).toEqual(['card-missing']);

    const hydrated = await kernel.getQueueRowsByIds('retrieval', ['card-missing']);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]?.meta?.blockType).toBe('missing');
  });
});
