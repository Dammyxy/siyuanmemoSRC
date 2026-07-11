import {
  TRUTH_DEVICE_IDENTITY_VERSION,
  type TruthDeviceIdentityPort,
  type TruthDeviceIdentityRecord,
} from '@/application/ports/TruthDeviceIdentityPort';

export const TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.truth.deviceId.v1';
export const LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1';
export const TRUTH_DEVICE_ID_LOCAL_STATE_PATH = 'truth-device-id.v1.json';
export const TRUTH_DEVICE_IDENTITY_STORAGE_KEY = 'siyuanmemo.truth.identity.v2';

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

type TruthDeviceIdentityRecordRead =
  | { status: 'missing'; record: null; error: null }
  | { status: 'valid'; record: TruthDeviceIdentityRecord; error: null }
  | { status: 'invalid'; record: null; error: string }
  | { status: 'error'; record: null; error: string };

export type TruthDeviceIdentitySource =
  | 'authority-copies'
  | 'indexeddb-repaired-localStorage'
  | 'localStorage-repaired-indexeddb'
  | 'identity-recovery-required'
  | 'temp-local'
  | 'localStorage'
  | 'legacy-localStorage'
  | 'generated'
  | 'unavailable';

export interface TruthDeviceIdentityResolution {
  deviceId: string | null;
  identityEpoch?: string | null;
  source: TruthDeviceIdentitySource;
  localStatePath: typeof TRUTH_DEVICE_ID_LOCAL_STATE_PATH;
  persisted: boolean;
  cacheUpdated: boolean;
  hostFingerprintMatch?: 'match' | 'changed' | 'unknown';
  error: string | null;
}

export interface ResolveTruthDeviceIdOptions {
  localStore?: TruthDeviceIdentityLocalStore | null;
  storage?: TruthDeviceIdentityStorage | null;
  identityStore?: TruthDeviceIdentityPort | null;
  hostFingerprint?: string | null;
  createId?: () => string;
  createEpoch?: () => string;
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
  const identityStore = options.identityStore ?? null;
  const now = options.now ?? Date.now;
  const authorityRead = await readIdentityRecord(identityStore);
  const storageRead = readStorageIdentityRecord(storage);
  if (authorityRead.status === 'error') {
    return unavailable(`indexedDB identity authority read failed: ${authorityRead.error}`);
  }
  if (storageRead.status === 'error') {
    return unavailable(`localStorage identity authority read failed: ${storageRead.error}`);
  }
  if (authorityRead.status === 'invalid') {
    return identityRecoveryRequired(authorityRead.error);
  }
  if (storageRead.status === 'invalid') {
    return identityRecoveryRequired(storageRead.error);
  }
  const authorityRecord = authorityRead.record;
  const storageRecord = storageRead.record;
  const legacyStoredDeviceId = identityStore
    ? readStorageDeviceId(storage, TRUTH_DEVICE_ID_STORAGE_KEY)
    : null;
  const legacyReviewDeviceId = identityStore
    ? readStorageDeviceId(storage, LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY)
    : null;
  const tempLocalDeviceId = identityStore
    ? await readTempLocalDeviceId(localStore)
    : null;
  const legacyEvidence = [
    legacyStoredDeviceId,
    legacyReviewDeviceId,
    tempLocalDeviceId?.deviceId ?? null,
  ].filter((deviceId): deviceId is string => Boolean(deviceId));
  const versionedDeviceId = authorityRecord?.deviceId ?? storageRecord?.deviceId ?? null;
  if (versionedDeviceId && legacyEvidence.some((deviceId) => deviceId !== versionedDeviceId)) {
    return identityRecoveryRequired(
      `versioned identity conflicts with legacy evidence: versioned=${versionedDeviceId}, localStorage=${legacyStoredDeviceId ?? 'missing'}, legacyLocalStorage=${legacyReviewDeviceId ?? 'missing'}, tempLocal=${tempLocalDeviceId?.deviceId ?? 'missing'}`,
    );
  }
  if (!versionedDeviceId && new Set(legacyEvidence).size > 1) {
    return identityRecoveryRequired(
      `legacy identity sources disagree: localStorage=${legacyStoredDeviceId ?? 'missing'}, legacyLocalStorage=${legacyReviewDeviceId ?? 'missing'}, tempLocal=${tempLocalDeviceId?.deviceId ?? 'missing'}`,
    );
  }
  if (authorityRecord && storageRecord && sameIdentityRecord(authorityRecord, storageRecord)) {
    const observed = observeHostFingerprint(authorityRecord, options.hostFingerprint, now);
    const resolvedRecord = observed.record;
    const hostFingerprintChanged = observed.changed;
    if (hostFingerprintChanged && identityStore) {
      try {
        await identityStore.writeRecord(resolvedRecord);
      } catch (error) {
        return unavailable(`indexedDB identity authority write failed: ${toErrorMessage(error)}`);
      }
      if (!writeStorageIdentityRecord(storage, resolvedRecord)) {
        return unavailable('localStorage identity authority write failed');
      }
      await writeTempLocalDeviceId(localStore, resolvedRecord.deviceId, 'temp-local', now);
    }
    return {
      deviceId: resolvedRecord.deviceId,
      identityEpoch: resolvedRecord.identityEpoch,
      source: 'authority-copies',
      localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
      persisted: true,
      cacheUpdated: hostFingerprintChanged,
      hostFingerprintMatch: hostFingerprintChanged
        ? 'changed'
        : options.hostFingerprint == null || resolvedRecord.hostFingerprint == null
          ? 'unknown'
          : 'match',
      error: null,
    };
  }
  if (authorityRecord && storageRecord) {
    return identityRecoveryRequired(
      `identity authority copies disagree: indexedDB=${authorityRecord.deviceId}/${authorityRecord.identityEpoch}, localStorage=${storageRecord.deviceId}/${storageRecord.identityEpoch}`,
    );
  }
  if (authorityRecord && !storageRecord) {
    const observed = observeHostFingerprint(authorityRecord, options.hostFingerprint, now);
    if (observed.changed && identityStore) {
      try {
        await identityStore.writeRecord(observed.record);
      } catch (error) {
        return unavailable(`indexedDB identity authority write failed: ${toErrorMessage(error)}`);
      }
    }
    const cacheUpdated = writeStorageIdentityRecord(storage, observed.record);
    if (!cacheUpdated) {
      return unavailable('localStorage identity authority write failed');
    }
    return {
      deviceId: observed.record.deviceId,
      identityEpoch: observed.record.identityEpoch,
      source: 'indexeddb-repaired-localStorage',
      localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
      persisted: true,
      cacheUpdated: true,
      hostFingerprintMatch: observed.changed
        ? 'changed'
        : resolveHostFingerprintMatch(observed.record, options.hostFingerprint),
      error: null,
    };
  }
  if (!authorityRecord && storageRecord && identityStore) {
    const observed = observeHostFingerprint(storageRecord, options.hostFingerprint, now);
    try {
      await identityStore.writeRecord(observed.record);
    } catch (error) {
      return unavailable(`indexedDB identity authority write failed: ${toErrorMessage(error)}`);
    }
    if (observed.changed && !writeStorageIdentityRecord(storage, observed.record)) {
      return unavailable('localStorage identity authority write failed');
    }
    return {
      deviceId: observed.record.deviceId,
      identityEpoch: observed.record.identityEpoch,
      source: 'localStorage-repaired-indexeddb',
      localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
      persisted: true,
      cacheUpdated: observed.changed,
      hostFingerprintMatch: observed.changed
        ? 'changed'
        : resolveHostFingerprintMatch(observed.record, options.hostFingerprint),
      error: null,
    };
  }

