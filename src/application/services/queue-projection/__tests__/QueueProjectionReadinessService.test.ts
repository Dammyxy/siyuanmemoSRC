import { describe, expect, it, vi } from 'vitest';
import { QueueProjectionReadinessService } from '../QueueProjectionReadinessService';

describe('QueueProjectionReadinessService', () => {
  it('maps a ready snapshot to readiness identity without creating a new generation', async () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: 'policy-existing',
        generation: 7,
        status: 'ready',
        rows: [],
        counters: null,
      })),
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toEqual({
      status: 'ready',
      queueId: 'retrieval-practice',
      policyId: 'policy-existing',
      generation: 7,
    });
  });

  it('generates canonical policy identity independent of caller object key order', () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(),
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

  it('returns refreshing for non-ready snapshots without local repair', async () => {
    const readSnapshot = vi.fn(async () => ({
      queueType: 'retrieval-practice',
      policyHash: null,
      generation: null,
      status: 'unavailable',
      rows: [],
      counters: null,
    }));
    const service = new QueueProjectionReadinessService({
      readSnapshot,
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toEqual({
      status: 'refreshing',
      queueId: 'retrieval-practice',
      policyId: service.buildPolicyId({ queueType: 'retrieval-practice' }),
      cause: 'projection_unavailable',
      retryAfterMs: 300,
    });
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it('returns projection_stale when snapshot freshness shows missing or stale projection rows', async () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: 'policy-stale',
        generation: 8,
        status: 'refreshing',
        rows: [],
        counters: null,
        freshness: {
          checkedAt: 1_700_000_000_000,
          totalRows: 2,
          freshRows: 1,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['card-stale'],
          missingCardIds: [],
        },
      })),
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toEqual({
      status: 'refreshing',
      queueId: 'retrieval-practice',
      policyId: service.buildPolicyId({ queueType: 'retrieval-practice' }),
      cause: 'projection_stale',
      retryAfterMs: 300,
    });
  });

  it('returns recoverable unavailable with machine cause when backend read fails', async () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(async () => {
        throw new Error('backend down');
      }),
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toMatchObject({
      status: 'unavailable',
      cause: 'backend_unavailable',
      recoverable: true,
      reason: 'backend down',
    });
  });
});
