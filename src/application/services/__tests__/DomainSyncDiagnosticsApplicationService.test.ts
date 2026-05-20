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
    const logger = { info: vi.fn() };
    const service = new DomainSyncDiagnosticsApplicationService({ domainSyncStatus }, logger);

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
});
