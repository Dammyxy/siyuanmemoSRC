import {
  createInMemoryReviewFeedbackJournalStore,
  type ReviewFeedbackJournalStore,
} from './ReviewFeedbackJournalStore';
import type { MessagePackTruthSegmentFileStore } from '../truth/MessagePackTruthSegmentStore';

export interface SqliteConflictDatabaseSource {
  sourceId: string;
  bytes: Uint8Array;
  path?: string | null;
  modifiedAt?: number | null;
  size?: number | null;
}

export interface SqlitePersistenceBridge {
  readBinary(path: string, metadata?: SqlitePersistenceHostEffectMetadata): Promise<Uint8Array | null>;
  writeBinary(path: string, bytes: Uint8Array, metadata?: SqlitePersistenceHostEffectMetadata): Promise<void>;
  readJSON?<T>(path: string, metadata?: SqlitePersistenceHostEffectMetadata): Promise<T | null>;
  writeJSON?(path: string, value: unknown, metadata?: SqlitePersistenceHostEffectMetadata): Promise<void>;
  deleteFile?(path: string): Promise<void>;
  hasLegacyPetalSqliteDb?(): Promise<boolean>;
  reviewFeedbackJournalStore?: ReviewFeedbackJournalStore;
  truthFileStore?: MessagePackTruthSegmentFileStore;
  readSyncConflictDatabaseSources?(): Promise<SqliteConflictDatabaseSource[]>;
  cleanupSyncConflictDatabaseSources?(sourceIds: string[]): Promise<{
    cleaned: Array<{ sourceId: string; path: string | null }>;
    skipped: Array<{ sourceId: string; reason: string }>;
    failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  }>;
}

export interface SqlitePersistenceHostEffectMetadata {
  purpose?: string | null;
  substep?: string | null;
}

export function toTransferableArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function createUnavailableSqlitePersistenceBridge(reason: string): SqlitePersistenceBridge {
  return {
    async readBinary(): Promise<Uint8Array | null> {
      throw new Error(reason);
    },
    async writeBinary(): Promise<void> {
      throw new Error(reason);
    },
    async readJSON<T>(): Promise<T | null> {
      throw new Error(reason);
    },
    async writeJSON(): Promise<void> {
      throw new Error(reason);
    },
    async deleteFile(): Promise<void> {
      throw new Error(reason);
    },
    async hasLegacyPetalSqliteDb(): Promise<boolean> {
      return false;
    },
    async readSyncConflictDatabaseSources(): Promise<SqliteConflictDatabaseSource[]> {
      throw new Error(reason);
    },
    async cleanupSyncConflictDatabaseSources(): Promise<{
      cleaned: Array<{ sourceId: string; path: string | null }>;
      skipped: Array<{ sourceId: string; reason: string }>;
      failed: Array<{ sourceId: string; path: string | null; reason: string }>;
    }> {
      throw new Error(reason);
    },
  };
}

export function createInMemorySqlitePersistenceBridge(): SqlitePersistenceBridge & {
  snapshot(): { bytes: Uint8Array | null };
  jsonSnapshot(path: string): unknown | null;
} {
  const binary = new Map<string, Uint8Array>();
  const json = new Map<string, unknown>();
  const reviewFeedbackJournalStore = createInMemoryReviewFeedbackJournalStore();
  const truthFileStore: MessagePackTruthSegmentFileStore = {
    async readJSON<T>(path: string): Promise<T | null> {
      return (json.get(path) as T | undefined) ?? null;
    },
    async writeJSON(path: string, value: unknown): Promise<void> {
      json.set(path, value);
    },
    async readBinary(path: string): Promise<Uint8Array | null> {
      const value = binary.get(path);
      return value ? new Uint8Array(value) : null;
    },
    async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
      const buffer = toTransferableArrayBuffer(bytes);
      binary.set(path, new Uint8Array(buffer));
    },
    async listFiles(prefix: string): Promise<string[]> {
      return [
        ...Array.from(json.keys()),
        ...Array.from(binary.keys()),
      ].filter((path) => path.startsWith(prefix));
    },
    async deleteFile(path: string): Promise<void> {
      binary.delete(path);
      json.delete(path);
    },
  };

  return {
    reviewFeedbackJournalStore,
    truthFileStore,
    async readBinary(path: string): Promise<Uint8Array | null> {
      const value = binary.get(path);
      return value ? new Uint8Array(value) : null;
    },
    async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
      const buffer = toTransferableArrayBuffer(bytes);
      binary.set(path, new Uint8Array(buffer));
    },
    async readJSON<T>(path: string): Promise<T | null> {
      return (json.get(path) as T | undefined) ?? null;
    },
    async writeJSON(path: string, value: unknown): Promise<void> {
      json.set(path, value);
    },
    async deleteFile(path: string): Promise<void> {
      json.delete(path);
      binary.delete(path);
    },
    async hasLegacyPetalSqliteDb(): Promise<boolean> {
      return binary.has('storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db');
    },
    async readSyncConflictDatabaseSources(): Promise<SqliteConflictDatabaseSource[]> {
      return [];
    },
    async cleanupSyncConflictDatabaseSources(sourceIds: string[]): Promise<{
      cleaned: Array<{ sourceId: string; path: string | null }>;
      skipped: Array<{ sourceId: string; reason: string }>;
      failed: Array<{ sourceId: string; path: string | null; reason: string }>;
    }> {
      return {
        cleaned: sourceIds.map((sourceId) => ({ sourceId, path: null })),
        skipped: [],
        failed: [],
      };
    },
    snapshot() {
      const first = binary.get('siyuanmemo.db');
      return {
        bytes: first ? new Uint8Array(first) : null,
      };
    },
    jsonSnapshot(path: string): unknown | null {
      return json.get(path) ?? null;
    },
  };
}
