import { describe, expect, it, vi } from 'vitest';
import type { NativeRiffImportExclusionPort } from '@/application/ports/NativeRiffImportExclusionPort';
import type { NativeRiffLegacyBlacklistPort } from '@/application/ports/NativeRiffLegacyBlacklistPort';
import { NativeRiffLegacyBlacklistMigrationModule } from '../NativeRiffLegacyBlacklistMigrationModule';

describe('NativeRiffLegacyBlacklistMigrationModule', () => {
  it('writes every durable exclusion before clearing the legacy blacklist', async () => {
    const legacy: NativeRiffLegacyBlacklistPort = {
      listBlockIds: vi.fn(async () => [
        ' block-b ',
        'block-a',
        'block-b',
        '',
      ]),
      clear: vi.fn(async () => undefined),
    };
    const exclusions: NativeRiffImportExclusionPort = {
      findExclusion: vi.fn(async () => null),
      hasExclusion: vi.fn(async () => false),
      saveExclusion: vi.fn(async input => ({
        version: 1,
        blockId: input.blockId,
        excludedAt: 100,
        source: input.source,
        ...(input.reason ? { reason: input.reason } : {}),
      })),
      removeExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffLegacyBlacklistMigrationModule({
      legacy,
      exclusions,
    });

    await expect(module.migrate()).resolves.toEqual({
      migratedBlockIds: ['block-a', 'block-b'],
      migratedCount: 2,
      legacyCleared: true,
    });
    expect(exclusions.saveExclusion).toHaveBeenNthCalledWith(1, {
      blockId: 'block-a',
      source: 'legacy-blacklist',
      reason: 'migrated-riff-blacklist',
    });
    expect(exclusions.saveExclusion).toHaveBeenNthCalledWith(2, {
      blockId: 'block-b',
      source: 'legacy-blacklist',
      reason: 'migrated-riff-blacklist',
    });
    expect(vi.mocked(legacy.clear).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(exclusions.saveExclusion).mock.invocationCallOrder[1] ?? 0,
    );
  });

  it('keeps the legacy blacklist when any durable exclusion write fails', async () => {
    const legacy: NativeRiffLegacyBlacklistPort = {
      listBlockIds: vi.fn(async () => ['block-a', 'block-b']),
      clear: vi.fn(async () => undefined),
    };
    const exclusions: NativeRiffImportExclusionPort = {
      findExclusion: vi.fn(async () => null),
      hasExclusion: vi.fn(async () => false),
      saveExclusion: vi.fn(async input => {
        if (input.blockId === 'block-b') {
          throw new Error('durable exclusion write failed');
        }
        return {
          version: 1,
          blockId: input.blockId,
          excludedAt: 100,
          source: input.source,
        };
      }),
      removeExclusion: vi.fn(async () => false),
    };
    const module = new NativeRiffLegacyBlacklistMigrationModule({
      legacy,
      exclusions,
    });

    await expect(module.migrate()).rejects.toThrow('durable exclusion write failed');
    expect(exclusions.saveExclusion).toHaveBeenCalledTimes(2);
    expect(legacy.clear).not.toHaveBeenCalled();
  });
});
