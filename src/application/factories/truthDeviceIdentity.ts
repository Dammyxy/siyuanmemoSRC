import {
  TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
  TRUTH_DEVICE_IDENTITY_VERSION,
  type TruthDeviceIdentityAuthorityEnvelope,
  type TruthDeviceIdentityAuthorityPort,
  type TruthDeviceIdentityCacheDiagnostic,
  type TruthDeviceIdentityCachePort,
  type TruthDeviceIdentityEvidenceProbePort,
  type TruthDeviceIdentityInitializationFencePort,
  type TruthDeviceIdentityInstallationEvidence,
  type TruthDeviceIdentityRecord,
  type TruthDeviceIdentityStatus,
} from '@/application/ports/TruthDeviceIdentityPort';

export const TRUTH_DEVICE_IDENTITY_LOCAL_STATE_PATH = '/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json';

export type TruthDeviceIdentitySource =
  | 'installation-authority'
  | 'legacy-browser-authority-migration'
  | 'first-install'
  | 'identity-recovery-required'
  | 'authority-unavailable';

export interface TruthDeviceIdentityResolution {
  status: TruthDeviceIdentityStatus;
  deviceId: string | null;
  identityEpoch: string | null;
  source: TruthDeviceIdentitySource;
  authorityRevision: number | null;
  localStatePath: typeof TRUTH_DEVICE_IDENTITY_LOCAL_STATE_PATH;
  persisted: boolean;
  cacheUpdated: boolean;
  cacheDiagnostics: TruthDeviceIdentityCacheDiagnostic[];
  installationEvidence: TruthDeviceIdentityInstallationEvidence | null;
  hostFingerprintMatch: 'match' | 'changed' | 'unknown';
  error: string | null;
}

export interface ResolveTruthDeviceIdentityOptions {
  authority: TruthDeviceIdentityAuthorityPort;
  caches: TruthDeviceIdentityCachePort[];
  evidenceProbe: TruthDeviceIdentityEvidenceProbePort;
  initializationFence: TruthDeviceIdentityInitializationFencePort;
  hostFingerprint?: string | null;
  createId?: () => string;
  createEpoch?: () => string;
  now?: () => number;
}

interface CacheReadResult {
  cache: TruthDeviceIdentityCachePort;
  raw: unknown | null;
  record: TruthDeviceIdentityRecord | null;
  error: string | null;
}

type FencedResolution =
  | { kind: 'verified'; envelope: TruthDeviceIdentityAuthorityEnvelope; source: 'installation-authority' | 'legacy-browser-authority-migration' | 'first-install'; evidence: TruthDeviceIdentityInstallationEvidence | null }
  | { kind: 'recovery'; error: string; evidence: TruthDeviceIdentityInstallationEvidence | null }
  | { kind: 'unavailable'; error: string; evidence: TruthDeviceIdentityInstallationEvidence | null };

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

export function createTruthIdentityEpoch(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const randomId = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `epoch-${randomId}`;
}

export function isTruthDeviceIdentityRecord(value: unknown): value is TruthDeviceIdentityRecord {
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

export function isTruthDeviceIdentityAuthorityEnvelope(
  value: unknown,
): value is TruthDeviceIdentityAuthorityEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const envelope = value as Partial<TruthDeviceIdentityAuthorityEnvelope>;
  return envelope.version === TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION
    && Number.isSafeInteger(envelope.revision)
    && Number(envelope.revision) > 0
    && (
      envelope.previousRevision === null
      || (Number.isSafeInteger(envelope.previousRevision) && Number(envelope.previousRevision) > 0)
    )
    && typeof envelope.publishedAt === 'number'
    && Number.isFinite(envelope.publishedAt)
    && envelope.publishedAt > 0
    && isTruthDeviceIdentityRecord(envelope.identity);
}

export async function resolveTruthDeviceId(
  options: ResolveTruthDeviceIdentityOptions,
): Promise<string | null> {
  return (await resolveTruthDeviceIdentity(options)).deviceId;
}

