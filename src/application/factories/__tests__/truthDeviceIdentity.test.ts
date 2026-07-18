import { describe, expect, it, vi } from 'vitest';
import {
  TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
  TRUTH_DEVICE_IDENTITY_VERSION,
  type TruthDeviceIdentityAuthorityEnvelope,
  type TruthDeviceIdentityAuthorityPort,
  type TruthDeviceIdentityCacheKind,
  type TruthDeviceIdentityCachePort,
  type TruthDeviceIdentityEvidenceProbePort,
  type TruthDeviceIdentityInitializationFencePort,
  type TruthDeviceIdentityInstallationEvidence,
  type TruthDeviceIdentityRecord,
} from '@/application/ports/TruthDeviceIdentityPort';
import { resolveTruthDeviceIdentity } from '../truthDeviceIdentity';

class MemoryAuthority implements TruthDeviceIdentityAuthorityPort {
  current: unknown | null = null;
  previous: unknown | null = null;
  readError: Error | null = null;
  publishError: Error | null = null;
  readonly publishAuthority = vi.fn(async (envelope: TruthDeviceIdentityAuthorityEnvelope) => {
    if (this.publishError) throw this.publishError;
    if (this.current != null) this.previous = this.current;
    this.current = structuredClone(envelope);
  });

  async readAuthority(): Promise<unknown | null> {
    if (this.readError) throw this.readError;
    return structuredClone(this.current);
  }

  async readPreviousAuthority(): Promise<unknown | null> {
    return structuredClone(this.previous);
  }
}

class MemoryCache implements TruthDeviceIdentityCachePort {
  raw: unknown | null = null;
  readError: Error | null = null;
  writeError: Error | null = null;
  clearError: Error | null = null;
  readonly writeCache = vi.fn(async (record: TruthDeviceIdentityRecord) => {
    if (this.writeError) throw this.writeError;
    this.raw = structuredClone(record);
  });
  readonly clearCache = vi.fn(async () => {
    if (this.clearError) throw this.clearError;
    this.raw = null;
  });

  constructor(readonly kind: TruthDeviceIdentityCacheKind) {}

  async readCache(): Promise<unknown | null> {
    if (this.readError) throw this.readError;
    return structuredClone(this.raw);
  }
}

class MemoryEvidenceProbe implements TruthDeviceIdentityEvidenceProbePort {
  constructor(public evidence: TruthDeviceIdentityInstallationEvidence) {}
  async probeEvidence(): Promise<TruthDeviceIdentityInstallationEvidence> {
    return structuredClone(this.evidence);
  }
}

class SerializedFence implements TruthDeviceIdentityInitializationFencePort {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class FailingFence implements TruthDeviceIdentityInitializationFencePort {
  async runExclusive<T>(_operation: () => Promise<T>): Promise<T> {
    throw new Error('kernel fence unavailable');
  }
}

function identity(overrides: Partial<TruthDeviceIdentityRecord> = {}): TruthDeviceIdentityRecord {
  return {
    version: TRUTH_DEVICE_IDENTITY_VERSION,
    deviceId: 'device-stable',
    identityEpoch: 'epoch-stable',
    hostFingerprint: 'host-a',
    createdAt: 10,
    lastSeenAt: 10,
    ...overrides,
  };
}

function envelope(record = identity()): TruthDeviceIdentityAuthorityEnvelope {
  return {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
    revision: 1,
    identity: record,
    previousRevision: null,
    publishedAt: 10,
  };
}

function evidence(
  status: TruthDeviceIdentityInstallationEvidence['status'],
  reasons: string[] = [],
): TruthDeviceIdentityInstallationEvidence {
  return {
    status,
    reasons,
    checkedAt: 20,
    error: status === 'unavailable' ? 'probe failed' : null,
  };
}

function createHarness(input: {
  authority?: MemoryAuthority;
  caches?: MemoryCache[];
  evidence?: TruthDeviceIdentityInstallationEvidence;
  fence?: TruthDeviceIdentityInitializationFencePort;
} = {}) {
  return {
    authority: input.authority ?? new MemoryAuthority(),
    caches: input.caches ?? [new MemoryCache('indexeddb'), new MemoryCache('local-storage'), new MemoryCache('temp-local')],
    evidenceProbe: new MemoryEvidenceProbe(input.evidence ?? evidence('empty')),
    initializationFence: input.fence ?? new SerializedFence(),
    hostFingerprint: 'host-a',
    createId: vi.fn(() => 'device-new'),
    createEpoch: vi.fn(() => 'epoch-new'),
    now: vi.fn(() => 30),
  };
}

describe('Truth Device Identity module', () => {
  it('uses an existing installation authority without rewriting it', async () => {
    const harness = createHarness();
    harness.authority.current = envelope();
    for (const cache of harness.caches) cache.raw = identity();

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'verified',
      source: 'installation-authority',
      deviceId: 'device-stable',
      identityEpoch: 'epoch-stable',
      authorityRevision: 1,
      cacheUpdated: false,
      hostFingerprintMatch: 'match',
    });
    expect(harness.authority.publishAuthority).not.toHaveBeenCalled();
    expect(harness.createId).not.toHaveBeenCalled();
    expect(harness.createEpoch).not.toHaveBeenCalled();
  });

