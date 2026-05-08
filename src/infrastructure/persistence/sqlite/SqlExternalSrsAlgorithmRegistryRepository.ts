import type {
  ExternalSrsAlgorithmRegistryPort,
  ExternalSrsAlgorithmRegistryRecord,
  ExternalSrsAlgorithmRegistryStateUpdate,
  ExternalSrsRegistryState,
  ExternalSrsRuntimeKind,
} from '@/application/services/external-srs/ExternalSrsAlgorithmRuntime';
import { EXTERNAL_SRS_ALGORITHM_ID_PREFIX } from '@/application/services/external-srs/ExternalSrsAlgorithmRuntime';
import { parseJson, stringifyJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

type AlgorithmRegistryRow = Record<string, string | number> & {
  algorithm_id: string;
  label: string;
  domain: string;
  enabled: number;
  state: string;
  runtime_kind: string;
  version: string;
  parameter_hash: string;
  state_schema_version: number;
  metadata_json: string;
};

function toRecord(row: AlgorithmRegistryRow): ExternalSrsAlgorithmRegistryRecord {
  return {
    algorithmId: row.algorithm_id,
    label: row.label,
    domain: 'srs',
    enabled: Number(row.enabled) === 1,
    state: row.state as ExternalSrsRegistryState,
    runtimeKind: row.runtime_kind as ExternalSrsRuntimeKind,
    version: row.version,
    parameterHash: row.parameter_hash,
    stateSchemaVersion: Number(row.state_schema_version) || 1,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  };
}

export class SqlExternalSrsAlgorithmRegistryRepository implements ExternalSrsAlgorithmRegistryPort {
  constructor(private readonly database: SqliteDatabaseService) {}

  upsertExternalAlgorithm(record: ExternalSrsAlgorithmRegistryRecord): void {
    this.database.run(
      `INSERT OR REPLACE INTO algorithm_registry
        (algorithm_id, label, domain, enabled, state, runtime_kind, version, parameter_hash, state_schema_version, metadata_json)
       VALUES (?, ?, 'srs', ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.algorithmId,
        record.label,
        record.enabled ? 1 : 0,
        record.state,
        record.runtimeKind,
        record.version,
        record.parameterHash,
        record.stateSchemaVersion,
        stringifyJson(record.metadata),
      ],
    );
  }

  updateExternalAlgorithmState(
    algorithmId: string,
    update: ExternalSrsAlgorithmRegistryStateUpdate,
  ): void {
    const current = this.getExternalAlgorithm(algorithmId);
    const metadata = {
      ...(current?.metadata || {}),
      ...(update.metadataPatch || {}),
    };
    this.database.run(
      `UPDATE algorithm_registry
       SET enabled = ?, state = ?, metadata_json = ?
       WHERE algorithm_id = ? AND domain = 'srs'`,
      [
        update.enabled ? 1 : 0,
        update.state,
        stringifyJson(metadata),
        algorithmId,
      ],
    );
  }

  getExternalAlgorithm(algorithmId: string): ExternalSrsAlgorithmRegistryRecord | null {
    const row = this.database.getOne<AlgorithmRegistryRow>(
      `SELECT algorithm_id, label, domain, enabled, state, runtime_kind, version, parameter_hash, state_schema_version, metadata_json
       FROM algorithm_registry
       WHERE algorithm_id = ? AND domain = 'srs'
       LIMIT 1`,
      [algorithmId],
    );
    return row ? toRecord(row) : null;
  }

  listExternalAlgorithms(): ExternalSrsAlgorithmRegistryRecord[] {
    const rows = this.database.getAll<AlgorithmRegistryRow>(
      `SELECT algorithm_id, label, domain, enabled, state, runtime_kind, version, parameter_hash, state_schema_version, metadata_json
       FROM algorithm_registry
       WHERE domain = 'srs' AND algorithm_id LIKE ?
       ORDER BY label COLLATE NOCASE, algorithm_id`,
      [`${EXTERNAL_SRS_ALGORITHM_ID_PREFIX}%`],
    );
    return rows.map(toRecord);
  }
}
