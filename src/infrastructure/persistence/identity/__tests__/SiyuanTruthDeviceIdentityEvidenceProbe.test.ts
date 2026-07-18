import { describe, expect, it, vi } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { SiyuanTruthDeviceIdentityEvidenceProbe } from '../SiyuanTruthDeviceIdentityEvidenceProbe';

function createFilePort(input: {
  truth?: boolean;
  delta?: boolean;
  temp?: unknown;
  previous?: string | null;
  error?: Error;
} = {}): Pick<IFileService, 'hasPluginDataEntries' | 'readTempLocalJSON' | 'readInstallationIdentityText'> {
  return {
    hasPluginDataEntries: vi.fn(async (prefix: string) => {
      if (input.error) throw input.error;
      return prefix === 'truth' ? Boolean(input.truth) : Boolean(input.delta);
    }),
    readTempLocalJSON: async <T>() => (input.temp ?? null) as T | null,
    readInstallationIdentityText: vi.fn(async () => input.previous ?? null),
  };
}

describe('SiyuanTruthDeviceIdentityEvidenceProbe', () => {
  it('proves an empty installation', async () => {
    const probe = new SiyuanTruthDeviceIdentityEvidenceProbe(createFilePort(), () => 10);
    await expect(probe.probeEvidence()).resolves.toEqual({
      status: 'empty', reasons: [], checkedAt: 10, error: null,
    });
  });

  it.each([
    [{ truth: true }, 'canonical-truth-or-frontier'],
    [{ delta: true }, 'sqlite-delta'],
    [{ temp: { deviceId: 'device-a' } }, 'temp-local-identity'],
    [{ previous: '{}' }, 'previous-authority-recovery-evidence'],
  ] as const)('reports non-empty evidence for %s', async (input, reason) => {
    const probe = new SiyuanTruthDeviceIdentityEvidenceProbe(createFilePort(input), () => 10);
    await expect(probe.probeEvidence()).resolves.toMatchObject({
      status: 'non-empty', reasons: [reason], error: null,
    });
  });

  it('reports evidence probe failures as unavailable', async () => {
    const probe = new SiyuanTruthDeviceIdentityEvidenceProbe(createFilePort({ error: new Error('readDir failed') }), () => 10);
    await expect(probe.probeEvidence()).resolves.toMatchObject({
      status: 'unavailable', error: 'readDir failed',
    });
  });

  it('reports missing evidence APIs as unavailable instead of assuming an empty install', async () => {
    const probe = new SiyuanTruthDeviceIdentityEvidenceProbe({} as never, () => 10);
    await expect(probe.probeEvidence()).resolves.toEqual({
      status: 'unavailable',
      reasons: [],
      checkedAt: 10,
      error: 'installation identity evidence APIs unavailable',
    });
  });
});
