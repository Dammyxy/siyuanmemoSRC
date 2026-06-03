import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY,
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
  readTempLocalJSON = vi.fn(async <T>(path: string): Promise<T | null> => {
    return (this.state.get(path) as T | undefined) ?? null;
  });

  writeTempLocalJSON = vi.fn(async (path: string, value: unknown): Promise<void> => {
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
});