export async function resolveTruthDeviceIdentity(
  options: ResolveTruthDeviceIdentityOptions,
): Promise<TruthDeviceIdentityResolution> {
  const now = options.now ?? Date.now;
  const authorityRead = await readAuthority(options.authority);
  if (authorityRead.error) {
    return authorityUnavailable(authorityRead.error);
  }
  if (authorityRead.value != null) {
    if (!isTruthDeviceIdentityAuthorityEnvelope(authorityRead.value)) {
      return identityRecoveryRequired('invalid or unsupported installation identity authority');
    }
    return verifiedResolution(
      authorityRead.value,
      'installation-authority',
      await reconcileCaches(options.caches, authorityRead.value.identity),
      null,
      options.hostFingerprint,
    );
  }

  if (!options.initializationFence) {
    return authorityUnavailable('installation identity initialization fence unavailable');
  }

  let fenced: FencedResolution;
  try {
    fenced = await options.initializationFence.runExclusive(async () => {
      const current = await readAuthority(options.authority);
      if (current.error) {
        return { kind: 'unavailable', error: current.error, evidence: null };
      }
      if (current.value != null) {
        if (!isTruthDeviceIdentityAuthorityEnvelope(current.value)) {
          return { kind: 'recovery', error: 'invalid or unsupported installation identity authority', evidence: null };
        }
        return { kind: 'verified', envelope: current.value, source: 'installation-authority', evidence: null };
      }

      const cacheReads = await readCaches(options.caches);
      const indexedDb = cacheReads.find((entry) => entry.cache.kind === 'indexeddb');
      const localStorage = cacheReads.find((entry) => entry.cache.kind === 'local-storage');
      if (
        indexedDb?.record
        && localStorage?.record
        && sameIdentityRecord(indexedDb.record, localStorage.record)
      ) {
        const envelope = createAuthorityEnvelope(indexedDb.record, now());
        const publication = await publishAuthority(options.authority, envelope);
        if (publication.kind !== 'ok') {
          return publication;
        }
        return {
          kind: 'verified',
          envelope,
          source: 'legacy-browser-authority-migration',
          evidence: null,
        };
      }

      const evidence = await options.evidenceProbe.probeEvidence();
      if (evidence.status === 'unavailable') {
        return {
          kind: 'unavailable',
          error: `installation identity evidence unavailable: ${evidence.error ?? 'unknown'}`,
          evidence,
        };
      }
      if (evidence.status === 'non-empty') {
        return {
          kind: 'recovery',
          error: describeAmbiguousLegacyEvidence(cacheReads, evidence),
          evidence,
        };
      }

      const identity = createIdentityRecord(options, now);
      if (!identity) {
        return {
          kind: 'unavailable',
          error: 'generated Truth Device Identity is invalid',
          evidence,
        };
      }
      const envelope = createAuthorityEnvelope(identity, now());
      const publication = await publishAuthority(options.authority, envelope);
      if (publication.kind !== 'ok') {
        return { ...publication, evidence };
      }
      return { kind: 'verified', envelope, source: 'first-install', evidence };
    });
  } catch (error) {
    return authorityUnavailable(`installation identity initialization fence failed: ${toErrorMessage(error)}`);
  }

  if (fenced.kind === 'unavailable') {
    return authorityUnavailable(fenced.error, fenced.evidence);
  }
  if (fenced.kind === 'recovery') {
    return identityRecoveryRequired(fenced.error, fenced.evidence);
  }
  return verifiedResolution(
    fenced.envelope,
    fenced.source,
    await reconcileCaches(options.caches, fenced.envelope.identity),
    fenced.evidence,
    options.hostFingerprint,
  );
}

function createIdentityRecord(
  options: ResolveTruthDeviceIdentityOptions,
  now: () => number,
): TruthDeviceIdentityRecord | null {
  const deviceId = (options.createId ?? createTruthDeviceId)().trim();
  const identityEpoch = (options.createEpoch ?? createTruthIdentityEpoch)().trim();
  if (!isMessagePackTruthIdentity(deviceId) || !identityEpoch) {
    return null;
  }
  const timestamp = now();
  return {
    version: TRUTH_DEVICE_IDENTITY_VERSION,
    deviceId,
    identityEpoch,
    hostFingerprint: options.hostFingerprint ?? null,
    createdAt: timestamp,
    lastSeenAt: timestamp,
  };
}

function createAuthorityEnvelope(
  identity: TruthDeviceIdentityRecord,
  publishedAt: number,
): TruthDeviceIdentityAuthorityEnvelope {
  return {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
    revision: 1,
    identity,
    previousRevision: null,
    publishedAt,
  };
}

async function readAuthority(
  authority: TruthDeviceIdentityAuthorityPort,
): Promise<{ value: unknown | null; error: string | null }> {
  try {
    return { value: await authority.readAuthority(), error: null };
  } catch (error) {
    return { value: null, error: `installation identity authority read failed: ${toErrorMessage(error)}` };
  }
}

async function publishAuthority(
  authority: TruthDeviceIdentityAuthorityPort,
  envelope: TruthDeviceIdentityAuthorityEnvelope,
): Promise<
  | { kind: 'ok' }
  | { kind: 'recovery'; error: string; evidence: null }
  | { kind: 'unavailable'; error: string; evidence: null }
> {
  try {
    await authority.publishAuthority(envelope);
    return { kind: 'ok' };
  } catch (error) {
    const message = toErrorMessage(error);
    if (
      message.includes('VERIFICATION_FAILED')
      || message.includes('REVISION_CONFLICT')
      || message.includes('AUTHORITY_INVALID')
    ) {
      return { kind: 'recovery', error: message, evidence: null };
    }
    return { kind: 'unavailable', error: message, evidence: null };
  }
}

