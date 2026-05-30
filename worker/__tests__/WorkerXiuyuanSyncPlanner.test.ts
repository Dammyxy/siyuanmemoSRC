import { describe, expect, it, vi } from 'vitest';
import type {
  BackendXiuyuanRiffReadAuditResult,
  BackendXiuyuanSyncLocalFacts,
} from '../../packages/contracts/src/backend-rpc';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { WorkerXiuyuanSyncPlanner } from '../xiuyuan/WorkerXiuyuanSyncPlanner';

function localFacts(): BackendXiuyuanSyncLocalFacts {
  return {
    loadedAt: 1_700_000_000_000,
    xiuyuans: [
      {
        id: 'xy-existing',
        blockIds: ['block-existing'],
        representativeBlockId: 'block-existing',
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        updatedAt: 1,
      },
      {
        id: 'xy-gone',
        blockIds: ['block-gone'],
        representativeBlockId: 'block-gone',
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        updatedAt: 1,
      },
      {
        id: 'xy-owned',
        blockIds: ['block-owned'],
        representativeBlockId: 'block-owned',
        templateId: 'manual-basic',
        ownership: 'local-owned',
        source: 'manual',
        updatedAt: 1,
      },
    ],
    cards: [
      {
        id: 'card-existing',
        xiuyuanId: 'xy-existing',
        blockId: 'block-existing',
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        schedulerType: 'fsrs-v6',
        updatedAt: 1,
      },
      {
        id: 'card-gone',
        xiuyuanId: 'xy-gone',
        blockId: 'block-gone',
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
        schedulerType: 'fsrs-v6',
        updatedAt: 1,
      },
      {
        id: 'card-owned',
        xiuyuanId: 'xy-owned',
        blockId: 'block-owned',
        templateId: 'manual-basic',
        ownership: 'local-owned',
        source: 'manual',
        schedulerType: 'fsrs-v6',
        updatedAt: 1,
      },
    ],
  };
}

function nativeReady(): BackendXiuyuanRiffReadAuditResult {
  return {
    status: 'ready',
    requestId: 'riff-read-sync-command-1',
    mode: 'full',
    deckId: 'deck-a',
    readAt: 1_700_000_000_100,
    blocks: [
      { id: 'block-existing', content: 'Existing updated content' },
      { id: 'block-new', content: 'New native content' },
      { id: 'block-owned', content: 'Local owned native content' },
      { id: 'block-empty', content: '   ' },
    ],
    diagnostics: {
      source: 'renderer-host-effect',
      blockCount: 4,
      normalizedBlockCount: 3,
      malformedBlockCount: 1,
      truncated: false,
    },
  };
}

