import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';
import { createAutoCardKernelXiuyuanServiceBundle } from '../createAutoCardKernelXiuyuanServiceBundle';

describe('createAutoCardKernelXiuyuanServiceBundle', () => {
  it('creates typed AutoCard, kernel-adjacent Xiuyuan, and sync factories without ApplicationContext locator access', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/application/factories/createAutoCardKernelXiuyuanServiceBundle.ts'),
      'utf8',
    );
    const bundle = createAutoCardKernelXiuyuanServiceBundle({
      plugin: { name: 'test-plugin', app: {} } as never,
      getUnifiedStorage: () => ({ getXiuyuans: vi.fn(() => []), getAllCards: vi.fn(() => []) } as never),
      getUnifiedDataSourceManager: () => ({ getQueue: vi.fn() } as never),
      getSqlXiuyuanReadRepository: () => null,
      getSrsBackendClient: () => null,
      getCardTypeDetectionService: () => ({} as never),
      getEventBus: () => ({ publish: vi.fn(), subscribe: vi.fn() } as never),
      getRiffBlacklistService: () => ({} as never),
      getDeletionTracker: () => ({} as never),
    });

    expect(source).toContain('AutoCardKernelXiuyuanServiceBundle');
    expect(source).not.toContain('ApplicationContext');
    expect(await bundle.createXiuyuanApplicationService()).toBeInstanceOf(XiuyuanApplicationService);
    expect(bundle.createXiuyuanSyncService({
      mode: 'advanced',
      useLocalScheduler: true,
      storageConflictResolution: 'merge',
      incrementalSync: { enabled: false, triggers: [], useBlacklist: true },
      fullSync: { enabled: false, interval: 86_400_000, cleanupBlacklist: false },
      deleteSync: { enabled: false, useBlacklistFallback: false },
    } as never)).toBeInstanceOf(XiuyuanSyncService);
    expect(bundle.createAutoCardHandler).toEqual(expect.any(Function));
  });
});
