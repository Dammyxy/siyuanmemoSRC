import { describe, expect, it, vi } from 'vitest';
import { FrontendInstanceRuntime } from '../FrontendInstanceRuntime';
import type { KernelSidecarClient } from '../KernelSidecarClient';

describe('FrontendInstanceRuntime', () => {
  it('emits startup ownership diagnostics with lease holder details', async () => {
    const info = vi.fn();
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 1,
          expiresAt: 13_000,
          lastHeartbeatAt: 1,
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      leaseTtlMs: 9_000,
      logger: {
        info,
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runtime.start();

    expect(info).toHaveBeenCalledWith('[FrontendInstanceRuntime] started', expect.objectContaining({
      instanceId: 'instance-a',
      mode: 'writer',
      leaseHolder: 'instance-a',
    }));
    await runtime.dispose();
  });

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

  it('passes runtime scope id through writer lease calls and startup diagnostics', async () => {
    const info = vi.fn();
    const writerHello = vi.fn(async () => ({ ok: true, lease: null, now: 1 }));
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 13_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-a',
      },
      now: 1,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello,
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
      logger: {
        info,
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runtime.start();

    expect(writerHello).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      surfaceId: 'scope-a',
    }));
    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      surfaceId: 'scope-a',
    }));
    expect(info).toHaveBeenCalledWith('[FrontendInstanceRuntime] started', expect.objectContaining({
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
      leaseHolder: 'instance-a',
      leaseSurfaceId: 'scope-a',
    }));
    await runtime.dispose();
  });

  it('disposes previous runtime in same runtime scope before starting a replacement', async () => {
    const firstRelease = vi.fn(async () => ({ ok: true, lease: null, now: 2 }));
    const firstRuntime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-old',
          acquiredAt: 1,
          expiresAt: 13_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-replace',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: firstRelease,
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-old',
      runtimeScopeId: 'scope-replace',
    });

    await firstRuntime.start();

    const secondAcquire = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-new',
        acquiredAt: 3,
        expiresAt: 15_000,
        lastHeartbeatAt: 3,
        surfaceId: 'scope-replace',
      },
      now: 3,
    }));
    const secondRuntime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
      writerAcquireLease: secondAcquire,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-new',
      runtimeScopeId: 'scope-replace',
    });

    await secondRuntime.start();

    expect(firstRelease).toHaveBeenCalledWith({ instanceId: 'instance-old' });
    expect(firstRuntime.getMode()).toBe('follower');
    expect(secondRuntime.getMode()).toBe('writer');
    await secondRuntime.dispose();
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

  it('does not warn when follower heartbeat sees another active writer lease', async () => {
    const warn = vi.fn();
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance: writer-x');
      }),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-x',
          acquiredAt: 1,
          expiresAt: 13_000,
          lastHeartbeatAt: 1,
        },
        now: 2,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'follower-1',
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('heartbeat');

    expect(runtime.getMode()).toBe('follower');
    expect(warn).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] writer lease acquire failed',
      expect.objectContaining({ reason: 'heartbeat' }),
    );
  });

  it('drains relay command when current instance is writer', async () => {
    const info = vi.fn();
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
      logger: {
        info,
        warn: vi.fn(),
        error: vi.fn(),
      },
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
    expect(info).toHaveBeenCalledWith('[FrontendInstanceRuntime] relay command taken', expect.objectContaining({
      commandId: 'cmd-1',
      method: 'review.feedback',
      requesterInstanceId: 'follower-1',
      writerInstanceId: 'instance-a',
    }));
    expect(info).toHaveBeenCalledWith('[FrontendInstanceRuntime] relay command completed', expect.objectContaining({
      commandId: 'cmd-1',
      method: 'review.feedback',
      requesterInstanceId: 'follower-1',
      writerInstanceId: 'instance-a',
    }));
    await runtime.dispose();
  });

  it('keeps empty kernel transaction dequeue relay polling out of info diagnostics', async () => {
    const info = vi.fn();
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-empty-dequeue',
          requesterInstanceId: 'follower-1',
          method: 'kernel.transaction.dequeue',
          params: { maxActions: 4 },
          requestedAt: 1,
        },
        now: 2,
      })
      .mockResolvedValue({
        command: null,
        now: 3,
      });
    const writerCommandHandler = vi.fn(async () => ({ actions: [], remaining: 0 }));
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
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      relayPollIntervalMs: 250,
      writerCommandHandler,
      logger: {
        info,
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 320));

    expect(writerCommandHandler).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'cmd-empty-dequeue',
      method: 'kernel.transaction.dequeue',
    }));
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] relay command taken',
      expect.objectContaining({ commandId: 'cmd-empty-dequeue' }),
    );
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] relay command completed',
      expect.objectContaining({ commandId: 'cmd-empty-dequeue' }),
    );
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
