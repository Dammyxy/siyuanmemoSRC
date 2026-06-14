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
        nativeRiffSyncEnabled: boolean;
      }) => boolean;
    }).shouldEnableKernelTransactionIngestListener({
      kernelTransactionIngestAvailable: true,
      quickCardEnabled: false,
      nativeRiffSyncEnabled: false,
    })).toBe(false);

    expect((ApplicationContext as unknown as {
      shouldEnableKernelTransactionIngestListener: (input: {
        kernelTransactionIngestAvailable: boolean;
        quickCardEnabled: boolean;
        nativeRiffSyncEnabled: boolean;
      }) => boolean;
    }).shouldEnableKernelTransactionIngestListener({
      kernelTransactionIngestAvailable: true,
      quickCardEnabled: true,
      nativeRiffSyncEnabled: false,
    })).toBe(true);
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
      context: 'read-only-preflight',
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

  it('wires Agent card drafting through application AI and SiYuan read owners', () => {
    const source = readApplicationContextSource();

    expect(source).toContain("from '@/application/services/AgentCardDraftService'");
    expect(source).toContain("from '@/infrastructure/llm/OpenAICompatibleLLMAdapter'");
    expect(source).toContain("from '@/infrastructure/siyuan/AISiyuanAdapter'");
    expect(source).toContain('cardDraftService: new AgentCardDraftService({');
    expect(source).toContain('getAISettings: () => context.getSettingsService().getSettings().ai');
    expect(source).toContain('llmPort: new OpenAICompatibleLLMAdapter()');
    expect(source).toContain('siyuanPort: new AISiyuanAdapter(context.getPlugin())');
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
