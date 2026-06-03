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

export type TruthDeviceIdentitySource =
  | 'temp-local'
  | 'localStorage'
  | 'legacy-localStorage'
  | 'generated'
  | 'unavailable';

export interface TruthDeviceIdentityResolution {
  deviceId: string | null;
  source: TruthDeviceIdentitySource;
  localStatePath: typeof TRUTH_DEVICE_ID_LOCAL_STATE_PATH;
  persisted: boolean;
  cacheUpdated: boolean;
  error: string | null;
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
  return (await resolveTruthDeviceIdentity(options)).deviceId;
}

export async function resolveTruthDeviceIdentity(options: ResolveTruthDeviceIdOptions = {}): Promise<TruthDeviceIdentityResolution> {
  const localStore = options.localStore ?? null;
  const storage = options.storage ?? resolveGlobalStorage();
  const now = options.now ?? Date.now;
  const localDeviceId = await readTempLocalDeviceId(localStore);
  if (localDeviceId.error) {
    return unavailable(localDeviceId.error);
  }
  if (localDeviceId.deviceId) {
    const cacheUpdated = writeStorageDeviceId(storage, TRUTH_DEVICE_ID_STORAGE_KEY, localDeviceId.deviceId);
    return {
      deviceId: localDeviceId.deviceId,
      source: 'temp-local',
      localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
      persisted: true,
      cacheUpdated,
      error: null,
    };
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
    return unavailable(`invalid generated truth device id: ${String(next)}`);
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

async function readTempLocalDeviceId(localStore: TruthDeviceIdentityLocalStore | null): Promise<{
  deviceId: string | null;
  error: string | null;
}> {
  if (!localStore?.readTempLocalJSON) {
    return { deviceId: null, error: null };
  }
  try {
    const state = await localStore.readTempLocalJSON<TruthDeviceIdentityState>(TRUTH_DEVICE_ID_LOCAL_STATE_PATH);
    const deviceId = state?.deviceId;
    return {
      deviceId: isMessagePackTruthIdentity(deviceId) ? deviceId.trim() : null,
      error: null,
    };
  } catch (error) {
    return { deviceId: null, error: toErrorMessage(error) };
  }
}

async function persistAndReturn(
  localStore: TruthDeviceIdentityLocalStore | null,
  storage: TruthDeviceIdentityStorage | null,
  deviceId: string,
  source: 'localStorage' | 'legacy-localStorage' | 'generated',
  now: () => number,
): Promise<TruthDeviceIdentityResolution> {
  const persisted = await writeTempLocalDeviceId(localStore, deviceId, source, now);
  if (!persisted.ok && localStore) {
    return unavailable(persisted.error);
  }
  const cacheUpdated = writeStorageDeviceId(storage, TRUTH_DEVICE_ID_STORAGE_KEY, deviceId);
  return {
    deviceId,
    source,
    localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
    persisted: persisted.ok,
    cacheUpdated,
    error: null,
  };
}

async function writeTempLocalDeviceId(
  localStore: TruthDeviceIdentityLocalStore | null,
  deviceId: string,
  source: 'localStorage' | 'legacy-localStorage' | 'generated',
  now: () => number,
): Promise<{ ok: boolean; error: string | null }> {
  if (!localStore?.writeTempLocalJSON) {
    return { ok: false, error: 'temp-local write API unavailable' };
  }
  try {
    await localStore.writeTempLocalJSON(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, {
      version: 1,
      deviceId,
      source,
      updatedAt: now(),
    });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
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
): boolean {
  try {
    storage?.setItem(key, deviceId);
    return Boolean(storage);
  } catch {
    // Temp-local state is authoritative; localStorage is only a cache.
    return false;
  }
}

function unavailable(error: string | null): TruthDeviceIdentityResolution {
  return {
    deviceId: null,
    source: 'unavailable',
    localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
    persisted: false,
    cacheUpdated: false,
    error,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
