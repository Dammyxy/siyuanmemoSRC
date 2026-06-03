import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { BrowserAdvancedSqlQuerySourcePort } from '@/application/ports/BrowserAdvancedSqlQuerySourcePort';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-read-model',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-read-model',
    blockId: overrides.blockId ?? 'block-read-model',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? { content: 'read model row', rootId: 'doc-read-model' },
  };
}

function createService(
  backendClient: Partial<SrsBackendClient>,
  siyuanApiOverrides: Record<string, unknown> = {},
  manager: unknown = null,
  advancedSqlQuerySource: BrowserAdvancedSqlQuerySourcePort | null = null,
): BrowserApplicationService {
  return new BrowserApplicationService(
    {
      getCard: vi.fn(),
      queryCards: vi.fn(() => []),
      getAllCards: vi.fn(() => []),
    } as never,
    new CardScheduleService(),
    new CardFilterService(),
    new CardSortService(),
    manager as never,
    {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async () => []),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
      ...siyuanApiOverrides,
    } as never,
    null,
    null,
    backendClient as SrsBackendClient,
    null,
    null,
    advancedSqlQuerySource,
  );
}

function buildQueueSnapshotRow(id: string, overrides: Partial<QueueSnapshotRow> = {}): QueueSnapshotRow {
  const now = 1_700_000_000_000;
  return {
    id,
    fsrsCardId: overrides.fsrsCardId ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
    deckId: overrides.deckId ?? 'deck-read-model',
    rootId: overrides.rootId ?? 'doc-read-model',
    content: overrides.content ?? `content-${id}`,
    fullContent: overrides.fullContent ?? `content-${id}`,
    state: overrides.state ?? CardState.Review,
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    retrievability: overrides.retrievability ?? 0.8,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 1,
    scheduledDays: overrides.scheduledDays ?? 7,
    lastReview: overrides.lastReview ?? now,
    interval: overrides.interval ?? 7,
    firstReview: overrides.firstReview ?? now - 86_400_000,
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    cardType: overrides.cardType ?? CardType.Item,
    queueIndex: overrides.queueIndex,
    tags: overrides.tags ?? [],
    blockType: overrides.blockType ?? 'paragraph',
  };
}

function createProjectionQueueService(managerOverrides: Record<string, unknown>): BrowserApplicationService {
  const queue = {
    getProjectionReadMode: vi.fn(() => 'backend-projection'),
    getCards: vi.fn(() => {
      throw new Error('Browser read model must not fall back to queue.getCards');
    }),
    getSnapshotRows: vi.fn(() => {
      throw new Error('Browser read model must not fall back to queue.getSnapshotRows');
    }),
    getCardsBySnapshotIds: vi.fn(() => {
      throw new Error('Browser read model must not fall back to queue.getCardsBySnapshotIds');
    }),
  };
  const manager = {
    getQueue: vi.fn(() => queue),
    getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
      queueType: QueueType.RetrievalPractice,
      projectionBacked: true,
      readPath: 'backend-projection',
      state: 'backend-projection',
      reason: 'rollout-enabled',
    }]),
    ...managerOverrides,
  };
  return createService({
    browserSourceExistenceApplySweepHost: vi.fn(async () => ({
      checked: 0,
      updated: 0,
      changed: false,
      changedToMissing: false,
    })),
    browserSourceExistenceByBlockIds: vi.fn(async () => new Map()),
  }, {
    sql: vi.fn(async () => [
      { id: 'block-stale-row' },
      { id: 'block-visible-row' },
    ]),
  }, manager);
}

