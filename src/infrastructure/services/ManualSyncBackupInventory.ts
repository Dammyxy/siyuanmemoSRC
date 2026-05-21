const MANUAL_SYNC_BACKUP_DIR = 'manual-sync-backups';
const MANUAL_SYNC_BACKUP_NAME_PATTERN = /^siyuanmemo\.db\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.([^.].*)\.bak$/;

export interface ManualSyncBackupDirectoryEntry {
  name: string;
  isDir: boolean;
  updated?: number | null;
  size?: number | null;
}

export interface ManualSyncBackupInventoryAdapter {
  resolvePluginDataPath(path: string): string;
  readDir(path: string): Promise<ManualSyncBackupDirectoryEntry[]>;
  readBinary(path: string): Promise<Uint8Array | null>;
  deleteFile(path: string): Promise<void>;
}

export interface ManualSyncBackupFileEntry {
  path: string;
  name: string;
  size: number;
  modifiedAt: number | null;
  createdAt: number | null;
  sourceId: string | null;
  matchesPluginPattern: boolean;
  metadataValid: boolean;
}

function parseManualSyncBackupTimestamp(stamp: string): number | null {
  const normalized = stamp.replace(
    /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1$2:$3:$4.$5Z',
  );
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

export class ManualSyncBackupInventory {
  constructor(private readonly adapter: ManualSyncBackupInventoryAdapter) {}

  async listManualSyncBackupFiles(): Promise<ManualSyncBackupFileEntry[]> {
    const entries = await this.adapter.readDir(this.adapter.resolvePluginDataPath(MANUAL_SYNC_BACKUP_DIR));
    return Promise.all(entries
      .filter((entry) => !entry.isDir)
      .map(async (entry) => {
        const path = `${MANUAL_SYNC_BACKUP_DIR}/${entry.name}`;
        const match = MANUAL_SYNC_BACKUP_NAME_PATTERN.exec(entry.name);
        const createdAt = match ? parseManualSyncBackupTimestamp(match[1]) : null;
        const byteSize = match && (!entry.size || entry.size <= 0)
          ? (await this.adapter.readBinary(path))?.byteLength ?? 0
          : entry.size ?? 0;
        return {
          path,
          name: entry.name,
          size: byteSize,
          modifiedAt: entry.updated ?? null,
          createdAt,
          sourceId: match ? match[2] : null,
          matchesPluginPattern: Boolean(match),
          metadataValid: Boolean(match && createdAt !== null),
        };
      }));
  }

  async deleteManualSyncBackupFile(path: string): Promise<void> {
    const normalized = String(path || '').replace(/^\/+/, '');
    if (!normalized.startsWith(`${MANUAL_SYNC_BACKUP_DIR}/`) || normalized.includes('..')) {
      throw new Error('manual sync backup path is outside backup directory');
    }
    const name = normalized.slice(MANUAL_SYNC_BACKUP_DIR.length + 1);
    const match = MANUAL_SYNC_BACKUP_NAME_PATTERN.exec(name);
    const createdAt = match ? parseManualSyncBackupTimestamp(match[1]) : null;
    if (!match || createdAt === null) {
      throw new Error('manual sync backup path does not match plugin backup pattern');
    }
    await this.adapter.deleteFile(normalized);
  }
}
