import { describe, expect, it, vi } from 'vitest';
import type {
  TruthDeviceIdentityAuthorityEnvelope,
  TruthDeviceIdentityAuthorityPort,
  TruthDeviceIdentityCachePort,
} from '@/application/ports/TruthDeviceIdentityPort';
import {
  FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryAuthorityPublicationIntent,
} from '../../../../packages/contracts/src/backend-rpc';
import { ForeignEpochAuthorityPublicationCoordinator } from '../ForeignEpochAuthorityPublicationCoordinator';

class MemoryAuthority implements TruthDeviceIdentityAuthorityPort {
  current: unknown | null = null;
  previous: unknown | null = null;
  readBackOverride: unknown | undefined;
  corruptAfterPublish = false;

  async readAuthority(): Promise<unknown | null> {
    return this.readBackOverride !== undefined
      ? structuredClone(this.readBackOverride)
      : structuredClone(this.current);
  }

  async readPreviousAuthority(): Promise<unknown | null> {
    return structuredClone(this.previous);
  }

  async publishAuthority(envelope: TruthDeviceIdentityAuthorityEnvelope): Promise<void> {
    this.current = structuredClone(envelope);
    if (this.corruptAfterPublish) this.readBackOverride = { invalid: true };
  }
}

function cache(kind: TruthDeviceIdentityCachePort['kind'], value: unknown | null): TruthDeviceIdentityCachePort {
  return {
    kind,
    readCache: vi.fn(async () => structuredClone(value)),
    writeCache: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined),
  };
}

async function intent(authorityState: { currentAuthority: unknown | null; previousAuthority: unknown | null }) {
  const authority = {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
    revision: 1,
    identity: {
      version: TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
      deviceId: 'device-redacted',
      identityEpoch: 'epoch-current-redacted',
      hostFingerprint: null,
      createdAt: 100,
      lastSeenAt: 100,
    },
    previousRevision: null,
    publishedAt: 100,
  } as const;
  const material = {
    version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
    expectedAuthorityStateHash: await hashRecoveryContent(authorityState),
    authority,
    proof: {
      identity: {
        deviceIdHash: await hashRecoveryContent(authority.identity.deviceId),
        identityEpoch: authority.identity.identityEpoch,
      },
      provingEvidence: [],
      corroboratingEvidence: [],
      contradictingEvidence: [],
    },
  };
  return {
    ...material,
    intentHash: await hashRecoveryContent(material),
  } satisfies BackendForeignEpochRecoveryAuthorityPublicationIntent;
}

function harness() {
  const authority = new MemoryAuthority();
  const ensureActiveWriter = vi.fn(async () => undefined);
  const runExclusive = vi.fn();
  const initializationFence = {
    async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
      runExclusive();
      return operation();
    },
  };
  const caches = [
    cache('indexeddb', { version: 2, deviceId: 'device-redacted', identityEpoch: 'epoch-current-redacted' }),
    cache('local-storage', null),
    cache('temp-local', { version: 1, deviceId: 'device-redacted' }),
  ];
  return {
    authority,
    ensureActiveWriter,
    runExclusive,
    coordinator: new ForeignEpochAuthorityPublicationCoordinator({
      authority,
      caches,
      initializationFence,
      ensureActiveWriter,
    }),
  };
}

