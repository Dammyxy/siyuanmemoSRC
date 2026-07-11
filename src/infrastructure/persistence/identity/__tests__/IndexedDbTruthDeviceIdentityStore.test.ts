import { describe, expect, it } from 'vitest';
import type { TruthDeviceIdentityRecord } from '@/application/ports/TruthDeviceIdentityPort';
import { IndexedDbTruthDeviceIdentityStore } from '../IndexedDbTruthDeviceIdentityStore';

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
    objectStoreNames: {
      contains: () => created,
    },
    createObjectStore: () => {
      created = true;
      return {};
    },
    transaction: () => {
      const transaction = {
        error: null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          get: () => {
            const request: FakeRequest<unknown> = {
              result: undefined,
              error: null,
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => {
              request.result = stored;
              request.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
          put: (value: unknown) => {
            const request: FakeRequest<IDBValidKey> = {
              result: 'installation',
              error: null,
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => {
              stored = structuredClone(value);
              request.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
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

describe('IndexedDbTruthDeviceIdentityStore', () => {
  it('persists and reads the versioned installation identity record', async () => {
    const store = new IndexedDbTruthDeviceIdentityStore(createFakeIndexedDbFactory());
    const record: TruthDeviceIdentityRecord = {
      version: 2,
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 10,
      lastSeenAt: 20,
    };

    await store.writeRecord(record);

    await expect(store.readRecord()).resolves.toEqual(record);
  });

  it('returns a deterministic unavailable error when IndexedDB is absent', async () => {
    const store = new IndexedDbTruthDeviceIdentityStore(null);

    await expect(store.readRecord()).rejects.toThrow(
      'TRUTH_DEVICE_IDENTITY_UNAVAILABLE: indexedDB unavailable',
    );
  });
});
