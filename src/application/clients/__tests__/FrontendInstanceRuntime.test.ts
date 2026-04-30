import { describe, expect, it, vi } from 'vitest';
import { FrontendInstanceRuntime } from '../FrontendInstanceRuntime';
import type { KernelSidecarClient } from '../KernelSidecarClient';

describe('FrontendInstanceRuntime', () => {
  it('acquires writer lease on start and reports writer mode', async () => {
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 1,
          expiresAt: 2,
          lastHeartbeatAt: 1,
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      leaseTtlMs: 9_000,
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');
    await runtime.ensureWritable();
    await runtime.dispose();
  });

  it('throws explicit unavailable when follower cannot own lease', async () => {
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: held by writer-x');
      }),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-x',
          acquiredAt: 1,
          expiresAt: 2,
          lastHeartbeatAt: 1,
        },
        now: 1,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
    });

    await runtime.start();
    await expect(runtime.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer lease held by another instance',
    );
    await runtime.dispose();
  });

  it('drains relay command when current instance is writer', async () => {
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-1',
          requesterInstanceId: 'follower-1',
          method: 'review.feedback',
          params: { cardId: 'card-1' },
          requestedAt: 1,
        },
        now: 2,
      })
      .mockResolvedValue({
        command: null,
        now: 3,
      });
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 4 }));
    const writerCommandHandler = vi.fn(async () => ({ committed: true }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 1,
          expiresAt: 2,
          lastHeartbeatAt: 1,
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
      writerTakeCommand,
      writerCompleteCommand,
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      relayPollIntervalMs: 250,
      writerCommandHandler,
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(writerCommandHandler).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'cmd-1',
      method: 'review.feedback',
    }));
    expect(writerCompleteCommand).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      commandId: 'cmd-1',
    }));
    await runtime.dispose();
  });
});
