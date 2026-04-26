import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QueueSnapshotRow } from '@/types/queue-browser';

function buildCard(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: '',
    blockId: overrides.blockId ?? `block-${id}`,
    due: overrides.due ?? now,
    stability: overrides.stability ?? 3,
    difficulty: overrides.difficulty ?? 4,
    reps: overrides.reps ?? 1,
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
      content: `content-${id}`,
      rootId: 'doc-a',
      deckId: 'deck-a',
    },
  };
}

function buildSnapshotRow(id: string, overrides: Partial<QueueSnapshotRow> = {}): QueueSnapshotRow {
  return {
    id,
    fsrsCardId: overrides.fsrsCardId ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
    deckId: overrides.deckId ?? 'deck-a',
    rootId: overrides.rootId ?? 'doc-a',
    content: overrides.content ?? `content-${id}`,
    fullContent: overrides.fullContent ?? `content-${id}`,
    state: overrides.state ?? CardState.Review,
    due: overrides.due ?? Date.now(),
    stability: overrides.stability ?? 3,
    difficulty: overrides.difficulty ?? 4,
    retrievability: overrides.retrievability ?? 0.8,
    reps: overrides.reps ?? 1,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 2,
    lastReview: overrides.lastReview ?? Date.now() - 60_000,
    interval: overrides.interval ?? 2,
    firstReview: overrides.firstReview ?? Date.now() - 120_000,
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    cardType: overrides.cardType ?? CardType.Item,
    queueIndex: overrides.queueIndex,
    tags: overrides.tags ?? [],
    blockType: overrides.blockType ?? 'paragraph',
  };
}

describe('BrowserApplicationService queue query path', () => {
  it('routes queue snapshot and hydrate calls through the queue kernel', async () => {
    const queue = {
      getSnapshotRows: vi.fn(async () => [
        buildSnapshotRow('row-a', { fsrsCardId: 'card-a', priority: 10, queueIndex: 2 }),
        buildSnapshotRow('row-b', { fsrsCardId: 'card-b', priority: 90, queueIndex: 1 }),
      ]),
      getCardsBySnapshotIds: vi.fn(async (ids: string[]) => {
        const cardById = new Map([
          ['card-a', buildCard('card-a', { riffCardId: 'row-a' })],
          ['card-b', buildCard('card-b', { riffCardId: 'row-b' })],
          ['row-a', buildCard('card-a', { riffCardId: 'row-a' })],
          ['row-b', buildCard('card-b', { riffCardId: 'row-b' })],
        ]);
        return ids.map((id) => cardById.get(id)).filter(Boolean);
      }),
      getCounterSnapshot: vi.fn(async () => ({
        version: 1,
        remaining: 2,
        due: 2,
        total: 2,
        buckets: { all: 2, item: 2, descriptor: 0, topic: 0, concept: 0 },
        source: 'reconciled' as const,
      })),
      getRemainingSize: vi.fn(async () => 2),
      getStats: vi.fn(async () => ({ total: 2, due: 2, new: 0, learning: 0, reviewed: 0 })),
      getSize: vi.fn(async () => 2),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;
    const service = new BrowserApplicationService(
      {
        getCard: vi.fn(),
        queryCards: vi.fn(() => []),
        getAllCards: vi.fn(() => []),
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      manager,
      {
        ATTR_CARD_ID: 'custom-fsrs-card-id',
        ATTR_PRIORITY: 'custom-fsrs-priority',
        ATTR_SUSPENDED: 'custom-fsrs-suspended',
        ATTR_CARD_TYPE: 'custom-fsrs-card-type',
        ATTR_A_FACTOR: 'custom-fsrs-a-factor',
        sql: vi.fn(async () => [
          { id: 'block-row-a' },
          { id: 'block-row-b' },
        ]),
        setBlockAttrs: vi.fn(),
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      } as never,
    );

    const snapshot = await service.getQueueQuerySnapshot({
      queueId: 'retrieval',
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    });
    expect(snapshot.rows.map((row) => row.id)).toEqual(['card-b', 'card-a']);

    const rows = await service.getQueueRowsByIds('retrieval', ['card-a', 'card-b']);
    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(['card-a', 'card-b']);
  });

  it('createDataSource wires queue datasources back to browser service methods', async () => {
    const manager = {
      getQueue: vi.fn(() => ({
        getSnapshotRows: vi.fn(async () => []),
        getCardsBySnapshotIds: vi.fn(async () => []),
      })),
    } as never;
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async () => []),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    } as never;
    const dataSourceFactory = vi.fn((options, context) => ({
      fetchRows: async () => {
        const snapshot = await context.browserService.getQueueQuerySnapshot({
          queueId: options.queueId as never,
          preset: options.preset,
          searchText: options.queryText,
          cardType: options.cardType,
          sortModel: [],
        });
        const rows = await context.browserService.getQueueRowsByIds(
          options.queueId as never,
          snapshot.rows.map((row: { id: string }) => row.id),
        );
        return {
          rows,
          totalCount: snapshot.total,
        };
      },
    }));
    const service = new BrowserApplicationService(
      {
        getCard: vi.fn(),
        queryCards: vi.fn(() => []),
        getAllCards: vi.fn(() => []),
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      manager,
      siyuanApi,
      dataSourceFactory as never,
    );
    const getQueueQuerySnapshotSpy = vi.spyOn(service, 'getQueueQuerySnapshot').mockResolvedValue({
      total: 1,
      rows: [{ id: 'card-1', blockId: 'block-1', fsrsCardId: 'card-1' }],
    });
    const getQueueRowsByIdsSpy = vi.spyOn(service, 'getQueueRowsByIds').mockResolvedValue([
      {
        id: 'card-1',
        fsrsCardId: 'card-1',
        blockId: 'block-1',
        deckId: 'deck-a',
        content: 'card-1',
        fullContent: 'card-1',
        rootId: 'doc-a',
        state: CardState.Review,
        stateLabel: 'Review',
        due: new Date(),
        dueFormatted: '',
        stability: 1,
        difficulty: 1,
        retrievability: 0.5,
        reps: 1,
        lapses: 0,
        elapsedDays: 1,
        scheduledDays: 1,
        lastReview: null,
        lastReviewFormatted: '',
        interval: 1,
        firstReview: null,
        firstReviewFormatted: '',
        priority: 50,
        suspended: false,
        tags: [],
      },
    ]);

    const dataSource = service.createDataSource({
      type: 'queue',
      queueId: 'retrieval',
      preset: 'all',
      queryText: '',
      cardType: 'all',
    });

    const result = await dataSource.fetchRows({
      startRow: 0,
      endRow: 10,
      sortModel: [],
      filterModel: {},
    });

    expect(result.totalCount).toBe(1);
    expect(dataSourceFactory).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'queue', queueId: 'retrieval' }),
      expect.objectContaining({
        browserService: service,
        manager,
        siyuanApi,
      }),
    );
    expect(getQueueQuerySnapshotSpy).toHaveBeenCalled();
    expect(getQueueRowsByIdsSpy).toHaveBeenCalledWith('retrieval', ['card-1']);
  });
});
