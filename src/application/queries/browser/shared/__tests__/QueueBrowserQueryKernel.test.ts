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
    meta: overrides.meta,
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
  it('uses projection snapshot identity for projection-backed Browser counts and page hydration', async () => {
    const projectionRows = [
      buildSnapshotRow('row-b', {
        fsrsCardId: 'card-b',
        blockId: 'block-b',
        priority: 90,
        queueIndex: 1,
        content: 'beta',
      }),
      buildSnapshotRow('row-a', {
        fsrsCardId: 'card-a',
        blockId: 'block-a',
        priority: 10,
        queueIndex: 2,
        content: 'alpha',
      }),
    ];
    const hydratedCards = [
      buildCard('card-a', {
        blockId: 'block-a',
        riffCardId: 'row-a',
        priority: 10,
        meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
      }),
      buildCard('card-b', {
        blockId: 'block-b',
        riffCardId: 'row-b',
        priority: 90,
        meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
      }),
    ];
    const queue = {
      getProjectionReadMode: vi.fn(() => 'backend-projection'),
      getSnapshotRows: vi.fn(async () => projectionRows),
      getCards: vi.fn(async () => [
        buildCard('stale-card', {
          blockId: 'stale-block',
          meta: { content: 'stale', rootId: 'doc-a', deckId: 'deck-a' },
        }),
      ]),
      getCardsBySnapshotIds: vi.fn(async (ids: string[]) => {
        const cardById = new Map([
          ['card-a', hydratedCards[0]],
          ['card-b', hydratedCards[1]],
          ['row-a', hydratedCards[0]],
          ['row-b', hydratedCards[1]],
        ]);
        return ids.map((id) => cardById.get(id)).filter(Boolean);
      }),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      readQueueProjectionSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: 'retrieval-practice:queue-snapshot',
        generation: 'generation-a',
        rows: projectionRows,
        counters: null,
      })),
      getQueueProjectionCardsBySnapshotIds: vi.fn(async (_queueType: string, ids: string[]) => {
        const cardById = new Map([
          ['card-a', hydratedCards[0]],
          ['card-b', hydratedCards[1]],
          ['row-a', hydratedCards[0]],
          ['row-b', hydratedCards[1]],
        ]);
        return ids.map((id) => cardById.get(id)).filter(Boolean);
      }),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: 'retrieval-practice',
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }]),
    } as never;

    const kernel = new QueueBrowserQueryKernel(manager);
    const snapshot = await kernel.buildSnapshot({
      queueId: 'retrieval',
      preset: 'all',
    });

    expect(snapshot.total).toBe(2);
    expect(snapshot.rows.map((row) => row.id)).toEqual(['card-b', 'card-a']);
    expect(snapshot.readOwner).toMatchObject({
      kind: 'queue-projection',
      queueId: 'retrieval',
      projectionBacked: true,
    });
    expect(manager.readQueueProjectionSnapshot).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCards).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();

    const hydrated = await kernel.getQueueRowsByIds('retrieval', ['card-a']);
    expect(hydrated.map((row) => row.fsrsCardId)).toEqual(['card-a']);
    expect(hydrated[0]?.queueIndex).toBe(2);
    expect(manager.getQueueProjectionCardsBySnapshotIds).toHaveBeenCalledWith('retrieval-practice', ['card-a'], { forceRefresh: false });
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
    expect(queue.getCards).not.toHaveBeenCalled();
  });

  it('keeps projection-backed queue rows visible regardless of CDF diagnostic metadata', async () => {
    const snapshotRows = [
      buildSnapshotRow('row-active', {
        fsrsCardId: 'card-active',
        blockId: 'block-active',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
      buildSnapshotRow('row-incomplete', {
        fsrsCardId: 'card-incomplete',
        blockId: 'block-incomplete',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-reverse',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-incomplete',
          liveRelationIssues: [],
        },
      }),
      buildSnapshotRow('row-orphaned', {
        fsrsCardId: 'card-orphaned',
        blockId: 'block-orphaned',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:definition-forward',
          liveRelationStatus: 'orphaned-by-live-relation',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
    ];
    const queue = {
      getProjectionReadMode: vi.fn(() => 'backend-projection'),
      getSnapshotRows: vi.fn(async () => snapshotRows),
      getCards: vi.fn(async () => []),
      getCardsBySnapshotIds: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      readQueueProjectionSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: 'retrieval-practice:queue-snapshot',
        generation: 'generation-a',
        rows: snapshotRows,
        counters: null,
      })),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: 'retrieval-practice',
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }]),
    } as never;
    const kernel = new QueueBrowserQueryKernel(manager);

    const normal = await kernel.buildSnapshot({ queueId: 'retrieval', preset: 'all' });
    const unknownDiagnosticPreset = await kernel.buildSnapshot({ queueId: 'retrieval', preset: 'cdf-content-incomplete' });

    expect(normal.rows.map((row) => row.id)).toEqual(['card-active', 'card-incomplete', 'card-orphaned']);
    expect(unknownDiagnosticPreset.rows.map((row) => row.id)).toEqual(['card-active', 'card-incomplete', 'card-orphaned']);
    expect(manager.readQueueProjectionSnapshot).toHaveBeenCalledTimes(2);
    expect(queue.getCards).not.toHaveBeenCalled();
  });

  it('fails closed when projection-backed row hydration cannot return every requested row', async () => {
    const queue = {
      getSnapshotRows: vi.fn(async () => [
        buildSnapshotRow('row-a', { fsrsCardId: 'card-a', queueIndex: 1 }),
        buildSnapshotRow('row-b', { fsrsCardId: 'card-b', queueIndex: 2 }),
      ]),
      getCards: vi.fn(async () => {
        throw new Error('stale local queue should not be used');
      }),
      getCardsBySnapshotIds: vi.fn(async () => [
        buildCard('card-a', {
          riffCardId: 'row-a',
          meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
        }),
      ]),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: 'retrieval-practice',
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }]),
    } as never;
    const kernel = new QueueBrowserQueryKernel(manager);

    await expect(kernel.getQueueRowsByIds('retrieval', ['card-a', 'card-b']))
      .rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');
    expect(queue.getCards).not.toHaveBeenCalled();
  });

  it('keeps explicit local queue policy even when rollout diagnostics exist', async () => {
    const localCards = [
      buildCard('local-card', {
        meta: { content: 'local', rootId: 'doc-a', deckId: 'deck-a' },
      }),
    ];
    const queue = {
      getProjectionReadMode: vi.fn(() => 'local-queue'),
      getSnapshotRows: vi.fn(async () => {
        throw new Error('projection rows should not be used for explicit local queue policy');
      }),
      getCards: vi.fn(async () => localCards),
      getCardsBySnapshotIds: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: 'final-drill',
        projectionBacked: true,
        state: 'backend-projection',
        readPath: 'backend-projection',
        reason: 'rollout-enabled',
        nextCoverageTask: null,
      }]),
    } as never;
    const kernel = new QueueBrowserQueryKernel(manager);

    const snapshot = await kernel.buildSnapshot({ queueId: 'final-drill' });

    expect(snapshot.total).toBe(1);
    expect(snapshot.readOwner).toMatchObject({
      kind: 'explicit-local-queue',
      projectionBacked: false,
    });
    expect(queue.getCards).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
  });

  it('keeps explicit local queue rows visible regardless of CDF diagnostic metadata', async () => {
    const localCards = [
      buildCard('card-active', {
        meta: {
          content: 'active',
          rootId: 'doc-a',
          deckId: 'deck-a',
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
      buildCard('card-duplicate', {
        meta: {
          content: 'duplicate',
          rootId: 'doc-a',
          deckId: 'deck-a',
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-forward',
          liveRelationStatus: 'duplicate-live-relation',
          liveContentStatus: 'content-incomplete',
          liveRelationIssues: [],
        },
      }),
    ];
    const queue = {
      getProjectionReadMode: vi.fn(() => 'local-queue'),
      getSnapshotRows: vi.fn(async () => []),
      getCards: vi.fn(async () => localCards),
      getCardsBySnapshotIds: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;
    const kernel = new QueueBrowserQueryKernel(manager);

    const normal = await kernel.buildSnapshot({ queueId: 'final-drill', preset: 'all' });
    const unknownDiagnosticPreset = await kernel.buildSnapshot({ queueId: 'final-drill', preset: 'cdf-duplicate' });

    expect(normal.rows.map((row) => row.id)).toEqual(['card-active', 'card-duplicate']);
    expect(unknownDiagnosticPreset.rows.map((row) => row.id)).toEqual(['card-active', 'card-duplicate']);
  });

  it('fails closed instead of using local queue rows when no explicit local policy exists', async () => {
    const queue = {
      getSnapshotRows: vi.fn(async () => []),
      getCards: vi.fn(async () => {
        throw new Error('hidden local queue fallback should not run');
      }),
      getCardsBySnapshotIds: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;
    const kernel = new QueueBrowserQueryKernel(manager);

    await expect(kernel.buildSnapshot({ queueId: 'retrieval' }))
      .rejects.toThrow('QUEUE_PROJECTION_UNAVAILABLE');
    expect(queue.getCards).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
  });

  it.each([
    'retrieval',
    'final-drill',
    'filter-group',
    'incremental-learning',
    'neural-roam',
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
      buildCard('card-a', { riffCardId: 'row-a', priority: 10, meta: { content: queueId === 'incremental-learning' ? 'needle alpha' : 'alpha', rootId: 'doc-a', deckId: 'deck-a' } }),
      buildCard('card-b', { riffCardId: 'row-b', priority: 90, meta: { content: queueId === 'incremental-learning' ? 'needle beta' : 'beta', rootId: 'doc-a', deckId: 'deck-a' } }),
      buildCard('card-c', { riffCardId: 'row-c', meta: { content: 'gamma', rootId: 'doc-other', deckId: 'deck-a' }, type: CardType.Descriptor }),
    ];
    const queue = {
      getProjectionReadMode: vi.fn(() => 'local-queue'),
      getSnapshotRows: vi.fn(async () => snapshotRows),
      getCards: vi.fn(async () => cards),
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
    expect(snapshotRows.map((row) => row.id)).toEqual(['row-a', 'row-b', 'row-c']);

    const hydrated = await kernel.getQueueRowsByIds(queueId, ['card-a', 'card-b']);
    expect(hydrated.map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);
    expect(queue.getCards).toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
  });

  it('does not pass Browser forceRefresh into Review projection snapshots', async () => {
    const queue = {
      getProjectionReadMode: vi.fn(() => 'local-queue'),
      getSnapshotRows: vi.fn(async () => [
        buildSnapshotRow('row-a', { fsrsCardId: 'card-a' }),
      ]),
      getCards: vi.fn(async () => [
        buildCard('card-a'),
      ]),
      getCardsBySnapshotIds: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;
    const kernel = new QueueBrowserQueryKernel(manager);

    await kernel.buildSnapshot({
      queueId: 'retrieval',
      forceRefresh: true,
    });

    expect(queue.getCards).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
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
      getProjectionReadMode: vi.fn(() => 'local-queue'),
      getSnapshotRows: vi.fn(async () => snapshotRows),
      getCards: vi.fn(async () => cards),
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

  it('uses SQL source-existence cache for queue missing-block filtering when available', async () => {
    const snapshotRows = [
      buildSnapshotRow('row-existing', {
        fsrsCardId: 'card-existing',
        blockId: 'block-existing',
      }),
      buildSnapshotRow('row-missing', {
        fsrsCardId: 'card-missing',
        blockId: 'block-missing',
      }),
    ];
    const queue = {
      getProjectionReadMode: vi.fn(() => 'local-queue'),
      getSnapshotRows: vi.fn(async () => snapshotRows),
      getCards: vi.fn(async () => [
        buildCard('card-existing', { blockId: 'block-existing' }),
        buildCard('card-missing', { blockId: 'block-missing' }),
      ]),
      getCardsBySnapshotIds: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;
    const siyuanApi = {
      sql: vi.fn(async () => {
        throw new Error('Siyuan SQL should not be used when SQL source cache is available');
      }),
    };
    const sourceExistencePort = {
      queryDeckPage: vi.fn(),
      queryDeckMatchedIds: vi.fn(),
      getDeckCardsByIds: vi.fn(),
      countCards: vi.fn(),
      getBrowserStats: vi.fn(),
      getSourceExistenceByBlockIds: vi.fn(() => new Map([
        ['block-existing', true],
        ['block-missing', false],
      ])),
      getSourceExistenceRefreshCandidates: vi.fn(() => []),
      updateSourceExistence: vi.fn(),
      getSourceExistenceSummary: vi.fn(() => ({ unknown: 0, stale: 0, missing: 1 })),
      queryCardIdsByRootIds: vi.fn(() => []),
      queryRootlessCardBlockIds: vi.fn(() => []),
      queryInconsistentCardTypeMarkerIds: vi.fn(() => []),
    };

    const kernel = new QueueBrowserQueryKernel(manager, siyuanApi as never, sourceExistencePort as never);

    const normalSnapshot = await kernel.buildSnapshot({
      queueId: 'retrieval',
      preset: 'all',
    });
    const lostSnapshot = await kernel.buildSnapshot({
      queueId: 'retrieval',
      docId: '__lost__',
      preset: 'all',
    });

    expect(normalSnapshot.rows.map((row) => row.id)).toEqual(['card-existing']);
    expect(lostSnapshot.rows.map((row) => row.id)).toEqual(['card-missing']);
    expect(siyuanApi.sql).not.toHaveBeenCalled();
  });
});
