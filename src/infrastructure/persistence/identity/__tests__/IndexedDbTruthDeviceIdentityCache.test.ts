import { describe, expect, it } from 'vitest';
import type { TruthDeviceIdentityRecord } from '@/application/ports/TruthDeviceIdentityPort';
import { IndexedDbTruthDeviceIdentityCache } from '../IndexedDbTruthDeviceIdentityCache';

interface FakeRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
  onblocked?: (() => void) | null;
}

function createFakeIndexedDbFactory(): IDBFactory {
  let created = false;
  let stored: unknown = undefined;
  const db = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => { created = true; return {}; },
    transaction: () => {
      const transaction = {
        error: null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          get: () => createRequest(() => stored, transaction),
          put: (value: unknown) => createRequest(() => {
            stored = structuredClone(value);
            return 'installation';
          }, transaction),
          delete: () => createRequest(() => {
            stored = undefined;
            return undefined;
          }, transaction),
        }),
      };
      return transaction;
    },
  };
  return {
    open: () => {
      const request: FakeRequest<typeof db> = {
        result: db,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  } as unknown as IDBFactory;
}

function createRequest<T>(read: () => T, transaction: { oncomplete: (() => void) | null }): FakeRequest<T> {
  const request: FakeRequest<T> = {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    request.result = read();
    request.onsuccess?.();
    queueMicrotask(() => transaction.oncomplete?.());
  });
  return request;
}

const record: TruthDeviceIdentityRecord = {
  version: 2,
  deviceId: 'device-stable',
  identityEpoch: 'epoch-1',
  hostFingerprint: 'host-1',
  createdAt: 10,
  lastSeenAt: 20,
};

describe('IndexedDbTruthDeviceIdentityCache', () => {
  it('persists, reads, and clears a browser cache record', async () => {
    const cache = new IndexedDbTruthDeviceIdentityCache(createFakeIndexedDbFactory());
    await cache.writeCache(record);
    await expect(cache.readCache()).resolves.toEqual(record);
    await cache.clearCache();
    await expect(cache.readCache()).resolves.toBeNull();
  });

  it('uses browser window indexedDB when CJS global indexedDB is absent', async () => {
    const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
    const originalIndexedDb = (globalThis as typeof globalThis & { indexedDB?: unknown }).indexedDB;
    try {
      delete (globalThis as typeof globalThis & { indexedDB?: unknown }).indexedDB;
      (globalThis as typeof globalThis & { window?: unknown }).window = {
        indexedDB: createFakeIndexedDbFactory(),
      } as Window & typeof globalThis;
      const cache = new IndexedDbTruthDeviceIdentityCache();
      await cache.writeCache(record);
      await expect(cache.readCache()).resolves.toEqual(record);
    } finally {
      if (typeof originalIndexedDb === 'undefined') {
        delete (globalThis as typeof globalThis & { indexedDB?: unknown }).indexedDB;
      } else {
        (globalThis as typeof globalThis & { indexedDB?: unknown }).indexedDB = originalIndexedDb;
      }
      (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
    }
  });

  it('returns a deterministic cache-unavailable error when IndexedDB is absent', async () => {
    const cache = new IndexedDbTruthDeviceIdentityCache(null);
    await expect(cache.readCache()).rejects.toThrow(
      'TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: indexedDB unavailable',
    );
  });
});
