import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'siyuan';

const sqliteInitMock = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/persistence/sqlite', () => ({
  SqlArenaRepository: class {},
  SqliteDatabaseService: class {
    init = sqliteInitMock;
  },
  SqliteMigrationService: class {},
  SqlQueueStateRepository: class {},
  SqlReviewLogRepository: class {},
  SqlUnifiedStorageRepository: class {},
}));

import { ApplicationContext } from '@/application/ApplicationContext';

const STORAGE_ROLLBACK_ENV = 'VITE_SIYUANMEMO_ALLOW_STORAGE_ROLLBACK';

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
  it('fails closed when SQLite initialization fails without explicit operator rollback', async () => {
    const previousRollback = process.env[STORAGE_ROLLBACK_ENV];
    delete process.env[STORAGE_ROLLBACK_ENV];
    sqliteInitMock.mockRejectedValueOnce(new Error('sqlite unavailable'));

    try {
      await expect(ApplicationContext.create({
        plugin: createMockPlugin(),
        i18n: {},
      })).rejects.toThrow('STORAGE_UNAVAILABLE: SQLite migration/init failed');
    } finally {
      if (previousRollback === undefined) {
        delete process.env[STORAGE_ROLLBACK_ENV];
      } else {
        process.env[STORAGE_ROLLBACK_ENV] = previousRollback;
      }
    }
  });
});