describe('BrowserApplicationService BrowserReadModel facade', () => {
  it('returns deck page rows with read model metadata', async () => {
    const card = buildCard();
    const backendClient = {
      browserDeckPage: vi.fn(async () => ({
        total: 1,
        cards: [card],
        generation: 42,
      })),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([[card.blockId, true]])),
    };
    const service = createService(backendClient);

    const response = await service.getBrowserReadModel().page({
      source: 'deck',
      query: {
        preset: 'all',
        sortModel: [{ colId: 'due', sort: 'asc' }],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(response).toMatchObject({
      status: 'ready',
      total: 1,
      queryFingerprint: expect.any(String),
      generation: 42,
      readOwner: {
        kind: 'sql-card-universe',
      },
    });
    expect(response.rows.map((row) => row.fsrsCardId)).toEqual([card.id]);
    expect(backendClient.browserDeckPage).toHaveBeenCalledWith({
      preset: 'all',
      sortModel: [{ colId: 'due', sort: 'asc' }],
    }, {
      startRow: 0,
      endRow: 20,
    });
  });

  it('resolves action targets from explicit rowsByIds path', async () => {
    const card = buildCard({ id: 'target-card', blockId: 'target-block' });
    const backendClient = {
      browserDeckRowsByIds: vi.fn(async () => [card]),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([[card.blockId, true]])),
    };
    const service = createService(backendClient);

    await expect(service.getBrowserReadModel().actionTargetsByIds(['target-card'], {
      source: 'deck',
      reason: 'bulk-action',
    })).resolves.toEqual([expect.objectContaining({
      id: 'target-card',
      blockId: 'target-block',
      fsrsCardId: 'target-card',
    })]);
  });

  it('routes advanced SQL through application query source ids and shared deck row hydration', async () => {
    const card = buildCard({ id: 'card-sql', blockId: 'block-sql' });
    const backendClient = {
      browserDeckRowsByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({
        ...card,
        id: id === 'card-direct' ? 'card-direct' : card.id,
        blockId: id === 'card-direct' ? 'block-direct' : card.blockId,
      }))),
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map([[card.blockId, true]])),
    };
    const advancedSqlQuerySource = {
      matchedIds: vi.fn(async () => ['block-sql', 'card-direct']),
    };
    const service = createService(backendClient, {}, null, advancedSqlQuerySource);

    const page = await service.getBrowserReadModel().page({
      source: 'advanced-sql',
      statement: 'select id from blocks',
    }, {
      startRow: 0,
      endRow: 1,
    });
    const matchedIds = await service.getBrowserReadModel().matchedIds({
      source: 'advanced-sql',
      statement: 'select id from blocks',
    }, {
      reason: 'all-select',
    });

    expect(page).toMatchObject({
      status: 'ready',
      total: 2,
      generation: null,
      readOwner: {
        kind: 'block-id-intersection',
      },
      rows: [expect.objectContaining({ fsrsCardId: 'card-sql', blockId: 'block-sql' })],
    });
    expect(matchedIds).toEqual(['block-sql', 'card-direct']);
    expect(advancedSqlQuerySource.matchedIds).toHaveBeenCalledWith('select id from blocks');
    expect(backendClient.browserDeckRowsByIds).toHaveBeenCalledWith(['block-sql']);
  });

  it('routes queue query source through the same Browser row shape without local queue fallback', async () => {
    const card = buildCard({
      id: 'queue-card',
      blockId: 'queue-block',
      riffCardId: 'queue-row',
      priority: 70,
    });
    const queue = {
      getProjectionReadMode: vi.fn(() => 'backend-projection'),
      getSnapshotRows: vi.fn(async () => [{
        id: 'queue-row',
        fsrsCardId: 'queue-card',
        blockId: 'queue-block',
        deckId: 'deck-a',
        rootId: 'doc-a',
        content: 'queue row',
        fullContent: 'queue row',
        state: CardState.Review,
        due: Date.now(),
        stability: 4,
        difficulty: 5,
        retrievability: 0.8,
        reps: 3,
        lapses: 0,
        elapsedDays: 1,
        scheduledDays: 7,
        lastReview: Date.now() - 60_000,
        interval: 7,
        firstReview: Date.now() - 120_000,
        priority: 70,
        suspended: false,
        cardType: CardType.Item,
        queueIndex: 1,
        tags: [],
        blockType: 'paragraph',
      }]),
      getCardsBySnapshotIds: vi.fn(async (ids: string[]) => ids.includes('queue-card') ? [card] : []),
      getCards: vi.fn(() => {
        throw new Error('local queue.getCards fallback must not run for projection-backed Browser reads');
      }),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.RetrievalPractice,
        projectionBacked: true,
        readPath: 'backend-projection',
        state: 'ready',
        reason: 'test-projection-ready',
      }]),
    };
    const service = new BrowserApplicationService(
      {
        getCard: vi.fn(),
        queryCards: vi.fn(() => []),
        getAllCards: vi.fn(() => []),
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      manager as never,
      {
        ATTR_CARD_ID: 'custom-fsrs-card-id',
        ATTR_PRIORITY: 'custom-fsrs-priority',
        ATTR_SUSPENDED: 'custom-fsrs-suspended',
        ATTR_CARD_TYPE: 'custom-fsrs-card-type',
        ATTR_A_FACTOR: 'custom-fsrs-a-factor',
        sql: vi.fn(async () => []),
        setBlockAttrs: vi.fn(),
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      } as never,
      null,
      {
        getSourceExistenceByBlockIds: vi.fn(() => new Map([['queue-block', true]])),
      } as never,
    );

    const page = await service.getBrowserReadModel().page({
      source: 'queue',
      query: {
        queueId: 'retrieval',
        preset: 'all',
        searchText: '',
        cardType: 'all',
        sortModel: [],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(page).toMatchObject({
      status: 'ready',
      total: 1,
      readOwner: {
        kind: 'queue-projection',
        queueId: 'retrieval',
        projectionBacked: true,
      },
      rows: [expect.objectContaining({
        fsrsCardId: 'queue-card',
        blockId: 'queue-block',
        priority: 70,
      })],
    });
    expect(page.queryFingerprint).toEqual(expect.any(String));
    expect(page.generation).toBeNull();
    expect(queue.getCards).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalledWith(['queue-card'], false);
  });

  it('returns preparing when a projection-backed queue snapshot is cold without local queue fallback', async () => {
    const readQueueProjectionSnapshot = vi.fn(async () => null);
    const service = createProjectionQueueService({
      readQueueProjectionSnapshot,
    });

    const page = await service.getBrowserReadModel().page({
      source: 'queue',
      query: {
        queueId: 'retrieval',
        preset: 'all',
        searchText: '',
        cardType: 'all',
        sortModel: [],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(page).toMatchObject({
      status: 'preparing',
      rows: [],
      total: 0,
      readOwner: {
        kind: 'queue-projection',
        queueId: 'retrieval',
        projectionBacked: true,
      },
      diagnostics: [expect.objectContaining({ kind: 'refresh-required' })],
    });
    expect(readQueueProjectionSnapshot).toHaveBeenCalledWith(QueueType.RetrievalPractice, { forceRefresh: false });
  });

  it('returns preparing for missing derived-cache projection instead of ready empty or local fallback', async () => {
    const readQueueProjectionSnapshot = vi.fn(async () => null);
    const service = createProjectionQueueService({
      readQueueProjectionSnapshot,
      getQueueProjectionRolloutDiagnostics: vi.fn(() => [{
        queueType: QueueType.RetrievalPractice,
        projectionBacked: true,
        readPath: 'backend-projection',
        state: 'projection-unavailable',
        reason: 'refresh-required',
        unavailableReason: 'missing_derived_cache',
        backendStatus: 'refreshing',
        policyHash: null,
        generation: null,
      }]),
    });

    const page = await service.getBrowserReadModel().page({
      source: 'queue',
      query: {
        queueId: 'retrieval',
        preset: 'all',
        searchText: '',
        cardType: 'all',
        sortModel: [],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(page).toMatchObject({
      status: 'preparing',
      rows: [],
      total: 0,
      readOwner: {
        kind: 'queue-projection',
        queueId: 'retrieval',
        projectionBacked: true,
        state: 'projection-unavailable',
        unavailableReason: 'missing_derived_cache',
      },
      diagnostics: [expect.objectContaining({ kind: 'refresh-required' })],
    });
    expect(readQueueProjectionSnapshot).toHaveBeenCalledWith(QueueType.RetrievalPractice, { forceRefresh: false });
  });

  it('returns repair-required when queue projection freshness reports stale or missing rows', async () => {
    const service = createProjectionQueueService({
      readQueueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        policyHash: 'policy-stale',
        generation: 9,
        status: 'ready',
        rows: [buildQueueSnapshotRow('stale-row', { fsrsCardId: 'stale-card' })],
        counters: null,
        freshness: {
          checkedAt: 1_700_000_000_000,
          totalRows: 1,
          freshRows: 0,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['stale-card'],
          missingCardIds: [],
        },
      })),
    });

    const page = await service.getBrowserReadModel().page({
      source: 'queue',
      query: {
        queueId: 'retrieval',
        preset: 'all',
        searchText: '',
        cardType: 'all',
        sortModel: [],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(page).toMatchObject({
      status: 'repair-required',
      rows: [],
      total: 0,
      reason: expect.stringContaining('projection_stale'),
      diagnostics: [expect.objectContaining({
        kind: 'refresh-required',
        rowIds: ['stale-card'],
      })],
    });
  });

  it('returns unavailable when projection owner read fails without local queue fallback', async () => {
    const service = createProjectionQueueService({
      readQueueProjectionSnapshot: vi.fn(async () => {
        throw new Error('backend projection reader down');
      }),
    });

    const page = await service.getBrowserReadModel().page({
      source: 'queue',
      query: {
        queueId: 'retrieval',
        preset: 'all',
        searchText: '',
        cardType: 'all',
        sortModel: [],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(page).toMatchObject({
      status: 'unavailable',
      rows: [],
      total: 0,
      reason: expect.stringContaining('backend projection reader down'),
      diagnostics: [expect.objectContaining({ kind: 'owner-unavailable' })],
    });
  });

  it('returns repair-required when projection row hydration misses visible ids', async () => {
    const getQueueProjectionCardsBySnapshotIds = vi.fn(async () => []);
    const service = createProjectionQueueService({
      readQueueProjectionSnapshot: vi.fn(async () => ({
        queueType: QueueType.RetrievalPractice,
        policyHash: 'policy-ready',
        generation: 10,
        status: 'ready',
        rows: [buildQueueSnapshotRow('visible-row', { fsrsCardId: 'visible-card' })],
        counters: null,
      })),
      getQueueProjectionCardsBySnapshotIds,
    });

    const page = await service.getBrowserReadModel().page({
      source: 'queue',
      query: {
        queueId: 'retrieval',
        preset: 'all',
        searchText: '',
        cardType: 'all',
        sortModel: [],
      },
    }, {
      startRow: 0,
      endRow: 20,
    });

    expect(page).toMatchObject({
      status: 'repair-required',
      rows: [],
      total: 0,
      reason: expect.stringContaining('visible-card'),
      diagnostics: [expect.objectContaining({
        kind: 'missing-row',
        rowIds: ['visible-card'],
      })],
    });
    expect(getQueueProjectionCardsBySnapshotIds).toHaveBeenCalledWith(
      QueueType.RetrievalPractice,
      ['visible-card'],
      { forceRefresh: false },
    );
  });
});
