import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';

describe('ApplicationContext writer relay command dispatch', () => {
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

    await (ApplicationContext as unknown as {
      executeWriterRelayCommand: (
        backend: unknown,
        command: { method: string; params?: unknown },
        hooks?: { onKernelTransactionIngested?: () => void },
      ) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
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

    const result = await (ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
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

    const result = await (ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
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

    await expect((ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
      method: 'autocard.execute',
      params: 'invalid',
    })).rejects.toThrow('INVALID_REQUEST: autocard.execute relay requires params object');
    expect(client.executeAutoCard).not.toHaveBeenCalled();
  });

  it('rejects autocard.decision.resolve relay when params is not an object', async () => {
    const client = {
      resolveAutoCardDecision: vi.fn(),
    };

    await expect((ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
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

    const result = await (ApplicationContext as unknown as {
      executeWriterRelayCommand: (backend: unknown, command: { method: string; params?: unknown }) => Promise<unknown>;
    }).executeWriterRelayCommand(client, {
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
});
