import type {
  NativeRiffImportExclusion,
  NativeRiffImportExclusionPort,
  NativeRiffImportExclusionSource,
  SaveNativeRiffImportExclusionInput,
} from '@/application/ports/NativeRiffImportExclusionPort';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import { parseJson, stringifyJson } from './json';

export const NATIVE_RIFF_IMPORT_EXCLUSION_KIND = 'native-riff-import-exclusion';

type NativeRiffImportExclusionRow = Readonly<{
  payload_json: string;
}>;

export class SqlNativeRiffImportExclusionRepository
implements NativeRiffImportExclusionPort {
  private readonly now: () => number;

  constructor(
    private readonly database: SqliteDatabaseService,
    options: Readonly<{ now?: () => number }> = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  async findExclusion(blockId: string): Promise<NativeRiffImportExclusion | null> {
    const normalizedBlockId = normalizeRequiredString(blockId, 'blockId');
    const row = this.database.getOne<NativeRiffImportExclusionRow>(
      `SELECT payload_json
       FROM tombstones
       WHERE kind = ? AND id = ?`,
      [NATIVE_RIFF_IMPORT_EXCLUSION_KIND, normalizedBlockId],
    );
    return normalizeExclusion(
      parseJson<unknown>(row?.payload_json, null),
      normalizedBlockId,
    );
  }

  async hasExclusion(blockId: string): Promise<boolean> {
    const normalizedBlockId = normalizeRequiredString(blockId, 'blockId');
    return Boolean(this.database.getOne<{ present: number }>(
      `SELECT 1 AS present
       FROM tombstones
       WHERE kind = ? AND id = ?`,
      [NATIVE_RIFF_IMPORT_EXCLUSION_KIND, normalizedBlockId],
    ));
  }

  async saveExclusion(
    input: SaveNativeRiffImportExclusionInput,
  ): Promise<NativeRiffImportExclusion> {
    const blockId = normalizeRequiredString(input.blockId, 'blockId');
    const record = Object.freeze({
      version: 1 as const,
      blockId,
      ...optionalString('nativeCardId', input.nativeCardId),
      ...optionalString('deckId', input.deckId),
      excludedAt: normalizeTimestamp(this.now()),
      source: normalizeSource(input.source),
      ...optionalString('reason', input.reason),
    });

    await this.database.write((db) => {
      db.run(
        `INSERT OR IGNORE INTO tombstones (
          kind,
          id,
          deleted_at,
          deleted_by,
          payload_json
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          NATIVE_RIFF_IMPORT_EXCLUSION_KIND,
          blockId,
          record.excludedAt,
          record.source,
          stringifyJson(record),
        ],
      );
    }, {
      label: 'native-riff-import-exclusion.save',
    });

    const persisted = await this.findExclusion(blockId);
    if (!persisted) {
      throw new Error('NATIVE_RIFF_IMPORT_EXCLUSION_PERSIST_FAILED');
    }
    return persisted;
  }

  async removeExclusion(blockId: string): Promise<boolean> {
    const normalizedBlockId = normalizeRequiredString(blockId, 'blockId');
    if (!(await this.hasExclusion(normalizedBlockId))) {
      return false;
    }

    await this.database.write((db) => {
      db.run(
        'DELETE FROM tombstones WHERE kind = ? AND id = ?',
        [NATIVE_RIFF_IMPORT_EXCLUSION_KIND, normalizedBlockId],
      );
    }, {
      label: 'native-riff-import-exclusion.remove',
    });
    return true;
  }
}

function normalizeExclusion(
  value: unknown,
  expectedBlockId: string,
): NativeRiffImportExclusion | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }

  const blockId = normalizeString(value.blockId);
  const excludedAt = normalizeOptionalTimestamp(value.excludedAt);
  const source = normalizeOptionalSource(value.source);
  if (blockId !== expectedBlockId || excludedAt === null || !source) {
    return null;
  }

  return Object.freeze({
    version: 1,
    blockId,
    ...optionalString('nativeCardId', value.nativeCardId),
    ...optionalString('deckId', value.deckId),
    excludedAt,
    source,
    ...optionalString('reason', value.reason),
  });
}

function normalizeSource(value: unknown): NativeRiffImportExclusionSource {
  const source = normalizeOptionalSource(value);
  if (!source) {
    throw new Error('NATIVE_RIFF_IMPORT_EXCLUSION_SOURCE_INVALID');
  }
  return source;
}

function normalizeOptionalSource(
  value: unknown,
): NativeRiffImportExclusionSource | null {
  return value === 'legacy-blacklist' || value === 'user'
    ? value
    : null;
}

function normalizeRequiredString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`NATIVE_RIFF_IMPORT_EXCLUSION_${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function optionalString<K extends string>(
  key: K,
  value: unknown,
): Partial<Record<K, string>> {
  const normalized = normalizeString(value);
  return normalized ? { [key]: normalized } as Record<K, string> : {};
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = normalizeOptionalTimestamp(value);
  if (timestamp === null) {
    throw new Error('NATIVE_RIFF_IMPORT_EXCLUSION_TIMESTAMP_INVALID');
  }
  return timestamp;
}

function normalizeOptionalTimestamp(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
