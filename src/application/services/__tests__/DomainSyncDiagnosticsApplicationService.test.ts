import { describe, expect, it, vi } from 'vitest';
import { DomainSyncDiagnosticsApplicationService } from '../DomainSyncDiagnosticsApplicationService';
import type {
  BackendDomainSyncConflictSourceCleanupCandidatesResult,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusResult,
} from '../../../../../packages/contracts/src/backend-rpc';

function cleanStatusResult(): BackendDomainSyncStatusResult {
  return {
    ok: true,
    ledger: {
      operationCount: 0,
      newestOperationAt: null,
      operationTypes: {},
    },
    processedSources: {
      recent: [],
      skipped: [],
      totalProcessed: 0,
      totalSkipped: 0,
    },
    sanity: {
      status: 'clean',
      checkedAt: 11,
      ledgerOperationCount: 0,
      pendingImportCount: 0,
      processedSourceCount: 0,
      skippedSourceCount: 0,
      repairableDivergenceCount: 0,
      divergentCardCount: 0,
      reasonCounts: {},
      affectedCardIds: [],
      truncated: false,
    },
    repair: {
      available: false,
      repairableDivergenceCount: 0,
      latestPlanId: null,
    },
  };
}

function repairPreviewResult(): BackendDomainSyncRepairPreviewResult {
  return {
    ok: true,
    planId: 'writer-plan',
    status: 'preview',
    createdAt: 1_700_002_000_000,
    affectedCardCount: 1,
    evidence: [],
    plannedMutations: [],
    unrepairableReasons: [],
    schedulerEvidence: {
      schedulerType: 'fsrs-v6',
      configHash: 'hash',
      capturedAt: 1_700_002_000_000,
    },
    truncated: false,
    limit: 50,
  };
}

function cleanupCandidatesResult(): BackendDomainSyncConflictSourceCleanupCandidatesResult {
  return {
    ok: true,
    sanityStatus: 'clean',
    candidates: [],
  };
}