  const localDeviceId = tempLocalDeviceId ?? await readTempLocalDeviceId(localStore);
  if (identityStore) {
    const migratedDeviceId = legacyStoredDeviceId ?? legacyReviewDeviceId ?? localDeviceId.deviceId;
    if (migratedDeviceId) {
      const source = legacyStoredDeviceId
        ? 'localStorage'
        : legacyReviewDeviceId
          ? 'legacy-localStorage'
          : 'temp-local';
      return persistAuthorityAndReturn(
        identityStore,
        localStore,
        storage,
        createIdentityRecord(migratedDeviceId, options, now),
        source,
        now,
      );
    }
  }

  if (localDeviceId.error && !identityStore) {
    return unavailable(localDeviceId.error);
  }
  if (localDeviceId.deviceId) {
    if (identityStore) {
      return persistAuthorityAndReturn(
        identityStore,
        localStore,
        storage,
        createIdentityRecord(localDeviceId.deviceId, options, now),
        'temp-local',
        now,
      );
    }
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
  if (identityStore) {
    return persistAuthorityAndReturn(
      identityStore,
      localStore,
      storage,
      createIdentityRecord(next.trim(), options, now),
      'generated',
      now,
    );
  }
  return await persistAndReturn(localStore, storage, next.trim(), 'generated', now);
}

function createIdentityRecord(
  deviceId: string,
  options: ResolveTruthDeviceIdOptions,
  now: () => number,
): TruthDeviceIdentityRecord {
  const timestamp = now();
  return {
    version: TRUTH_DEVICE_IDENTITY_VERSION,
    deviceId,
    identityEpoch: (options.createEpoch ?? createTruthIdentityEpoch)(),
    hostFingerprint: options.hostFingerprint ?? null,
    createdAt: timestamp,
    lastSeenAt: timestamp,
  };
}

function createTruthIdentityEpoch(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const randomId = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `epoch-${randomId}`;
}

async function readIdentityRecord(
  identityStore: TruthDeviceIdentityPort | null,
): Promise<TruthDeviceIdentityRecordRead> {
  if (!identityStore) {
    return { status: 'missing', record: null, error: null };
  }
  try {
    const value = await identityStore.readRecord();
    if (value == null) {
      return { status: 'missing', record: null, error: null };
    }
    if (!isTruthDeviceIdentityRecord(value)) {
      return {
        status: 'invalid',
        record: null,
        error: invalidIdentityRecordReason(value, 'indexedDB'),
      };
    }
    return { status: 'valid', record: value, error: null };
  } catch (error) {
    return { status: 'error', record: null, error: toErrorMessage(error) };
  }
}

function readStorageIdentityRecord(
  storage: TruthDeviceIdentityStorage | null,
): TruthDeviceIdentityRecordRead {
  try {
    const serialized = storage?.getItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY);
    if (!serialized) {
      return { status: 'missing', record: null, error: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch (error) {
      return {
        status: 'invalid',
        record: null,
        error: `invalid localStorage identity JSON: ${toErrorMessage(error)}`,
      };
    }
    if (!isTruthDeviceIdentityRecord(parsed)) {
      return {
        status: 'invalid',
        record: null,
        error: invalidIdentityRecordReason(parsed, 'localStorage'),
      };
    }
    return { status: 'valid', record: parsed, error: null };
  } catch (error) {
    return { status: 'error', record: null, error: toErrorMessage(error) };
  }
}

function invalidIdentityRecordReason(value: unknown, source: 'indexedDB' | 'localStorage'): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const version = (value as { version?: unknown }).version;
    if (version !== undefined && version !== TRUTH_DEVICE_IDENTITY_VERSION) {
      return `unsupported ${source} identity version: ${String(version)}`;
    }
  }
  return `invalid ${source} identity record`;
}

