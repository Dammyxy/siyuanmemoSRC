import { describe, expect, it, vi } from 'vitest';
import { DomainSyncDiagnosticsApplicationService } from '../DomainSyncDiagnosticsApplicationService';
import type { BackendDomainSyncStatusResult } from '../../../../../packages/contracts/src/backend-rpc';

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
    }, logger);

    await expect(service.readStatus()).resolves.toBe(result);
    expect(domainSyncStatus).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith('Domain sync diagnostics status read', {
      sanityStatus: 'merged',
      operationCount: 2,
      processedSources: 1,
      skippedSources: 0,
      repairableDivergenceCount: 0,
    });
  });

  it('routes repair apply through writer relay when runtime is follower', async () => {
    const backend = {
      domainSyncStatus: vi.fn(),
      domainSyncRepairPreview: vi.fn(),
      domainSyncRepairApply: vi.fn(async () => {
        throw new Error('follower must not apply locally');
      }),
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
});
