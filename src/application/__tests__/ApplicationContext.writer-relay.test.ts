import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import { executeWriterRelayCommand } from '../commands/writerRelayCommandDispatcher';

function readApplicationContextSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/ApplicationContext.ts'), 'utf8');
}

describe('ApplicationContext writer relay command dispatch', () => {
  it('keeps writer relay dispatch outside ApplicationContext composition root', () => {
    const source = readApplicationContextSource();

    expect(source).toContain("from '@/application/commands/writerRelayCommandDispatcher'");
    expect(source).not.toContain('private static async executeWriterRelayCommand');
    expect(source).not.toContain('unsupported writer relay method');
  });

  it('does not enable kernel transaction ingest listener when only review source refresh needs ws-main', () => {
    expect((ApplicationContext as unknown as {
      shouldEnableKernelTransactionIngestListener: (input: {
        kernelTransactionIngestAvailable: boolean;
        quickCardEnabled: boolean;
      }) => boolean;
    }).shouldEnableKernelTransactionIngestListener({
      kernelTransactionIngestAvailable: true,
      quickCardEnabled: false,
    })).toBe(false);

    expect((ApplicationContext as unknown as {
      shouldEnableKernelTransactionIngestListener: (input: {
        kernelTransactionIngestAvailable: boolean;
        quickCardEnabled: boolean;
      }) => boolean;
    }).shouldEnableKernelTransactionIngestListener({
      kernelTransactionIngestAvailable: true,
      quickCardEnabled: true,
    })).toBe(true);
  });

  it('limits kernel transaction ingest actions to AutoCard only', () => {
    expect((ApplicationContext as unknown as {
      resolveKernelTransactionIngestActionTypes: (input: {
        quickCardEnabled: boolean;
      }) => string[];
    }).resolveKernelTransactionIngestActionTypes({
      quickCardEnabled: false,
    })).toEqual([]);

    expect((ApplicationContext as unknown as {
      resolveKernelTransactionIngestActionTypes: (input: {
        quickCardEnabled: boolean;
      }) => string[];
    }).resolveKernelTransactionIngestActionTypes({
      quickCardEnabled: true,
    })).toEqual(['auto-card-candidates']);
  });

  it('contains no Native Riff transaction action routing', () => {
    const source = readApplicationContextSource();

    expect(source).not.toContain('shouldEnableNativeRiffCompatibilitySync');
    expect(source).not.toContain('resolveNativeRiffCompatibilitySyncOwner');
    expect(source).not.toContain("'native-riff-remove', 'native-riff-upsert'");
  });

  it('contains no Native Riff delete event bridge', () => {
    const source = readApplicationContextSource();

    expect(source).not.toContain('RiffSyncEventHandler');
    expect(source).not.toContain('shouldEnableNativeRiffDeleteCompatibilitySync');
  });

  it('keeps the default writer lease TTL when no override env is configured', () => {
    const key = 'VITE_SIYUANMEMO_KERNEL_WRITER_LEASE_TTL_MS';
    const previous = process.env[key];
    delete process.env[key];
    try {
      expect((ApplicationContext as unknown as {
        resolveKernelWriterLeaseTtlMs: () => number | undefined;
      }).resolveKernelWriterLeaseTtlMs()).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('ignores blank writer lease TTL env instead of clamping it to the minimum', () => {
    const key = 'VITE_SIYUANMEMO_KERNEL_WRITER_LEASE_TTL_MS';
    const previous = process.env[key];
    process.env[key] = '';
    try {
      expect((ApplicationContext as unknown as {
        resolveKernelWriterLeaseTtlMs: () => number | undefined;
      }).resolveKernelWriterLeaseTtlMs()).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('uses an explicit writer lease TTL env when configured', () => {
    const key = 'VITE_SIYUANMEMO_KERNEL_WRITER_LEASE_TTL_MS';
    const previous = process.env[key];
    process.env[key] = '9000';
    try {
      expect((ApplicationContext as unknown as {
        resolveKernelWriterLeaseTtlMs: () => number | undefined;
      }).resolveKernelWriterLeaseTtlMs()).toBe(9_000);
    } finally {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('wakes kernel action pump after relayed kernel transaction ingest succeeds', async () => {
    const onKernelTransactionIngested = vi.fn();
    const ingestKernelTransactions = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: 1,
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
    const client = {
      ingestKernelTransactions,
    } as unknown as {
      ingestKernelTransactions: (request: unknown) => Promise<unknown>;
    };

    await executeWriterRelayCommand(client, {
      method: 'kernel.transaction.ingest',
      params: {
        source: 'ws-main',
        transactions: [],
        receivedAt: 1,
        idempotencyKey: 'ingest-1',
      },
    }, { onKernelTransactionIngested });

    expect(ingestKernelTransactions).toHaveBeenCalledTimes(1);
    expect(onKernelTransactionIngested).toHaveBeenCalledTimes(1);
  });

  it('dispatches domainSync.status to backend client', async () => {
    const domainSyncStatus = vi.fn(async () => ({
      ok: true,
      sanity: { status: 'clean' },
    }));
    const client = {
      domainSyncStatus,
    } as unknown as {
      domainSyncStatus: (request: unknown) => Promise<unknown>;
    };
    const request = {
      context: 'snapshot-preflight',
      cardId: 'card-domain-status',
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'domainSync.status',
      params: request,
    });

    expect(domainSyncStatus).toHaveBeenCalledWith(request);
    expect(result).toMatchObject({
      ok: true,
      sanity: { status: 'clean' },
    });
  });

  it('dispatches domainSync.repair.preview to backend client', async () => {
    const domainSyncRepairPreview = vi.fn(async () => ({
      ok: true,
      planId: 'writer-plan',
      status: 'preview',
    }));
    const client = {
      domainSyncRepairPreview,
    } as unknown as {
      domainSyncRepairPreview: (request: unknown) => Promise<unknown>;
    };
    const request = {
      cardIds: ['card-domain-preview'],
      includeUnrepairable: true,
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'domainSync.repair.preview',
      params: request,
    });

    expect(domainSyncRepairPreview).toHaveBeenCalledWith(request);
    expect(result).toMatchObject({
      ok: true,
      planId: 'writer-plan',
    });
  });

  it('dispatches domainSync.conflictSources.cleanupCandidates to backend client', async () => {
    const domainSyncConflictSourceCleanupCandidates = vi.fn(async () => ({
      ok: true,
      sanityStatus: 'clean',
      candidates: [],
    }));
    const client = {
      domainSyncConflictSourceCleanupCandidates,
    } as unknown as {
      domainSyncConflictSourceCleanupCandidates: () => Promise<unknown>;
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'domainSync.conflictSources.cleanupCandidates',
      params: {},
    });

    expect(domainSyncConflictSourceCleanupCandidates).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      candidates: [],
    });
  });

  it('dispatches autocard.decision.resolve to backend client', async () => {
    const resolveAutoCardDecision = vi.fn(async () => ({
      candidateId: 'candidate-1',
      decisionEventId: 'decision-1',
      status: 'selected',
      unavailableClass: null,
      matchedRuleIds: ['BasicDirectionRule'],
      enabledDecisions: [],
      filteredDecisions: [],
      selectedDecision: null,
      conflicted: false,
      strategyUsed: 'semantic-first',
      markOnlyClozeCandidate: false,
      shouldUseTopicDerivation: false,
    }));
    const client = {
      resolveAutoCardDecision,
    } as unknown as {
      resolveAutoCardDecision: (request: unknown) => Promise<unknown>;
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'autocard.decision.resolve',
      params: {
        blockId: 'block-1',
        content: 'Alpha <> Beta',
        source: 'symbol-listener',
      },
    });

    expect(resolveAutoCardDecision).toHaveBeenCalledTimes(1);
    expect(resolveAutoCardDecision).toHaveBeenCalledWith({
      blockId: 'block-1',
      content: 'Alpha <> Beta',
      source: 'symbol-listener',
    });
    expect(result).toMatchObject({
      candidateId: 'candidate-1',
      decisionEventId: 'decision-1',
      status: 'selected',
    });
  });

  it('dispatches autocard.execute to backend client', async () => {
    const executeAutoCard = vi.fn(async () => ({
      executed: true,
      created: 1,
      skipped: 0,
    }));
    const client = {
      executeAutoCard,
    } as unknown as {
      executeAutoCard: (request: unknown) => Promise<unknown>;
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'autocard.execute',
      params: {
        envelope: {
          kind: 'planner-decision',
          blockId: 'block-1',
          content: 'Alpha <> Beta',
          decision: {
            id: 'BasicDirectionRule',
            family: 'basic',
            templateId: 'builtin-bidirectional-single',
            cardType: 'item',
            mode: 'multi-face',
            executorKind: 'quick-basic',
            priority: 50,
            direction: 'both',
          },
          source: 'symbol-listener',
        },
      },
    });

    expect(executeAutoCard).toHaveBeenCalledTimes(1);
    expect(executeAutoCard).toHaveBeenCalledWith({
      envelope: expect.objectContaining({
        kind: 'planner-decision',
        blockId: 'block-1',
      }),
    });
    expect(result).toEqual({
      executed: true,
      created: 1,
      skipped: 0,
    });
  });

  it('rejects autocard.execute relay when params is not an object', async () => {
    const client = {
      executeAutoCard: vi.fn(),
    };

    await expect(executeWriterRelayCommand(client, {
      method: 'autocard.execute',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: autocard.execute relay requires params object');
    expect(client.executeAutoCard).not.toHaveBeenCalled();
  });

  it('rejects autocard.decision.resolve relay when params is not an object', async () => {
    const client = {
      resolveAutoCardDecision: vi.fn(),
    };

    await expect(executeWriterRelayCommand(client, {
      method: 'autocard.decision.resolve',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: autocard.decision.resolve relay requires params object');
    expect(client.resolveAutoCardDecision).not.toHaveBeenCalled();
  });

  it('dispatches private.command.execute to backend client', async () => {
    const privateCommand = vi.fn(async () => ({
      ok: true,
      commandId: 'private-cmd-1',
      writerInstanceId: 'writer-1',
      changed: {},
      result: { committed: true },
      auditStatus: 'recorded',
      diagnosticEventId: 'diag-1',
    }));
    const client = {
      privateCommand,
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'private.command.execute',
      params: {
        requestId: 'req-1',
        method: 'private.command.execute',
        callerIntent: 'test',
        idempotencyKey: 'idempotency-1',
        params: { action: 'noop' },
      },
    });

    expect(privateCommand).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      commandId: 'private-cmd-1',
    });
  });

  it('dispatches semantic.command.execute to backend client', async () => {
    const semanticCommand = vi.fn(async () => ({
      status: 'ok',
      commandId: 'semantic-cmd-1',
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['semantic-session-1'] },
      diagnosticEventId: 'diag-semantic-1',
    }));
    const client = {
      semanticCommand,
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'semantic.command.execute',
      params: {
        requestId: 'semantic-req-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-key-1',
        command: { type: 'start-session', rootFocusNodeId: 'node-root' },
      },
    });

    expect(semanticCommand).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'ok',
      commandId: 'semantic-cmd-1',
    });
  });

  it('dispatches card.schedule.batchUpdate to the writer backend client', async () => {
    const cardScheduleBatchUpdate = vi.fn(async () => ({
      updatedCardIds: ['card-relay-1'],
    }));
    const client = {
      cardScheduleBatchUpdate,
    } as unknown as {
      cardScheduleBatchUpdate: (request: unknown) => Promise<unknown>;
    };
    const request = {
      mutationId: 'card-schedule:relay-1',
      schedulingWriteSource: 'manual-reschedule',
      cards: [{
        id: 'card-relay-1',
        due: 1_786_000_000_000,
      }],
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'card.schedule.batchUpdate',
      params: request,
    });

    expect(cardScheduleBatchUpdate).toHaveBeenCalledWith(request);
    expect(result).toEqual({
      updatedCardIds: ['card-relay-1'],
    });
  });

  it('dispatches card.crud.batchMutate to the writer backend client', async () => {
    const cardCrudBatchMutate = vi.fn(async () => ({
      durabilityReceipt: {
        mutationId: 'card-crud:relay-1',
        family: 'card-crud',
        stage: 'journaled',
      },
    }));
    const client = {
      cardCrudBatchMutate,
    } as unknown as {
      cardCrudBatchMutate: (request: unknown) => Promise<unknown>;
    };
    const request = {
      mutationId: 'card-crud:relay-1',
      upsertCards: [],
      upsertXiuyuans: [],
      deleteCardIds: ['card-relay-1'],
      deleteXiuyuanIds: [],
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'card.crud.batchMutate',
      params: request,
    });

    expect(cardCrudBatchMutate).toHaveBeenCalledWith(request);
    expect(result).toMatchObject({
      durabilityReceipt: {
        mutationId: 'card-crud:relay-1',
        family: 'card-crud',
        stage: 'journaled',
      },
    });
  });

  it('dispatches storage.maintenance.status to the writer backend client', async () => {
    const storageMaintenanceStatus = vi.fn(async () => ({
      operationId: 'legacy-storage-import-v1',
      migrationId: 'legacy-storage-import-v1',
      required: true,
      status: 'running',
      nextBatchIndex: 2,
      completedBatchCount: 2,
      totalBatchCount: 4,
      backupWritten: true,
      lastError: null,
    }));
    const client = {
      storageMaintenanceStatus,
    } as unknown as {
      storageMaintenanceStatus: (request: unknown) => Promise<unknown>;
    };
    const request = {
      operationId: 'legacy-storage-import-v1',
      migrationId: 'legacy-storage-import-v1',
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'storage.maintenance.status',
      params: request,
    });

    expect(storageMaintenanceStatus).toHaveBeenCalledWith(request);
    expect(result).toMatchObject({
      status: 'running',
      nextBatchIndex: 2,
      backupWritten: true,
    });
  });

  it('dispatches storage.pressure.recover to the writer backend client', async () => {
    const storagePressureRecover = vi.fn(async () => ({
      ok: true,
      phase: 'completed',
      error: null,
    }));
    const client = {
      storagePressureRecover,
    } as unknown as {
      storagePressureRecover: (request: unknown) => Promise<unknown>;
    };
    const request = {
      reason: 'plugin.onload-ready',
      maxPromotionBatches: 16,
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'storage.pressure.recover',
      params: request,
    });

    expect(storagePressureRecover).toHaveBeenCalledWith(request);
    expect(result).toMatchObject({
      ok: true,
      phase: 'completed',
      error: null,
    });
  });

  it('rejects storage.pressure.recover relay when params is not an object', async () => {
    const client = {
      storagePressureRecover: vi.fn(),
    };

    await expect(executeWriterRelayCommand(client, {
      method: 'storage.pressure.recover',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: storage.pressure.recover relay requires params object');
    expect(client.storagePressureRecover).not.toHaveBeenCalled();
  });

  it('guards writer Card CRUD and relays follower Card CRUD', async () => {
    const ensureWritable = vi.fn(async () => undefined);
    const cardCrudBatchMutate = vi.fn(async () => ({
      durabilityReceipt: {
        mutationId: 'card-crud:writer-1',
        family: 'card-crud',
        stage: 'journaled',
      },
    }));
    const submitAndWait = vi.fn(async () => ({
      durabilityReceipt: {
        mutationId: 'card-crud:follower-1',
        family: 'card-crud',
        stage: 'journaled',
      },
    }));
    const context = Object.create(ApplicationContext.prototype) as ApplicationContext & {
      backendMigrationRuntimePolicy: {
        capabilities: { writerRelayRequiredForBackendWrites: boolean };
      };
      executeCardCrudBatchMutate(request: unknown): Promise<unknown>;
      getSrsBackendClient(): unknown;
      getFrontendInstanceRuntime(): unknown;
      getFollowerCommandClient(): unknown;
    };
    context.backendMigrationRuntimePolicy = {
      capabilities: { writerRelayRequiredForBackendWrites: true },
    };
    context.getSrsBackendClient = () => ({ cardCrudBatchMutate });
    context.getFrontendInstanceRuntime = () => ({
      getMode: () => 'writer',
      getInstanceId: () => 'writer-1',
      ensureWritable,
    });
    context.getFollowerCommandClient = () => null;

    await context.executeCardCrudBatchMutate({
      mutationId: 'card-crud:writer-1',
      upsertCards: [],
      upsertXiuyuans: [],
      deleteCardIds: ['card-writer-1'],
      deleteXiuyuanIds: [],
    });

    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(cardCrudBatchMutate).toHaveBeenCalledTimes(1);

    context.getFrontendInstanceRuntime = () => ({
      getMode: () => 'follower',
      getInstanceId: () => 'follower-1',
    });
    context.getFollowerCommandClient = () => ({ submitAndWait });
    const followerRequest = {
      mutationId: 'card-crud:follower-1',
      upsertCards: [],
      upsertXiuyuans: [],
      deleteCardIds: ['card-follower-1'],
      deleteXiuyuanIds: [],
    };
    await context.executeCardCrudBatchMutate(followerRequest);

    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'follower-1',
      method: 'card.crud.batchMutate',
      params: followerRequest,
    });
    expect(cardCrudBatchMutate).toHaveBeenCalledTimes(1);

    context.getSrsBackendClient = () => null;
    await expect(context.executeCardCrudBatchMutate(followerRequest))
      .rejects.toThrow('BACKEND_UNAVAILABLE: card.crud.batchMutate requires backend Worker');
  });

  it('dispatches Queue state reads and mutations to the writer backend client', async () => {
    const queueStateLoadAll = vi.fn(async () => ({
      values: { retrievalPracticeQueue: ['card-1'] },
    }));
    const queueStateBatchMutate = vi.fn(async () => ({
      updatedKeys: ['retrievalPracticeQueue'],
      deletedKeys: [],
    }));
    const client = {
      queueStateLoadAll,
      queueStateBatchMutate,
    };
    const request = {
      mutationId: 'queue:relay-1',
      mutations: [{
        operation: 'set' as const,
        key: 'retrievalPracticeQueue',
        value: ['card-1'],
      }],
    };

    await expect(executeWriterRelayCommand(client, {
      method: 'queue.state.loadAll',
      params: {},
    })).resolves.toEqual({
      values: { retrievalPracticeQueue: ['card-1'] },
    });
    await expect(executeWriterRelayCommand(client, {
      method: 'queue.state.batchMutate',
      params: request,
    })).resolves.toMatchObject({
      updatedKeys: ['retrievalPracticeQueue'],
    });

    expect(queueStateLoadAll).toHaveBeenCalledTimes(1);
    expect(queueStateBatchMutate).toHaveBeenCalledWith(request);
  });

  it('keeps Queue state reads direct while guarding Queue state mutations with writer authority', async () => {
    const ensureWritable = vi.fn(async () => undefined);
    const queueStateLoadAll = vi.fn(async () => ({ values: {} }));
    const queueStateBatchMutate = vi.fn(async () => ({
      updatedKeys: ['queue-a'],
      deletedKeys: [],
    }));
    const context = Object.create(ApplicationContext.prototype) as ApplicationContext & {
      backendMigrationRuntimePolicy: {
        capabilities: { writerRelayRequiredForBackendWrites: boolean };
      };
      executeQueueStateLoadAll(): Promise<unknown>;
      executeQueueStateBatchMutate(request: unknown): Promise<unknown>;
      getSrsBackendClient(): unknown;
      getFrontendInstanceRuntime(): unknown;
      getFollowerCommandClient(): unknown;
    };
    context.backendMigrationRuntimePolicy = {
      capabilities: { writerRelayRequiredForBackendWrites: true },
    };
    context.getSrsBackendClient = () => ({
      queueStateLoadAll,
      queueStateBatchMutate,
    });
    context.getFrontendInstanceRuntime = () => ({
      getMode: () => 'writer',
      getInstanceId: () => 'writer-1',
      ensureWritable,
    });
    context.getFollowerCommandClient = () => null;

    await context.executeQueueStateLoadAll();
    await context.executeQueueStateBatchMutate({
      mutationId: 'queue:writer-1',
      mutations: [{ operation: 'delete', key: 'queue-a' }],
    });

    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(queueStateLoadAll).toHaveBeenCalledTimes(1);
    expect(queueStateBatchMutate).toHaveBeenCalledTimes(1);
  });

  it('keeps follower Queue state reads direct and relays only Queue state mutations', async () => {
    const submitAndWait = vi.fn(async () => ({
      updatedKeys: ['queue-a'],
      deletedKeys: [],
    }));
    const backendClient = {
      queueStateLoadAll: vi.fn(async () => ({ values: { 'queue-a': ['card-1'] } })),
      queueStateBatchMutate: vi.fn(),
    };
    const context = Object.create(ApplicationContext.prototype) as ApplicationContext & {
      backendMigrationRuntimePolicy: {
        capabilities: { writerRelayRequiredForBackendWrites: boolean };
      };
      executeQueueStateLoadAll(): Promise<unknown>;
      executeQueueStateBatchMutate(request: unknown): Promise<unknown>;
      getSrsBackendClient(): unknown;
      getFrontendInstanceRuntime(): unknown;
      getFollowerCommandClient(): unknown;
    };
    context.backendMigrationRuntimePolicy = {
      capabilities: { writerRelayRequiredForBackendWrites: true },
    };
    context.getSrsBackendClient = () => backendClient;
    context.getFrontendInstanceRuntime = () => ({
      getMode: () => 'follower',
      getInstanceId: () => 'follower-1',
    });
    context.getFollowerCommandClient = () => ({ submitAndWait });

    await expect(context.executeQueueStateLoadAll()).resolves.toEqual({
      values: { 'queue-a': ['card-1'] },
    });
    await context.executeQueueStateBatchMutate({
      mutationId: 'queue:follower-1',
      mutations: [{ operation: 'delete', key: 'queue-a' }],
    });

    expect(submitAndWait).toHaveBeenCalledTimes(1);
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'follower-1',
      method: 'queue.state.batchMutate',
      params: {
        mutationId: 'queue:follower-1',
        mutations: [{ operation: 'delete', key: 'queue-a' }],
      },
    });
    expect(backendClient.queueStateLoadAll).toHaveBeenCalledTimes(1);
    expect(backendClient.queueStateBatchMutate).not.toHaveBeenCalled();

    context.getSrsBackendClient = () => null;
    await expect(context.executeQueueStateLoadAll())
      .rejects.toThrow('BACKEND_UNAVAILABLE: queue.state.loadAll requires backend Worker');
  });

  it('does not block startup Queue state reads on an unavailable writer lease', async () => {
    const submitAndWait = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
    });
    const backendClient = {
      queueStateLoadAll: vi.fn(async () => ({ values: { startupQueue: ['card-1'] } })),
      queueStateBatchMutate: vi.fn(),
    };
    const context = Object.create(ApplicationContext.prototype) as ApplicationContext & {
      backendMigrationRuntimePolicy: {
        capabilities: { writerRelayRequiredForBackendWrites: boolean };
      };
      executeQueueStateLoadAll(): Promise<unknown>;
      getSrsBackendClient(): unknown;
      getFrontendInstanceRuntime(): unknown;
      getFollowerCommandClient(): unknown;
    };
    context.backendMigrationRuntimePolicy = {
      capabilities: { writerRelayRequiredForBackendWrites: true },
    };
    context.getSrsBackendClient = () => backendClient;
    context.getFrontendInstanceRuntime = () => ({
      getMode: () => 'follower',
      getInstanceId: () => 'startup-follower',
    });
    context.getFollowerCommandClient = () => ({ submitAndWait });

    await expect(context.executeQueueStateLoadAll()).resolves.toEqual({
      values: { startupQueue: ['card-1'] },
    });

    expect(backendClient.queueStateLoadAll).toHaveBeenCalledTimes(1);
    expect(submitAndWait).not.toHaveBeenCalled();
  });

  it('dispatches agent.tool.execute to application hook instead of backend client', async () => {
    const executeAgentTool = vi.fn(async (request: unknown) => ({
      ok: true,
      status: 'success',
      data: { accepted: true, request },
    }));
    const client = {};
    const params = {
      tool: 'memo_query',
      args: {
        action: 'status',
      },
      source: 'mcp',
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'agent.tool.execute',
      params,
    }, { executeAgentTool });

    expect(executeAgentTool).toHaveBeenCalledWith(params);
    expect(result).toMatchObject({
      ok: true,
      status: 'success',
      data: {
        accepted: true,
      },
    });
  });

  it('keeps plugin-owned Agent card drafting out of ApplicationContext composition', () => {
    const source = readApplicationContextSource();

    expect(source).not.toContain("from '@/application/services/AgentCardDraftService'");
    expect(source).not.toContain("from '@/infrastructure/llm/OpenAICompatibleLLMAdapter'");
    expect(source).not.toContain("from '@/infrastructure/siyuan/AISiyuanAdapter'");
    expect(source).not.toContain('cardDraftService: new AgentCardDraftService({');
    expect(source).not.toContain('getAISettings: () => context.getSettingsService().getSettings().ai');
    expect(source).not.toContain('llmPort: new OpenAICompatibleLLMAdapter()');
    expect(source).not.toContain('siyuanPort: new AISiyuanAdapter(context.getPlugin())');
  });

  it('rejects agent.tool.execute relay without an application hook', async () => {
    await expect(executeWriterRelayCommand({}, {
      method: 'agent.tool.execute',
      params: {
        tool: 'memo_query',
        args: {
          action: 'status',
        },
      },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: agent.tool.execute application hook unavailable');
  });

  it('dispatches hotspot.command.submit to backend client', async () => {
    const submitHotspotCommand = vi.fn(async () => ({
      accepted: true,
      commandId: 'topic-command-1',
      jobId: 'topic-command-1',
      state: 'accepted',
      submittedAt: 10,
      updatedAt: 10,
      result: null,
      diagnostics: {
        traceId: 'trace-hotspot-1',
        unavailableClass: null,
        errorCategory: null,
      },
    }));
    const client = {
      submitHotspotCommand,
    };

    const params = {
      envelope: {
        family: 'topic-derived',
        commandId: 'topic-command-1',
        idempotencyKey: 'topic-command-1',
        caller: {
          instanceId: 'follower-1',
          runtimeRole: 'follower',
          surface: 'review',
        },
        writerExpectation: {
          mode: 'required',
          expectedWriterInstanceId: 'writer-1',
          relayAllowed: true,
        },
        deadlineAt: 100,
        submittedAt: 10,
        payload: {
          blockId: 'block-1',
        },
      },
    };

    const result = await executeWriterRelayCommand(client, {
      method: 'hotspot.command.submit',
      params,
    });

    expect(submitHotspotCommand).toHaveBeenCalledTimes(1);
    expect(submitHotspotCommand).toHaveBeenCalledWith(params);
    expect(result).toMatchObject({
      accepted: true,
      commandId: 'topic-command-1',
      state: 'accepted',
    });
  });

  it('rejects hotspot.command.submit relay when params is not an object', async () => {
    const client = {
      submitHotspotCommand: vi.fn(),
    };

    await expect(executeWriterRelayCommand(client, {
      method: 'hotspot.command.submit',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: hotspot.command.submit relay requires params object');
    expect(client.submitHotspotCommand).not.toHaveBeenCalled();
  });
});