function resolveHostFingerprintMatch(
  record: TruthDeviceIdentityRecord,
  hostFingerprint: string | null | undefined,
): 'match' | 'changed' | 'unknown' {
  if (hostFingerprint == null || record.hostFingerprint == null) {
    return 'unknown';
  }
  return hostFingerprint === record.hostFingerprint ? 'match' : 'changed';
}

function observeHostFingerprint(
  record: TruthDeviceIdentityRecord,
  hostFingerprint: string | null | undefined,
  now: () => number,
): { record: TruthDeviceIdentityRecord; changed: boolean } {
  const changed = hostFingerprint != null && hostFingerprint !== record.hostFingerprint;
  return {
    record: changed
      ? {
          ...record,
          hostFingerprint,
          lastSeenAt: now(),
        }
      : record,
    changed,
  };
}

function writeStorageIdentityRecord(
  storage: TruthDeviceIdentityStorage | null,
  record: TruthDeviceIdentityRecord,
): boolean {
  try {
    storage?.setItem(TRUTH_DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record));
    return Boolean(storage);
  } catch {
    return false;
  }
}

function isTruthDeviceIdentityRecord(value: unknown): value is TruthDeviceIdentityRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<TruthDeviceIdentityRecord>;
  return record.version === TRUTH_DEVICE_IDENTITY_VERSION
    && isMessagePackTruthIdentity(record.deviceId)
    && typeof record.identityEpoch === 'string'
    && record.identityEpoch.trim().length > 0
    && (record.hostFingerprint === null || typeof record.hostFingerprint === 'string')
    && typeof record.createdAt === 'number'
    && Number.isFinite(record.createdAt)
    && typeof record.lastSeenAt === 'number'
    && Number.isFinite(record.lastSeenAt);
}

function sameIdentityRecord(
  left: TruthDeviceIdentityRecord,
  right: TruthDeviceIdentityRecord,
): boolean {
  return left.version === right.version
    && left.deviceId === right.deviceId
    && left.identityEpoch === right.identityEpoch
    && left.hostFingerprint === right.hostFingerprint
    && left.createdAt === right.createdAt
    && left.lastSeenAt === right.lastSeenAt;
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

async function persistAuthorityAndReturn(
  identityStore: TruthDeviceIdentityPort,
  localStore: TruthDeviceIdentityLocalStore | null,
  storage: TruthDeviceIdentityStorage | null,
  record: TruthDeviceIdentityRecord,
  source: 'temp-local' | 'localStorage' | 'legacy-localStorage' | 'generated',
  now: () => number,
): Promise<TruthDeviceIdentityResolution> {
  try {
    await identityStore.writeRecord(record);
  } catch (error) {
    return unavailable(`indexedDB identity authority write failed: ${toErrorMessage(error)}`);
  }
  if (!writeStorageIdentityRecord(storage, record)) {
    return unavailable('localStorage identity authority write failed');
  }
  await writeTempLocalDeviceId(localStore, record.deviceId, source, now);
  return {
    deviceId: record.deviceId,
    identityEpoch: record.identityEpoch,
    source,
    localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
    persisted: true,
    cacheUpdated: true,
    hostFingerprintMatch: record.hostFingerprint == null ? 'unknown' : 'match',
    error: null,
  };
}

async function writeTempLocalDeviceId(
  localStore: TruthDeviceIdentityLocalStore | null,
  deviceId: string,
  source: 'temp-local' | 'localStorage' | 'legacy-localStorage' | 'generated',
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

function identityRecoveryRequired(error: string): TruthDeviceIdentityResolution {
  return {
    deviceId: null,
    source: 'identity-recovery-required',
    localStatePath: TRUTH_DEVICE_ID_LOCAL_STATE_PATH,
    persisted: false,
    cacheUpdated: false,
    error,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
