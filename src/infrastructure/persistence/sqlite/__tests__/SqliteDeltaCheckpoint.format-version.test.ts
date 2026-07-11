import { encode } from '@msgpack/msgpack';
import { describe, expect, it } from 'vitest';
import {
  SQLITE_DELTA_LOG_FILE,
  SQLITE_DELTA_LOG_VERSION,
  SQLITE_DELTA_OPEN_SEGMENT_FILE,
  SqliteDeltaCheckpointLayer,
} from '../SqliteDeltaCheckpoint';

class MemoryDeltaFileService {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    return this.binaryFiles.get(fileName) ?? null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    version: SQLITE_DELTA_LOG_VERSION,
    path: SQLITE_DELTA_LOG_FILE,
    openSegment: null,
    sealedSegments: [],
    updatedAt: 0,
    nextSequence: 1,
    checkpoint: null,
    ...overrides,
  };
}

describe('SqliteDeltaCheckpoint format versions', () => {
  it('reports bounded delta inventory from the manifest without replaying segment payloads', async () => {
    const fileService = new MemoryDeltaFileService();
    fileService.jsonFiles.set(SQLITE_DELTA_LOG_FILE, manifest({
      openSegment: {
        version: SQLITE_DELTA_LOG_VERSION,
        path: SQLITE_DELTA_OPEN_SEGMENT_FILE,
        sequence: 3,
        sealed: false,
        checksum: 'sha256:open',
        entryCount: 2,
        byteSize: 300,
        minCreatedAt: 300,
        maxCreatedAt: 400,
        sealedAt: null,
      },
      sealedSegments: [
        {
          version: SQLITE_DELTA_LOG_VERSION,
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.segment-000001.msgpack',
          sequence: 1,
          sealed: true,
          checksum: 'sha256:sealed-1',
          entryCount: 3,
          byteSize: 500,
          minCreatedAt: 100,
          maxCreatedAt: 200,
          sealedAt: 250,
        },
        {
          version: SQLITE_DELTA_LOG_VERSION,
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.segment-000002.msgpack',
          sequence: 2,
          sealed: true,
          checksum: 'sha256:sealed-2',
          entryCount: 1,
          byteSize: 200,
          minCreatedAt: 250,
          maxCreatedAt: 250,
          sealedAt: 275,
        },
      ],
      nextSequence: 4,
    }));
    const layer = new SqliteDeltaCheckpointLayer(fileService);

    await expect(layer.getStorageInventory()).resolves.toEqual({
      files: 3,
      sealedFiles: 2,
      openFiles: 1,
      entries: 6,
      bytes: 1_000,
      oldestCreatedAt: 100,
    });
  });

  it('fails closed on a future delta manifest version', async () => {
    const fileService = new MemoryDeltaFileService();
    fileService.jsonFiles.set(SQLITE_DELTA_LOG_FILE, manifest({ version: SQLITE_DELTA_LOG_VERSION + 1 }));
    const layer = new SqliteDeltaCheckpointLayer(fileService);

    await expect(layer.replayPending({} as never))
      .rejects
      .toThrow(`SQLite delta log unsupported: expected version ${SQLITE_DELTA_LOG_VERSION}`);
  });

  it('fails closed on a future delta segment version', async () => {
    const fileService = new MemoryDeltaFileService();
    const bytes = encode({
      version: SQLITE_DELTA_LOG_VERSION + 1,
      kind: 'sqlite-delta-segment',
      path: SQLITE_DELTA_OPEN_SEGMENT_FILE,
      sequence: 1,
      sealed: false,
      createdAt: 1,
      updatedAt: 1,
      entries: [],
    });
    fileService.binaryFiles.set(SQLITE_DELTA_OPEN_SEGMENT_FILE, bytes);
    fileService.jsonFiles.set(SQLITE_DELTA_LOG_FILE, manifest({
      openSegment: {
        version: SQLITE_DELTA_LOG_VERSION,
        path: SQLITE_DELTA_OPEN_SEGMENT_FILE,
        sequence: 1,
        sealed: false,
        checksum: '',
        entryCount: 0,
        byteSize: bytes.byteLength,
        minCreatedAt: null,
        maxCreatedAt: null,
        sealedAt: null,
      },
      nextSequence: 2,
    }));
    const layer = new SqliteDeltaCheckpointLayer(fileService);

    await expect(layer.replayPending({} as never))
      .rejects
      .toThrow(`SQLite delta segment corrupt: ${SQLITE_DELTA_OPEN_SEGMENT_FILE}`);
  });
});