describe('WorkerXiuyuanSyncPlanner', () => {
  it('plans full dry-run sync from local DB facts and native Riff facts without applying writes', async () => {
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => localFacts()),
      readNativeRiffFacts: vi.fn(async () => nativeReady()),
    });

    const result = await planner.execute({
      requestId: 'sync-request-1',
      commandId: 'sync-command-1',
      idempotencyKey: 'sync-key-1',
      mode: 'full',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') {
      throw new Error('expected planned result');
    }
    expect(result.plan).toMatchObject({
      localXiuyuanCount: 3,
      localCardCount: 3,
      localManagedRiffCount: 2,
      nativeRiffCount: 4,
      normalizedNativeRiffCount: 3,
      malformedNativeRiffCount: 1,
      createCount: 1,
      updateCount: 1,
      deleteCount: 1,
      skippedLocalOwnedCount: 1,
      candidateBlockIds: {
        create: ['block-new'],
        update: ['block-existing'],
        delete: ['block-gone'],
        skippedLocalOwned: ['block-owned'],
      },
    });
    expect(result.applyImpact).toEqual({
      requested: false,
      applied: false,
      reason: 'dry-run',
      changed: {},
    });
    expect(JSON.stringify(result.plan)).not.toContain('New native content');
  });

  it('does not plan destructive deletes during incremental sync', async () => {
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => localFacts()),
      readNativeRiffFacts: vi.fn(async () => ({
        ...nativeReady(),
        mode: 'incremental' as const,
      })),
    });

    const result = await planner.execute({
      requestId: 'sync-request-2',
      commandId: 'sync-command-2',
      idempotencyKey: 'sync-key-2',
      mode: 'incremental',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') {
      throw new Error('expected planned result');
    }
    expect(result.plan.deleteCount).toBe(0);
    expect(result.plan.candidateBlockIds.delete).toEqual([]);
  });

  it('treats source=riff-sync on plugin-owned templates as origin metadata, not Riff ownership', async () => {
    const pluginOwnedFacts: BackendXiuyuanSyncLocalFacts = {
      loadedAt: 1_700_000_000_000,
      xiuyuans: [
        {
          id: 'xy-plugin-origin',
          blockIds: ['block-plugin-origin'],
          representativeBlockId: 'block-plugin-origin',
          templateId: 'builtin-concept-definition',
          ownership: null,
          source: 'riff-sync',
          updatedAt: 1,
        },
      ],
      cards: [
        {
          id: 'card-plugin-origin',
          xiuyuanId: 'xy-plugin-origin',
          blockId: 'block-plugin-origin',
          templateId: 'builtin-concept-definition',
          ownership: null,
          source: 'riff-sync',
          schedulerType: 'fsrs-v6',
          updatedAt: 1,
        },
      ],
    };
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => pluginOwnedFacts),
      readNativeRiffFacts: vi.fn(async () => ({
        ...nativeReady(),
        blocks: [
          { id: 'block-plugin-origin', content: 'Native Riff copy of plugin-owned block' },
        ],
        diagnostics: {
          ...nativeReady().diagnostics,
          blockCount: 1,
          normalizedBlockCount: 1,
          malformedBlockCount: 0,
        },
      })),
    });

    const result = await planner.execute({
      requestId: 'sync-request-plugin-origin',
      commandId: 'sync-command-plugin-origin',
      idempotencyKey: 'sync-key-plugin-origin',
      mode: 'full',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') {
      throw new Error('expected planned result');
    }
    expect(result.plan).toMatchObject({
      localManagedRiffCount: 0,
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      skippedLocalOwnedCount: 1,
      candidateBlockIds: {
        create: [],
        update: [],
        delete: [],
        skippedLocalOwned: ['block-plugin-origin'],
      },
    });
  });

  it('does not update or delete a mixed block that has plugin-owned cards and a Riff shadow card', async () => {
    const mixedBlockFacts: BackendXiuyuanSyncLocalFacts = {
      loadedAt: 1_700_000_000_000,
      xiuyuans: [
        {
          id: 'xy-mixed-plugin',
          blockIds: ['block-mixed'],
          representativeBlockId: 'block-mixed',
          templateId: 'builtin-concept-definition',
          ownership: null,
          source: 'riff-sync',
          updatedAt: 1,
        },
        {
          id: 'xy-mixed-riff',
          blockIds: ['block-mixed'],
          representativeBlockId: 'block-mixed',
          templateId: 'builtin-riff-sync',
          ownership: 'riff-managed',
          source: 'riff-sync',
          updatedAt: 1,
        },
      ],
      cards: [
        {
          id: 'card-mixed-plugin',
          xiuyuanId: 'xy-mixed-plugin',
          blockId: 'block-mixed',
          templateId: 'builtin-concept-definition',
          ownership: null,
          source: 'riff-sync',
          schedulerType: 'fsrs-v6',
          updatedAt: 1,
        },
        {
          id: 'card-mixed-riff',
          xiuyuanId: 'xy-mixed-riff',
          blockId: 'block-mixed',
          templateId: 'builtin-riff-sync',
          ownership: 'riff-managed',
          source: 'riff-sync',
          schedulerType: 'fsrs-v6',
          updatedAt: 1,
        },
      ],
    };
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => mixedBlockFacts),
      readNativeRiffFacts: vi.fn(async () => ({
        ...nativeReady(),
        blocks: [
          { id: 'block-mixed', content: 'Native Riff copy of mixed block' },
        ],
        diagnostics: {
          ...nativeReady().diagnostics,
          blockCount: 1,
          normalizedBlockCount: 1,
          malformedBlockCount: 0,
        },
      })),
    });

    const updateResult = await planner.execute({
      requestId: 'sync-request-mixed-update',
      commandId: 'sync-command-mixed-update',
      idempotencyKey: 'sync-key-mixed-update',
      mode: 'full',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(updateResult.status).toBe('planned');
    if (updateResult.status !== 'planned') {
      throw new Error('expected planned result');
    }
    expect(updateResult.plan).toMatchObject({
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      skippedLocalOwnedCount: 1,
      shadowAudit: {
        findingCount: 1,
        findings: [
          {
            blockId: 'block-mixed',
            pluginCardIds: ['card-mixed-plugin'],
            shadowCardIds: ['card-mixed-riff'],
            pluginXiuyuanIds: ['xy-mixed-plugin'],
            shadowXiuyuanIds: ['xy-mixed-riff'],
            proposedAction: 'audit-only-defer-hide-or-delete-policy',
          },
        ],
      },
      candidateBlockIds: {
        update: [],
        delete: [],
        skippedLocalOwned: ['block-mixed'],
      },
    });

    const deletePlanner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => mixedBlockFacts),
      readNativeRiffFacts: vi.fn(async () => ({
        ...nativeReady(),
        blocks: [],
        diagnostics: {
          ...nativeReady().diagnostics,
          blockCount: 0,
          normalizedBlockCount: 0,
          malformedBlockCount: 0,
        },
      })),
    });
    const deleteResult = await deletePlanner.execute({
      requestId: 'sync-request-mixed-delete',
      commandId: 'sync-command-mixed-delete',
      idempotencyKey: 'sync-key-mixed-delete',
      mode: 'full',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(deleteResult.status).toBe('planned');
    if (deleteResult.status !== 'planned') {
      throw new Error('expected planned result');
    }
    expect(deleteResult.plan.deleteCount).toBe(0);
    expect(deleteResult.plan.candidateBlockIds.delete).toEqual([]);
    expect(deleteResult.plan.shadowAudit).toMatchObject({
      findingCount: 1,
      findings: [
        {
          blockId: 'block-mixed',
          proposedAction: 'audit-only-defer-hide-or-delete-policy',
        },
      ],
    });
  });

  it('returns typed unavailable when the native Riff read proxy is absent', async () => {
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => localFacts()),
    });

    const result = await planner.execute({
      requestId: 'sync-request-unavailable',
      commandId: 'sync-command-unavailable',
      idempotencyKey: 'sync-key-unavailable',
      mode: 'audit',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableClass: 'KERNEL_SIDECAR_UNAVAILABLE',
      recoverable: true,
      progress: {
        state: 'unavailable',
        currentStep: 'read-native-riff-facts',
      },
    });
  });

  it('returns typed unavailable when apply authority is missing for non-dry-run sync', async () => {
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => localFacts()),
      readNativeRiffFacts: vi.fn(async () => nativeReady()),
    });

    const result = await planner.execute({
      requestId: 'sync-request-missing-writer',
      commandId: 'sync-command-missing-writer',
      idempotencyKey: 'sync-key-missing-writer',
      mode: 'full',
      dryRun: false,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableClass: 'BACKEND_UNAVAILABLE',
      reason: 'Xiuyuan sync apply authority unavailable',
      progress: {
        state: 'unavailable',
        currentStep: 'apply-sync-plan',
      },
      applyImpact: {
        requested: true,
        applied: false,
        reason: 'read-unavailable',
      },
    });
  });

  it('returns typed unavailable when apply authority fails mid-commit', async () => {
    const planner = new WorkerXiuyuanSyncPlanner({
      loadLocalFacts: vi.fn(async () => localFacts()),
      readNativeRiffFacts: vi.fn(async () => nativeReady()),
      applySyncPlan: vi.fn(async () => {
        throw new Error('apply failed');
      }),
    });

    const result = await planner.execute({
      requestId: 'sync-request-rollback',
      commandId: 'sync-command-rollback',
      idempotencyKey: 'sync-key-rollback',
      mode: 'full',
      dryRun: false,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableClass: 'FAILED',
      reason: 'apply failed',
      progress: {
        state: 'unavailable',
        currentStep: 'apply-sync-plan',
      },
      applyImpact: {
        requested: true,
        applied: false,
        reason: 'read-unavailable',
      },
    });
  });
});

