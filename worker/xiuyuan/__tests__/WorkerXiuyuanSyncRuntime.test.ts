import { describe, expect, it } from 'vitest';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { WorkerXiuyuanSyncRuntime } from '../WorkerXiuyuanSyncRuntime';
import type { WorkerXiuyuanSyncApplyInput } from '../WorkerXiuyuanSyncPlanner';

const NOW = 1_700_000_000_000;

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: overrides.id ?? 'card-existing',
    xiuyuanID: overrides.xiuyuanID ?? 'xy-existing',
    blockId: overrides.blockId ?? 'block-existing',
    due: overrides.due ?? 1_800_000_000_000,
    stability: overrides.stability ?? 12,
    difficulty: overrides.difficulty ?? 4,
    reps: overrides.reps ?? 5,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? 1_790_000_000_000,
    elapsedDays: overrides.elapsedDays ?? 3,
    scheduledDays: overrides.scheduledDays ?? 116,
    priority: overrides.priority ?? 42,
    type: overrides.type ?? CardType.Topic,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    schedulerType: overrides.schedulerType ?? 'fsrs-v6',
    riffCardId: overrides.riffCardId,
    content: overrides.content,
    meta: overrides.meta ?? {
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
    },
  };
}

async function createRuntime(now = NOW): Promise<{
  runtime: WorkerXiuyuanSyncRuntime;
  database: SqliteDatabaseService;
  repository: SqlUnifiedStorageRepository;
}> {
  const bridge = createInMemorySqlitePersistenceBridge();
  const database = new SqliteDatabaseService(bridge, 'siyuanmemo.db', {
    persistOnInit: false,
    enableDeltaPersistence: true,
    checkpointStorageClass: 'volatile-projection',
  });
  await database.init();
  const repository = new SqlUnifiedStorageRepository(database);
  const runtime = new WorkerXiuyuanSyncRuntime({
    runtime: database,
    repository,
    now: () => now,
  });
  return { runtime, database, repository };
}

function insertXiuyuan(
  database: SqliteDatabaseService,
  id: string,
  blockId: string,
  input: {
    content?: string;
    updatedAt?: number;
    templateID?: string;
    meta?: Record<string, unknown>;
  } = {},
): void {
  database.run('INSERT OR REPLACE INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
    id,
    input.updatedAt ?? NOW,
    JSON.stringify({
      id,
      blockIDs: [blockId],
      templateID: input.templateID ?? 'builtin-riff-sync',
      content: input.content ?? 'Stable content',
      updatedAt: input.updatedAt ?? NOW,
      meta: input.meta ?? {
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: `riff-${blockId}`,
        deckId: 'deck-a',
      },
    }),
  ]);
}

function buildApplyInput(overrides: Partial<WorkerXiuyuanSyncApplyInput> = {}): WorkerXiuyuanSyncApplyInput {
  return {
    request: {
      requestId: 'sync-request',
      commandId: 'sync-command',
      idempotencyKey: 'sync-key',
      mode: 'full',
      dryRun: false,
      deckId: 'deck-a',
      requestedAt: NOW,
      ...overrides.request,
    },
    plan: {
      localXiuyuanCount: 0,
      localCardCount: 0,
      localManagedRiffCount: 0,
      nativeRiffCount: 0,
      normalizedNativeRiffCount: 0,
      malformedNativeRiffCount: 0,
      duplicateNativeRiffCount: 0,
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      skippedLocalOwnedCount: 0,
      ...overrides.plan,
      candidateBlockIds: {
        create: [],
        update: [],
        delete: [],
        skippedLocalOwned: [],
        ...overrides.plan?.candidateBlockIds,
      },
    },
    localFacts: {
      loadedAt: NOW,
      xiuyuans: [],
      cards: [],
      ...overrides.localFacts,
    },
    nativeBlocks: [],
    appliedAt: NOW + 500,
    ...overrides,
  };
}

