import { afterEach, describe, expect, it, vi } from 'vitest';

import { withScopedCjsBrowserGlobals } from '@/utils/cjsBrowserGlobals';

type RuntimeGlobal = Record<string, unknown> & {
  Blob?: typeof Blob;
  URL?: typeof URL;
  Worker?: typeof Worker;
  self?: unknown;
  webkitURL?: unknown;
  window?: unknown;
};

type RuntimeGlobalKey = 'Worker' | 'Blob' | 'URL' | 'webkitURL' | 'window' | 'self';
type DescriptorSnapshot = Partial<Record<RuntimeGlobalKey, PropertyDescriptor | null>>;

const CONSTRUCTOR_KEYS: RuntimeGlobalKey[] = ['Worker', 'Blob', 'URL', 'webkitURL'];
const MODULE_IMPORT_KEYS: RuntimeGlobalKey[] = ['window', 'self', 'Worker', 'Blob', 'URL'];

function snapshotDescriptors(
  target: RuntimeGlobal,
  keys: RuntimeGlobalKey[] = CONSTRUCTOR_KEYS,
): DescriptorSnapshot {
  return Object.fromEntries(keys.map((key) => [
    key,
    Object.prototype.hasOwnProperty.call(target, key)
      ? Object.getOwnPropertyDescriptor(target, key) ?? null
      : null,
  ])) as DescriptorSnapshot;
}

function restoreDescriptors(target: RuntimeGlobal, snapshot: DescriptorSnapshot): void {
  for (const [key, descriptor] of Object.entries(snapshot) as Array<[RuntimeGlobalKey, PropertyDescriptor | null]>) {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    } else {
      delete target[key];
    }
  }
}

function createFakeBrowserSurface() {
  const url = {
    createObjectURL: vi.fn(() => 'blob:worker'),
    revokeObjectURL: vi.fn(),
  } as unknown as typeof URL;
  class TestWorker {}
  class TestBlob {}
  return {
    Worker: TestWorker as unknown as typeof Worker,
    Blob: TestBlob as unknown as typeof Blob,
    URL: url,
  };
}

describe('withScopedCjsBrowserGlobals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mutate browser descriptors when the transport module is only imported', async () => {
    const runtimeGlobal = globalThis as RuntimeGlobal;
    const before = snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS);

    vi.resetModules();
    await import('@/application/clients/BrowserSrsBackendWorkerTransport');

    expect(snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS)).toEqual(before);
  });

  it('reuses existing valid globals without changing values or descriptors', () => {
    const browserSurface = createFakeBrowserSurface();
    const runtimeGlobal: RuntimeGlobal = {};
    Object.defineProperty(runtimeGlobal, 'Worker', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: browserSurface.Worker,
    });
    Object.defineProperty(runtimeGlobal, 'Blob', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: browserSurface.Blob,
    });
    Object.defineProperty(runtimeGlobal, 'URL', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: browserSurface.URL,
    });
    const before = snapshotDescriptors(runtimeGlobal);

    const result = withScopedCjsBrowserGlobals(() => {
      expect(runtimeGlobal.Worker).toBe(browserSurface.Worker);
      expect(runtimeGlobal.Blob).toBe(browserSurface.Blob);
      expect(runtimeGlobal.URL).toBe(browserSurface.URL);
      return 'constructed';
    }, runtimeGlobal);

    expect(result).toBe('constructed');
    expect(snapshotDescriptors(runtimeGlobal)).toEqual(before);
  });

  it('installs only missing constructor aliases during construction and restores them on success', () => {
    const browserSurface = createFakeBrowserSurface();
    const runtimeGlobal: RuntimeGlobal = {
      window: browserSurface,
    };
    const before = snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS);

    const result = withScopedCjsBrowserGlobals(() => {
      expect(runtimeGlobal.Worker).toBe(browserSurface.Worker);
      expect(runtimeGlobal.Blob).toBe(browserSurface.Blob);
      expect(runtimeGlobal.URL).toBe(browserSurface.URL);
      expect(Object.prototype.hasOwnProperty.call(runtimeGlobal, 'self')).toBe(false);
      return 'worker';
    }, runtimeGlobal);

    expect(result).toBe('worker');
    expect(snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS)).toEqual(before);
  });

  it('restores temporary constructor aliases and preserves the original construction error', () => {
    const browserSurface = createFakeBrowserSurface();
    const runtimeGlobal: RuntimeGlobal = {
      window: browserSurface,
    };
    const before = snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS);

    expect(() => withScopedCjsBrowserGlobals(() => {
      throw new Error('inline worker exploded');
    }, runtimeGlobal)).toThrow('inline worker exploded');

    expect(snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS)).toEqual(before);
  });

  it('fails explicitly and rolls back partial aliases when a required descriptor cannot be defined', () => {
    const browserSurface = createFakeBrowserSurface();
    const runtimeGlobal: RuntimeGlobal = {
      window: browserSurface,
    };
    Object.defineProperty(runtimeGlobal, 'Blob', {
      configurable: false,
      enumerable: true,
      get: () => undefined,
    });
    const before = snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS);

    expect(() => withScopedCjsBrowserGlobals(() => 'unreachable', runtimeGlobal)).toThrow(
      'BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.Blob',
    );

    expect(snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS)).toEqual(before);
    expect(Object.prototype.hasOwnProperty.call(runtimeGlobal, 'Worker')).toBe(false);
  });

  it('does not leak temporary aliases across sequential worker constructions', () => {
    const browserSurface = createFakeBrowserSurface();
    const runtimeGlobal: RuntimeGlobal = {
      window: browserSurface,
    };
    const before = snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS);

    for (const expected of ['first', 'second']) {
      expect(withScopedCjsBrowserGlobals(() => {
        expect(runtimeGlobal.Worker).toBe(browserSurface.Worker);
        return expected;
      }, runtimeGlobal)).toBe(expected);
      expect(snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS)).toEqual(before);
    }
  });

  it('does not create window or self aliases when constructors are already explicit', () => {
    const browserSurface = createFakeBrowserSurface();
    const runtimeGlobal: RuntimeGlobal = {
      Worker: browserSurface.Worker,
      Blob: browserSurface.Blob,
      URL: browserSurface.URL,
    };
    const before = snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS);

    withScopedCjsBrowserGlobals(() => {
      expect(Object.prototype.hasOwnProperty.call(runtimeGlobal, 'window')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(runtimeGlobal, 'self')).toBe(false);
    }, runtimeGlobal);

    expect(snapshotDescriptors(runtimeGlobal, MODULE_IMPORT_KEYS)).toEqual(before);
  });
});
