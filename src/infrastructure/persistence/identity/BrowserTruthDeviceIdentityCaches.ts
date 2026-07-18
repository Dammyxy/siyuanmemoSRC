import type {
  TruthDeviceIdentityCachePort,
  TruthDeviceIdentityRecord,
} from '@/application/ports/TruthDeviceIdentityPort';

export const TRUTH_DEVICE_IDENTITY_STORAGE_KEY = 'siyuanmemo.truth.identity.v2';
export const TRUTH_DEVICE_ID_LOCAL_STATE_PATH = 'truth-device-id.v1.json';

export interface BrowserIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface TempIdentityLocalStore {
  readTempLocalJSON?: <T>(path: string) => Promise<T | null>;
  writeTempLocalJSON?: (path: string, value: unknown) => Promise<void>;
}

export function resolveGlobalIdentityStorage(): BrowserIdentityStorage | null {
  try {
    const runtimeGlobal = globalThis as typeof globalThis & {
      localStorage?: BrowserIdentityStorage;
      window?: { localStorage?: BrowserIdentityStorage };
    };
    return runtimeGlobal.localStorage ?? runtimeGlobal.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

export class LocalStorageTruthDeviceIdentityCache implements TruthDeviceIdentityCachePort {
  readonly kind = 'local-storage' as const;

  constructor(private readonly storage: BrowserIdentityStorage | null = resolveGlobalIdentityStorage()) {}

  async readCache(): Promise<unknown | null> {
    if (!this.storage) {
      throw new Error('TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: localStorage unavailable');
    }
    const value = this.storage.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY);
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  async writeCache(record: TruthDeviceIdentityRecord): Promise<void> {
    if (!this.storage) {
      throw new Error('TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: localStorage unavailable');
    }
    this.storage.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record));
  }

  async clearCache(): Promise<void> {
    if (!this.storage) {
      throw new Error('TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: localStorage unavailable');
    }
    this.storage.removeItem?.(TRUTH_DEVICE_IDENTITY_STORAGE_KEY);
  }
}

export class TempLocalTruthDeviceIdentityCache implements TruthDeviceIdentityCachePort {
  readonly kind = 'temp-local' as const;

  constructor(private readonly localStore: TempIdentityLocalStore | null) {}

  async readCache(): Promise<unknown | null> {
    if (!this.localStore?.readTempLocalJSON) {
      throw new Error('TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: temp-local read API unavailable');
    }
    return this.localStore.readTempLocalJSON<unknown>(TRUTH_DEVICE_ID_LOCAL_STATE_PATH);
  }

  async writeCache(record: TruthDeviceIdentityRecord): Promise<void> {
    if (!this.localStore?.writeTempLocalJSON) {
      throw new Error('TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: temp-local write API unavailable');
    }
    await this.localStore.writeTempLocalJSON(TRUTH_DEVICE_ID_LOCAL_STATE_PATH, record);
  }

  async clearCache(): Promise<void> {
    // Workspace temp is disposable and the host effect does not need a delete path.
  }
}
