import type {
  AppliedSyncSummary,
  SyncChangeSetStats,
} from './XiuyuanSyncService.types';
import type {
  PlannedSyncCreate,
  PlannedSyncDelete,
  PlannedSyncUpdate,
} from '@/core/xiuyuan/domain/repositories/SyncChangeSet';
import type { Result } from '@/types/result';
import type { RiffSyncState } from '@/core/storage/UnifiedStorageManager';

export interface XiuyuanSyncApplyInput {
  creates: PlannedSyncCreate[];
  metadataUpdates: PlannedSyncUpdate[];
  deletes: PlannedSyncDelete[];
  blacklistCleanup: string[];
  checkpointAdvance?: Partial<RiffSyncState>;
  stats: SyncChangeSetStats;
}

export interface XiuyuanSyncApplyRuntimeDeps {
  applySyncChangeSet: (changeSet: XiuyuanSyncApplyInput) => Promise<Result<AppliedSyncSummary>>;
}

export class XiuyuanSyncApplyRuntime {
  constructor(private readonly deps: XiuyuanSyncApplyRuntimeDeps) {}

  async apply(changeSet: XiuyuanSyncApplyInput): Promise<AppliedSyncSummary> {
    const applyResult = await this.deps.applySyncChangeSet(changeSet);
    if (!applyResult.ok) {
      throw applyResult.error;
    }
    return applyResult.value;
  }
}
