import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'siyuan';
import { ApplicationContext } from '@/application/ApplicationContext';

const ENV_BACKEND = 'VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER';
const ENV_WRITER = 'VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD';
const ENV_PRIVATE = 'VITE_SIYUANMEMO_ENABLE_PRIVATE_API';

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

describe('ApplicationContext private API runtime policy wiring', () => {
  let previousBackend: string | undefined;
  let previousWriter: string | undefined;
  let previousPrivate: string | undefined;

  beforeEach(() => {
    previousBackend = process.env[ENV_BACKEND];
    previousWriter = process.env[ENV_WRITER];
    previousPrivate = process.env[ENV_PRIVATE];
  });

  afterEach(() => {
    if (previousBackend === undefined) {
      delete process.env[ENV_BACKEND];
    } else {
      process.env[ENV_BACKEND] = previousBackend;
    }
    if (previousWriter === undefined) {
      delete process.env[ENV_WRITER];
    } else {
      process.env[ENV_WRITER] = previousWriter;
    }
    if (previousPrivate === undefined) {
      delete process.env[ENV_PRIVATE];
    } else {
      process.env[ENV_PRIVATE] = previousPrivate;
    }
  });

  it('fails closed when private API runtime policy is disabled', async () => {
    process.env[ENV_BACKEND] = 'false';
    process.env[ENV_WRITER] = 'false';
    process.env[ENV_PRIVATE] = 'false';

    const context = await ApplicationContext.create({
      plugin: createMockPlugin(),
      i18n: {},
    });
    try {
      expect(() => context.getPrivateApiService()).toThrow('BACKEND_UNAVAILABLE: private API read is disabled by runtime policy');
    } finally {
      await context.dispose();
    }
  });

  it('fails closed when backend policy is enabled but the Worker runtime is unavailable', async () => {
    process.env[ENV_BACKEND] = 'true';
    process.env[ENV_WRITER] = 'false';
    process.env[ENV_PRIVATE] = 'true';

    const context = await ApplicationContext.create({
      plugin: createMockPlugin(),
      i18n: {},
    });
    try {
      expect(() => context.getPrivateApiService()).toThrow(
        'BACKEND_UNAVAILABLE: private API backend client unavailable',
      );
    } finally {
      await context.dispose();
    }
  });

  it('fails closed when mutation policy is enabled but writer relay runtime instance is unavailable', async () => {
    process.env[ENV_BACKEND] = 'true';
    process.env[ENV_WRITER] = 'true';
    process.env[ENV_PRIVATE] = 'true';

    const context = await ApplicationContext.create({
      plugin: createMockPlugin(),
      i18n: {},
    });
    try {
      expect(() => context.getPrivateApiService({ mutation: true })).toThrow(
        'BACKEND_UNAVAILABLE: private API mutation requires writer relay runtime instance',
      );
    } finally {
      await context.dispose();
    }
  });
});
