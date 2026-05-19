import type {
  BackendSyncConflictMergeRequest,
  BackendSyncConflictMergeResult,
} from '../../../packages/contracts/src/backend-rpc';

export interface SyncConflictMergeFileSource {
  readSyncConflictDatabaseSources(): Promise<BackendSyncConflictMergeRequest['sources']>;
}

export interface SyncConflictMergeBackend {
  mergeSyncConflicts(request: BackendSyncConflictMergeRequest): Promise<BackendSyncConflictMergeResult>;
}

export class SyncConflictMergeApplicationService {
  constructor(
    private readonly fileSource: SyncConflictMergeFileSource,
    private readonly backend: SyncConflictMergeBackend,
  ) {}

  async mergeNow(options: { mergedAt?: number } = {}): Promise<BackendSyncConflictMergeResult> {
    const sources = await this.fileSource.readSyncConflictDatabaseSources();
    if (sources.length === 0) {
      return {
        ok: true,
        sources: 0,
        mergedReviewEvents: 0,
        ignoredReviewEvents: 0,
        mergedCards: 0,
        ignoredCards: 0,
        skippedSources: [],
      };
    }

    return this.backend.mergeSyncConflicts({
      sources,
      mergedAt: options.mergedAt,
    });
  }
}
