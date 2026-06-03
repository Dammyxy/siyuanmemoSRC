import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY,
  resolveTruthDeviceIdentity,
  resolveTruthDeviceId,
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

describe('truth device identity', () => {
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
