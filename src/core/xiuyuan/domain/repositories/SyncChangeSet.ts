import type { Xiuyuan } from '../Xiuyuan';

export interface RiffSyncStatePatch {
  lastSuccessfulIncrementalCursor?: string;
  lastSuccessfulIncrementalAt?: number;
  lastSuccessfulFullAt?: number;
}

export interface PlannedSyncCreate {
  blockId: string;
  xiuyuanEntity: Xiuyuan;
}

export interface PlannedSyncUpdate {
  blockId: string;
  xiuyuanEntity: Xiuyuan;
}

export interface PlannedSyncDelete {
  blockId: string;
  xiuyuanEntity: Xiuyuan;
}

export interface SyncChangeSetStats {
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  skippedCount: number;
  blacklistCleanedCount: number;
}

export interface SyncChangeSet {
  creates: PlannedSyncCreate[];
  metadataUpdates: PlannedSyncUpdate[];
  deletes: PlannedSyncDelete[];
  blacklistCleanup: string[];
  checkpointAdvance?: RiffSyncStatePatch;
  stats: SyncChangeSetStats;
}

export interface AppliedSyncSummary {
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  blacklistCleanedCount: number;
  checkpointApplied: boolean;
}