describe('WorkerSqliteDatabaseService Xiuyuan sync local facts', () => {
  it('reads active Xiuyuan and card sync facts from siyuanmemo.db', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    const now = 1_700_000_000_000;

    database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
      'xy-riff',
      now,
      JSON.stringify({
        id: 'xy-riff',
        blockIDs: ['block-riff'],
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
        'card-riff',
        'block-riff',
        'xy-riff',
        'fsrs-v6',
        now,
        JSON.stringify({
          id: 'card-riff',
          blockId: 'block-riff',
          xiuyuanID: 'xy-riff',
          riffCardId: 'riff-card-riff',
          meta: {
            templateID: 'builtin-riff-sync',
            ownership: 'riff-managed',
            source: 'riff-sync',
          },
        }),
        null,
      ],
    );

    const facts = await database.readXiuyuanSyncLocalFacts();

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
        schedulerType: 'fsrs-v6',
      }),
    ]);
  });

  it('preserves same-block plugin-owned cards and builtin Riff shadow cards for audit', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    const now = 1_700_000_000_000;

    database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
      'xy-plugin',
      now,
      JSON.stringify({
        id: 'xy-plugin',
        blockIDs: ['block-mixed'],
        templateID: 'builtin-concept-definition',
        meta: {
          source: 'riff-sync',
        },
      }),
    ]);
    database.run('INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)', [
      'xy-shadow',
      now,
      JSON.stringify({
        id: 'xy-shadow',
        blockIDs: ['block-mixed'],
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
        'card-plugin',
        'block-mixed',
        'xy-plugin',
        'fsrs-v6',
        now,
        JSON.stringify({
          id: 'card-plugin',
          blockId: 'block-mixed',
          xiuyuanID: 'xy-plugin',
          meta: {
            templateID: 'builtin-concept-definition',
            source: 'riff-sync',
          },
        }),
        null,
      ],
    );
    database.run(
      `INSERT INTO cards (id, block_id, xiuyuan_id, scheduler_type, updated_at, payload_json, dto_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'card-shadow',
        'block-mixed',
        'xy-shadow',
        'fsrs-v6',
        now,
        JSON.stringify({
          id: 'card-shadow',
          blockId: 'block-mixed',
          xiuyuanID: 'xy-shadow',
          riffCardId: 'riff-card-shadow',
          meta: {
            templateID: 'builtin-riff-sync',
            ownership: 'riff-managed',
            source: 'riff-sync',
          },
        }),
        null,
      ],
    );

    const facts = await database.readXiuyuanSyncLocalFacts();

    expect(facts.xiuyuans).toEqual([
      expect.objectContaining({
        id: 'xy-plugin',
        blockIds: ['block-mixed'],
        templateId: 'builtin-concept-definition',
        ownership: null,
        source: 'riff-sync',
      }),
      expect.objectContaining({
        id: 'xy-shadow',
        blockIds: ['block-mixed'],
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
      }),
    ]);
    expect(facts.cards).toEqual([
      expect.objectContaining({
        id: 'card-plugin',
        blockId: 'block-mixed',
        xiuyuanId: 'xy-plugin',
        templateId: 'builtin-concept-definition',
        ownership: null,
        source: 'riff-sync',
      }),
      expect.objectContaining({
        id: 'card-shadow',
        blockId: 'block-mixed',
        xiuyuanId: 'xy-shadow',
        riffCardId: 'riff-card-shadow',
        templateId: 'builtin-riff-sync',
        ownership: 'riff-managed',
        source: 'riff-sync',
      }),
    ]);
  });
});
