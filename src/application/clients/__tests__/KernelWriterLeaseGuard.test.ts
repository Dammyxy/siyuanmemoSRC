import { describe, expect, it, vi } from 'vitest';
import { KernelWriterLeaseGuard } from '../KernelWriterLeaseGuard';
import type { KernelSidecarClient } from '../KernelSidecarClient';

describe('KernelWriterLeaseGuard', () => {
  it('performs hello and acquire before write', async () => {
    const writerHello = vi.fn(async () => ({
      ok: true,
      lease: null,
      now: 1,
    }));
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 2,
        lastHeartbeatAt: 1,
      },
      now: 1,
    }));
    const guard = new KernelWriterLeaseGuard({
      writerHello,
      writerAcquireLease,
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      ttlMs: 9_000,
    });

    await guard.ensureWritable();

    expect(writerHello).toHaveBeenCalledWith({ instanceId: 'instance-a' });
    expect(writerAcquireLease).toHaveBeenCalledWith({
      instanceId: 'instance-a',
      ttlMs: 9_000,
    });
  });

  it('uses the shared longer default ttl when no override is provided', async () => {
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
      },
      now: 1,
    }));
    const guard = new KernelWriterLeaseGuard({
      writerHello: vi.fn(async () => ({
        ok: true,
        lease: null,
        now: 1,
      })),
      writerAcquireLease,
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
    });

    await guard.ensureWritable();

    expect(writerAcquireLease).toHaveBeenCalledWith({
      instanceId: 'instance-a',
      ttlMs: 60_000,
    });
  });

  it('throws when lease owner is different from local instance', async () => {
    const guard = new KernelWriterLeaseGuard({
      writerHello: vi.fn(async () => ({
        ok: true,
        lease: null,
        now: 1,
      })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-b',
          acquiredAt: 1,
          expiresAt: 2,
          lastHeartbeatAt: 1,
        },
        now: 1,
      })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
    });

    await expect(guard.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer lease not owned by current instance',
    );
  });
});
