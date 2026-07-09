import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { CardTypeDetectionService } from '@/core/xiuyuan/domain/services/CardTypeDetectionService';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import type { XiuyuanSyncSiyuanPort } from '@/application/ports/XiuyuanSyncSiyuanPort';
import { KernelCompanionBackgroundWorkRegistry } from '@/application/backgroundWork/KernelCompanionBackgroundWorkRegistry';
import { XiuyuanSyncService } from '../XiuyuanSyncService';
import type { HybridSyncConfig } from '../XiuyuanSyncService.types';
import type { RiffBlacklistService } from '../RiffBlacklistService';

async function settleBackgroundWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createBackendExecuteResult(input: {
  mode?: 'full' | 'incremental';
  commandId?: string;
  createCount?: number;
  updateCount?: number;
  deleteCount?: number;
  skippedLocalOwnedCount?: number;
  changedBlockIds?: string[];
  changedCardIds?: string[];
} = {}) {
  const mode = input.mode ?? 'incremental';
  const commandId = input.commandId ?? `cmd-${mode}`;
  return {
    status: 'applied' as const,
    commandId,
    idempotencyKey: `key-${commandId}`,
    mode,
    dryRun: false,
    progress: {
      state: 'succeeded' as const,
      currentStep: 'applied',
      completedUnits: 4,
      totalUnits: 4,
      updatedAt: 1_700_000_000_000,
    },
    plan: {
      localXiuyuanCount: 0,
      localCardCount: 0,
      localManagedRiffCount: 0,
      nativeRiffCount: 0,
      normalizedNativeRiffCount: 0,
      malformedNativeRiffCount: 0,
      duplicateNativeRiffCount: 0,
      createCount: input.createCount ?? 0,
      updateCount: input.updateCount ?? 0,
      deleteCount: input.deleteCount ?? 0,
      skippedLocalOwnedCount: input.skippedLocalOwnedCount ?? 0,
      candidateBlockIds: {
        create: [],
        update: input.changedBlockIds ?? [],
        delete: [],
        skippedLocalOwned: [],
      },
    },
    applyImpact: {
      requested: true,
      applied: true,
      reason: 'applied',
      changed: {
        blockIds: input.changedBlockIds ?? [],
        cardIds: input.changedCardIds ?? [],
      },
    },
    diagnostics: {
      diagnosticEventId: `xiuyuan-sync:${commandId}`,
      readSource: 'renderer-host-effect' as const,
      timingMs: 1,
      errorCategory: null,
    },
  };
}

function createConfig(): HybridSyncConfig {
  return {
    deckId: 'deck-backend',
    storage: null,
    incrementalSync: {
      enabled: true,
      triggers: ['plugin-start'],
      useBlacklist: false,
      autoDetectCardType: false,
    },
    fullSync: {
      enabled: true,
      interval: 1,
      cleanupBlacklist: true,
    },
    deleteSync: {
      enabled: false,
      useBlacklistFallback: false,
    },
  };
}

function createRepository(): IXiuyuanRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(async () => ({ ok: true, value: null })),
    findByBlockId: vi.fn(async () => ({ ok: true, value: [] })),
    findAll: vi.fn(async () => ({ ok: true, value: [] })),
    delete: vi.fn(),
    saveMany: vi.fn(),
    deleteMany: vi.fn(),
    applySyncChangeSet: vi.fn(async () => ({
      ok: true,
      value: {
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        blacklistCleanedCount: 0,
        checkpointApplied: false,
      },
    })),
    getXiuyuanIdByCardId: vi.fn(() => undefined),
  } as unknown as IXiuyuanRepository;
}

function createSiyuanApi(): XiuyuanSyncSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'deck-backend',
    ATTR_CARD_TYPE: 'custom-fsrs-card-type',
    getRiffCards: vi.fn(async () => []),
    getRiffNewCards: vi.fn(async () => []),
    removeRiffCards: vi.fn(async () => undefined),
    setBlockAttrs: vi.fn(async () => undefined),
    getBlockAttrs: vi.fn(async () => ({})),
  };
}

function createService(input: {
  executeXiuyuanSync: ReturnType<typeof vi.fn>;
  repository: IXiuyuanRepository;
  config?: HybridSyncConfig;
  backgroundWorkRegistry?: KernelCompanionBackgroundWorkRegistry;
}): XiuyuanSyncService {
  return new (XiuyuanSyncService as unknown as new (...args: unknown[]) => XiuyuanSyncService)(
    input.config ?? createConfig(),
    new EventBus(),
    input.repository,
    {
      filterBlacklist: vi.fn(async (cards) => cards),
      getBlacklist: vi.fn(async () => new Set<string>()),
      cleanupBlacklist: vi.fn(async () => 0),
    } as unknown as RiffBlacklistService,
    {
      detectCardType: vi.fn(async () => 'topic'),
      batchDetectCardTypes: vi.fn(async () => new Map()),
    } as unknown as CardTypeDetectionService,
    {
      isRecentlyDeleted: vi.fn(() => false),
    } as unknown as IDeletionTracker,
    createSiyuanApi(),
    {
      executeXiuyuanSync: input.executeXiuyuanSync,
    },
    input.backgroundWorkRegistry,
  );
}

