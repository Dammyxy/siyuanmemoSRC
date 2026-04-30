import { describe, expect, it, vi } from 'vitest';
import { KernelSidecarClient } from '../KernelSidecarClient';

describe('KernelSidecarClient', () => {
  it('calls writer.acquireLease and returns success envelope', async () => {
    const call = vi.fn(async (_method: string) => ({
      ok: true,
      lease: {
        instanceId: 'instance-1',
        acquiredAt: 1,
        expiresAt: 2,
        lastHeartbeatAt: 1,
      },
      now: 1,
    }));
    const client = new KernelSidecarClient({
      getStatus: vi.fn(),
      call,
    });

    await expect(client.writerAcquireLease({ instanceId: 'instance-1', ttlMs: 12_000 })).resolves.toMatchObject({
      ok: true,
      lease: expect.objectContaining({ instanceId: 'instance-1' }),
    });
    expect(call).toHaveBeenCalledWith('writer.acquireLease', {
      instanceId: 'instance-1',
      ttlMs: 12_000,
    });
  });

  it('throws explicit unavailable envelope from writer lease methods', async () => {
    const client = new KernelSidecarClient({
      getStatus: vi.fn(),
      call: vi.fn(async () => ({
        ok: false,
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'writer lease held by another instance',
        },
        lease: null,
        now: 1,
      })),
    });

    await expect(client.writerAcquireLease({ instanceId: 'instance-2' })).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer lease held by another instance',
    );
  });
});

