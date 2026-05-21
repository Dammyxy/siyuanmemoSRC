import type { ManualSyncBackupFileEntry } from '@/infrastructure/services/ManualSyncBackupInventory';

export type ManualSyncBackupRetentionReason =
  | 'eligible-old'
  | 'retained-newest'
  | 'retained-young'
  | 'ignored-name'
  | 'invalid-metadata';

export interface ManualSyncBackupRetentionPolicy {
  keepNewest: number;
  deleteOlderThanDays: number;
}

export interface ManualSyncBackupRetentionCandidate {
  path: string;
  name: string;
  size: number;
  createdAt: number | null;
  sourceId: string | null;
  eligible: boolean;
  reason: ManualSyncBackupRetentionReason;
}

export interface ManualSyncBackupRetentionPreviewResult {
  status: 'preview';
  retention: ManualSyncBackupRetentionPolicy;
  candidates: ManualSyncBackupRetentionCandidate[];
  eligibleCount: number;
  eligibleBytes: number;
}

export interface ManualSyncBackupRetentionApplyResult {
  status: 'applied';
  deleted: Array<{ path: string; size: number }>;
  skipped: ManualSyncBackupRetentionCandidate[];
  failed: Array<{ path: string; reason: string }>;
}

export interface ManualSyncBackupRetentionFileSource {
  listManualSyncBackupFiles(): Promise<ManualSyncBackupFileEntry[]>;
  deleteManualSyncBackupFile(path: string): Promise<void>;
}

const DEFAULT_RETENTION: ManualSyncBackupRetentionPolicy = {
  keepNewest: 3,
  deleteOlderThanDays: 7,
};

function looksLikePluginBackupName(name: string): boolean {
  return name.startsWith('siyuanmemo.db.') && name.endsWith('.bak');
}

export class ManualSyncBackupRetentionApplicationService {
  constructor(
    private readonly fileSource: ManualSyncBackupRetentionFileSource,
    private readonly now: () => number = () => Date.now(),
    private readonly defaultRetention: ManualSyncBackupRetentionPolicy = DEFAULT_RETENTION,
  ) {}

  async preview(retention: Partial<ManualSyncBackupRetentionPolicy> = {}): Promise<ManualSyncBackupRetentionPreviewResult> {
    const resolved = this.resolveRetention(retention);
    const files = await this.fileSource.listManualSyncBackupFiles();
    const candidates = this.classify(files, resolved);
    return {
      status: 'preview',
      retention: resolved,
      candidates,
      eligibleCount: candidates.filter((candidate) => candidate.eligible).length,
      eligibleBytes: candidates
        .filter((candidate) => candidate.eligible)
        .reduce((total, candidate) => total + candidate.size, 0),
    };
  }

  async apply(retention: Partial<ManualSyncBackupRetentionPolicy> = {}): Promise<ManualSyncBackupRetentionApplyResult> {
    const preview = await this.preview(retention);
    const deleted: ManualSyncBackupRetentionApplyResult['deleted'] = [];
    const skipped = preview.candidates.filter((candidate) => !candidate.eligible);
    const failed: ManualSyncBackupRetentionApplyResult['failed'] = [];

    for (const candidate of preview.candidates.filter((item) => item.eligible)) {
      try {
        await this.fileSource.deleteManualSyncBackupFile(candidate.path);
        deleted.push({ path: candidate.path, size: candidate.size });
      } catch (error) {
        failed.push({
          path: candidate.path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { status: 'applied', deleted, skipped, failed };
  }

  private resolveRetention(retention: Partial<ManualSyncBackupRetentionPolicy>): ManualSyncBackupRetentionPolicy {
    return {
      keepNewest: Math.max(1, Math.floor(retention.keepNewest ?? this.defaultRetention.keepNewest)),
      deleteOlderThanDays: Math.max(0, Math.floor(retention.deleteOlderThanDays ?? this.defaultRetention.deleteOlderThanDays)),
    };
  }

  private classify(
    files: ManualSyncBackupFileEntry[],
    retention: ManualSyncBackupRetentionPolicy,
  ): ManualSyncBackupRetentionCandidate[] {
    const valid = files
      .filter((file) => file.matchesPluginPattern && file.metadataValid && file.createdAt !== null)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const newest = new Set(valid.slice(0, retention.keepNewest).map((file) => file.path));
    const ageCutoff = this.now() - retention.deleteOlderThanDays * 24 * 60 * 60 * 1000;

    return files.map((file) => {
      if (!file.matchesPluginPattern) {
        return this.toCandidate(file, false, looksLikePluginBackupName(file.name) ? 'invalid-metadata' : 'ignored-name');
      }
      if (!file.metadataValid || file.createdAt === null) {
        return this.toCandidate(file, false, 'invalid-metadata');
      }
      if (newest.has(file.path)) {
        return this.toCandidate(file, false, 'retained-newest');
      }
      if (file.createdAt >= ageCutoff) {
        return this.toCandidate(file, false, 'retained-young');
      }
      return this.toCandidate(file, true, 'eligible-old');
    });
  }

  private toCandidate(
    file: ManualSyncBackupFileEntry,
    eligible: boolean,
    reason: ManualSyncBackupRetentionReason,
  ): ManualSyncBackupRetentionCandidate {
    return {
      path: file.path,
      name: file.name,
      size: file.size,
      createdAt: file.createdAt,
      sourceId: file.sourceId,
      eligible,
      reason,
    };
  }
}
