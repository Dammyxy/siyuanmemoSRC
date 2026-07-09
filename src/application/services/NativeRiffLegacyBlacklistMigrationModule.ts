import type { NativeRiffImportExclusionPort } from '@/application/ports/NativeRiffImportExclusionPort';
import type { NativeRiffLegacyBlacklistPort } from '@/application/ports/NativeRiffLegacyBlacklistPort';

export type NativeRiffLegacyBlacklistMigrationResult = Readonly<{
  migratedBlockIds: readonly string[];
  migratedCount: number;
  legacyCleared: boolean;
}>;

export class NativeRiffLegacyBlacklistMigrationModule {
  constructor(private readonly deps: Readonly<{
    legacy: NativeRiffLegacyBlacklistPort;
    exclusions: NativeRiffImportExclusionPort;
  }>) {}

  async migrate(): Promise<NativeRiffLegacyBlacklistMigrationResult> {
    const blockIds = normalizeBlockIds(await this.deps.legacy.listBlockIds());
    if (blockIds.length === 0) {
      return {
        migratedBlockIds: [],
        migratedCount: 0,
        legacyCleared: false,
      };
    }

    for (const blockId of blockIds) {
      await this.deps.exclusions.saveExclusion({
        blockId,
        source: 'legacy-blacklist',
        reason: 'migrated-riff-blacklist',
      });
    }

    await this.deps.legacy.clear();
    return {
      migratedBlockIds: blockIds,
      migratedCount: blockIds.length,
      legacyCleared: true,
    };
  }
}

function normalizeBlockIds(values: readonly string[]): string[] {
  return Array.from(new Set(
    values
      .map(value => String(value || '').trim())
      .filter(Boolean),
  )).sort();
}