describe('ForeignEpochAuthorityPublicationCoordinator', () => {
  it('reads authority and cache evidence without promoting any cache', async () => {
    const { authority, coordinator } = harness();
    const before = structuredClone(authority.current);

    const evidence = await coordinator.readEvidence();

    expect(evidence).toEqual({
      currentAuthority: null,
      previousAuthority: null,
      tempLocalIdentity: { version: 1, deviceId: 'device-redacted' },
      browserCacheObservations: [
        { version: 2, deviceId: 'device-redacted', identityEpoch: 'epoch-current-redacted' },
      ],
    });
    expect(authority.current).toEqual(before);
  });

  it('reports cache read failure as content-safe unavailable evidence', async () => {
    const { authority, ensureActiveWriter, runExclusive } = harness();
    const failingCache = cache('indexeddb', null);
    vi.mocked(failingCache.readCache).mockRejectedValueOnce(new Error('sensitive cache path'));
    const coordinator = new ForeignEpochAuthorityPublicationCoordinator({
      authority,
      caches: [failingCache],
      initializationFence: {
        async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
          runExclusive();
          return operation();
        },
      },
      ensureActiveWriter,
    });

    const evidence = await coordinator.readEvidence();

    expect(evidence.browserCacheObservations).toEqual([{
      status: 'unavailable',
      cacheKind: 'indexeddb',
      errorHash: expect.stringMatching(/^sha256:/),
    }]);
    expect(JSON.stringify(evidence)).not.toContain('sensitive cache path');
  });

  it('publishes the exact certified intent under writer authority and Kernel identity fence', async () => {
    const { authority, coordinator, ensureActiveWriter, runExclusive } = harness();
    const certified = await intent({ currentAuthority: null, previousAuthority: null });

    const result = await coordinator.publishCertifiedIntent({
      requestMethod: 'recovery.foreignEpoch.apply',
      operationId: 'operation-redacted',
      planHash: `sha256:${'a'.repeat(64)}`,
      intent: certified,
    });

    expect(ensureActiveWriter).toHaveBeenCalledTimes(1);
    expect(runExclusive).toHaveBeenCalledTimes(1);
    expect(authority.current).toEqual(certified.authority);
    expect(result.authorityHash).toBe(await hashRecoveryContent(certified.authority));
  });

  it('rejects non-apply callers and changed authority state before publication', async () => {
    const first = harness();
    const certified = await intent({ currentAuthority: null, previousAuthority: null });
    await expect(first.coordinator.publishCertifiedIntent({
      requestMethod: 'recovery.foreignEpoch.preview',
      operationId: 'operation-redacted',
      planHash: `sha256:${'a'.repeat(64)}`,
      intent: certified,
    })).rejects.toThrow('apply-only');
    expect(first.ensureActiveWriter).not.toHaveBeenCalled();

    const second = harness();
    second.authority.current = certified.authority;
    await expect(second.coordinator.publishCertifiedIntent({
      requestMethod: 'recovery.foreignEpoch.apply',
      operationId: 'operation-redacted',
      planHash: `sha256:${'a'.repeat(64)}`,
      intent: certified,
    })).rejects.toThrow('authority state changed');
  });

  it('acquires active writer authority only for a recovery apply request', async () => {
    const { coordinator, ensureActiveWriter } = harness();
    const planHash = `sha256:${'a'.repeat(64)}` as const;

    await coordinator.ensureRecoveryActiveWriter({
      requestMethod: 'recovery.foreignEpoch.apply',
      operationId: 'operation-redacted',
      planHash,
      stage: 'continuity',
    });
    expect(ensureActiveWriter).toHaveBeenCalledTimes(1);

    await expect(coordinator.ensureRecoveryActiveWriter({
      requestMethod: 'db.load',
      operationId: 'operation-redacted',
      planHash,
      stage: 'continuity',
    })).rejects.toThrow('apply-only');
    expect(ensureActiveWriter).toHaveBeenCalledTimes(1);
  });

  it('rejects intent tampering and exact read-back mismatch', async () => {
    const first = harness();
    const certified = await intent({ currentAuthority: null, previousAuthority: null });
    const tampered: BackendForeignEpochRecoveryAuthorityPublicationIntent = {
      ...structuredClone(certified),
      authority: {
        ...structuredClone(certified.authority),
        identity: {
          ...structuredClone(certified.authority.identity),
          identityEpoch: 'epoch-tampered',
        },
      },
    };
    await expect(first.coordinator.publishCertifiedIntent({
      requestMethod: 'recovery.foreignEpoch.apply',
      operationId: 'operation-redacted',
      planHash: `sha256:${'a'.repeat(64)}`,
      intent: tampered,
    })).rejects.toThrow('intent hash mismatch');

    const second = harness();
    second.authority.corruptAfterPublish = true;
    await expect(second.coordinator.publishCertifiedIntent({
      requestMethod: 'recovery.foreignEpoch.apply',
      operationId: 'operation-redacted',
      planHash: `sha256:${'a'.repeat(64)}`,
      intent: certified,
    })).rejects.toThrow('read-back mismatch');
  });
});
