import { describe, expect, it, vi } from 'vitest';
import { KernelTruthDeviceIdentityInitializationFence } from '../KernelTruthDeviceIdentityInitializationFence';

describe('KernelTruthDeviceIdentityInitializationFence', () => {
  it('waits for the current origin to release, then runs and releases the operation', async () => {
    let attempts = 0;
    const client = {
      identityAcquireInitializationFence: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false as const,
            error: { code: 'FENCE_UNAVAILABLE' as const, message: 'held' },
            fence: null,
            now: attempts,
          };
        }
        return {
          ok: true as const,
          fence: { instanceId: 'origin-b', token: 'token-b', acquiredAt: 2, expiresAt: 20 },
          now: attempts,
        };
      }),
      identityReleaseInitializationFence: vi.fn(async () => ({ ok: true as const, fence: null, now: 3 })),
    };
    let now = 0;
    const fence = new KernelTruthDeviceIdentityInitializationFence(client as never, {
      instanceId: 'origin-b',
      now: () => now,
      retryDelayMs: 10,
      delay: async (ms) => { now += ms; },
    });
    const operation = vi.fn(async () => 'done');
    await expect(fence.runExclusive(operation)).resolves.toBe('done');
    expect(client.identityAcquireInitializationFence).toHaveBeenCalledTimes(2);
    expect(client.identityReleaseInitializationFence).toHaveBeenCalledWith({
      instanceId: 'origin-b', token: 'token-b',
    });
  });

  it('never runs the operation when the kernel fence times out', async () => {
    const client = {
      identityAcquireInitializationFence: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'FENCE_UNAVAILABLE' as const, message: 'held' },
        fence: null,
        now: 1,
      })),
      identityReleaseInitializationFence: vi.fn(),
    };
    let now = 0;
    const fence = new KernelTruthDeviceIdentityInitializationFence(client as never, {
      instanceId: 'origin-b',
      acquireTimeoutMs: 250,
      retryDelayMs: 100,
      now: () => now,
      delay: async (ms) => { now += ms; },
    });
    const operation = vi.fn();
    await expect(fence.runExclusive(operation)).rejects.toThrow('initialization fence timeout');
    expect(operation).not.toHaveBeenCalled();
    expect(client.identityReleaseInitializationFence).not.toHaveBeenCalled();
  });

  it('retries transient Sidecar transport failures until the fence is acquired', async () => {
    let attempts = 0;
    const client = {
      identityAcquireInitializationFence: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('network temporarily unavailable');
        return {
          ok: true as const,
          fence: { instanceId: 'origin-b', token: 'token-b', acquiredAt: 2, expiresAt: 20 },
          now: attempts,
        };
      }),
      identityReleaseInitializationFence: vi.fn(async () => ({ ok: true as const, fence: null, now: 3 })),
    };
    let now = 0;
    const fence = new KernelTruthDeviceIdentityInitializationFence(client as never, {
      instanceId: 'origin-b',
      now: () => now,
      retryDelayMs: 10,
      delay: async (ms) => { now += ms; },
    });

    await expect(fence.runExclusive(async () => 'done')).resolves.toBe('done');
    expect(client.identityAcquireInitializationFence).toHaveBeenCalledTimes(2);
  });

  it('does not mask the operation error when releasing the fence also fails', async () => {
    const client = {
      identityAcquireInitializationFence: vi.fn(async () => ({
        ok: true as const,
        fence: { instanceId: 'origin-b', token: 'token-b', acquiredAt: 1, expiresAt: 20 },
        now: 1,
      })),
      identityReleaseInitializationFence: vi.fn(async () => {
        throw new Error('release network failed');
      }),
    };
    const fence = new KernelTruthDeviceIdentityInitializationFence(client as never, {
      instanceId: 'origin-b',
    });

    await expect(fence.runExclusive(async () => {
      throw new Error('authority publication failed');
    })).rejects.toThrow('authority publication failed');
  });
});