  it('keeps identity stable across an origin/host change with cleared browser caches', async () => {
    const harness = createHarness();
    harness.authority.current = envelope();
    harness.hostFingerprint = 'host-b';

    const resolved = await resolveTruthDeviceIdentity(harness);
    expect(resolved).toMatchObject({
      status: 'verified',
      deviceId: 'device-stable',
      identityEpoch: 'epoch-stable',
      hostFingerprintMatch: 'changed',
      cacheUpdated: true,
    });
    expect(resolved.cacheDiagnostics.every((item) => item.status === 'repaired')).toBe(true);
    expect(harness.authority.publishAuthority).not.toHaveBeenCalled();
  });

  it('does not block verified authority when browser cache access fails', async () => {
    const harness = createHarness();
    harness.authority.current = envelope();
    const browser = harness.caches[0];
    browser.readError = new Error('read denied');
    browser.writeError = new Error('write denied');
    browser.clearError = new Error('clear denied');

    const resolved = await resolveTruthDeviceIdentity(harness);
    expect(resolved.status).toBe('verified');
    expect(resolved.cacheDiagnostics).toContainEqual(expect.objectContaining({
      kind: 'indexeddb',
      status: 'unavailable',
    }));
  });

  it('migrates only a matching full IndexedDB/localStorage pair', async () => {
    const harness = createHarness({ evidence: evidence('non-empty', ['canonical-truth-or-frontier']) });
    harness.caches[0].raw = identity();
    harness.caches[1].raw = identity();

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'verified',
      source: 'legacy-browser-authority-migration',
      deviceId: 'device-stable',
      identityEpoch: 'epoch-stable',
    });
    expect(harness.authority.publishAuthority).toHaveBeenCalledTimes(1);
    expect(harness.createEpoch).not.toHaveBeenCalled();
  });

  it('fails closed for conflicting legacy browser identities in a non-empty install', async () => {
    const harness = createHarness({ evidence: evidence('non-empty', ['sqlite-delta']) });
    harness.caches[0].raw = identity();
    harness.caches[1].raw = identity({ identityEpoch: 'epoch-other' });

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'identity-recovery-required',
      source: 'identity-recovery-required',
      deviceId: null,
      error: expect.stringContaining('non-empty installation'),
    });
    expect(harness.authority.publishAuthority).not.toHaveBeenCalled();
  });

  it('fails closed for a single surviving browser identity in a non-empty install', async () => {
    const harness = createHarness({ evidence: evidence('non-empty', ['canonical-truth-or-frontier']) });
    harness.caches[0].raw = identity();

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'identity-recovery-required',
      error: expect.stringContaining('indexeddb=device-stable/epoch-stable'),
    });
    expect(harness.createEpoch).not.toHaveBeenCalled();
  });

  it('fails closed when authority and browser caches are all missing in a non-empty install', async () => {
    const harness = createHarness({ evidence: evidence('non-empty', ['canonical-truth-or-frontier']) });

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'identity-recovery-required',
      deviceId: null,
      identityEpoch: null,
      error: expect.stringContaining('indexeddb=missing, local-storage=missing'),
    });
    expect(harness.authority.publishAuthority).not.toHaveBeenCalled();
    expect(harness.createId).not.toHaveBeenCalled();
    expect(harness.createEpoch).not.toHaveBeenCalled();
  });

  it('does not generate from a temp-only device ID in a non-empty install', async () => {
    const harness = createHarness({ evidence: evidence('non-empty', ['temp-local-identity']) });
    harness.caches[2].raw = { version: 1, deviceId: 'device-temp' };

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'identity-recovery-required',
      deviceId: null,
      identityEpoch: null,
    });
    expect(harness.createEpoch).not.toHaveBeenCalled();
  });

  it('creates one new identity only for an empty installation', async () => {
    const harness = createHarness({ evidence: evidence('empty') });
    harness.caches[0].raw = identity({ deviceId: 'stale-browser-device' });

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'verified',
      source: 'first-install',
      deviceId: 'device-new',
      identityEpoch: 'epoch-new',
      installationEvidence: { status: 'empty' },
    });
    expect(harness.createId).toHaveBeenCalledTimes(1);
    expect(harness.createEpoch).toHaveBeenCalledTimes(1);
  });

  it('returns retryable authority unavailable when evidence cannot be probed', async () => {
    const harness = createHarness({ evidence: evidence('unavailable') });
    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'authority-unavailable',
      source: 'authority-unavailable',
      error: expect.stringContaining('evidence unavailable'),
    });
  });

  it('does not fall back to caches when installation authority is malformed', async () => {
    const harness = createHarness();
    harness.authority.current = { version: 99 };
    harness.caches[0].raw = identity();
    harness.caches[1].raw = identity();

    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'identity-recovery-required',
      error: expect.stringContaining('invalid or unsupported'),
    });
    expect(harness.authority.publishAuthority).not.toHaveBeenCalled();
  });

  it('returns authority unavailable for transient authority reads', async () => {
    const harness = createHarness();
    harness.authority.readError = new Error('conf unavailable');
    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'authority-unavailable',
      error: expect.stringContaining('conf unavailable'),
    });
  });

  it('maps authority read-back verification failure to recovery required', async () => {
    const harness = createHarness({ evidence: evidence('empty') });
    harness.authority.publishError = new Error('TRUTH_DEVICE_IDENTITY_AUTHORITY_VERIFICATION_FAILED: mismatch');
    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'identity-recovery-required',
      error: expect.stringContaining('VERIFICATION_FAILED'),
    });
  });

  it('does not perform an unfenced identity write', async () => {
    const harness = createHarness({ evidence: evidence('empty'), fence: new FailingFence() });
    await expect(resolveTruthDeviceIdentity(harness)).resolves.toMatchObject({
      status: 'authority-unavailable',
      error: expect.stringContaining('fence failed'),
    });
    expect(harness.authority.publishAuthority).not.toHaveBeenCalled();
  });

  it('serializes concurrent first-install resolvers onto one authority', async () => {
    const authority = new MemoryAuthority();
    const fence = new SerializedFence();
    const first = createHarness({ authority, fence, evidence: evidence('empty') });
    const second = createHarness({ authority, fence, evidence: evidence('empty') });
    second.createId = vi.fn(() => 'device-loser');
    second.createEpoch = vi.fn(() => 'epoch-loser');

    const [left, right] = await Promise.all([
      resolveTruthDeviceIdentity(first),
      resolveTruthDeviceIdentity(second),
    ]);
    expect(left.deviceId).toBe('device-new');
    expect(right.deviceId).toBe('device-new');
    expect(left.identityEpoch).toBe('epoch-new');
    expect(right.identityEpoch).toBe('epoch-new');
    expect(authority.publishAuthority).toHaveBeenCalledTimes(1);
    expect(second.createId).not.toHaveBeenCalled();
  });
});
