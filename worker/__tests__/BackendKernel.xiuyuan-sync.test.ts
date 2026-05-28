import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
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
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    schedulerType: overrides.schedulerType ?? 'fsrs-v6',
    riffCardId: overrides.riffCardId,
    meta: overrides.meta ?? {
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
    },
  };
}

async function createSeededDatabase(): Promise<WorkerSqliteDatabaseService> {
  const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
  await database.init();
  const now = 1_700_000_000_000;
  database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
    'xy-existing',
    now,
    JSON.stringify({
      id: 'xy-existing',
      blockIDs: ['block-existing'],
      templateID: 'builtin-riff-sync',
      meta: {
        ownership: 'riff-managed',
        source: 'riff-sync',
      },
    }),
  ]);
  await database.upsertCards([buildCard()]);
  return database;
}

describe('BackendKernel xiuyuan.sync.execute', () => {
  it('plans Xiuyuan sync through backend Worker using the native Riff read proxy', async () => {
    const database = await createSeededDatabase();
    const readXiuyuanRiffFacts = vi.fn(async (request) => ({
      status: 'ready' as const,
      requestId: request.requestId,
      mode: request.mode,
      deckId: request.deckId,
      readAt: 1_700_000_000_100,
      blocks: [
        { id: 'block-existing', content: 'Existing updated content' },
        { id: 'block-new', content: 'New native content' },
      ],
      diagnostics: {
        source: 'renderer-host-effect' as const,
        blockCount: 2,
        normalizedBlockCount: 2,
        malformedBlockCount: 0,
        truncated: false,
      },
    }));
    const kernel = new BackendKernel({
      database,
      readXiuyuanRiffFacts,
    });

    const response = await kernel.handle({
      id: 'xiuyuan-sync',
      jsonrpc: '2.0',
      method: 'xiuyuan.sync.execute',
      params: [{
        requestId: 'sync-request-1',
        commandId: 'sync-command-1',
        idempotencyKey: 'sync-key-1',
        mode: 'incremental',
        dryRun: true,
        deckId: 'deck-a',
        requestedAt: 1_700_000_000_000,
      }],
    });

    expect(readXiuyuanRiffFacts).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'incremental',
      deckId: 'deck-a',
      requestId: 'riff-read-sync-command-1',
    }));
    expect(response).toEqual(expect.objectContaining({
      id: 'xiuyuan-sync',
      result: expect.objectContaining({
        status: 'planned',
        commandId: 'sync-command-1',
        plan: expect.objectContaining({
          localXiuyuanCount: 1,
          createCount: 1,
          updateCount: 1,
          deleteCount: 0,
          candidateBlockIds: expect.objectContaining({
            create: ['block-new'],
            update: ['block-existing'],
          }),
        }),
        applyImpact: {
          requested: false,
          applied: false,
          reason: 'dry-run',
          changed: {},
        },
      }),
    }));
  });

  it('returns typed unavailable when the Riff read proxy dependency is missing', async () => {
    const database = await createSeededDatabase();
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'xiuyuan-sync-unavailable',
      jsonrpc: '2.0',
      method: 'xiuyuan.sync.execute',
      params: [{
        requestId: 'sync-request-unavailable',
        commandId: 'sync-command-unavailable',
        idempotencyKey: 'sync-key-unavailable',
        mode: 'full',
        dryRun: true,
        deckId: 'deck-a',
        requestedAt: 1_700_000_000_000,
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        commandId: 'sync-command-unavailable',
        unavailableClass: 'KERNEL_SIDECAR_UNAVAILABLE',
        recoverable: true,
      }),
    }));
  });

  it('applies non-dry-run sync through backend Worker DB authority', async () => {
    const database = await createSeededDatabase();
    const now = 1_700_000_000_000;
    database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
      'xy-gone',
      now,
      JSON.stringify({
        id: 'xy-gone',
        blockIDs: ['block-gone'],
        templateID: 'builtin-riff-sync',
        meta: {
          ownership: 'riff-managed',
          source: 'riff-sync',
        },
      }),
    ]);
    database.run(
      `INSERT INTO cards (id, block_id, xiuyuan_id, scheduler_type, updated_at, payload_json, dto_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'card-gone',
        'block-gone',
        'xy-gone',
        'fsrs-v6',
        now,
        JSON.stringify({
          id: 'card-gone',
          blockId: 'block-gone',
          xiuyuanID: 'xy-gone',
          meta: {
            templateID: 'builtin-riff-sync',
            ownership: 'riff-managed',
            source: 'riff-sync',
          },
        }),
        null,
      ],
    );
    const readXiuyuanRiffFacts = vi.fn(async (request) => ({
      status: 'ready' as const,
      requestId: request.requestId,
      mode: request.mode,
      deckId: request.deckId,
      readAt: 1_700_000_000_100,
      blocks: [
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
      diagnostics: {
        source: 'renderer-host-effect' as const,
        blockCount: 2,
        normalizedBlockCount: 2,
        malformedBlockCount: 0,
        truncated: false,
      },
    }));
    const kernel = new BackendKernel({
      database,
      readXiuyuanRiffFacts,
    });

    const response = await kernel.handle({
      id: 'xiuyuan-sync-apply',
      jsonrpc: '2.0',
      method: 'xiuyuan.sync.execute',
      params: [{
        requestId: 'sync-request-apply',
        commandId: 'sync-command-apply',
        idempotencyKey: 'sync-key-apply',
        mode: 'full',
        dryRun: false,
        deckId: 'deck-a',
        requestedAt: now,
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'applied',
        commandId: 'sync-command-apply',
        applyImpact: {
          requested: true,
          applied: true,
          reason: 'applied',
          changed: {
            blockIds: ['block-existing', 'block-gone', 'block-new'],
            cardIds: ['card-existing', 'card-gone', 'card-block-new'],
          },
        },
      }),
    }));
    expect(database.getOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM cards WHERE block_id = 'block-new'",
    )?.count).toBe(1);
    expect(database.getOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM tombstones WHERE kind = 'card' AND id = 'card-gone'",
    )?.count).toBe(1);
    expect(database.getOne<{ payload_json: string }>(
      "SELECT payload_json FROM xiuyuans WHERE id = 'xy-existing'",
    )?.payload_json).toContain('Existing backend-applied content');
    const existing = await database.getCard('card-existing');
    expect(existing).toMatchObject({
      due: 1_800_000_000_000,
      reps: 5,
      lastReview: 1_790_000_000_000,
      state: CardState.Review,
      type: CardType.Topic,
      riffCardId: 'riff-existing',
      meta: expect.objectContaining({
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
      }),
    });
    const created = await database.getCard('card-block-new');
    expect(created).toEqual(expect.objectContaining({
      id: 'card-block-new',
      blockId: 'block-new',
      xiuyuanID: 'xy-block-new',
      due: expect.any(Number),
      reps: 1,
      lastReview: expect.any(Number),
      state: CardState.Review,
      type: CardType.Topic,
      riffCardId: 'riff-new',
      schedulerType: 'a-factor-v2',
      scheduledDays: 43,
    }));
    expect(created?.due).toBeGreaterThan(0);
    expect(created?.createdAt).toBeGreaterThan(0);
  });

  it('preserves newer local scheduling state when native Riff schedule is stale', async () => {
    const database = await createSeededDatabase();
    await database.upsertCards([buildCard({
      id: 'card-existing',
      xiuyuanID: 'xy-existing',
      blockId: 'block-existing',
      due: 1_790_900_000_000,
      stability: 9.5,
      difficulty: 3.2,
      reps: 8,
      lapses: 1,
      state: CardState.Review,
      lastReview: 1_790_000_000_000,
      elapsedDays: 0,
      scheduledDays: 10,
      schedulerType: 'fsrs-v6',
      riffCardId: 'riff-existing',
      updatedAt: 1_790_000_000_100,
      meta: {
        templateID: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId: 'riff-existing',
      },
    })]);
    const readXiuyuanRiffFacts = vi.fn(async (request) => ({
      status: 'ready' as const,
      requestId: request.requestId,
      mode: request.mode,
      deckId: request.deckId,
      readAt: 1_800_000_000_000,
      blocks: [
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
      diagnostics: {
        source: 'renderer-host-effect' as const,
        blockCount: 1,
        normalizedBlockCount: 1,
        malformedBlockCount: 0,
        truncated: false,
      },
    }));
    const kernel = new BackendKernel({
      database,
      readXiuyuanRiffFacts,
    });

    const response = await kernel.handle({
      id: 'xiuyuan-sync-stale-native-schedule',
      jsonrpc: '2.0',
      method: 'xiuyuan.sync.execute',
      params: [{
        requestId: 'sync-request-stale-native-schedule',
        commandId: 'sync-command-stale-native-schedule',
        idempotencyKey: 'sync-key-stale-native-schedule',
        mode: 'incremental',
        dryRun: false,
        deckId: 'deck-a',
        requestedAt: 1_800_000_000_000,
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'applied',
      }),
    }));
    await expect(database.getCard('card-existing')).resolves.toMatchObject({
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
      meta: expect.objectContaining({
        ownership: 'riff-managed',
        source: 'riff-sync',
      }),
    });
  });

  it('replays duplicate non-dry-run sync commands by idempotency key without applying twice', async () => {
    const database = await createSeededDatabase();
    const readXiuyuanRiffFacts = vi.fn(async (request) => ({
      status: 'ready' as const,
      requestId: request.requestId,
      mode: request.mode,
      deckId: request.deckId,
      readAt: 1_700_000_000_100,
      blocks: [
        { id: 'block-existing', content: 'Existing duplicate-safe content', riffCardID: 'riff-existing' },
        { id: 'block-new', content: 'New duplicate-safe content', riffCardID: 'riff-new' },
      ],
      diagnostics: {
        source: 'renderer-host-effect' as const,
        blockCount: 2,
        normalizedBlockCount: 2,
        malformedBlockCount: 0,
        truncated: false,
      },
    }));
    const kernel = new BackendKernel({
      database,
      readXiuyuanRiffFacts,
    });
    const params = {
      requestId: 'sync-request-duplicate',
      commandId: 'sync-command-duplicate',
      idempotencyKey: 'sync-key-duplicate',
      mode: 'full' as const,
      dryRun: false,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    };

    const first = await kernel.handle({
      id: 'xiuyuan-sync-duplicate-1',
      jsonrpc: '2.0',
      method: 'xiuyuan.sync.execute',
      params: [params],
    });
    const second = await kernel.handle({
      id: 'xiuyuan-sync-duplicate-2',
      jsonrpc: '2.0',
      method: 'xiuyuan.sync.execute',
      params: [params],
    });

    expect(first).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'applied',
        idempotencyKey: 'sync-key-duplicate',
      }),
    }));
    expect(second).toEqual(expect.objectContaining({
      result: first.result,
    }));
    expect(readXiuyuanRiffFacts).toHaveBeenCalledTimes(1);
    expect(database.getOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM cards WHERE block_id = 'block-new'",
    )?.count).toBe(1);
  });
});
