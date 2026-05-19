export interface SqliteConflictDatabaseSource {
  sourceId: string;
  bytes: Uint8Array;
  path?: string | null;
  modifiedAt?: number | null;
  size?: number | null;
}

export interface SqlitePersistenceBridge {
  readBinary(path: string): Promise<Uint8Array | null>;
  writeBinary(path: string, bytes: Uint8Array): Promise<void>;
  readJSON?<T>(path: string): Promise<T | null>;
  writeJSON?(path: string, value: unknown): Promise<void>;
  readSyncConflictDatabaseSources?(): Promise<SqliteConflictDatabaseSource[]>;
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
    async readSyncConflictDatabaseSources(): Promise<SqliteConflictDatabaseSource[]> {
      throw new Error(reason);
    },
  };
}

export function createInMemorySqlitePersistenceBridge(): SqlitePersistenceBridge & {
  snapshot(): { bytes: Uint8Array | null };
} {
  const binary = new Map<string, Uint8Array>();
  const json = new Map<string, unknown>();

  return {
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
    async readSyncConflictDatabaseSources(): Promise<SqliteConflictDatabaseSource[]> {
      return [];
    },
    snapshot() {
      const first = binary.values().next().value as Uint8Array | undefined;
      return {
        bytes: first ? new Uint8Array(first) : null,
      };
    },
  };
}
