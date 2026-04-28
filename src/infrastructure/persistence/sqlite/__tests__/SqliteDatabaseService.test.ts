import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';

type JsonFileService = Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'>;

class MemorySqliteFileService implements JsonFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  writeBinaryCount = 0;
  failNextWriteBinary = false;

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.writeBinaryCount += 1;
    if (this.failNextWriteBinary) {
      this.failNextWriteBinary = false;
      throw new Error('mock binary write failed');
    }
    this.binary.set(fileName, new Uint8Array(bytes));
  }

  resetWriteCounts(): void {
    this.writeBinaryCount = 0;
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

describe('SqliteDatabaseService', () => {
  it('defers nested persists and writes one binary database file per outer transaction', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.resetWriteCounts();

    await database.runTransaction('hot-path', async () => {
      database.run('CREATE TABLE hot_path_test (id TEXT PRIMARY KEY, value TEXT)');
      database.run('INSERT INTO hot_path_test (id, value) VALUES (?, ?)', ['a', 'one']);
      await database.persist();
      await database.write((db) => {
        db.run('INSERT INTO hot_path_test (id, value) VALUES (?, ?)', ['b', 'two']);
      });
    });

    expect(fileService.writeBinaryCount).toBe(1);
    expect(database.getAll<{ value: string }>('SELECT value FROM hot_path_test ORDER BY id')).toEqual([
      { value: 'one' },
      { value: 'two' },
    ]);
    expect(fileService.binary.get(SQLITE_DB_FILE)?.byteLength).toBeGreaterThan(16);
  });

  it('loads a legacy base64 envelope, backs it up, and rewrites the database as binary', async () => {
    const sourceFileService = new MemorySqliteFileService();
    const sourceDatabase = new SqliteDatabaseService(sourceFileService);
    await sourceDatabase.init();
    await sourceDatabase.runTransaction('seed-legacy-envelope', () => {
      sourceDatabase.run('CREATE TABLE legacy_envelope_test (id TEXT PRIMARY KEY, value TEXT)');
      sourceDatabase.run('INSERT INTO legacy_envelope_test (id, value) VALUES (?, ?)', ['legacy', 'loaded']);
    });
    const legacyBytes = sourceFileService.binary.get(SQLITE_DB_FILE);
    expect(legacyBytes).toBeTruthy();

    const fileService = new MemorySqliteFileService();
    fileService.json.set(SQLITE_DB_FILE, {
      encoding: 'base64-sqlite-v1',
      byteLength: legacyBytes!.byteLength,
      updatedAt: 1,
      data: toBase64(legacyBytes!),
    });
    const database = new SqliteDatabaseService(fileService);
    await database.init();

    expect(database.getOne<{ value: string }>('SELECT value FROM legacy_envelope_test WHERE id = ?', ['legacy'])).toEqual({
      value: 'loaded',
    });
    expect(fileService.binary.get(SQLITE_DB_FILE)?.byteLength).toBeGreaterThan(16);
    expect(Array.from(fileService.json.keys()).some((key) => key.startsWith('migration-backups/siyuanmemo.db.base64-envelope-'))).toBe(true);
  });

  it('restores the in-memory database from the last persisted file when transaction persist fails', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    await database.runTransaction('seed-restore-test', () => {
      database.run('CREATE TABLE restore_test (id TEXT PRIMARY KEY, value TEXT)');
      database.run('INSERT INTO restore_test (id, value) VALUES (?, ?)', ['before', 'persisted']);
    });

    fileService.failNextWriteBinary = true;
    await expect(database.runTransaction('failing-review-feedback', () => {
      database.run('INSERT INTO restore_test (id, value) VALUES (?, ?)', ['after', 'unpersisted']);
    })).rejects.toThrow('mock binary write failed');

    expect(database.getAll<{ id: string; value: string }>('SELECT id, value FROM restore_test ORDER BY id')).toEqual([
      { id: 'before', value: 'persisted' },
    ]);
  });

  it('exposes FTS5 capability without creating an unconditional virtual table dependency', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();

    expect(typeof database.supportsFts5()).toBe('boolean');
    expect(database.getOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name = '__siyuanmemo_fts5_probe'",
    )).toBeNull();
  });
});