describe('WorkerXiuyuanSyncRuntime', () => {
  it('reads active Xiuyuan and card sync facts from SQLite', async () => {
    const { runtime, database, repository } = await createRuntime();
    insertXiuyuan(database, 'xy-riff', 'block-riff');
    repository.upsertCard(buildCard({
      id: 'card-riff',
      xiuyuanID: 'xy-riff',
      blockId: 'block-riff',
      riffCardId: 'riff-card-riff',
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
      },
    }));

    const facts = await runtime.readXiuyuanSyncLocalFacts();

    expect(facts.loadedAt).toBe(NOW);
    expect(facts.xiuyuans).toEqual([
      expect.objectContaining({
        id: 'xy-riff',
        blockIds: ['block-riff'],
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
      }),
    ]);
    expect(facts.cards).toEqual([
      expect.objectContaining({
        id: 'card-riff',
        blockId: 'block-riff',
        xiuyuanId: 'xy-riff',
        riffCardId: 'riff-card-riff',
        ownership: 'riff-managed',
        source: 'riff-sync',
        schedulerType: 'a-factor-v2',
      }),
    ]);
  });

  it('applies create, update, delete rows and advances full-sync checkpoint', async () => {
    const { runtime, database, repository } = await createRuntime();
    insertXiuyuan(database, 'xy-existing', 'block-existing', { content: 'Old content' });
    insertXiuyuan(database, 'xy-gone', 'block-gone', { content: 'Gone content' });
    repository.upsertCard(buildCard({
      id: 'card-existing',
      xiuyuanID: 'xy-existing',
      blockId: 'block-existing',
      riffCardId: 'riff-existing',
      content: 'Old content',
    }));
    repository.upsertCard(buildCard({
      id: 'card-gone',
      xiuyuanID: 'xy-gone',
      blockId: 'block-gone',
      riffCardId: 'riff-gone',
      content: 'Gone content',
    }));

    const result = await runtime.applyXiuyuanSyncPlan(buildApplyInput({
      plan: {
        candidateBlockIds: {
          update: ['block-existing'],
          delete: ['block-gone'],
          create: ['block-new'],
          skippedLocalOwned: [],
        },
      },
      localFacts: {
        loadedAt: NOW,
        xiuyuans: [
          { id: 'xy-existing', blockIds: ['block-existing'], representativeBlockId: 'block-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' },
          { id: 'xy-gone', blockIds: ['block-gone'], representativeBlockId: 'block-gone', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' },
        ],
        cards: [
          { id: 'card-existing', xiuyuanId: 'xy-existing', blockId: 'block-existing', riffCardId: 'riff-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' },
          { id: 'card-gone', xiuyuanId: 'xy-gone', blockId: 'block-gone', riffCardId: 'riff-gone', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' },
        ],
      },
      nativeBlocks: [
        { id: 'block-existing', content: 'Existing backend-applied content', riffCardID: 'riff-existing' },
        {
          id: 'block-new',
          content: 'New backend-applied content',
          riffCardID: 'riff-new',
          riffCard: {
            id: 'riff-new',
            due: '2026-04-13T00:00:00.000Z',
            lastReview: '2026-03-01T00:00:00.000Z',
            reps: 1,
            state: CardState.Learning,
            stability: 0,
            difficulty: 1,
            scheduledDays: 43,
            elapsedDays: 43,
          },
        },
      ],
    }));

    expect(result).toEqual({
      blockIds: ['block-existing', 'block-gone', 'block-new'],
      cardIds: ['card-existing', 'card-gone', 'card-block-new'],
    });
    expect(database.getOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM cards WHERE block_id = 'block-new'",
    )?.count).toBe(1);
    expect(database.getOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM tombstones WHERE kind = 'card' AND id = 'card-gone'",
    )?.count).toBe(1);
    expect(database.getOne<{ payload_json: string }>(
      "SELECT payload_json FROM xiuyuans WHERE id = 'xy-existing'",
    )?.payload_json).toContain('Existing backend-applied content');
    expect(repository.getCard('card-existing')).toMatchObject({
      due: 1_800_000_000_000,
      reps: 5,
      lastReview: 1_790_000_000_000,
      state: CardState.Review,
      riffCardId: 'riff-existing',
    });
    expect(repository.getCard('card-block-new')).toEqual(expect.objectContaining({
      id: 'card-block-new',
      blockId: 'block-new',
      xiuyuanID: 'xy-block-new',
      reps: 1,
      lastReview: expect.any(Number),
      state: CardState.Review,
      type: CardType.Topic,
      riffCardId: 'riff-new',
      schedulerType: 'a-factor-v2',
      scheduledDays: 43,
    }));
    const syncState = JSON.parse(database.getOne<{ value_json: string }>(
      "SELECT value_json FROM riff_sync WHERE key = 'sync_state'",
    )?.value_json ?? '{}');
    expect(syncState.lastSuccessfulFullAt).toBe(NOW + 500);
  });

  it('does not rewrite unchanged managed Riff rows but can persist a full idle checkpoint', async () => {
    const { runtime, database, repository } = await createRuntime();
    insertXiuyuan(database, 'xy-existing', 'block-existing', {
      content: 'Stable content',
      meta: {
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: 'riff-existing',
        deckId: 'deck-a',
      },
    });
    repository.upsertCard(buildCard({
      riffCardId: 'riff-existing',
      content: 'Stable content',
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: 'riff-existing',
        deckId: 'deck-a',
      },
    }));
    const beforeCardRow = database.getOne<{ updated_at: number; payload_json: string }>(
      "SELECT updated_at, payload_json FROM cards WHERE id = 'card-existing'",
    );
    const beforeXiuyuan = database.getOne<{ updated_at: number; payload_json: string }>(
      "SELECT updated_at, payload_json FROM xiuyuans WHERE id = 'xy-existing'",
    );

    const result = await runtime.applyXiuyuanSyncPlan(buildApplyInput({
      plan: {
        candidateBlockIds: {
          update: ['block-existing'],
          create: [],
          delete: [],
          skippedLocalOwned: [],
        },
      },
      localFacts: {
        loadedAt: NOW,
        xiuyuans: [{ id: 'xy-existing', blockIds: ['block-existing'], representativeBlockId: 'block-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' }],
        cards: [{ id: 'card-existing', xiuyuanId: 'xy-existing', blockId: 'block-existing', riffCardId: 'riff-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' }],
      },
      nativeBlocks: [
        { id: 'block-existing', content: 'Stable content', riffCardID: 'riff-existing' },
      ],
    }));

    expect(result).toEqual({ blockIds: [], cardIds: [] });
    expect(database.getOne<{ updated_at: number; payload_json: string }>(
      "SELECT updated_at, payload_json FROM cards WHERE id = 'card-existing'",
    )).toEqual(beforeCardRow);
    expect(database.getOne<{ updated_at: number; payload_json: string }>(
      "SELECT updated_at, payload_json FROM xiuyuans WHERE id = 'xy-existing'",
    )).toEqual(beforeXiuyuan);
    const syncState = JSON.parse(database.getOne<{ value_json: string }>(
      "SELECT value_json FROM riff_sync WHERE key = 'sync_state'",
    )?.value_json ?? '{}');
    expect(syncState.lastSuccessfulFullAt).toBe(NOW + 500);
  });

  it('does not persist idle incremental checkpoint for skipped local-owned candidates when requested', async () => {
    const { runtime, database, repository } = await createRuntime();
    insertXiuyuan(database, 'xy-existing', 'block-existing', {
      content: 'Stable startup content',
      meta: {
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: 'riff-existing',
        deckId: 'deck-a',
      },
    });
    repository.upsertCard(buildCard({
      riffCardId: 'riff-existing',
      content: 'Stable startup content',
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: 'riff-existing',
        deckId: 'deck-a',
      },
    }));

    const result = await runtime.applyXiuyuanSyncPlan(buildApplyInput({
      request: { mode: 'incremental', persistIdleCheckpoint: false },
      plan: {
        candidateBlockIds: {
          update: [],
          create: [],
          delete: [],
          skippedLocalOwned: ['block-existing'],
        },
      },
      localFacts: {
        loadedAt: NOW,
        xiuyuans: [{ id: 'xy-existing', blockIds: ['block-existing'], representativeBlockId: 'block-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' }],
        cards: [{ id: 'card-existing', xiuyuanId: 'xy-existing', blockId: 'block-existing', riffCardId: 'riff-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' }],
      },
      nativeBlocks: [
        { id: 'block-existing', content: 'Stable startup content', riffCardID: 'riff-existing' },
      ],
    }));

    expect(result.blockIds).toEqual(expect.any(Array));
    expect(result.cardIds).toEqual(expect.any(Array));
    expect(database.getOne<{ value_json: string }>(
      "SELECT value_json FROM riff_sync WHERE key = 'sync_state'",
    )).toBeNull();
  });

  it('preserves newer local scheduling state when native Riff schedule is stale', async () => {
    const { runtime, database, repository } = await createRuntime();
    insertXiuyuan(database, 'xy-existing', 'block-existing');
    repository.upsertCard(buildCard({
      due: 1_790_900_000_000,
      stability: 9.5,
      difficulty: 3.2,
      reps: 8,
      lapses: 1,
      state: CardState.Review,
      lastReview: 1_790_000_000_000,
      elapsedDays: 0,
      scheduledDays: 10,
      riffCardId: 'riff-existing',
      updatedAt: 1_790_000_000_100,
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: 'riff-existing',
      },
    }));

    await runtime.applyXiuyuanSyncPlan(buildApplyInput({
      request: { mode: 'incremental' },
      plan: {
        candidateBlockIds: {
          update: ['block-existing'],
          create: [],
          delete: [],
          skippedLocalOwned: [],
        },
      },
      localFacts: {
        loadedAt: NOW,
        xiuyuans: [{ id: 'xy-existing', blockIds: ['block-existing'], representativeBlockId: 'block-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' }],
        cards: [{ id: 'card-existing', xiuyuanId: 'xy-existing', blockId: 'block-existing', riffCardId: 'riff-existing', templateId: 'builtin-riff-sync', ownership: 'riff-managed', source: 'riff-sync' }],
      },
      nativeBlocks: [
        {
          id: 'block-existing',
          content: 'Existing content with stale native schedule',
          riffCardID: 'riff-existing',
          riffCard: {
            id: 'riff-existing',
            due: '2026-03-02T00:00:00.000Z',
            lastReview: '2026-03-01T00:00:00.000Z',
            reps: 3,
            lapses: 0,
            state: CardState.Relearning,
            stability: 0,
            difficulty: 1,
            scheduledDays: 0,
            elapsedDays: 0,
          },
        },
      ],
      appliedAt: 1_800_000_000_000,
    }));

    expect(repository.getCard('card-existing')).toMatchObject({
      due: 1_790_900_000_000,
      stability: 9.5,
      difficulty: 3.2,
      reps: 8,
      lapses: 1,
      state: CardState.Review,
      lastReview: 1_790_000_000_000,
      elapsedDays: 0,
      scheduledDays: 10,
      riffCardId: 'riff-existing',
    });
  });
});
