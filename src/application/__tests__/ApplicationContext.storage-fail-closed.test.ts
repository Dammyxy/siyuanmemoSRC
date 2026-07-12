import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'siyuan';

const sqliteInitMock = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/persistence/sqlite', () => ({
  SqlArenaRepository: class {},
  SqliteDatabaseService: class {
    init = sqliteInitMock;
  },
  SqlNeuralRoamRouteRepository: class {},
  SqlQueueStateRepository: class {},
  SqlReviewLogRepository: class {},
  SqlUnifiedStorageRepository: class {},
  SqlXiuyuanReadRepository: class {},
}));

import { ApplicationContext } from '@/application/ApplicationContext';

const STORAGE_ROLLBACK_ENV = 'VITE_SIYUANMEMO_ALLOW_STORAGE_ROLLBACK';

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function createMockPlugin(): Plugin {
  return {
    name: 'test-plugin',
    data: {},
    app: {},
    loadData: vi.fn(async (fileName: string) => fileName === 'settings.json' ? {
      storageConflictResolution: 'merge',
    } : null),
    saveData: vi.fn(async () => {}),
    removeData: vi.fn(async () => {}),
  } as unknown as Plugin;
}

describe('ApplicationContext storage bootstrap fallback governance', () => {
  it('fails closed before renderer SQLite initialization when Worker maintenance is unavailable', async () => {
    const previousRollback = process.env[STORAGE_ROLLBACK_ENV];
    delete process.env[STORAGE_ROLLBACK_ENV];
    sqliteInitMock.mockReset();

    try {
      await expect(ApplicationContext.create({
        plugin: createMockPlugin(),
        i18n: {},
      })).rejects.toThrow('BACKEND_UNAVAILABLE: storage maintenance requires backend Worker');
      expect(sqliteInitMock).not.toHaveBeenCalled();
    } finally {
      if (previousRollback === undefined) {
        delete process.env[STORAGE_ROLLBACK_ENV];
      } else {
        process.env[STORAGE_ROLLBACK_ENV] = previousRollback;
      }
    }
  });

  it('keeps normal startup readiness impossible for recovery, untrusted storage, and hard pressure states', () => {
    const contextSource = readRepoFile('src/application/ApplicationContext.ts');
    const workerSource = readRepoFile('worker/db/SqliteDatabaseService.ts');
    const workerTests = readRepoFile('worker/__tests__/WorkerSqliteDatabaseService.test.ts');
    const evidenceTests = readRepoFile('worker/db/__tests__/WorkerStartupStorageEvidence.test.ts');

    expect(contextSource).toContain('recordStartupDeferredWorkDescriptors(startupDeferredWorkDescriptors, loadResult)');
    expect(contextSource).toContain('const hasStartupMaintenance = hasStartupStorageMaintenanceDescriptor(deferredDescriptors)');
    expect(contextSource).toContain('if (!hasStartupMaintenance)');
    expect(workerSource).toContain('private createStartupReadinessDisposition()');
    expect(workerSource).toContain("? 'read-only-authority-unavailable'");
    expect(workerSource).toContain("? 'read-only-recovery-required'");
    expect(workerSource).toContain("? 'read-only-storage-pressure'");
    expect(workerSource).toContain('writable: !authorityUnavailable && !recoveryRequired && !storagePressureBlocked');
    expect(workerSource).toContain("if (readiness.status !== 'ready')");
    expect(workerSource).toContain('return [];');
    expect(evidenceTests).toContain('identity authority copies disagree');
    expect(evidenceTests).toContain('storage identity requires both deviceId and identityEpoch');
    expect(evidenceTests).toContain('TRUTH_VALIDATION_FAILED: canonical segment checksum mismatch');
    expect(workerTests).toContain('keeps typed authority-unavailable recovery read-only and preserves pending Review journal work');
    expect(workerTests).toContain('keeps startup readable and fail-closed when a v2 sealed sqlite delta checksum mismatches');
    expect(workerTests).toContain('keeps startup readable but not writable when hard storage pressure cannot clear');
  });
});
