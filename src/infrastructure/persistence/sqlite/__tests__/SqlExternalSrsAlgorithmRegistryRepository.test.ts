import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SqlExternalSrsAlgorithmRegistryRepository } from '@/infrastructure/persistence/sqlite/SqlExternalSrsAlgorithmRegistryRepository';
import type { ExternalSrsAlgorithmRegistryRecord } from '@/application/services/external-srs/ExternalSrsAlgorithmRuntime';

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

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
    this.binary.set(fileName, new Uint8Array(bytes));
  }
}

function record(overrides: Partial<ExternalSrsAlgorithmRegistryRecord> = {}): ExternalSrsAlgorithmRegistryRecord {
  return {
    algorithmId: 'external:demo',
    label: 'Demo Local Algorithm',
    domain: 'srs',
    enabled: false,
    state: 'disabled',
    runtimeKind: 'worker-module',
    version: '1.0.0',
    parameterHash: 'external-params:test',
    stateSchemaVersion: 1,
    metadata: {
      source: 'external-local',
      advisoryOnly: true,
    },
    ...overrides,
  };
}

describe('SqlExternalSrsAlgorithmRegistryRepository', () => {
  it('stores user-installed algorithm metadata in algorithm_registry disabled by default', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlExternalSrsAlgorithmRegistryRepository(database);

    repository.upsertExternalAlgorithm(record());

    const row = database.getOne<{
      algorithm_id: string;
      enabled: number;
      state: string;
      runtime_kind: string;
      metadata_json: string;
    }>(
      'SELECT algorithm_id, enabled, state, runtime_kind, metadata_json FROM algorithm_registry WHERE algorithm_id = ?',
      ['external:demo'],
    );
    expect(row).toMatchObject({
      algorithm_id: 'external:demo',
      enabled: 0,
      state: 'disabled',
      runtime_kind: 'worker-module',
    });
    expect(JSON.parse(row?.metadata_json || '{}')).toMatchObject({
      source: 'external-local',
      advisoryOnly: true,
    });
  });

  it('updates enable, disable, and unavailable states without touching built-in registry rows', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlExternalSrsAlgorithmRegistryRepository(database);
    repository.upsertExternalAlgorithm(record());

    repository.updateExternalAlgorithmState('external:demo', {
      enabled: true,
      state: 'enabled',
      metadataPatch: { enabledAt: 10 },
    });
    repository.updateExternalAlgorithmState('external:demo', {
      enabled: false,
      state: 'unavailable',
      metadataPatch: { unavailableReason: 'entry-missing' },
    });

    expect(repository.getExternalAlgorithm('external:demo')).toMatchObject({
      algorithmId: 'external:demo',
      enabled: false,
      state: 'unavailable',
      metadata: {
        enabledAt: 10,
        unavailableReason: 'entry-missing',
      },
    });
    expect(repository.listExternalAlgorithms().map((entry) => entry.algorithmId)).toEqual(['external:demo']);

    const builtinRows = database.getAll<{ algorithm_id: string }>(
      "SELECT algorithm_id FROM algorithm_registry WHERE algorithm_id IN ('fsrs-v6', 'a-factor-v2') ORDER BY algorithm_id",
    );
    expect(builtinRows.map((row) => row.algorithm_id)).toEqual(['a-factor-v2', 'fsrs-v6']);
  });
});
