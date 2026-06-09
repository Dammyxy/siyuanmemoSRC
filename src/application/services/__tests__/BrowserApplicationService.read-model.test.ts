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
  cdfLiveRelationCardCreator: unknown = null,
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
    cdfLiveRelationCardCreator as never,
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
  it('refreshes current-card CDF live relation metadata on Browser open by card id', async () => {
    const conceptId = '20260101000000-aaaaaaa';
    const sourceId = '20260101000001-bbbbbbb';
    const card = buildCard({
      id: 'cdf-card',
      blockId: sourceId,
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        templateID: 'builtin-concept-definition-forward',
        typeMarker: 'concept-definition-forward',
        sourceBlockId: sourceId,
        fieldMapping: {
          concept: conceptId,
          definition: sourceId,
        },
      },
    });
    const manager = {
      getCard: vi.fn(async (cardId: string) => {
        if (cardId !== 'cdf-card') {
          throw new Error(`missing ${cardId}`);
        }
        return card;
      }),
      getCards: vi.fn(async () => [card]),
      updateCard: vi.fn(async () => undefined),
    };
    const sql = vi.fn(async (statement: string) => {
      if (statement.includes('LIMIT 1')) {
        return [{
          id: sourceId,
          parent_id: '',
          root_id: sourceId,
          type: 'p',
          markdown: `((${conceptId} "Concept")) :> definition body`,
          sort: '0',
        }];
      }
      return [{
        id: sourceId,
        parent_id: '',
        root_id: sourceId,
        type: 'p',
        markdown: `((${conceptId} "Concept")) :> definition body`,
        sort: '0',
      }];
    });
    const service = createService({
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map()),
    }, { sql }, manager);

    const result = await service.refreshCdfLiveRelationOnOpen('cdf-card');

    expect(result.reason).toBe('refreshed');
    expect(result.actions.some((action) => action.kind === 'create-card')).toBe(false);
    expect(manager.getCard).toHaveBeenCalledWith('cdf-card', { silent: true });
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cdf-card',
        meta: expect.objectContaining({
          liveRelationKey: `${sourceId}:${conceptId}:definition-forward`,
          relationAuthority: 'live-backlink',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
        }),
      }),
      { suppressDueIndexSort: true },
    );
  });

  it('previews full CDF live relation repair through Browser scope without persisting changes', async () => {
    const existingSourceId = '20260101000003-existing';
    const conceptId = '20260101000004-concept';
    const existingCard = buildCard({
      id: 'existing-cdf-card',
      blockId: existingSourceId,
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: `${existingSourceId}:${conceptId}:descriptor-forward`,
        sourceBlockId: existingSourceId,
        conceptBlockId: conceptId,
        relationKind: 'descriptor-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        templateID: 'builtin-concept-descriptor',
        typeMarker: 'concept-descriptor-forward',
      },
    });
    const manager = {
      getCards: vi.fn(async () => [existingCard]),
      updateCard: vi.fn(async () => undefined),
      onCardCreated: vi.fn(async () => undefined),
    };
    const sql = vi.fn(async () => []);
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = createService({
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map()),
    }, { sql }, manager, null, creator);

    const preview = await service.previewFullCdfLiveRelationRepair({
      scope: { kind: 'document', docId: 'doc-cdf' },
      limit: 7,
    });

    expect(preview).toMatchObject({
      attempted: true,
      reason: 'no-candidates',
      scope: { kind: 'document', docId: 'doc-cdf' },
      summary: {
        candidateSourceCount: 0,
        scannedRootCount: 0,
        derivedRelationCount: 0,
        actionCount: 0,
        createCardCount: 0,
        updatedCardCount: 0,
        activeUpdateCount: 0,
        orphanCount: 0,
        duplicateCount: 0,
        reactivatedCount: 0,
        legacyMigratedCount: 0,
        legacyUnavailableCount: 0,
        contentIncompleteCount: 0,
        deriveFailedNoCardCandidateCount: 0,
        sourceMissingCount: 0,
        sourceUnavailableCount: 0,
        persistedMutationCount: 0,
      },
    });
    const statement = String(sql.mock.calls[0]?.[0] || '');
    expect(statement).toContain("(root_id = 'doc-cdf' OR id = 'doc-cdf')");
    expect(statement).toContain(`id IN ('${existingSourceId}')`);
    expect(statement).toContain('LIMIT 7');
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(manager.onCardCreated).not.toHaveBeenCalled();
  });

  it('executes full CDF live relation repair through Browser service for existing cards only by default', async () => {
    const existingSourceId = '20260101000003-existing';
    const conceptId = '20260101000004-concept';
    const existingCard = buildCard({
      id: 'existing-cdf-card',
      blockId: existingSourceId,
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: `${existingSourceId}:${conceptId}:descriptor-forward`,
        sourceBlockId: existingSourceId,
        conceptBlockId: conceptId,
        relationKind: 'descriptor-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        templateID: 'builtin-concept-descriptor',
        typeMarker: 'concept-descriptor-forward',
        fieldMapping: {
          concept: conceptId,
          descriptor: existingSourceId,
        },
      },
    });
    const manager = {
      getCards: vi.fn(async (filter?: { blockIds?: string[] }) => {
        if (!filter?.blockIds || filter.blockIds.length === 0) {
          return [existingCard];
        }
        return filter.blockIds.includes(existingSourceId) ? [existingCard] : [];
      }),
      updateCard: vi.fn(async () => undefined),
      onCardCreated: vi.fn(async () => undefined),
    };
    const sql = vi.fn(async (statement: string) => {
      if (statement.includes('ORDER BY root_id ASC')) {
        return [{
          id: existingSourceId,
          root_id: 'doc-cdf',
          box: 'notebook-cdf',
          type: 'p',
          markdown: 'descriptor source after live relation removed',
          content: '',
        }];
      }
      if (statement.includes("WHERE id = 'doc-cdf'")) {
        return [{
          id: 'doc-cdf',
          parent_id: '',
          root_id: 'doc-cdf',
          type: 'd',
          markdown: 'Document',
          sort: '0',
        }];
      }
      if (statement.includes("WHERE root_id = 'doc-cdf'")) {
        return [
          {
            id: 'doc-cdf',
            parent_id: '',
            root_id: 'doc-cdf',
            type: 'd',
            markdown: 'Document',
            sort: '0',
          },
          {
            id: existingSourceId,
            parent_id: 'doc-cdf',
            root_id: 'doc-cdf',
            type: 'p',
            markdown: 'descriptor source after live relation removed',
            sort: '1',
          },
        ];
      }
      return [];
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = createService({
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map()),
    }, { sql }, manager, null, creator);

    const result = await service.executeFullCdfLiveRelationRepair({
      scope: { kind: 'document', docId: 'doc-cdf' },
    });

    expect(result).toMatchObject({
      attempted: true,
      reason: 'executed',
      createNewCandidates: false,
      sourcePreviews: [
        {
          scanRootId: 'doc-cdf',
          candidateSourceIds: [existingSourceId],
          persisted: true,
          previewOnly: false,
        },
      ],
      summary: {
        candidateSourceCount: 1,
        scannedRootCount: 1,
        derivedRelationCount: 0,
        actionCount: 1,
        createCardCount: 0,
        updatedCardCount: 1,
        activeUpdateCount: 0,
        orphanCount: 1,
        duplicateCount: 0,
        reactivatedCount: 0,
        legacyMigratedCount: 0,
        legacyUnavailableCount: 0,
        contentIncompleteCount: 0,
        deriveFailedNoCardCandidateCount: 0,
        sourceMissingCount: 0,
        sourceUnavailableCount: 0,
        persistedMutationCount: 1,
      },
    });
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing-cdf-card',
        meta: expect.objectContaining({
          liveRelationStatus: 'orphaned-by-live-relation',
        }),
      }),
      { suppressDueIndexSort: true },
    );
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.onCardCreated).not.toHaveBeenCalled();
  });

  it('previews and executes single-source CDF repair through Browser service', async () => {
    const sourceId = '20260101000005-source';
    const conceptId = '20260101000006-concept';
    const manager = {
      getCards: vi.fn(async () => []),
      updateCard: vi.fn(async () => undefined),
      onCardCreated: vi.fn(async () => undefined),
    };
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = createService({
      browserSourceExistenceApplySweepHost: vi.fn(async () => ({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
      })),
      browserSourceExistenceByBlockIds: vi.fn(async () => new Map()),
    }, {}, manager, null, creator);
    const sourceTree = {
      id: sourceId,
      type: 'p',
      markdown: `((${conceptId} "Concept")) :> definition body`,
    };

    const preview = await service.previewSingleSourceCdfLiveRelationRepair({
      sourceBlockId: sourceId,
      sourceTree,
    });

    expect(preview).toMatchObject({
      attempted: true,
      sourceBlockId: sourceId,
      persisted: false,
      reason: 'reconciled',
      summary: {
        candidateSourceCount: 1,
        scannedRootCount: 1,
        derivedRelationCount: 1,
        actionCount: 1,
        createCardCount: 1,
        updatedCardCount: 0,
        activeUpdateCount: 0,
        orphanCount: 0,
        duplicateCount: 0,
        reactivatedCount: 0,
        legacyMigratedCount: 0,
        legacyUnavailableCount: 0,
        contentIncompleteCount: 0,
        deriveFailedNoCardCandidateCount: 0,
        sourceMissingCount: 0,
        sourceUnavailableCount: 0,
        persistedMutationCount: 0,
      },
    });
    expect(preview.result.createdCards).toEqual([
      expect.objectContaining({
        blockId: sourceId,
        meta: expect.objectContaining({
          liveRelationKey: `${sourceId}:${conceptId}:definition-forward`,
        }),
      }),
    ]);
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();

    const execution = await service.executeSingleSourceCdfLiveRelationRepair({
      sourceBlockId: sourceId,
      sourceTree,
    });

    expect(execution.persisted).toBe(true);
    expect(execution.summary).toEqual(expect.objectContaining({
      createCardCount: 1,
      persistedMutationCount: 1,
    }));
    expect(creator.createCards).toHaveBeenCalled();
    expect(manager.onCardCreated).toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
  });

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
