import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { createAutoCardKernelXiuyuanServiceBundle } from '../createAutoCardKernelXiuyuanServiceBundle';

describe('createAutoCardKernelXiuyuanServiceBundle', () => {
  it('creates typed AutoCard and Xiuyuan factories without ApplicationContext locator access', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/application/factories/createAutoCardKernelXiuyuanServiceBundle.ts'),
      'utf8',
    );
    const bundle = createAutoCardKernelXiuyuanServiceBundle({
      plugin: { name: 'test-plugin', app: {} } as never,
      getUnifiedStorage: () => ({ getXiuyuans: vi.fn(() => []), getAllCards: vi.fn(() => []) } as never),
      getSqlXiuyuanReadRepository: () => null,
      getCardTypeDetectionService: () => ({} as never),
      getEventBus: () => ({ publish: vi.fn(), subscribe: vi.fn() } as never),
    });

    expect(source).toContain('AutoCardKernelXiuyuanServiceBundle');
    expect(source).not.toContain('ApplicationContext');
    expect(await bundle.createXiuyuanApplicationService()).toBeInstanceOf(XiuyuanApplicationService);
    expect(bundle.createAutoCardHandler).toEqual(expect.any(Function));
  });
});