describe('XiuyuanSyncService backend command facade', () => {
  it('routes incremental sync through backend xiuyuan.sync.execute without local apply fallback', async () => {
    const repository = createRepository();
    const executeXiuyuanSync = vi.fn(async () => ({
      status: 'applied',
      commandId: 'cmd-incremental',
      idempotencyKey: 'key-incremental',
      mode: 'incremental',
      dryRun: false,
      progress: {
        state: 'succeeded',
        currentStep: 'applied',
        completedUnits: 4,
        totalUnits: 4,
        updatedAt: 1_700_000_000_000,
      },
      plan: {
        localXiuyuanCount: 0,
        localCardCount: 0,
        localManagedRiffCount: 0,
        nativeRiffCount: 3,
        normalizedNativeRiffCount: 3,
        malformedNativeRiffCount: 0,
        duplicateNativeRiffCount: 0,
        createCount: 1,
        updateCount: 2,
        deleteCount: 0,
        skippedLocalOwnedCount: 4,
        candidateBlockIds: {
          create: ['block-new'],
          update: ['block-existing-1', 'block-existing-2'],
          delete: [],
          skippedLocalOwned: ['block-owned-1', 'block-owned-2', 'block-owned-3', 'block-owned-4'],
        },
      },
      applyImpact: {
        requested: true,
        applied: true,
        reason: 'applied',
        changed: {
          blockIds: ['block-new', 'block-existing-1', 'block-existing-2'],
          cardIds: ['card-new', 'card-existing-1', 'card-existing-2'],
        },
      },
      diagnostics: {
        diagnosticEventId: 'xiuyuan-sync:cmd-incremental',
        readSource: 'renderer-host-effect',
        timingMs: 1,
        errorCategory: null,
      },
    }));
    const service = createService({ executeXiuyuanSync, repository });

    const progress = vi.fn();
    const result = await service.incrementalSync(progress, { source: 'manual' });

    expect(executeXiuyuanSync).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'incremental',
      dryRun: false,
      deckId: 'deck-backend',
      caller: expect.objectContaining({
        surface: 'background',
      }),
    }));
    expect(repository.applySyncChangeSet).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      addedCount: 1,
      updatedCount: 2,
      deletedCount: 0,
      skippedCount: 4,
    });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'saving',
      current: 4,
      total: 4,
    }));
  });

  it('reports backend sync updatedCount from actual changed update candidates', async () => {
    const repository = createRepository();
    const executeXiuyuanSync = vi.fn(async () => ({
      status: 'applied',
      commandId: 'cmd-full',
      idempotencyKey: 'key-full',
      mode: 'full',
      dryRun: false,
      progress: {
        state: 'succeeded',
        currentStep: 'applied',
        completedUnits: 4,
        totalUnits: 4,
        updatedAt: 1_700_000_000_000,
      },
      plan: {
        localXiuyuanCount: 2,
        localCardCount: 2,
        localManagedRiffCount: 2,
        nativeRiffCount: 2,
        normalizedNativeRiffCount: 2,
        malformedNativeRiffCount: 0,
        duplicateNativeRiffCount: 0,
        createCount: 0,
        updateCount: 2,
        deleteCount: 0,
        skippedLocalOwnedCount: 0,
        candidateBlockIds: {
          create: [],
          update: ['block-changed', 'block-noop'],
          delete: [],
          skippedLocalOwned: [],
        },
      },
      applyImpact: {
        requested: true,
        applied: true,
        reason: 'applied',
        changed: {
          blockIds: ['block-changed'],
          cardIds: ['card-changed'],
        },
      },
      diagnostics: {
        diagnosticEventId: 'xiuyuan-sync:cmd-full',
        readSource: 'renderer-host-effect',
        timingMs: 1,
        errorCategory: null,
      },
    }));
    const service = createService({ executeXiuyuanSync, repository });

    const result = await service.fullSync();

    expect(result.updatedCount).toBe(1);
  });

  it('surfaces backend unavailable as sync error without local full-sync fallback', async () => {
    const repository = createRepository();
    const executeXiuyuanSync = vi.fn(async () => ({
      status: 'unavailable',
      commandId: 'cmd-full',
      idempotencyKey: 'key-full',
      mode: 'full',
      dryRun: false,
      unavailableClass: 'BACKEND_UNAVAILABLE',
      reason: 'worker stopped',
      recoverable: true,
      progress: {
        state: 'unavailable',
        currentStep: 'apply-sync-plan',
        completedUnits: 1,
        totalUnits: 4,
        updatedAt: 1_700_000_000_000,
      },
      applyImpact: {
        requested: true,
        applied: false,
        reason: 'read-unavailable',
        changed: {},
      },
      diagnostics: {
        diagnosticEventId: 'xiuyuan-sync:cmd-full',
        readSource: 'none',
        timingMs: 1,
        errorCategory: 'BACKEND_UNAVAILABLE',
      },
    }));
    const service = createService({ executeXiuyuanSync, repository });

    await expect(service.fullSync()).rejects.toThrow('BACKEND_UNAVAILABLE: worker stopped');
    expect(repository.applySyncChangeSet).not.toHaveBeenCalled();
  });

  it('does not block plugin startup when due backend full sync has not completed', async () => {
    const repository = createRepository();
    let rejectSync: (error: Error) => void = () => undefined;
    const executeXiuyuanSync = vi.fn(() => new Promise((_resolve, reject) => {
      rejectSync = reject;
    }));
    const service = createService({ executeXiuyuanSync, repository });

    const startup = service.start().then(() => 'started');
    const result = await Promise.race([
      startup,
      new Promise((resolve) => {
        setTimeout(() => resolve('blocked'), 50);
      }),
    ]);

    expect(result).toBe('started');
    await vi.waitFor(() => expect(executeXiuyuanSync).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'full',
      dryRun: false,
    })));
    rejectSync(new Error('BACKEND_UNAVAILABLE: backend worker request timed out after 30000ms'));
    await Promise.resolve();
    await Promise.resolve();
    expect(repository.applySyncChangeSet).not.toHaveBeenCalled();
  });

  it('submits due startup full sync through the background work registry', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const repository = createRepository();
    const executeXiuyuanSync = vi.fn(async () => createBackendExecuteResult({
      mode: 'full',
      commandId: 'cmd-startup-full',
      createCount: 2,
      changedBlockIds: ['block-a', 'block-b'],
      changedCardIds: ['card-a', 'card-b'],
    }));
    const service = createService({
      executeXiuyuanSync,
      repository,
      backgroundWorkRegistry: registry,
    });

    await service.start();

    const startupJobId = service.getStartupSyncJobId();
    expect(startupJobId).toMatch(/^xiuyuan-startup-sync-/);
    expect(registry.status(startupJobId!)).toMatchObject({
      kind: 'xiuyuan-startup-sync',
      state: 'accepted',
      diagnostics: {
        reason: 'plugin-start',
        syncType: 'full',
        source: 'startup',
        status: 'submitted',
      },
    });
    expect(executeXiuyuanSync).not.toHaveBeenCalled();

    scheduled[0]?.();
    await vi.waitFor(() => expect(registry.status(startupJobId!)).toMatchObject({
      state: 'completed',
      diagnostics: {
        status: 'completed',
        latestCompletedPhase: 'checkpoint',
        addedCount: 2,
      },
    }));
    expect(executeXiuyuanSync).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'full',
      dryRun: false,
    }));
  });

  it('submits startup incremental sync through the registry with idle checkpoint persistence disabled', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const repository = createRepository();
    const config = createConfig();
    config.fullSync.enabled = false;
    const executeXiuyuanSync = vi.fn(async () => createBackendExecuteResult({
      mode: 'incremental',
      commandId: 'cmd-startup-incremental-registry',
    }));
    const service = createService({
      executeXiuyuanSync,
      repository,
      config,
      backgroundWorkRegistry: registry,
    });

    await service.start();

    const startupJobId = service.getStartupSyncJobId();
    expect(registry.status(startupJobId!)).toMatchObject({
      kind: 'xiuyuan-startup-sync',
      state: 'accepted',
      diagnostics: {
        syncType: 'incremental',
        source: 'startup',
        persistIdleCheckpoint: false,
      },
    });

    scheduled[0]?.();
    await vi.waitFor(() => expect(executeXiuyuanSync).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'incremental',
      dryRun: false,
      persistIdleCheckpoint: false,
    })));
    await vi.waitFor(() => expect(registry.status(startupJobId!)).toMatchObject({
      state: 'completed',
      diagnostics: {
        status: 'completed',
        latestCompletedPhase: 'checkpoint',
      },
    }));
  });

  it('registry shutdown defers accepted startup sync before backend work runs', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const repository = createRepository();
    const executeXiuyuanSync = vi.fn(async () => createBackendExecuteResult({ mode: 'full' }));
    const service = createService({
      executeXiuyuanSync,
      repository,
      backgroundWorkRegistry: registry,
    });

    await service.start();
    const startupJobId = service.getStartupSyncJobId();
    registry.shutdown('plugin-unload');
    scheduled[0]?.();
    await settleBackgroundWork();

    expect(executeXiuyuanSync).not.toHaveBeenCalled();
    expect(registry.status(startupJobId!)).toMatchObject({
      state: 'deferred',
      reason: 'plugin-unload',
      attemptCount: 0,
    });
  });

  it('stop cancels running startup sync and late backend results do not complete the registry job', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const repository = createRepository();
    let finishSync: (value: unknown) => void = () => undefined;
    const executeXiuyuanSync = vi.fn(() => new Promise((resolve) => {
      finishSync = resolve;
    }));
    const service = createService({
      executeXiuyuanSync,
      repository,
      backgroundWorkRegistry: registry,
    });

    await service.start();
    const startupJobId = service.getStartupSyncJobId();
    scheduled[0]?.();
    await settleBackgroundWork();
    expect(registry.status(startupJobId!)).toMatchObject({
      state: 'running',
      attemptCount: 1,
    });

    service.stop();
    expect(registry.status(startupJobId!)).toMatchObject({
      state: 'canceled',
      reason: 'xiuyuan-sync-service-stop',
    });

    finishSync(createBackendExecuteResult({ mode: 'full', createCount: 1 }));
    await settleBackgroundWork();
    expect(registry.status(startupJobId!)).toMatchObject({
      state: 'canceled',
      diagnostics: {
        status: 'submitted',
      },
    });
  });

  it('marks startup incremental backend sync as non-persistent when idle', async () => {
    const repository = createRepository();
    const config = createConfig();
    config.fullSync.enabled = false;
    const executeXiuyuanSync = vi.fn(async () => ({
      status: 'applied',
      commandId: 'cmd-startup-incremental',
      idempotencyKey: 'key-startup-incremental',
      mode: 'incremental',
      dryRun: false,
      progress: {
        state: 'succeeded',
        currentStep: 'applied',
        completedUnits: 4,
        totalUnits: 4,
        updatedAt: 1_700_000_000_000,
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
        candidateBlockIds: {
          create: [],
          update: [],
          delete: [],
          skippedLocalOwned: [],
        },
      },
      applyImpact: {
        requested: true,
        applied: true,
        reason: 'applied',
        changed: {
          blockIds: [],
          cardIds: [],
        },
      },
      diagnostics: {
        diagnosticEventId: 'xiuyuan-sync:cmd-startup-incremental',
        readSource: 'renderer-host-effect',
        timingMs: 1,
        errorCategory: null,
      },
    }));
    const service = createService({ executeXiuyuanSync, repository, config });

    await service.start();

    await vi.waitFor(() => expect(executeXiuyuanSync).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'incremental',
      dryRun: false,
      persistIdleCheckpoint: false,
    })));
    expect(repository.applySyncChangeSet).not.toHaveBeenCalled();
  });

  it('passes scoped block IDs through native Riff upsert backend sync requests', async () => {
    const repository = createRepository();
    const executeXiuyuanSync = vi.fn(async () => ({
      status: 'applied',
      commandId: 'cmd-scoped-upsert',
      idempotencyKey: 'key-scoped-upsert',
      mode: 'incremental',
      dryRun: false,
      progress: {
        state: 'succeeded',
        currentStep: 'applied',
        completedUnits: 4,
        totalUnits: 4,
        updatedAt: 1_700_000_000_000,
      },
      plan: {
        localXiuyuanCount: 0,
        localCardCount: 0,
        localManagedRiffCount: 0,
        nativeRiffCount: 2,
        normalizedNativeRiffCount: 2,
        malformedNativeRiffCount: 0,
        duplicateNativeRiffCount: 0,
        createCount: 2,
        updateCount: 0,
        deleteCount: 0,
        skippedLocalOwnedCount: 0,
        candidateBlockIds: {
          create: ['block-a', 'block-b'],
          update: [],
          delete: [],
          skippedLocalOwned: [],
        },
      },
      applyImpact: {
        requested: true,
        applied: true,
        reason: 'applied',
        changed: {
          blockIds: ['block-a', 'block-b'],
          cardIds: ['card-a', 'card-b'],
        },
      },
      diagnostics: {
        diagnosticEventId: 'xiuyuan-sync:cmd-scoped-upsert',
        readSource: 'renderer-host-effect',
        timingMs: 1,
        errorCategory: null,
      },
    }));
    const service = createService({ executeXiuyuanSync, repository });

    await service.handleNativeRiffUpsert([' block-a ', 'block-a', 'block-b']);

    expect(executeXiuyuanSync).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'incremental',
      scope: expect.objectContaining({
        blockIds: ['block-a', 'block-b'],
      }),
      persistIdleCheckpoint: false,
    }));
  });
});
