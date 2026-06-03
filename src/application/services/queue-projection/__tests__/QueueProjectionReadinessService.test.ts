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

  it('includes submitted FilterGroup policy identity fields in canonical policy id', () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(),
    });
    const submittedFilterGroup = {
      queueType: 'filter-group',
      source: 'browser',
      filterHash: 'filter-hash-a',
      manualCardIds: ['manual-b', 'manual-a'],
      temporaryBlacklistIds: ['hidden-b', 'hidden-a'],
      customOrder: ['card-a', 'card-b'],
      transferSessionId: 'transfer-a',
      sessionId: 'session-a',
      commitPolicy: 'write-schedule',
    };

    const policyId = service.buildPolicyId(submittedFilterGroup);

    expect(policyId).toBe(service.buildPolicyId({
      ...submittedFilterGroup,
      manualCardIds: ['manual-a', 'manual-b'],
      temporaryBlacklistIds: ['hidden-a', 'hidden-b'],
    }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, filterHash: 'filter-hash-b' }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, manualCardIds: ['manual-a'] }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, temporaryBlacklistIds: ['hidden-a'] }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, customOrder: ['card-b', 'card-a'] }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, transferSessionId: 'transfer-b' }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, sessionId: 'session-b' }));
    expect(policyId).not.toBe(service.buildPolicyId({ ...submittedFilterGroup, commitPolicy: 'preview-only' }));
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

  it('returns missing_derived_cache when snapshot reports absent non-durable projection cache', async () => {
    const service = new QueueProjectionReadinessService({
      readSnapshot: vi.fn(async () => ({
        queueType: 'retrieval-practice',
        policyHash: null,
        generation: null,
        status: 'refreshing',
        rows: [],
        counters: null,
        cacheState: 'missing-derived-cache',
      })),
    });

    await expect(service.ensureReady({ queueType: 'retrieval-practice' })).resolves.toEqual({
      status: 'refreshing',
      queueId: 'retrieval-practice',
      policyId: service.buildPolicyId({ queueType: 'retrieval-practice' }),
      cause: 'missing_derived_cache',
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
