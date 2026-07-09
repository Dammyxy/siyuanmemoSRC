import type {
  NativeRiffImportRestoreCandidate,
  NativeRiffImportRestorePort,
  NativeRiffImportRestoreResult,
} from '@/application/ports/NativeRiffImportRestorePort';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import { NATIVE_RIFF_IMPORT_EXCLUSION_KIND } from './SqlNativeRiffImportExclusionRepository';
import { parseJson } from './json';

type TombstoneRow = Readonly<{
  kind: string;
  id: string;
  payload_json: string;
}>;

export class SqlNativeRiffImportRestoreRepository
implements NativeRiffImportRestorePort {
  constructor(private readonly database: SqliteDatabaseService) {}

  async restoreCandidate(
    candidate: NativeRiffImportRestoreCandidate,
  ): Promise<NativeRiffImportRestoreResult> {
    const removedCardTombstoneIds: string[] = [];
    const removedXiuyuanTombstoneIds: string[] = [];
    let removedExclusion = false;

    await this.database.write((db) => {
      removedExclusion = Boolean(this.database.getOne<{ present: number }>(
        `SELECT 1 AS present
         FROM tombstones
         WHERE kind = ? AND id = ?`,
        [NATIVE_RIFF_IMPORT_EXCLUSION_KIND, candidate.blockId],
      ));

      const tombstones = this.database.getAll<TombstoneRow>(
        `SELECT kind, id, payload_json
         FROM tombstones
         WHERE kind IN ('card', 'xiuyuan')
         ORDER BY kind, id`,
      );

      for (const tombstone of tombstones) {
        if (!matchesCandidate(tombstone, candidate)) {
          continue;
        }
        db.run(
          'DELETE FROM tombstones WHERE kind = ? AND id = ?',
          [tombstone.kind, tombstone.id],
        );
        if (tombstone.kind === 'card') {
          removedCardTombstoneIds.push(tombstone.id);
        } else {
          removedXiuyuanTombstoneIds.push(tombstone.id);
        }
      }

      if (removedExclusion) {
        db.run(
          'DELETE FROM tombstones WHERE kind = ? AND id = ?',
          [NATIVE_RIFF_IMPORT_EXCLUSION_KIND, candidate.blockId],
        );
      }
    }, {
      label: 'native-riff-import.restore-candidate',
    });

    return {
      removedExclusion,
      removedCardTombstoneIds,
      removedXiuyuanTombstoneIds,
    };
  }
}

function matchesCandidate(
  tombstone: TombstoneRow,
  candidate: NativeRiffImportRestoreCandidate,
): boolean {
  if (tombstone.kind === 'card' && candidate.cardId === tombstone.id) {
    return true;
  }
  if (tombstone.kind === 'xiuyuan' && candidate.xiuyuanId === tombstone.id) {
    return true;
  }

  const payload = parseJson<unknown>(tombstone.payload_json, null);
  if (!isRecord(payload)) {
    return false;
  }
  if (payload.blockId === candidate.blockId) {
    return true;
  }
  if (
    Array.isArray(payload.blockIds)
    && payload.blockIds.some(blockId => blockId === candidate.blockId)
  ) {
    return true;
  }
  return payload.riffCardId === candidate.nativeCardId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
