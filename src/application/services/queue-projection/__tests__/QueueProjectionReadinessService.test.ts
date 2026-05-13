import { describe, expect, it, vi } from 'vitest';
import { QueueProjectionReadinessService } from '../QueueProjectionReadinessService';

describe('QueueProjectionReadinessService', () => {
  it('maps a ready snapshot to readiness identity without creating a new generation', async () => {
    const materialize = vi.fn();
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: 'policy-existing',
        generation: 7,
        status: 'ready',
        rows: [],
        counters: null,
      })),
      materialize,
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toEqual({
      status: 'ready',
      queueId: 'retrieval-practice',
      policyId: 'policy-existing',
      generation: 7,
    });
    expect(materialize).not.toHaveBeenCalled();
  });

  it('generates canonical policy identity independent of caller object key order', () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(),
      materialize: vi.fn(),
    });

    expect(service.buildPolicyId({
      queueType: 'retrieval-practice',
      scopeDocIds: ['b', 'a'],
      source: 'browser',
    })).toBe(service.buildPolicyId({
      source: 'browser',
      scopeDocIds: ['a', 'b'],
      queueType: 'retrieval-practice',
    }));
  });

  it('single-flights same-identity materialization and clears in-flight state after completion', async () => {
    let resolveMaterialize: ((value: unknown) => void) | null = null;
    const materialize = vi.fn(() => new Promise((resolve) => {
      resolveMaterialize = resolve;
    }) as Promise<any>);
    const service = new QueueProjectionReadinessService({
      shortAwaitMs: 1,
      readSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: null,
        generation: null,
        status: 'unavailable',
        rows: [],
        counters: null,
      })),
      materialize,
    });

    const first = service.ensureReady({ queueType: 'retrieval-practice' });
    const second = service.ensureReady({ queueType: 'retrieval-practice' });
    await Promise.all([first, second]);
    expect(materialize).toHaveBeenCalledTimes(1);

    resolveMaterialize?.({
      queueType: 'retrieval-practice',
      policyHash: 'policy-next',
      generation: 1,
      status: 'ready',
      rows: 0,
      counters: { remaining: 0 },
    });
    await Promise.resolve();

    await service.ensureReady({ queueType: 'retrieval-practice' });
    expect(materialize).toHaveBeenCalledTimes(2);
  });

  it('returns recoverable unavailable with machine cause when backend read fails', async () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(async () => {
        throw new Error('backend down');
      }),
      materialize: vi.fn(),
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toMatchObject({
      status: 'unavailable',
      cause: 'backend_unavailable',
      recoverable: true,
      reason: 'backend down',
    });
  });
});
