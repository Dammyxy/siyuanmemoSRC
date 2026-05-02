import { describe, expect, it, vi } from 'vitest';
import { FrontendInstanceRuntime } from '../FrontendInstanceRuntime';
import type { KernelSidecarClient } from '../KernelSidecarClient';

describe('FrontendInstanceRuntime', () => {
  it('waits for kernel companion running state before writer hello', async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce({
        kind: 'unavailable',
        reason: 'not-running',
        pluginName: 'siyuan-plugin-siyuanmemo',
        pluginState: 'loaded',
        checkedAt: 1,
      })
      .mockResolvedValueOnce({
        kind: 'available',
        pluginName: 'siyuan-plugin-siyuanmemo',
        pluginState: 'running',
        checkedAt: 2,
      });
    const writerHello = vi.fn(async () => ({ ok: true, lease: null, now: 3 }));
    const runtime = new FrontendInstanceRuntime({
      getStatus,
      writerHello,
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 3,
          expiresAt: 4,
          lastHeartbeatAt: 3,
        },
        now: 3,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      startupRetryDelayMs: 1,
      startupMaxWaitMs: 50,
    });

    await runtime.start();

    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(writerHello).toHaveBeenCalledTimes(1);
    expect(runtime.getMode()).toBe('writer');
    await runtime.dispose();
  });

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

  it('reports follower when lease owner changes after start', async () => {
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          lease: {
            instanceId: 'instance-a',
            acquiredAt: 1,
            expiresAt: 2,
            lastHeartbeatAt: 1,
          },
          now: 1,
        })
        .mockResolvedValueOnce({
          ok: true,
          lease: {
            instanceId: 'instance-b',
            acquiredAt: 1,
            expiresAt: 2,
            lastHeartbeatAt: 1,
          },
          now: 2,
        }),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-b',
          acquiredAt: 1,
          expiresAt: 2,
          lastHeartbeatAt: 1,
        },
        now: 2,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      leaseTtlMs: 9_000,
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');
    await expect(runtime.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer lease held by another instance',
    );
    expect(runtime.getMode()).toBe('follower');
    await runtime.dispose();
  });

  it('fails relay command via writerFailCommand when handler throws', async () => {
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-fail-1',
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
    const writerFailCommand = vi.fn(async () => ({ ok: true, now: 4 }));
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
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 4 })),
      writerFailCommand,
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      relayPollIntervalMs: 250,
      writerCommandHandler: async () => {
        throw new Error('boom-handler');
      },
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(writerFailCommand).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      commandId: 'cmd-fail-1',
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
      }),
    }));
    await runtime.dispose();
  });

  it('drops to follower when relay polling detects writer lease unavailable', async () => {
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          lease: {
            instanceId: 'instance-a',
            acquiredAt: 1,
            expiresAt: 2,
            lastHeartbeatAt: 1,
          },
          now: 1,
        })
        .mockRejectedValue(new Error('BACKEND_UNAVAILABLE: writer lease held by another instance')),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-b',
          acquiredAt: 1,
          expiresAt: 2,
          lastHeartbeatAt: 1,
        },
        now: 2,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
      writerTakeCommand: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer takeCommand unavailable: current instance is not active writer');
      }),
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 4 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      relayPollIntervalMs: 250,
      writerCommandHandler: async () => ({ committed: true }),
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(runtime.getMode()).toBe('follower');
    await runtime.dispose();
  });
});
