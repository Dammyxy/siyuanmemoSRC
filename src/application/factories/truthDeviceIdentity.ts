export const TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.truth.deviceId.v1';
export const LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1';
export const TRUTH_DEVICE_ID_LOCAL_STATE_PATH = 'truth-device-id.v1.json';

export interface TruthDeviceIdentityLocalStore {
  readTempLocalJSON?: <T>(path: string) => Promise<T | null>;
  writeTempLocalJSON?: (path: string, value: unknown) => Promise<void>;
}

export interface TruthDeviceIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface TruthDeviceIdentityState {
  deviceId?: unknown;
}

export interface ResolveTruthDeviceIdOptions {
  localStore?: TruthDeviceIdentityLocalStore | null;
  storage?: TruthDeviceIdentityStorage | null;
  createId?: () => string;
  now?: () => number;
}

export function isMessagePackTruthIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.trim())
    && !value.trim().includes('..');
}

export function createTruthDeviceId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const randomId = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `device-${randomId}`;
}

export async function resolveTruthDeviceId(options: ResolveTruthDeviceIdOptions = {}): Promise<string | null> {
  const localStore = options.localStore ?? null;
  const storage = options.storage ?? resolveGlobalStorage();
  const now = options.now ?? Date.now;
  const localDeviceId = await readTempLocalDeviceId(localStore);
  if (localDeviceId) {
    writeStorageDeviceId(storage, TRUTH_DEVICE_ID_STORAGE_KEY, localDeviceId);
    return localDeviceId;
  }

  const stored = readStorageDeviceId(storage, TRUTH_DEVICE_ID_STORAGE_KEY);
  if (stored) {
    return await persistAndReturn(localStore, storage, stored, 'localStorage', now);
  }

  const legacyStored = readStorageDeviceId(storage, LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY);
  if (legacyStored) {
    return await persistAndReturn(localStore, storage, legacyStored, 'legacy-localStorage', now);
  }

  const next = (options.createId ?? createTruthDeviceId)();
  if (!isMessagePackTruthIdentity(next)) {
    return null;
  }
  return await persistAndReturn(localStore, storage, next.trim(), 'generated', now);
}

function resolveGlobalStorage(): TruthDeviceIdentityStorage | null {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

async function readTempLocalDeviceId(localStore: TruthDeviceIdentityLocalStore | null): Promise<string | null> {
  if (!localStore?.readTempLocalJSON) {
    return null;
  }
  try {
    const state = await localStore.readTempLocalJSON<TruthDeviceIdentityState>(TRUTH_DEVICE_ID_LOCAL_STATE_PATH);
    const deviceId = state?.deviceId;
    return isMessagePackTruthIdentity(deviceId) ? deviceId.trim() : null;
  } catch {
    return null;
  }
}

async function persistAndReturn(
  localStore: TruthDeviceIdentityLocalStore | null,
  storage: TruthDeviceIdentityStorage | null,
  deviceId: string,
  source: 'localStorage' | 'legacy-localStorage' | 'generated',
  now: () => number,
): Promise<string | null> {
  const persisted = await writeTempLocalDeviceId(localStore, deviceId, source, now);
  if (!persisted && localStore) {
    return null;
  }
  writeStorageDeviceId(storage, TRUTH_DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

async function writeTempLocalDeviceId(
  localStore: TruthDeviceIdentityLocalStore | null,
  deviceId: string,
  source: 'localStorage' | 'legacy-localStorage' | 'generated',
  now: () => number,
): Promise<boolean> {
  if (!localStore?.writeTempLocalJSON) {
    return false;
  }
  try {
    await localStore.writeTempLocalJSON(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, {
      version: 1,
      deviceId,
      source,
      updatedAt: now(),
    });
    return true;
  } catch {
    return false;
  }
}

function readStorageDeviceId(storage: TruthDeviceIdentityStorage | null, key: string): string | null {
  try {
    const value = storage?.getItem(key);
    return isMessagePackTruthIdentity(value) ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStorageDeviceId(
  storage: TruthDeviceIdentityStorage | null,
  key: string,
  deviceId: string,
): void {
  try {
    storage?.setItem(key, deviceId);
  } catch {
    // Temp-local state is authoritative; localStorage is only a cache.
  }
}
