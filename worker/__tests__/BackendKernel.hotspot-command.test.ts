import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

function createKernel(): BackendKernel {
  return new BackendKernel({
    database: new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge()),
  });
}

describe('BackendKernel hotspot command runtime', () => {
  it('accepts hotspot commands and replays duplicate idempotency keys without creating another command', async () => {
    const kernel = createKernel();
    const params = {
      envelope: {
        family: 'progressive.command' as const,
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
        caller: {
          instanceId: 'instance-a',
          runtimeRole: 'follower' as const,
          surface: 'review' as const,
        },
        writerExpectation: {
          mode: 'required' as const,
          expectedWriterInstanceId: 'writer-a',
          relayAllowed: true,
        },
        deadlineAt: 1_700_000_100_000,
        submittedAt: 1_700_000_000_000,
        payload: {
          sourceBlockId: 'block-1',
        },
      },
    };

    const first = await kernel.handle({
      id: 'hotspot-submit-1',
      jsonrpc: '2.0',
      method: 'hotspot.command.submit',
      params: [params],
    });
    const duplicate = await kernel.handle({
      id: 'hotspot-submit-2',
      jsonrpc: '2.0',
      method: 'hotspot.command.submit',
      params: [params],
    });
    const job = await kernel.handle({
      id: 'hotspot-job-get',
      jsonrpc: '2.0',
      method: 'hotspot.job.get',
      params: [{
        family: 'progressive.command',
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
      }],
    });
    const diagnostics = await kernel.handle({
      id: 'diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });

    expect(first).toEqual(expect.objectContaining({
      id: 'hotspot-submit-1',
      result: expect.objectContaining({
        ok: true,
        accepted: true,
        family: 'progressive.command',
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
        state: 'accepted',
      }),
    }));
    expect(duplicate).toEqual(expect.objectContaining({
      id: 'hotspot-submit-2',
      result: expect.objectContaining({
        ok: true,
        accepted: true,
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
      }),
    }));
    expect(job).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        ok: true,
        accepted: true,
        commandId: 'progressive-command-1',
      }),
    }));
    expect(diagnostics).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        hotspot: expect.objectContaining({
          submittedTotal: 1,
          idempotencyHitTotal: 1,
          acceptedLatencyMsTotal: expect.any(Number),
          lastAcceptedLatencyMs: expect.any(Number),
          pendingCount: 1,
          writerRelayFailureTotal: 0,
          kernelProxyFailureTotal: 0,
        }),
      }),
    }));
  });

  it('returns typed unavailable for missing hotspot command state', async () => {
    const kernel = createKernel();

    const response = await kernel.handle({
      id: 'hotspot-job-missing',
      jsonrpc: '2.0',
      method: 'hotspot.job.get',
      params: [{
        family: 'xiuyuan.sync',
        commandId: 'missing-command',
      }],
    });

    expect(response).toEqual({
      id: 'hotspot-job-missing',
      jsonrpc: '2.0',
      result: {
        ok: false,
        family: 'xiuyuan.sync',
        commandId: 'missing-command',
        state: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
        reason: 'hotspot command state unavailable',
        recoverable: true,
      },
    });
  });

  it('returns typed unavailable placeholders for aggregate and graph reads', async () => {
    const kernel = createKernel();
    const identity = {
      snapshotId: 'snapshot-1',
      generation: 1,
      datasourceId: 'deck:all',
      policyHash: 'policy-1',
      queryFingerprint: 'query-1',
    };

    const snapshot = await kernel.handle({
      id: 'aggregate-snapshot',
      jsonrpc: '2.0',
      method: 'browser.aggregate.snapshot',
      params: [{
        requestId: 'aggregate-request-1',
        datasourceId: 'deck:all',
      }],
    });
    const page = await kernel.handle({
      id: 'aggregate-page',
      jsonrpc: '2.0',
      method: 'browser.aggregate.page',
      params: [{
        requestId: 'page-request-1',
        identity,
        limit: 50,
      }],
    });
    const focus = await kernel.handle({
      id: 'aggregate-focus',
      jsonrpc: '2.0',
      method: 'browser.aggregate.focus',
      params: [{
        requestId: 'focus-request-1',
        identity,
        focus: { type: 'card', cardId: 'card-1' },
      }],
    });
    const graph = await kernel.handle({
      id: 'graph-query',
      jsonrpc: '2.0',
      method: 'graph.query',
      params: [{
        queryId: 'graph-1',
        kind: 'neighbors',
        sourceNodeId: 'block-1',
      }],
    });

    expect(snapshot).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
        totalCount: 0,
      }),
    }));
    expect(page).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        identity,
        rows: [],
      }),
    }));
    expect(focus).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        identity,
        focusFound: false,
        rows: [],
      }),
    }));
    expect(graph).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        queryId: 'graph-1',
        kind: 'neighbors',
        unavailableClass: 'BACKEND_UNAVAILABLE',
      }),
    }));
  });

  it('executes progressive and topic-derived command callbacks idempotently', async () => {
    const progressive = vi.fn(async (request) => ({
      status: 'completed' as const,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: request.operation,
      result: { docId: 'progressive-doc-1' },
      rollback: { attempted: false, status: 'not-needed' as const },
      progress: { state: 'succeeded' as const, updatedAt: 1 },
      diagnostics: {
        diagnosticEventId: 'diag-progressive-1',
        family: 'progressive.command' as const,
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const topic = vi.fn(async (request) => ({
      status: 'completed' as const,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: 'create-from-topic-source' as const,
      result: { created: 1, skipped: 0, items: [] },
      audit: { created: 1, skipped: 0, nativeRiffRegistered: 1 },
      rollback: { attempted: false, status: 'not-needed' as const },
      progress: { state: 'succeeded' as const, updatedAt: 1 },
      diagnostics: {
        diagnosticEventId: 'diag-topic-1',
        family: 'topic-derived.command' as const,
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const kernel = new BackendKernel({
      database: new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge()),
      executeProgressiveCommand: progressive,
      executeTopicDerivedCommand: topic,
    });
    const progressiveParams = {
      requestId: 'progressive-request-1',
      commandId: 'progressive-command-1',
      idempotencyKey: 'progressive-key-1',
      operation: 'create-child-doc',
      input: { sourceDocId: 'doc-1' },
      requestedAt: 1,
    };
    const topicParams = {
      requestId: 'topic-request-1',
      commandId: 'topic-command-1',
      idempotencyKey: 'topic-key-1',
      operation: 'create-from-topic-source',
      input: { sourceBlockId: 'block-1' },
      requestedAt: 1,
    };

    const firstProgressive = await kernel.handle({
      id: 'progressive-1',
      jsonrpc: '2.0',
      method: 'progressive.command.execute',
      params: [progressiveParams],
    });
    const duplicateProgressive = await kernel.handle({
      id: 'progressive-2',
      jsonrpc: '2.0',
      method: 'progressive.command.execute',
      params: [progressiveParams],
    });
    const firstTopic = await kernel.handle({
      id: 'topic-1',
      jsonrpc: '2.0',
      method: 'topic-derived.command.execute',
      params: [topicParams],
    });
    const duplicateTopic = await kernel.handle({
      id: 'topic-2',
      jsonrpc: '2.0',
      method: 'topic-derived.command.execute',
      params: [topicParams],
    });

    expect(firstProgressive).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'completed', commandId: 'progressive-command-1' }),
    }));
    expect(duplicateProgressive).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'duplicate', commandId: 'progressive-command-1' }),
    }));
    expect(firstTopic).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'completed', commandId: 'topic-command-1' }),
    }));
    expect(duplicateTopic).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'duplicate', commandId: 'topic-command-1' }),
    }));
    expect(progressive).toHaveBeenCalledTimes(1);
    expect(topic).toHaveBeenCalledTimes(1);
  });
});
