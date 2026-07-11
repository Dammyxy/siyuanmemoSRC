import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY,
  resolveTruthDeviceIdentity,
  resolveTruthDeviceId,
  TRUTH_DEVICE_IDENTITY_STORAGE_KEY,
  TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
  TRUTH_DEVICE_ID_STORAGE_KEY,
} from '../truthDeviceIdentity';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class MemoryLocalIdentityStore {
  readonly state = new Map<string, unknown>();
  readError: Error | null = null;
  writeError: Error | null = null;

  readTempLocalJSON = vi.fn(async <T>(path: string): Promise<T | null> => {
    if (this.readError) {
      throw this.readError;
    }
    return (this.state.get(path) as T | undefined) ?? null;
  });

  writeTempLocalJSON = vi.fn(async (path: string, value: unknown): Promise<void> => {
    if (this.writeError) {
      throw this.writeError;
    }
    this.state.set(path, value);
  });
}

class MemoryIdentityRecordStore {
  record: unknown = null;

  readRecord = vi.fn(async (): Promise<unknown | null> => this.record);

  writeRecord = vi.fn(async (record: unknown): Promise<void> => {
    this.record = record;
  });
}

describe('truth device identity', () => {
  it('uses matching authority copies when the temp mirror cannot be read', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    const record = {
      version: 2,
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 10,
      lastSeenAt: 20,
    };
    identityStore.record = record;
    storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record));
    localStore.readError = new Error('temp read denied');
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId,
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-stable',
      source: 'authority-copies',
      error: null,
    });

    expect(createId).not.toHaveBeenCalled();
    expect(identityStore.writeRecord).not.toHaveBeenCalled();
  });

  it('records a host fingerprint change without rotating device identity', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    const record = {
      version: 2,
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-old',
      createdAt: 10,
      lastSeenAt: 20,
    };
    identityStore.record = record;
    storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record));

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-new',
      createId: () => 'device-new',
      createEpoch: () => 'epoch-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      source: 'authority-copies',
      hostFingerprintMatch: 'changed',
      error: null,
    });

    const updatedRecord = {
      ...record,
      hostFingerprint: 'host-new',
      lastSeenAt: 30,
    };
    expect(identityStore.writeRecord).toHaveBeenCalledWith(updatedRecord);
    expect(JSON.parse(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY) ?? 'null')).toEqual(updatedRecord);
  });

  it('repairs missing localStorage authority from IndexedDB before reading the temp mirror', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    const record = {
      version: 2,
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 10,
      lastSeenAt: 20,
    };
    identityStore.record = record;
    localStore.readError = new Error('temp read denied');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-stable',
      source: 'indexeddb-repaired-localStorage',
      error: null,
    });

    expect(JSON.parse(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY) ?? 'null')).toEqual(record);
  });

  it('records a host change while repairing a missing localStorage authority copy', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    const record = {
      version: 2,
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-old',
      createdAt: 10,
      lastSeenAt: 20,
    };
    identityStore.record = record;

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-new',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      source: 'indexeddb-repaired-localStorage',
      hostFingerprintMatch: 'changed',
      error: null,
    });

    const updatedRecord = {
      ...record,
      hostFingerprint: 'host-new',
      lastSeenAt: 30,
    };
    expect(identityStore.writeRecord).toHaveBeenCalledWith(updatedRecord);
    expect(JSON.parse(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY) ?? 'null')).toEqual(updatedRecord);
  });

  it('repairs missing IndexedDB authority from localStorage before reading the temp mirror', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    const record = {
      version: 2,
      deviceId: 'device-stable',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 10,
      lastSeenAt: 20,
    };
    storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record));
    localStore.readError = new Error('temp read denied');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-stable',
      source: 'localStorage-repaired-indexeddb',
      error: null,
    });

    expect(identityStore.writeRecord).toHaveBeenCalledWith(record);
  });

  it('fails closed when valid authority copies disagree', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    identityStore.record = {
      version: 2,
      deviceId: 'device-indexeddb',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 10,
      lastSeenAt: 20,
    };
    storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify({
      version: 2,
      deviceId: 'device-localstorage',
      identityEpoch: 'epoch-2',
      hostFingerprint: 'host-1',
      createdAt: 11,
      lastSeenAt: 21,
    }));
    localStore.state.set(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, { deviceId: 'device-indexeddb' });
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId,
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: null,
      source: 'identity-recovery-required',
      error: expect.stringContaining('authority copies disagree'),
    });

    expect(createId).not.toHaveBeenCalled();
    expect(identityStore.writeRecord).not.toHaveBeenCalled();
  });

  it('fails closed with diagnostics for an unsupported localStorage identity version', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify({
      version: 99,
      deviceId: 'device-future',
      identityEpoch: 'epoch-future',
      hostFingerprint: 'host-future',
      createdAt: 10,
      lastSeenAt: 20,
    }));
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId,
      createEpoch: () => 'epoch-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: null,
      source: 'identity-recovery-required',
      error: expect.stringContaining('unsupported localStorage identity version: 99'),
    });

    expect(createId).not.toHaveBeenCalled();
    expect(identityStore.writeRecord).not.toHaveBeenCalled();
  });

  it('fails closed when versioned authority conflicts with legacy identity evidence', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    const record = {
      version: 2,
      deviceId: 'device-current',
      identityEpoch: 'epoch-current',
      hostFingerprint: 'host-1',
      createdAt: 10,
      lastSeenAt: 20,
    };
    identityStore.record = record;
    storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record));
    storage.setItem(LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY, 'device-stale');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId: () => 'device-new',
      createEpoch: () => 'epoch-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: null,
      source: 'identity-recovery-required',
      error: expect.stringContaining('versioned identity conflicts with legacy evidence'),
    });

    expect(identityStore.writeRecord).not.toHaveBeenCalled();
  });

  it('reuses temp-local identity and refreshes localStorage without generating a new device', async () => {
    const storage = new MemoryStorage();
    const localStore = new MemoryLocalIdentityStore();
    localStore.state.set(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, { deviceId: 'device-stable' });
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceId({ localStore, storage, createId })).resolves.toBe('device-stable');

    expect(createId).not.toHaveBeenCalled();
    expect(storage.getItem(TRUTH_DEVICE_ID_STORAGE_KEY)).toBe('device-stable');
    expect(localStore.writeTempLocalJSON).not.toHaveBeenCalled();
  });

  it('exposes temp-local identity diagnostics for startup status', async () => {
    const storage = new MemoryStorage();
    const localStore = new MemoryLocalIdentityStore();
    localStore.state.set(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, { deviceId: 'device-stable' });

    await expect(resolveTruthDeviceIdentity({ localStore, storage, createId: () => 'device-new' }))
      .resolves.toMatchObject({
        deviceId: 'device-stable',
        source: 'temp-local',
        localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
        persisted: true,
        cacheUpdated: true,
        error: null,
      });
  });

  it('migrates legacy localStorage identity into temp-local state', async () => {
    const storage = new MemoryStorage();
    const localStore = new MemoryLocalIdentityStore();
    storage.setItem(LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY, 'device-legacy');

    await expect(resolveTruthDeviceId({ localStore, storage, createId: () => 'device-new' })).resolves.toBe('device-legacy');

    expect(storage.getItem(TRUTH_DEVICE_ID_STORAGE_KEY)).toBe('device-legacy');
    expect(localStore.writeTempLocalJSON).toHaveBeenCalledWith(
      TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
      expect.objectContaining({ deviceId: 'device-legacy' }),
    );
  });

  it('migrates legacy localStorage identity into both authority copies when the temp mirror write fails', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    localStore.writeError = new Error('temp write denied');
    storage.setItem(LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY, 'device-legacy');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createEpoch: () => 'epoch-1',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-legacy',
      source: 'legacy-localStorage',
      error: null,
    });

    const expectedRecord = {
      version: 2,
      deviceId: 'device-legacy',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 30,
      lastSeenAt: 30,
    };
    expect(identityStore.writeRecord).toHaveBeenCalledWith(expectedRecord);
    expect(JSON.parse(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY) ?? 'null')).toEqual(expectedRecord);
  });

  it('migrates a temp-only device identity into both authority copies', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    localStore.state.set(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, { deviceId: 'device-temp' });

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createEpoch: () => 'epoch-1',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-temp',
      identityEpoch: 'epoch-1',
      source: 'temp-local',
      error: null,
    });

    const expectedRecord = {
      version: 2,
      deviceId: 'device-temp',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-1',
      createdAt: 30,
      lastSeenAt: 30,
    };
    expect(identityStore.writeRecord).toHaveBeenCalledWith(expectedRecord);
    expect(JSON.parse(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY) ?? 'null')).toEqual(expectedRecord);
  });

  it('migrates the v1 truth device key without changing its writable directory identity', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    storage.setItem(TRUTH_DEVICE_ID_STORAGE_KEY, 'device-existing-directory');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createEpoch: () => 'epoch-1',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-existing-directory',
      identityEpoch: 'epoch-1',
      source: 'localStorage',
      error: null,
    });

    expect(identityStore.writeRecord).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'device-existing-directory',
      identityEpoch: 'epoch-1',
    }));
  });

  it('migrates legacy localStorage identity when the temp mirror cannot be read', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    localStore.readError = new Error('temp read denied');
    storage.setItem(LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY, 'device-legacy');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createEpoch: () => 'epoch-1',
      createId: () => 'device-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-legacy',
      source: 'legacy-localStorage',
      error: null,
    });
  });

  it('fails closed when legacy localStorage and temp identity disagree', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    storage.setItem(LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY, 'device-legacy');
    localStore.state.set(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, { deviceId: 'device-temp' });
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId,
      createEpoch: () => 'epoch-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: null,
      source: 'identity-recovery-required',
      error: expect.stringContaining('legacy identity sources disagree'),
    });

    expect(createId).not.toHaveBeenCalled();
    expect(identityStore.writeRecord).not.toHaveBeenCalled();
    expect(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY)).toBeNull();
  });

  it('creates a new device identity and epoch after complete authoritative identity loss', async () => {
    const storage = new MemoryStorage();
    const identityStore = new MemoryIdentityRecordStore();
    const localStore = new MemoryLocalIdentityStore();
    localStore.readError = new Error('temp mirror missing');

    await expect(resolveTruthDeviceIdentity({
      localStore,
      storage,
      identityStore,
      hostFingerprint: 'host-1',
      createId: () => 'device-new',
      createEpoch: () => 'epoch-new',
      now: () => 30,
    })).resolves.toMatchObject({
      deviceId: 'device-new',
      identityEpoch: 'epoch-new',
      source: 'generated',
      error: null,
    });

    const expectedRecord = {
      version: 2,
      deviceId: 'device-new',
      identityEpoch: 'epoch-new',
      hostFingerprint: 'host-1',
      createdAt: 30,
      lastSeenAt: 30,
    };
    expect(identityStore.writeRecord).toHaveBeenCalledWith(expectedRecord);
    expect(JSON.parse(storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY) ?? 'null')).toEqual(expectedRecord);
  });

  it('persists a new identity to temp-local state and localStorage when no valid identity exists', async () => {
    const storage = new MemoryStorage();
    const localStore = new MemoryLocalIdentityStore();

    await expect(resolveTruthDeviceId({ localStore, storage, createId: () => 'device-new' })).resolves.toBe('device-new');

    expect(storage.getItem(TRUTH_DEVICE_ID_STORAGE_KEY)).toBe('device-new');
    expect(localStore.writeTempLocalJSON).toHaveBeenCalledWith(
      TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
      expect.objectContaining({ deviceId: 'device-new' }),
    );
  });

  it('fails closed when authoritative temp-local identity cannot be read', async () => {
    const storage = new MemoryStorage();
    const localStore = new MemoryLocalIdentityStore();
    localStore.readError = new Error('temp read denied');
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceIdentity({ localStore, storage, createId })).resolves.toMatchObject({
      deviceId: null,
      source: 'unavailable',
      persisted: false,
      cacheUpdated: false,
      error: expect.stringContaining('temp read denied'),
    });
    await expect(resolveTruthDeviceId({ localStore, storage, createId })).resolves.toBeNull();

    expect(createId).not.toHaveBeenCalled();
    expect(storage.getItem(TRUTH_DEVICE_ID_STORAGE_KEY)).toBeNull();
  });

  it('fails closed when temp-local identity cannot be persisted', async () => {
    const storage = new MemoryStorage();
    const localStore = new MemoryLocalIdentityStore();
    localStore.writeError = new Error('temp write denied');
    const createId = vi.fn(() => 'device-new');

    await expect(resolveTruthDeviceIdentity({ localStore, storage, createId })).resolves.toMatchObject({
      deviceId: null,
      source: 'unavailable',
      persisted: false,
      cacheUpdated: false,
      error: expect.stringContaining('temp write denied'),
    });

    expect(createId).toHaveBeenCalledTimes(1);
    expect(storage.getItem(TRUTH_DEVICE_ID_STORAGE_KEY)).toBeNull();
  });
});