describe('DomainSyncDiagnosticsApplicationService', () => {
  it('reads backend-owned domain sync status and logs a bounded summary', async () => {
    const result: BackendDomainSyncStatusResult = {
      ok: true,
      ledger: {
        operationCount: 2,
        newestOperationAt: 10,
        operationTypes: {
          'review-committed': 1,
          'card-deleted': 1,
        },
      },
      processedSources: {
        recent: [],
        skipped: [],
        totalProcessed: 1,
        totalSkipped: 0,
      },
      sanity: {
        status: 'merged',
        checkedAt: 11,
        ledgerOperationCount: 2,
        pendingImportCount: 0,
        processedSourceCount: 1,
        skippedSourceCount: 0,
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
        reasonCounts: {},
        affectedCardIds: [],
        truncated: false,
      },
      repair: {
        available: false,
        repairableDivergenceCount: 0,
        latestPlanId: null,
      },
    };
    const domainSyncStatus = vi.fn(async () => result);
    const domainSyncRepairPreview = vi.fn();
    const domainSyncRepairApply = vi.fn();
    const logger = { info: vi.fn() };
    const service = new DomainSyncDiagnosticsApplicationService({
      domainSyncStatus,
      domainSyncRepairPreview,
      domainSyncRepairApply,
      domainSyncConflictSourcesCleanup: vi.fn(),
      domainSyncConflictSourceCleanupCandidates: vi.fn(),
    }, logger);

    await expect(service.readStatus()).resolves.toBe(result);
    expect(domainSyncStatus).toHaveBeenCalledWith({});
    expect(logger.info).toHaveBeenCalledWith('Domain sync diagnostics status read', {
      sanityStatus: 'merged',
      operationCount: 2,
      processedSources: 1,
      skippedSources: 0,
      repairableDivergenceCount: 0,
    });
  });

  it('passes review preflight status context to backend diagnostics reads', async () => {
    const result = cleanStatusResult();
    const domainSyncStatus = vi.fn(async () => result);
    const logger = { info: vi.fn() };
    const service = new DomainSyncDiagnosticsApplicationService({
      domainSyncStatus,
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(),
      domainSyncConflictSourcesCleanup: vi.fn(),
      domainSyncConflictSourceCleanupCandidates: vi.fn(),
    }, logger);

    await expect(service.readStatus({
      context: 'review-feedback-preflight',
      cardId: 'card-preflight',
    })).resolves.toBe(result);
    expect(domainSyncStatus).toHaveBeenCalledWith({
      context: 'review-feedback-preflight',
      cardId: 'card-preflight',
    });
    expect(logger.info).not.toHaveBeenCalledWith(
      'Domain sync diagnostics status read',
      expect.anything(),
    );
  });

  it('routes diagnostics status through writer relay when runtime is follower', async () => {
    const request = {
      context: 'snapshot-preflight' as const,
      cardId: 'card-status-follower',
    };
    const relayResult = cleanStatusResult();
    const backend = {
      domainSyncStatus: vi.fn(async () => {
        throw new Error('follower must not read local domain sync status');
      }),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(),
      domainSyncConflictSourcesCleanup: vi.fn(),
      domainSyncConflictSourceCleanupCandidates: vi.fn(),
    };
    const submitAndWait = vi.fn(async () => relayResult);
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'follower', getInstanceId: () => 'instance-follower-domain-status' },
      { submitAndWait },
    );

    await expect(service.readStatus(request)).resolves.toBe(relayResult);
    expect(backend.domainSyncStatus).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'instance-follower-domain-status',
      method: 'domainSync.status',
      params: request,
    });
  });

  it('routes repair preview through writer relay when runtime is follower so apply sees the same plan', async () => {
    const request = {
      cardIds: ['card-preview-follower'],
      limit: 10,
      includeUnrepairable: true,
    };
    const relayResult = repairPreviewResult();
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(async () => {
        throw new Error('follower must not create local repair plan');
      }),
      domainSyncRepairApply: vi.fn(),
      domainSyncConflictSourcesCleanup: vi.fn(),
      domainSyncConflictSourceCleanupCandidates: vi.fn(),
    };
    const submitAndWait = vi.fn(async () => relayResult);
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'follower', getInstanceId: () => 'instance-follower-domain-preview' },
      { submitAndWait },
    );

    await expect(service.previewRepair(request)).resolves.toBe(relayResult);
    expect(backend.domainSyncRepairPreview).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'instance-follower-domain-preview',
      method: 'domainSync.repair.preview',
      params: request,
    });
  });

  it('routes cleanup candidates through writer relay when runtime is follower', async () => {
    const relayResult = cleanupCandidatesResult();
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(),
      domainSyncConflictSourcesCleanup: vi.fn(),
      domainSyncConflictSourceCleanupCandidates: vi.fn(async () => {
        throw new Error('follower must not read local cleanup candidates');
      }),
    };
    const submitAndWait = vi.fn(async () => relayResult);
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'follower', getInstanceId: () => 'instance-follower-domain-candidates' },
      { submitAndWait },
    );

    await expect(service.listCleanupCandidates()).resolves.toBe(relayResult);
    expect(backend.domainSyncConflictSourceCleanupCandidates).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'instance-follower-domain-candidates',
      method: 'domainSync.conflictSources.cleanupCandidates',
      params: {},
    });
  });

  it('routes repair apply through writer relay when runtime is follower', async () => {
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(async () => {
        throw new Error('follower must not apply locally');
      }),
      domainSyncConflictSourcesCleanup: vi.fn(),
    };
    const request = {
      planId: 'plan-follower',
      idempotencyKey: 'apply-key-follower',
      confirmedAt: 1_700_002_000_000,
    };
    const relayResult = {
      ok: true as const,
      status: 'applied' as const,
      planId: request.planId,
      idempotencyKey: request.idempotencyKey,
      appliedAt: request.confirmedAt,
      appliedCards: 1,
      skippedCards: 0,
      invalidatedQueueProjections: 6,
    };
    const submitAndWait = vi.fn(async () => relayResult);
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'follower', getInstanceId: () => 'instance-follower-domain-sync' },
      { submitAndWait },
    );

    await expect(service.applyRepair(request)).resolves.toBe(relayResult);
    expect(backend.domainSyncRepairApply).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'instance-follower-domain-sync',
      method: 'domainSync.repair.apply',
      params: request,
    });
  });

  it('returns explicit unavailable when follower repair apply has no relay client', async () => {
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(),
      domainSyncConflictSourcesCleanup: vi.fn(),
    };
    const request = {
      planId: 'plan-no-relay',
      idempotencyKey: 'apply-key-no-relay',
      confirmedAt: 1_700_002_100_000,
    };
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'follower', getInstanceId: () => 'instance-follower-no-relay' },
      null,
    );

    await expect(service.applyRepair(request)).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      planId: 'plan-no-relay',
      idempotencyKey: 'apply-key-no-relay',
    });
    expect(backend.domainSyncRepairApply).not.toHaveBeenCalled();
  });

  it('returns backend unavailable repair apply result without renderer fallback', async () => {
    const request = {
      planId: 'plan-backend-unavailable',
      idempotencyKey: 'apply-key-backend-unavailable',
      confirmedAt: 1_700_002_200_000,
    };
    const unavailable = {
      ok: false as const,
      status: 'unavailable' as const,
      planId: request.planId,
      idempotencyKey: request.idempotencyKey,
      reason: 'backend worker unavailable',
    };
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(async () => unavailable),
      domainSyncConflictSourcesCleanup: vi.fn(),
    };
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'writer', getInstanceId: () => 'instance-writer-domain-sync' },
      null,
    );

    await expect(service.applyRepair(request)).resolves.toBe(unavailable);
    expect(backend.domainSyncRepairApply).toHaveBeenCalledWith(request);
  });

  it('routes cleanup through writer relay when runtime is follower', async () => {
    const request = {
      sourceIds: ['eligible-source'],
      idempotencyKey: 'cleanup-key-follower',
      confirmedAt: 1_700_003_000_000,
    };
    const relayResult = {
      ok: true,
      idempotencyKey: request.idempotencyKey,
      cleaned: [{ sourceId: 'eligible-source', path: '/conflicts/eligible-source.db' }],
      skipped: [],
      failed: [],
      status: 'cleaned' as const,
    };
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(),
      domainSyncConflictSourcesCleanup: vi.fn(async () => {
        throw new Error('follower must not cleanup locally');
      }),
    };
    const submitAndWait = vi.fn(async () => relayResult);
    const service = new DomainSyncDiagnosticsApplicationService(
      backend,
      { info: vi.fn() },
      { getMode: () => 'follower', getInstanceId: () => 'instance-follower-domain-cleanup' },
      { submitAndWait },
    );

    await expect(service.cleanupConflictSources(request)).resolves.toBe(relayResult);
    expect(backend.domainSyncConflictSourcesCleanup).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith({
      instanceId: 'instance-follower-domain-cleanup',
      method: 'domainSync.conflictSources.cleanup',
      params: request,
    });
  });
});
