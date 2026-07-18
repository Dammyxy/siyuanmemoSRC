import { describe, expect, it, vi } from 'vitest';
import {
  TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
  TRUTH_DEVICE_IDENTITY_VERSION,
  type TruthDeviceIdentityAuthorityEnvelope,
} from '@/application/ports/TruthDeviceIdentityPort';
import {
  SiyuanConfTruthDeviceIdentityAuthorityStore,
  TRUTH_DEVICE_IDENTITY_AUTHORITY_FILE,
  TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE,
} from '../SiyuanConfTruthDeviceIdentityAuthorityStore';

function createEnvelope(revision = 1): TruthDeviceIdentityAuthorityEnvelope {
  return {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_ENVELOPE_VERSION,
    revision,
    identity: {
      version: TRUTH_DEVICE_IDENTITY_VERSION,
      deviceId: 'device-a',
      identityEpoch: revision === 1 ? 'epoch-a' : 'epoch-b',
      hostFingerprint: 'host-a',
      createdAt: 10,
      lastSeenAt: 10,
    },
    previousRevision: revision === 1 ? null : revision - 1,
    publishedAt: 20 + revision,
  };
}

function createFilePort() {
  const files = new Map<string, string>();
  return {
    files,
    readInstallationIdentityText: vi.fn(async (path: string) => files.get(path) ?? null),
    writeInstallationIdentityText: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
}

describe('SiyuanConfTruthDeviceIdentityAuthorityStore', () => {
  it('publishes and verifies the first installation authority', async () => {
    const filePort = createFilePort();
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    const record = createEnvelope();
    await store.publishAuthority(record);
    await expect(store.readAuthority()).resolves.toEqual(record);
  });

  it('retains the previous verified envelope when revision advances', async () => {
    const filePort = createFilePort();
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    const first = createEnvelope();
    const second = createEnvelope(2);
    await store.publishAuthority(first);
    await store.publishAuthority(second);
    await expect(store.readPreviousAuthority()).resolves.toEqual(first);
    expect(filePort.files.has(TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE)).toBe(true);
  });

  it('restores a missing current authority only by continuing the verified previous revision', async () => {
    const filePort = createFilePort();
    const previous = createEnvelope();
    filePort.files.set(TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE, JSON.stringify(previous));
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    const recovered = {
      ...createEnvelope(2),
      identity: structuredClone(previous.identity),
    };

    await store.publishAuthority(recovered);

    await expect(store.readAuthority()).resolves.toEqual(recovered);
    await expect(store.readPreviousAuthority()).resolves.toEqual(previous);
  });

  it('rejects missing-current recovery that changes the previous authority identity', async () => {
    const filePort = createFilePort();
    filePort.files.set(TRUTH_DEVICE_IDENTITY_PREVIOUS_AUTHORITY_FILE, JSON.stringify(createEnvelope()));
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);

    await expect(store.publishAuthority(createEnvelope(2))).rejects.toThrow('REVISION_CONFLICT');
    await expect(store.readAuthority()).resolves.toBeNull();
  });

  it('returns malformed JSON as invalid evidence instead of treating it as missing', async () => {
    const filePort = createFilePort();
    filePort.files.set(TRUTH_DEVICE_IDENTITY_AUTHORITY_FILE, '{bad-json');
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    await expect(store.readAuthority()).resolves.toBe('{bad-json');
  });

  it('rejects unsupported envelopes and revision conflicts', async () => {
    const filePort = createFilePort();
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    await expect(store.publishAuthority({ ...createEnvelope(), version: 99 } as never))
      .rejects.toThrow('AUTHORITY_INVALID');
    await store.publishAuthority(createEnvelope());
    await expect(store.publishAuthority({ ...createEnvelope(2), revision: 3 }))
      .rejects.toThrow('REVISION_CONFLICT');
  });

  it('rejects invalid identity payloads before writing', async () => {
    const filePort = createFilePort();
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    const invalid = {
      ...createEnvelope(),
      identity: { ...createEnvelope().identity, identityEpoch: '' },
    };

    await expect(store.publishAuthority(invalid)).rejects.toThrow('AUTHORITY_INVALID');
    expect(filePort.writeInstallationIdentityText).not.toHaveBeenCalled();
  });

  it('propagates authority write failures without claiming publication', async () => {
    const filePort = createFilePort();
    filePort.writeInstallationIdentityText.mockRejectedValueOnce(new Error('disk denied'));
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);

    await expect(store.publishAuthority(createEnvelope())).rejects.toThrow('disk denied');
    await expect(store.readAuthority()).resolves.toBeNull();
  });

  it('rejects write/read-back mismatches', async () => {
    const filePort = createFilePort();
    filePort.writeInstallationIdentityText.mockImplementation(async (path: string, content: string) => {
      filePort.files.set(path, content.replace('device-a', 'device-corrupt'));
    });
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore(filePort);
    await expect(store.publishAuthority(createEnvelope())).rejects.toThrow('VERIFICATION_FAILED');
  });

  it('reports missing host APIs as authority unavailable', async () => {
    const store = new SiyuanConfTruthDeviceIdentityAuthorityStore({});
    await expect(store.readAuthority()).rejects.toThrow('AUTHORITY_UNAVAILABLE');
    await expect(store.publishAuthority(createEnvelope())).rejects.toThrow('AUTHORITY_UNAVAILABLE');
  });
});
