import type {
  BackendSyncConflictDatabaseSummary,
  BackendSyncConflictMergeRequest,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
  BackendTruthReconciliationRunRequest,
  BackendTruthReconciliationRunResult,
} from '../../../packages/contracts/src/backend-rpc';

export type SyncConflictDirectionChoice =
  | { kind: 'smartMerge' }
  | { kind: 'keepCurrentLocal' }
  | { kind: 'cancel' };

export interface SyncConflictDirectionPreview {
  current: BackendSyncConflictDatabaseSummary | null;
  sources: BackendSyncConflictDatabaseSummary[];
}

export type SyncConflictDirectionApplyResult =
  | { kind: 'smartMerge'; reconciliation: BackendTruthReconciliationRunResult }
  | { kind: 'keepCurrentLocal'; unchanged: true; sources: number }
  | { kind: 'cancel'; unchanged: true };

export interface SyncConflictDirectionFileSource {
  readSyncConflictDatabaseSources(): Promise<BackendSyncConflictMergeRequest['sources']>;
}

export interface SyncConflictDirectionBackend {
  summarizeSyncConflicts(request: BackendSyncConflictSummarizeRequest): Promise<BackendSyncConflictSummarizeResult>;
  reconcileCanonicalTruth(
    request?: BackendTruthReconciliationRunRequest,
  ): Promise<BackendTruthReconciliationRunResult>;
}

export class SyncConflictDirectionResolutionService {
  private cachedSources: BackendSyncConflictMergeRequest['sources'] = [];

  constructor(
    private readonly fileSource: SyncConflictDirectionFileSource,
    private readonly backend: SyncConflictDirectionBackend,
  ) {}

  async preview(): Promise<SyncConflictDirectionPreview> {
    const sources = await this.fileSource.readSyncConflictDatabaseSources();
    this.cachedSources = sources;
    const result = await this.backend.summarizeSyncConflicts({
      includeCurrent: true,
      sources,
    });
    return {
      current: result.current,
      sources: result.sources,
    };
  }

  async apply(choice: SyncConflictDirectionChoice): Promise<SyncConflictDirectionApplyResult> {
    if (choice.kind === 'cancel') {
      return { kind: 'cancel', unchanged: true };
    }
    const sources = this.cachedSources.length > 0
      ? this.cachedSources
      : await this.fileSource.readSyncConflictDatabaseSources();

    if (choice.kind === 'keepCurrentLocal') {
      return { kind: 'keepCurrentLocal', unchanged: true, sources: sources.length };
    }

    if (choice.kind === 'smartMerge') {
      return {
        kind: 'smartMerge',
        reconciliation: await this.backend.reconcileCanonicalTruth({
          reason: 'manual-sync-conflict-reconciliation',
        }),
      };
    }
  }
}