async function readCaches(caches: TruthDeviceIdentityCachePort[]): Promise<CacheReadResult[]> {
  return Promise.all(caches.map(async (cache) => {
    try {
      const raw = await cache.readCache();
      return {
        cache,
        raw,
        record: isTruthDeviceIdentityRecord(raw) ? raw : null,
        error: null,
      };
    } catch (error) {
      return {
        cache,
        raw: null,
        record: null,
        error: toErrorMessage(error),
      };
    }
  }));
}

async function reconcileCaches(
  caches: TruthDeviceIdentityCachePort[],
  authority: TruthDeviceIdentityRecord,
): Promise<TruthDeviceIdentityCacheDiagnostic[]> {
  const reads = await readCaches(caches);
  return Promise.all(reads.map(async (read): Promise<TruthDeviceIdentityCacheDiagnostic> => {
    if (read.record && sameIdentityRecord(read.record, authority)) {
      return { kind: read.cache.kind, status: 'match', message: null };
    }
    try {
      await read.cache.writeCache(authority);
      return {
        kind: read.cache.kind,
        status: 'repaired',
        message: read.error ?? (read.raw == null ? 'cache was missing' : 'cache disagreed with authority'),
      };
    } catch (writeError) {
      try {
        await read.cache.clearCache();
        return {
          kind: read.cache.kind,
          status: 'invalidated',
          message: `cache repair failed and cache was invalidated: ${toErrorMessage(writeError)}`,
        };
      } catch (clearError) {
        return {
          kind: read.cache.kind,
          status: 'unavailable',
          message: `cache repair failed: ${toErrorMessage(writeError)}; invalidation failed: ${toErrorMessage(clearError)}`,
        };
      }
    }
  }));
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

function describeAmbiguousLegacyEvidence(
  cacheReads: CacheReadResult[],
  evidence: TruthDeviceIdentityInstallationEvidence,
): string {
  const browser = cacheReads
    .filter((entry) => entry.cache.kind === 'indexeddb' || entry.cache.kind === 'local-storage')
    .map((entry) => `${entry.cache.kind}=${entry.record ? `${entry.record.deviceId}/${entry.record.identityEpoch}` : entry.error ? 'unavailable' : entry.raw == null ? 'missing' : 'invalid'}`)
    .join(', ');
  return `installation identity authority missing for non-empty installation (${evidence.reasons.join(', ') || 'unknown evidence'}); ${browser || 'browser caches unavailable'}`;
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

function verifiedResolution(
  envelope: TruthDeviceIdentityAuthorityEnvelope,
  source: 'installation-authority' | 'legacy-browser-authority-migration' | 'first-install',
  cacheDiagnostics: TruthDeviceIdentityCacheDiagnostic[],
  evidence: TruthDeviceIdentityInstallationEvidence | null,
  hostFingerprint: string | null | undefined,
): TruthDeviceIdentityResolution {
  return {
    status: 'verified',
    deviceId: envelope.identity.deviceId,
    identityEpoch: envelope.identity.identityEpoch,
    source,
    authorityRevision: envelope.revision,
    localStatePath: TRUTH_DEVICE_IDENTITY_LOCAL_STATE_PATH,
    persisted: true,
    cacheUpdated: cacheDiagnostics.some((diagnostic) => diagnostic.status === 'repaired' || diagnostic.status === 'invalidated'),
    cacheDiagnostics,
    installationEvidence: evidence,
    hostFingerprintMatch: resolveHostFingerprintMatch(envelope.identity, hostFingerprint),
    error: null,
  };
}

function authorityUnavailable(
  error: string,
  evidence: TruthDeviceIdentityInstallationEvidence | null = null,
): TruthDeviceIdentityResolution {
  return {
    status: 'authority-unavailable',
    deviceId: null,
    identityEpoch: null,
    source: 'authority-unavailable',
    authorityRevision: null,
    localStatePath: TRUTH_DEVICE_IDENTITY_LOCAL_STATE_PATH,
    persisted: false,
    cacheUpdated: false,
    cacheDiagnostics: [],
    installationEvidence: evidence,
    hostFingerprintMatch: 'unknown',
    error,
  };
}

function identityRecoveryRequired(
  error: string,
  evidence: TruthDeviceIdentityInstallationEvidence | null = null,
): TruthDeviceIdentityResolution {
  return {
    status: 'identity-recovery-required',
    deviceId: null,
    identityEpoch: null,
    source: 'identity-recovery-required',
    authorityRevision: null,
    localStatePath: TRUTH_DEVICE_IDENTITY_LOCAL_STATE_PATH,
    persisted: false,
    cacheUpdated: false,
    cacheDiagnostics: [],
    installationEvidence: evidence,
    hostFingerprintMatch: 'unknown',
    error,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
