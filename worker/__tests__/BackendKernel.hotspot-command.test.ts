import { describe, expect, it } from 'vitest';
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
});
