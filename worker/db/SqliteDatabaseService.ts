import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import type { SqlitePersistenceBridge } from './SqlitePersistenceBridge';

type SqlParams = SqlValue[] | ParamsObject;

type SqliteFileServiceAdapter = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  readBinary(fileName: string): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array): Promise<void>;
};

function createSqliteFileServiceAdapter(bridge: SqlitePersistenceBridge): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(fileName: string): Promise<T | null> => {
      if (!bridge.readJSON) {
        return null;
      }
      return bridge.readJSON<T>(fileName);
    },
    writeJSON: async (fileName: string, data: unknown): Promise<void> => {
      if (!bridge.writeJSON) {
        throw new Error(`JSON persistence is not available for ${fileName}`);
      }
      await bridge.writeJSON(fileName, data);
    },
    readBinary: (fileName: string) => bridge.readBinary(fileName),
    writeBinary: (fileName: string, bytes: Uint8Array) => bridge.writeBinary(fileName, bytes),
  };
}

export class WorkerSqliteDatabaseService {
  private readonly runtime: RuntimeSqliteDatabaseService;
  private initialized = false;

  constructor(
    bridge: SqlitePersistenceBridge,
    private readonly dbFile = SQLITE_DB_FILE,
  ) {
    this.runtime = new RuntimeSqliteDatabaseService(createSqliteFileServiceAdapter(bridge), dbFile);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.runtime.init();
    this.initialized = true;
  }

  async load(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    await this.init();
    return {
      ok: true,
      initialized: true,
      dbFile: this.dbFile,
    };
  }

  async persist(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    await this.init();
    await this.runtime.persist();
    return {
      ok: true,
      persisted: true,
      dbFile: this.dbFile,
    };
  }

  getStatus(): { initialized: boolean; dbFile: string } {
    return {
      initialized: this.initialized,
      dbFile: this.dbFile,
    };
  }

  async runTransaction<T>(
    label: string,
    writer: (db: Database) => T | Promise<T>,
  ): Promise<T> {
    await this.init();
    return this.runtime.runTransaction(label, writer);
  }

  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null {
    return this.runtime.getOne<T>(sql, params);
  }

  dispose(): void {
    this.runtime.dispose();
    this.initialized = false;
  }
}
