import type {
  BackendSyncConflictDatabaseSummary,
  BackendSyncConflictMergeRequest,
  BackendSyncConflictMergeResult,
  BackendSyncConflictReloadResult,
  BackendSyncConflictSummarizeRequest,
  BackendSyncConflictSummarizeResult,
} from '../../../packages/contracts/src/backend-rpc';

export type SyncConflictDirectionChoice =
  | { kind: 'smartMerge'; sourceIds?: string[]; mergedAt?: number }
  | { kind: 'keepCurrentLocal' }
  | { kind: 'replaceWithConflictCopy'; sourceId: string; confirmed: boolean; now?: number }
  | { kind: 'cancel' };

export interface SyncConflictDirectionPreview {
  current: BackendSyncConflictDatabaseSummary | null;
  sources: BackendSyncConflictDatabaseSummary[];
}

export type SyncConflictDirectionApplyResult =
  | { kind: 'smartMerge'; merge: BackendSyncConflictMergeResult }
  | { kind: 'keepCurrentLocal'; unchanged: true; sources: number }
  | { kind: 'replaceWithConflictCopy'; sourceId: string; backupPath: string; reload: BackendSyncConflictReloadResult }
  | { kind: 'cancel'; unchanged: true };

export interface SyncConflictDirectionFileSource {
  readSyncConflictDatabaseSources(): Promise<BackendSyncConflictMergeRequest['sources']>;
  backupCurrentSqliteDatabase(options?: { sourceId?: string; now?: number }): Promise<{ backupPath: string; bytes: Uint8Array }>;
  replaceCurrentSqliteDatabase(bytes: Uint8Array): Promise<void>;
}

export interface SyncConflictDirectionBackend {
  summarizeSyncConflicts(request: BackendSyncConflictSummarizeRequest): Promise<BackendSyncConflictSummarizeResult>;
  mergeSyncConflicts(request: BackendSyncConflictMergeRequest): Promise<BackendSyncConflictMergeResult>;
  reloadSyncConflictDatabase(): Promise<BackendSyncConflictReloadResult>;
}

function readableSource(summary: BackendSyncConflictDatabaseSummary): boolean {
  return summary.parseStatus === 'ok';
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
      const selected = choice.sourceIds?.length
        ? sources.filter((source) => choice.sourceIds!.includes(source.sourceId))
        : sources;
      const summary = await this.backend.summarizeSyncConflicts({ includeCurrent: false, sources: selected });
      const readableIds = new Set(summary.sources.filter(readableSource).map((source) => source.sourceId));
      const readable = selected.filter((source) => readableIds.has(source.sourceId));
      return {
        kind: 'smartMerge',
        merge: await this.backend.mergeSyncConflicts({
          sources: readable,
          mergedAt: choice.mergedAt,
        }),
      };
    }

    if (!choice.confirmed) {
      return { kind: 'cancel', unchanged: true };
    }
    const selected = sources.find((source) => source.sourceId === choice.sourceId);
    if (!selected) {
      throw new Error(`SYNC_CONFLICT_SOURCE_NOT_FOUND: ${choice.sourceId}`);
    }
    const summary = await this.backend.summarizeSyncConflicts({ includeCurrent: false, sources: [selected] });
    const sourceSummary = summary.sources[0];
    if (!sourceSummary || !readableSource(sourceSummary)) {
      throw new Error(`SYNC_CONFLICT_SOURCE_UNREADABLE: ${choice.sourceId}`);
    }

    const backup = await this.fileSource.backupCurrentSqliteDatabase({
      sourceId: selected.sourceId,
      now: choice.now,
    });
    await this.fileSource.replaceCurrentSqliteDatabase(selected.bytes);
    const reload = await this.backend.reloadSyncConflictDatabase();
    return {
      kind: 'replaceWithConflictCopy',
      sourceId: selected.sourceId,
      backupPath: backup.backupPath,
      reload,
    };
  }
}
