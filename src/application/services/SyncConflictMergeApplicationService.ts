import type {
  BackendTruthReconciliationRunRequest,
  BackendTruthReconciliationRunResult,
} from '../../../packages/contracts/src/backend-rpc';

export interface SyncConflictMergeBackend {
  reconcileCanonicalTruth(
    request?: BackendTruthReconciliationRunRequest,
  ): Promise<BackendTruthReconciliationRunResult>;
}

export class SyncConflictMergeApplicationService {
  constructor(private readonly backend: SyncConflictMergeBackend) {}

  mergeNow(
    options: { reason?: string } = {},
  ): Promise<BackendTruthReconciliationRunResult> {
    return this.backend.reconcileCanonicalTruth({
      reason: options.reason ?? 'manual-sync-conflict-reconciliation',
    });
  }
}
