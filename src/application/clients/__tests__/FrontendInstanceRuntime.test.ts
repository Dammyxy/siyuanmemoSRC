import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontendInstanceRuntime } from '../FrontendInstanceRuntime';
import type { KernelSidecarClient } from '../KernelSidecarClient';
import {
  getRuntimePerformanceDiagnosticsReport,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

describe('FrontendInstanceRuntime', () => {
  afterEach(() => {
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('passes frontend visibility diagnostics through writer lease calls', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('window', {
      location: { href: 'app://siyuan/main-window' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerHello = vi.fn(async () => ({ ok: true, lease: null, now: 1 }));
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-a',
        visibilityState: 'visible',
        documentHasFocus: true,
        locationHref: 'app://siyuan/main-window',
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
    });

    await runtime.start();

    expect(writerHello).toHaveBeenCalledWith(expect.objectContaining({
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'app://siyuan/main-window',
    }));
    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      visibilityState: 'visible',
      documentHasFocus: true,
      locationHref: 'app://siyuan/main-window',
    }));
    await runtime.dispose();
  });

  it('releases writer lease and refuses writable mode when backend worker health is unhealthy', async () => {
    let backendHealthy = true;
    const writerReleaseLease = vi.fn(async () => ({ ok: true, lease: null, now: 2 }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-a',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-a',
        },
        now: 1,
      })),
      writerReleaseLease,
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
      backendWorkerHealth: () => ({
        healthy: backendHealthy,
        reason: 'worker-timeout',
      }),
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');

    backendHealthy = false;

    await expect(runtime.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: backend worker unhealthy: worker-timeout',
    );
    expect(writerReleaseLease).toHaveBeenCalledWith({ instanceId: 'instance-a' });
    expect(runtime.getMode()).toBe('follower');
    await runtime.dispose();
  });

  it('passes bounded writer profile diagnostics through writer lease calls', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      body: { className: 'fn__flex-column body--toolbar-hide body--win32' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuan/3.6.5 Chrome/146 Electron/41 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:61082/stage/build/app/?v=1778023002402' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerHello = vi.fn(async () => ({ ok: true, lease: null, now: 1 }));
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
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
      backendContainer: 'std',
      frontendKind: 'desktop',
      isBrowser: false,
      isMobile: false,
    });

    await runtime.start();

    expect(writerHello).toHaveBeenCalledWith(expect.objectContaining({
      writerProfile: expect.objectContaining({
        backendContainer: 'std',
        frontendKind: 'desktop',
        surfaceRole: 'primary-app',
        writerEligibility: 'canonical',
        sanitizedLocationHref: 'http://127.0.0.1:61082/stage/build/app/?v=<redacted>',
      }),
    }));
    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      writerProfile: expect.objectContaining({
        backendContainer: 'std',
        frontendKind: 'desktop',
        surfaceRole: 'primary-app',
        writerEligibility: 'canonical',
      }),
    }));
    await runtime.dispose();
  });

  it('uses a longer default writer lease ttl for background-throttled windows', async () => {
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-a',
      },
      now: 1,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
    });

    await runtime.start();

    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      ttlMs: 60_000,
    }));
    await runtime.dispose();
  });

  it('drains writer commands immediately when push relay command notification arrives', async () => {
    let onEvent: ((event: {
      method: string;
      params: unknown;
    }) => void) | null = null;
    const subscribeBroadcast = vi.fn((handlers: {
      onEvent: typeof onEvent;
    }) => {
      onEvent = handlers.onEvent;
      return {
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'open' }),
      };
    });
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-push-1',
          requesterInstanceId: 'follower-1',
          method: 'review.feedback',
          requestedAt: 1,
        },
        now: 1,
      })
      .mockResolvedValueOnce({ command: null, now: 2 });
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 2 }));
    const writerCommandHandler = vi.fn(async () => ({ ok: true }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerTakeCommand,
      writerCompleteCommand,
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
      writerCommandHandler,
    });

    await runtime.start();

    expect(subscribeBroadcast).toHaveBeenCalledTimes(1);
    expect(writerTakeCommand).not.toHaveBeenCalled();
    onEvent?.({
      method: 'memo.writer.command',
      params: {
        commandId: 'cmd-push-1',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        requestedAt: 1,
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writerTakeCommand).toHaveBeenCalledTimes(2);
    expect(writerCommandHandler).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'cmd-push-1',
    }));
    expect(writerCompleteCommand).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'writer-1',
      commandId: 'cmd-push-1',
      result: { ok: true },
    }));
    await runtime.dispose();
  });

  it('does not drain follower command through an unhealthy writer worker', async () => {
    let backendHealthy = true;
    let onEvent: ((event: {
      method: string;
      params: unknown;
    }) => void) | null = null;
    const subscribeBroadcast = vi.fn((handlers: {
      onEvent: typeof onEvent;
    }) => {
      onEvent = handlers.onEvent;
      return {
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'open' }),
      };
    });
    const writerTakeCommand = vi.fn(async () => ({
      command: {
        commandId: 'cmd-push-unhealthy',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        requestedAt: 1,
      },
      now: 1,
    }));
    const writerReleaseLease = vi.fn(async () => ({ ok: true, lease: null, now: 2 }));
    const writerCommandHandler = vi.fn(async () => ({ ok: true }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerTakeCommand,
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease,
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
      writerCommandHandler,
      backendWorkerHealth: () => ({
        healthy: backendHealthy,
        reason: 'worker-timeout',
      }),
    });

    await runtime.start();
    backendHealthy = false;

    onEvent?.({
      method: 'memo.writer.command',
      params: {
        commandId: 'cmd-push-unhealthy',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        requestedAt: 1,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(writerTakeCommand).not.toHaveBeenCalled();
    expect(writerCommandHandler).not.toHaveBeenCalled();
    expect(writerReleaseLease).toHaveBeenCalledWith({ instanceId: 'writer-1' });
    expect(runtime.getMode()).toBe('follower');
    await runtime.dispose();
  });

  it('publishes queue projection identity broadcasts with runtime identity metadata', async () => {
    const queueProjectionPublishIdentityChanged = vi.fn(async (request: unknown) => ({
      ok: true,
      broadcast: request,
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      queueProjectionPublishIdentityChanged,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
    });

    await runtime.start();
    await runtime.publishQueueProjectionIdentityBroadcast({
      type: 'queue-projection-live-identity',
      queueId: 'filter-group' as any,
      queueType: 'filter-group' as any,
      policyId: 'policy-a',
      generation: 3,
      reason: 'refreshed',
      source: 'runtime',
      timestamp: 10,
      diagnosticEventId: 'event-a',
    });

    expect(queueProjectionPublishIdentityChanged).toHaveBeenCalledWith(expect.objectContaining({
      queueId: 'filter-group',
      policyId: 'policy-a',
      generation: 3,
      sourceInstanceId: 'writer-1',
      sourceSurfaceId: 'scope-writer',
      sourceMode: 'writer',
      diagnosticEventId: 'event-a',
    }));
    await runtime.dispose();
  });

  it('accepts remote queue projection identity broadcasts and dedupes local echoes', async () => {
    let onEvent: ((event: any) => void) | null = null;
    const subscribeBroadcast = vi.fn((handlers: { onEvent: typeof onEvent }) => {
      onEvent = handlers.onEvent;
      return {
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'open' }),
      };
    });
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: false,
        error: { code: 'BACKEND_UNAVAILABLE', message: 'writer held' },
        lease: { instanceId: 'writer-1' },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: { instanceId: 'writer-1' }, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'follower-1',
      runtimeScopeId: 'scope-follower',
    });
    const accepted: unknown[] = [];

    await runtime.start();
    runtime.subscribeQueueProjectionIdentityBroadcasts((event) => accepted.push(event));
    const remoteEvent = {
      method: 'memo.queueProjection.identityChanged',
      params: {
        queueId: 'filter-group',
        queueType: 'filter-group',
        policyId: 'policy-a',
        generation: 4,
        reason: 'refreshed',
        source: 'runtime',
        sourceInstanceId: 'writer-1',
        timestamp: 10,
        diagnosticEventId: 'event-a',
      },
    };
    onEvent?.(remoteEvent);
    onEvent?.(remoteEvent);
    onEvent?.({
      ...remoteEvent,
      params: {
        ...remoteEvent.params,
        sourceInstanceId: 'follower-1',
        diagnosticEventId: 'local-echo',
      },
    });

    expect(accepted).toEqual([
      expect.objectContaining({
        queueId: 'filter-group',
        policyId: 'policy-a',
        generation: 4,
      }),
    ]);
    await runtime.dispose();
  });

  it('deduplicates duplicate push command notifications while a command is in flight', async () => {
    let onEvent: ((event: {
      method: string;
      params: unknown;
    }) => void) | null = null;
    const subscribeBroadcast = vi.fn((handlers: {
      onEvent: typeof onEvent;
    }) => {
      onEvent = handlers.onEvent;
      return {
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'open' }),
      };
    });
    const command = {
      commandId: 'cmd-duplicate-1',
      requesterInstanceId: 'follower-1',
      method: 'review.feedback',
      requestedAt: 1,
    };
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({ command, now: 1 })
      .mockResolvedValueOnce({ command, now: 1 })
      .mockResolvedValue({ command: null, now: 2 });
    let resolveHandler: ((value: unknown) => void) | null = null;
    const writerCommandHandler = vi.fn(() => new Promise((resolve) => {
      resolveHandler = resolve;
    }));
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 2 }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerTakeCommand,
      writerCompleteCommand,
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
      writerCommandHandler,
    });

    await runtime.start();
    onEvent?.({ method: 'memo.writer.command', params: command });
    onEvent?.({ method: 'memo.writer.command', params: command });
    await Promise.resolve();
    await Promise.resolve();

    expect(writerCommandHandler).toHaveBeenCalledTimes(1);
    resolveHandler?.({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(writerCommandHandler).toHaveBeenCalledTimes(1);
    expect(writerCompleteCommand).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  it('drains pending commands when push relay reconnects', async () => {
    let onStateChange: ((state: { state: string }) => void) | null = null;
    const subscribeBroadcast = vi.fn((handlers: {
      onEvent: (event: { method: string; params: unknown }) => void;
      onStateChange?: typeof onStateChange;
    }) => {
      onStateChange = handlers.onStateChange || null;
      return {
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'connecting' }),
      };
    });
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-reconnect-1',
          requesterInstanceId: 'follower-1',
          method: 'review.feedback',
          requestedAt: 1,
        },
        now: 1,
      })
      .mockResolvedValueOnce({ command: null, now: 2 });
    const writerCommandHandler = vi.fn(async () => ({ ok: true }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerTakeCommand,
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
      writerCommandHandler,
    });

    await runtime.start();
    expect(writerTakeCommand).not.toHaveBeenCalled();
    onStateChange?.({ state: 'open' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(writerCommandHandler).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'cmd-reconnect-1',
    }));
    await runtime.dispose();
  });

  it('backs off empty watchdog drains when push relay is open and keeps push drains immediate', async () => {
    vi.useFakeTimers();
    const writerTakeCommand = vi.fn(async () => ({
      command: null,
      pendingCommandCount: 0,
      now: Date.now(),
    }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast: vi.fn(() => ({
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'open' }),
      })),
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerTakeCommand,
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
      relayPollIntervalMs: 250,
      relayNoCommandBackoffMaxMs: 1_000,
      writerCommandHandler: vi.fn(async () => ({ ok: true })),
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason?: string, commandId?: string) => Promise<void>;
    }).drainPendingWriterCommands('watchdog');
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason?: string, commandId?: string) => Promise<void>;
    }).drainPendingWriterCommands('watchdog');
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason?: string, commandId?: string) => Promise<void>;
    }).drainPendingWriterCommands('push:command', 'cmd-push');

    expect(writerTakeCommand).toHaveBeenCalledTimes(2);
    await runtime.dispose();
  });

  it('keeps watchdog polling when push relay is unavailable', async () => {
    vi.useFakeTimers();
    const writerTakeCommand = vi.fn(async () => ({
      command: null,
      pendingCommandCount: 0,
      now: Date.now(),
    }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast: vi.fn(() => null),
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-1',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-writer',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerTakeCommand,
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'writer-1',
      runtimeScopeId: 'scope-writer',
      relayPollIntervalMs: 250,
      relayNoCommandBackoffMaxMs: 1_000,
      writerCommandHandler: vi.fn(async () => ({ ok: true })),
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason?: string) => Promise<void>;
    }).drainPendingWriterCommands('watchdog');
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason?: string) => Promise<void>;
    }).drainPendingWriterCommands('watchdog');

    expect(writerTakeCommand).toHaveBeenCalledTimes(2);
    await runtime.dispose();
  });

  it('ignores push relay command notifications while follower', async () => {
    let onEvent: ((event: {
      method: string;
      params: unknown;
    }) => void) | null = null;
    const subscribeBroadcast = vi.fn((handlers: {
      onEvent: typeof onEvent;
    }) => {
      onEvent = handlers.onEvent;
      return {
        close: vi.fn(),
        getDiagnostics: () => ({ state: 'open' }),
      };
    });
    const writerTakeCommand = vi.fn(async () => ({
      command: {
        commandId: 'cmd-must-not-run',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        requestedAt: 1,
      },
      now: 1,
    }));
    const runtime = new FrontendInstanceRuntime({
      subscribeBroadcast,
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'other-writer',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-other',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'other-writer',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-other',
        },
        now: 1,
      })),
      writerTakeCommand,
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'follower-1',
      runtimeScopeId: 'scope-follower',
      writerCommandHandler: vi.fn(),
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('follower');

    onEvent?.({
      method: 'memo.writer.command',
      params: {
        commandId: 'cmd-must-not-run',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        requestedAt: 1,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(writerTakeCommand).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('keeps hidden follower observe-only instead of acquiring writer lease', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => {
      throw new Error('hidden follower must not acquire');
    });
    const writerGetLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'visible-writer',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-visible',
      },
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease,
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'hidden-follower',
      runtimeScopeId: 'scope-hidden',
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('heartbeat');

    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(writerGetLease).toHaveBeenCalledTimes(1);
    expect(runtime.getMode()).toBe('follower');
  });

  it('throws explicit unavailable when writer lease observation fails', async () => {
    const warn = vi.fn();
    const writerGetLease = vi.fn(async () => {
      throw new Error('sidecar down');
    });
    const writerAcquireLease = vi.fn(async () => {
      throw new Error('must not acquire after observation failure');
    });
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease,
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'follower-observe-fail',
      runtimeScopeId: 'scope-observe-fail',
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await expect((runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('manual'))
      .rejects.toThrow('BACKEND_UNAVAILABLE: writer lease observation failed: sidecar down');

    expect(writerGetLease).toHaveBeenCalledTimes(1);
    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
    expect(warn).toHaveBeenCalledWith('[FrontendInstanceRuntime] writer lease observe failed', expect.objectContaining({
      instanceId: 'follower-observe-fail',
      runtimeScopeId: 'scope-observe-fail',
      reason: 'manual:observe',
    }));
  });

  it('keeps startup follower observe-only when another active writer exists', async () => {
    const writerAcquireLease = vi.fn(async () => {
      throw new Error('startup follower must not acquire while another writer is active');
    });
    const writerGetLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'writer-instance',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'writer-scope',
      },
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease,
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'follower-instance',
      runtimeScopeId: 'follower-scope',
    });

    await runtime.start();

    expect(writerGetLease).toHaveBeenCalledTimes(1);
    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
    await runtime.dispose();
  });

  it('observes an empty lease before visible startup acquires writer ownership', async () => {
    const writerGetLease = vi.fn(async () => ({ ok: true, lease: null, now: 1 }));
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-a',
      },
      now: 1,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease,
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
    });

    await runtime.start();

    expect(writerGetLease).toHaveBeenCalledTimes(1);
    expect(writerAcquireLease).toHaveBeenCalledTimes(1);
    expect(writerGetLease.mock.invocationCallOrder[0]).toBeLessThan(
      writerAcquireLease.mock.invocationCallOrder[0],
    );
    expect(runtime.getMode()).toBe('writer');
    await runtime.dispose();
  });

  it('keeps manual visible follower observe-only when another active writer exists', async () => {
    const writerAcquireLease = vi.fn(async () => {
      throw new Error('manual follower must not acquire while another writer is active');
    });
    const writerGetLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'writer-instance',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'writer-scope',
      },
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease,
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'follower-instance',
      runtimeScopeId: 'follower-scope',
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('manual');

    expect(writerGetLease).toHaveBeenCalledTimes(1);
    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
  });

  it('refreshes ownership when a hidden follower becomes visible', async () => {
    let visibilityState = 'hidden';
    const documentListeners = new Map<string, EventListener>();
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        documentListeners.set(event, listener);
      }),
      removeEventListener: vi.fn((event: string) => {
        documentListeners.delete(event);
      }),
    });
    vi.stubGlobal('window', {
      location: { href: 'app://siyuan/window-a' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-a',
      },
      now: 1,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
    });

    await runtime.start();
    expect(writerAcquireLease).not.toHaveBeenCalled();

    visibilityState = 'visible';
    documentListeners.get('visibilitychange')?.(new Event('visibilitychange'));
    await vi.waitFor(() => expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      surfaceId: 'scope-a',
    })));
    expect(runtime.getMode()).toBe('writer');
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

  it('disposes previous runtime in the same JS context even when runtime scope differs', async () => {
    const firstRelease = vi.fn(async () => ({ ok: true, lease: null, now: 2 }));
    const firstRuntime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-old',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'scope-old',
        },
        now: 1,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: firstRelease,
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-old',
      runtimeScopeId: 'scope-old',
    });

    await firstRuntime.start();

    const secondRuntime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
      writerAcquireLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-new',
          acquiredAt: 3,
          expiresAt: 64_000,
          lastHeartbeatAt: 3,
          surfaceId: 'scope-new',
        },
        now: 3,
      })),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-new',
      runtimeScopeId: 'scope-new',
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

  it('allows mobile app surface to acquire writer lease for review feedback writes', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      body: { className: 'body--mobile' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuanMobile Android Mobile Safari/537.36',
      platform: 'Linux armv8l',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:6806/stage/build/mobile/?v=1' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'mobile-instance',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'mobile-scope',
      },
      now: 1,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'mobile-instance',
      runtimeScopeId: 'mobile-scope',
      backendContainer: 'android',
      frontendKind: 'mobile',
      isBrowser: false,
      isMobile: true,
    });

    await runtime.start();

    expect(runtime.getMode()).toBe('writer');
    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      writerProfile: expect.objectContaining({
        frontendKind: 'mobile',
        surfaceRole: 'active-frontend',
        writerEligibility: 'canonical',
      }),
    }));
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

  it('renews writer heartbeat instead of acquiring the lease again', async () => {
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 61_000,
        lastHeartbeatAt: 1,
        surfaceId: 'scope-a',
      },
      now: 1,
    }));
    const writerRenewLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 1,
        expiresAt: 81_000,
        lastHeartbeatAt: 21_000,
        surfaceId: 'scope-a',
      },
      now: 21_000,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerRenewLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
    });

    await runtime.start();
    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('heartbeat');

    expect(writerAcquireLease).toHaveBeenCalledTimes(1);
    expect(writerRenewLease).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      surfaceId: 'scope-a',
      ttlMs: 60_000,
    }));
    expect(runtime.getMode()).toBe('writer');
    await runtime.dispose();
  });

  it('keeps canonical primary writer mode while recovering an empty lease after heartbeat renew failure', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      body: { className: 'fn__flex-column body--win32' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuan/3.6.5 Chrome/146 Electron/41 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const info = vi.fn();
    const warn = vi.fn();
    const writerAcquireLease = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'primary-scope',
        },
        now: 1,
      })
      .mockResolvedValueOnce({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 21_000,
          expiresAt: 81_000,
          lastHeartbeatAt: 21_000,
          surfaceId: 'primary-scope',
        },
        now: 21_000,
      });
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerRenewLease: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer lease not found');
      }),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 21_000 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 22_000 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'primary-instance',
      runtimeScopeId: 'primary-scope',
      backendContainer: 'std',
      frontendKind: 'desktop',
      isBrowser: false,
      isMobile: false,
      logger: { info, warn, error: vi.fn() },
    });

    await runtime.start();
    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('heartbeat');

    expect(writerAcquireLease).toHaveBeenCalledTimes(2);
    expect(runtime.getMode()).toBe('writer');
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] mode changed',
      expect.objectContaining({ mode: 'follower' }),
    );
    expect(info).toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] writer lease gap recovered',
      expect.objectContaining({
        instanceId: 'primary-instance',
        runtimeScopeId: 'primary-scope',
        reason: 'heartbeat',
      }),
    );
    await runtime.dispose();
  });

  it('keeps hidden canonical primary writer mode while recovering an empty lease after heartbeat renew failure', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => false),
      body: { className: 'fn__flex-column body--win32' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuan/3.6.5 Chrome/146 Electron/41 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const info = vi.fn();
    const writerAcquireLease = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'primary-scope',
        },
        now: 1,
      })
      .mockResolvedValueOnce({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 21_000,
          expiresAt: 81_000,
          lastHeartbeatAt: 21_000,
          surfaceId: 'primary-scope',
          visibilityState: 'hidden',
          documentHasFocus: false,
        },
        now: 21_000,
      });
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerRenewLease: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer lease unavailable for renew; acquire lease first');
      }),
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 21_000 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 22_000 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'primary-instance',
      runtimeScopeId: 'primary-scope',
      backendContainer: 'std',
      frontendKind: 'desktop',
      isBrowser: false,
      isMobile: false,
      logger: { info, warn: vi.fn(), error: vi.fn() },
    });

    await runtime.start();
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('heartbeat');

    expect(writerAcquireLease).toHaveBeenCalledTimes(2);
    expect(writerAcquireLease).toHaveBeenLastCalledWith(expect.objectContaining({
      visibilityState: 'hidden',
      documentHasFocus: false,
      writerProfile: expect.objectContaining({
        surfaceRole: 'primary-app',
        writerEligibility: 'canonical',
      }),
    }));
    expect(runtime.getMode()).toBe('writer');
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] mode changed',
      expect.objectContaining({ mode: 'follower' }),
    );
    await runtime.dispose();
  });

  it('recovers canonical primary writer relay polling from an empty lease gap without dropping follower', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      body: { className: 'fn__flex-column body--win32' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuan/3.6.5 Chrome/146 Electron/41 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const info = vi.fn();
    const warn = vi.fn();
    const writerAcquireLease = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'primary-scope',
        },
        now: 1,
      })
      .mockResolvedValueOnce({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 2,
          expiresAt: 62_000,
          lastHeartbeatAt: 2,
          surfaceId: 'primary-scope',
        },
        now: 2,
      });
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
      writerTakeCommand: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease');
      }),
      writerCompleteCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 2 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'primary-instance',
      runtimeScopeId: 'primary-scope',
      backendContainer: 'std',
      frontendKind: 'desktop',
      isBrowser: false,
      isMobile: false,
      writerCommandHandler: vi.fn(),
      logger: { info, warn, error: vi.fn() },
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason: string) => Promise<void>;
    }).drainPendingWriterCommands('watchdog');

    expect(writerAcquireLease).toHaveBeenCalledTimes(2);
    expect(runtime.getMode()).toBe('writer');
    expect(warn).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] relay polling lost writer lease',
      expect.anything(),
    );
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] mode changed',
      expect.objectContaining({ mode: 'follower' }),
    );
    await runtime.dispose();
  });

  it('does not warn when writer heartbeat observes another active writer takeover', async () => {
    const warn = vi.fn();
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          lease: {
            instanceId: 'instance-a',
            acquiredAt: 1,
            expiresAt: 13_000,
            lastHeartbeatAt: 1,
          },
          now: 1,
        })
        .mockRejectedValue(new Error('BACKEND_UNAVAILABLE: writer lease held by another instance: writer-b')),
      writerRenewLease: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance: writer-b');
      }),
      writerGetLease: vi.fn()
        .mockResolvedValueOnce({ ok: true, lease: null, now: 1 })
        .mockResolvedValue({
          ok: true,
          lease: {
            instanceId: 'writer-b',
            acquiredAt: 2,
            expiresAt: 14_000,
            lastHeartbeatAt: 2,
          },
          now: 2,
        }),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('heartbeat');

    expect(runtime.getMode()).toBe('follower');
    expect(warn).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] writer lease acquire failed',
      expect.objectContaining({ reason: 'heartbeat' }),
    );
    await runtime.dispose();
  });

  it('does not warn when visibility refresh observes local writer after acquire race', async () => {
    const warn = vi.fn();
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          lease: {
            instanceId: 'instance-a',
            acquiredAt: 1,
            expiresAt: 13_000,
            lastHeartbeatAt: 1,
            surfaceId: 'scope-a',
          },
          now: 1,
        })
        .mockRejectedValue(new Error('BACKEND_UNAVAILABLE: writer lease held by another instance: writer-b')),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'instance-a',
          acquiredAt: 2,
          expiresAt: 14_000,
          lastHeartbeatAt: 2,
          surfaceId: 'scope-a',
        },
        now: 2,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('visibility');

    expect(runtime.getMode()).toBe('writer');
    expect(warn).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] writer lease acquire failed',
      expect.objectContaining({ reason: 'visibility' }),
    );
    await runtime.dispose();
  });

  it('does not warn when visibility refresh observes another active writer', async () => {
    const warn = vi.fn();
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance: writer-b');
      }),
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'writer-b',
          acquiredAt: 2,
          expiresAt: 14_000,
          lastHeartbeatAt: 2,
          surfaceId: 'scope-b',
        },
        now: 2,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('visibility');

    expect(runtime.getMode()).toBe('follower');
    expect(warn).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] writer lease acquire failed',
      expect.objectContaining({ reason: 'visibility' }),
    );
  });

  it('visible follower tries acquire after observing stale unfocused normal app writer', async () => {
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5#current' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'instance-a',
        acquiredAt: 61_000,
        expiresAt: 121_000,
        lastHeartbeatAt: 61_000,
        surfaceId: 'scope-a',
        visibilityState: 'visible',
        documentHasFocus: true,
        locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html',
        ownerChangedAt: 61_000,
      },
      now: 61_000,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'ghost-writer',
          acquiredAt: 1,
          expiresAt: 120_000,
          lastHeartbeatAt: 60_000,
          surfaceId: 'ghost-scope',
          visibilityState: 'visible',
          documentHasFocus: false,
          locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html',
          ownerChangedAt: 1,
        },
        now: 60_000,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 62_000 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      runtimeScopeId: 'scope-a',
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('manual');

    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-a',
      surfaceId: 'scope-a',
      ttlMs: 60_000,
    }));
    expect(runtime.getMode()).toBe('writer');
  });

  it('primary app follower tries acquire after observing document-window writer', async () => {
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'primary-instance',
        acquiredAt: 2,
        expiresAt: 62_000,
        lastHeartbeatAt: 2,
        surfaceId: 'primary-scope',
        visibilityState: 'visible',
        documentHasFocus: true,
        locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
        ownerChangedAt: 2,
      },
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'document-window-instance',
          acquiredAt: 1,
          expiresAt: 61_000,
          lastHeartbeatAt: 1,
          surfaceId: 'document-window-scope',
          visibilityState: 'visible',
          documentHasFocus: false,
          locationHref: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5',
          ownerChangedAt: 1,
        },
        now: 1,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'primary-instance',
      runtimeScopeId: 'primary-scope',
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('visibility');

    expect(writerAcquireLease).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'primary-instance',
      surfaceId: 'primary-scope',
    }));
    expect(runtime.getMode()).toBe('writer');
  });

  it('document-window follower does not acquire from primary app writer', async () => {
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'document-window-instance',
        acquiredAt: 2,
        expiresAt: 62_000,
        lastHeartbeatAt: 2,
        surfaceId: 'document-window-scope',
      },
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({
        ok: true,
        lease: {
          instanceId: 'primary-instance',
          acquiredAt: 1,
          expiresAt: 121_000,
          lastHeartbeatAt: 60_000,
          surfaceId: 'primary-scope',
          visibilityState: 'visible',
          documentHasFocus: false,
          locationHref: 'http://127.0.0.1:49744/stage/build/app/?v=1778023002402',
          ownerChangedAt: 1,
        },
        now: 60_000,
      })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'document-window-instance',
      runtimeScopeId: 'document-window-scope',
    });

    await (runtime as unknown as {
      refreshOwnership: (reason: string) => Promise<{ leaseHolder: string | null }>;
    }).refreshOwnership('manual');

    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
  });

  it('desktop document-window fails closed when no primary app writer is observed', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      body: { className: 'fn__flex-column body--window body--win32' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuan/3.6.5 Chrome/146 Electron/41 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => ({
      ok: true,
      lease: {
        instanceId: 'document-window-instance',
        acquiredAt: 2,
        expiresAt: 62_000,
        lastHeartbeatAt: 2,
        surfaceId: 'document-window-scope',
      },
      now: 2,
    }));
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'document-window-instance',
      runtimeScopeId: 'document-window-scope',
      backendContainer: 'std',
      frontendKind: 'desktop-window',
      isBrowser: true,
      isMobile: false,
    });

    await expect(runtime.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer unavailable: desktop Electron document window is follower-only',
    );
    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
  });

  it('hidden desktop document-window fails closed when no primary app writer is observed', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      hasFocus: vi.fn(() => false),
      body: { className: 'fn__flex-column body--window body--win32' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 SiYuan/3.6.5 Chrome/146 Electron/41 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:49744/stage/build/app/window.html?v=3.6.5' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => {
      throw new Error('hidden document-window must not acquire');
    });
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'document-window-instance',
      runtimeScopeId: 'document-window-scope',
      backendContainer: 'std',
      frontendKind: 'desktop-window',
      isBrowser: true,
      isMobile: false,
    });

    await expect(runtime.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer unavailable: desktop Electron document window is follower-only',
    );
    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
  });

  it('std desktop browser frontend fails closed when no primary app writer is observed', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: vi.fn(() => true),
      body: { className: 'fn__flex-column body--toolbar-hide' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/146 Safari/537.36',
      platform: 'Win32',
    });
    vi.stubGlobal('window', {
      location: { href: 'http://127.0.0.1:6806/stage/build/desktop/?r=abc' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const writerAcquireLease = vi.fn(async () => {
      throw new Error('std desktop browser frontend must not acquire');
    });
    const runtime = new FrontendInstanceRuntime({
      writerHello: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerAcquireLease,
      writerGetLease: vi.fn(async () => ({ ok: true, lease: null, now: 1 })),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 3 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'browser-instance',
      runtimeScopeId: 'browser-scope',
      backendContainer: 'std',
      frontendKind: 'browser-desktop',
      isBrowser: true,
      isMobile: false,
    });

    await expect(runtime.ensureWritable()).rejects.toThrow(
      'BACKEND_UNAVAILABLE: writer unavailable: browser frontend active-writer policy is provisional until backend-specific evidence exists',
    );
    expect(writerAcquireLease).not.toHaveBeenCalled();
    expect(runtime.getMode()).toBe('follower');
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

  it('keeps successful kernel transaction ingest relay out of info diagnostics', async () => {
    const info = vi.fn();
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-ingest',
          requesterInstanceId: 'follower-1',
          method: 'kernel.transaction.ingest',
          params: {
            source: 'ws-main',
            transactions: [{ doOperations: [{ action: 'update', id: 'block-1' }] }],
          },
          requestedAt: 1,
        },
        now: 2,
      })
      .mockResolvedValue({
        command: null,
        now: 3,
      });
    const writerCommandHandler = vi.fn(async () => ({
      accepted: 1,
      queued: 1,
      receivedAt: 1,
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    }));
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
      commandId: 'cmd-ingest',
      method: 'kernel.transaction.ingest',
    }));
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] relay command taken',
      expect.objectContaining({ commandId: 'cmd-ingest' }),
    );
    expect(info).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] relay command completed',
      expect.objectContaining({ commandId: 'cmd-ingest' }),
    );
    await runtime.dispose();
  });

  it('yields relay drain after budget while preserving writer command order', async () => {
    const nowValues = [0, 2, 3, 3, 3, 3];
    vi.spyOn(performance, 'now').mockImplementation(() => nowValues.shift() ?? 3);
    const commands = [
      {
        commandId: 'cmd-budget-1',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        requestedAt: 1,
      },
      {
        commandId: 'cmd-budget-2',
        requesterInstanceId: 'follower-1',
        method: 'browser.sourceExistence.applySweepHost',
        requestedAt: 2,
      },
    ];
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({ command: commands[0], pendingCommandCount: 1, now: 1 })
      .mockResolvedValueOnce({ command: commands[1], pendingCommandCount: 0, now: 2 })
      .mockResolvedValueOnce({ command: null, pendingCommandCount: 0, now: 3 });
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 4 }));
    const writerCommandHandler = vi.fn(async (command) => ({ handled: command.commandId }));
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
      relayDrainBudgetMs: 1,
      writerCommandHandler,
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason: string) => Promise<void>;
    }).drainPendingWriterCommands('budget-test');

    expect(writerCommandHandler).toHaveBeenCalledTimes(1);
    expect(writerCommandHandler).toHaveBeenLastCalledWith(expect.objectContaining({
      commandId: 'cmd-budget-1',
    }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(writerCommandHandler.mock.calls.map(([command]) => command.commandId)).toEqual([
      'cmd-budget-1',
      'cmd-budget-2',
    ]);
    expect(writerCompleteCommand.mock.calls.map(([request]) => request.commandId)).toEqual([
      'cmd-budget-1',
      'cmd-budget-2',
    ]);
    await runtime.dispose();
  });

  it('delays transaction relay continuation after budget yield while keeping deferred command pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    let currentNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => currentNow);
    const commands = [
      {
        commandId: 'cmd-transaction-1',
        requesterInstanceId: 'follower-1',
        method: 'kernel.transaction.ingest',
        requestedAt: 80,
      },
      {
        commandId: 'cmd-transaction-2',
        requesterInstanceId: 'follower-1',
        method: 'kernel.transaction.dequeue',
        requestedAt: 90,
      },
    ];
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({ command: commands[0], pendingCommandCount: 1, now: 1 })
      .mockResolvedValueOnce({ command: commands[1], pendingCommandCount: 0, now: 2 })
      .mockResolvedValueOnce({ command: null, pendingCommandCount: 0, now: 3 });
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 4 }));
    const writerCommandHandler = vi.fn(async (command) => {
      currentNow += command.commandId === 'cmd-transaction-1' ? 25 : 1;
      return { handled: command.commandId };
    });
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
      relayDrainBudgetMs: 24,
      writerCommandHandler,
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason: string) => Promise<void>;
    }).drainPendingWriterCommands('push:reconnect-drain');

    expect(writerCommandHandler).toHaveBeenCalledTimes(1);
    expect(writerCompleteCommand).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    expect(writerCommandHandler).toHaveBeenCalledTimes(1);
    expect(writerCompleteCommand).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(47);
    expect(writerCommandHandler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(writerCommandHandler.mock.calls.map(([command]) => command.commandId)).toEqual([
      'cmd-transaction-1',
      'cmd-transaction-2',
    ]);
    expect(writerCompleteCommand.mock.calls.map(([request]) => request.commandId)).toEqual([
      'cmd-transaction-1',
      'cmd-transaction-2',
    ]);

    const firstDrain = getRuntimePerformanceDiagnosticsReport().events.find(
      (event) => event.operation === 'writer.drain-pending-commands',
    );
    expect(firstDrain?.metadata).toMatchObject({
      wakeReason: 'push:reconnect-drain',
      commandCount: 1,
      pendingCommandCount: 1,
      budgetExceeded: true,
      yieldReason: 'budget',
      transactionCommandCount: 1,
      commandTypeSummary: 'kernel.transaction.ingest',
      continuationDelayMs: 48,
    });

    await runtime.dispose();
  });

  it('classifies stale transaction relay commands that already crossed max-delay cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    let currentNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => currentNow);
    const commands = [
      {
        commandId: 'cmd-stale-transaction-1',
        requesterInstanceId: 'follower-1',
        method: 'kernel.transaction.ingest',
        requestedAt: 9_000,
      },
      {
        commandId: 'cmd-stale-transaction-2',
        requesterInstanceId: 'follower-1',
        method: 'kernel.transaction.dequeue',
        requestedAt: 9_100,
      },
    ];
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({ command: commands[0], pendingCommandCount: 1, now: 10_001 })
      .mockResolvedValueOnce({ command: commands[1], pendingCommandCount: 0, now: 10_002 });
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 10_003 }));
    const writerCommandHandler = vi.fn(async (command) => {
      currentNow += command.commandId === 'cmd-stale-transaction-1' ? 25 : 1;
      return { handled: command.commandId };
    });
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
      relayDrainBudgetMs: 24,
      writerCommandHandler,
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason: string) => Promise<void>;
    }).drainPendingWriterCommands('push:reconnect-drain');

    const firstDrain = getRuntimePerformanceDiagnosticsReport().events.find(
      (event) => event.operation === 'writer.drain-pending-commands',
    );
    expect(firstDrain?.metadata).toMatchObject({
      wakeReason: 'push:reconnect-drain',
      wakeSource: 'reconnect',
      commandCount: 1,
      pendingCommandCount: 1,
      budgetExceeded: true,
      yieldReason: 'budget',
      transactionCommandCount: 1,
      freshTransactionCommandCount: 0,
      staleTransactionCommandCount: 1,
      maxDelayCapHit: true,
      transactionCommandAgeClass: 'stale',
      continuationDelayMs: 0,
    });

    await runtime.dispose();
  });

  it('records take and complete timing metadata without exposing command payloads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    let currentNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => currentNow);
    const command = {
      commandId: 'cmd-sidecar-timing-1',
      requesterInstanceId: 'follower-1',
      method: 'kernel.transaction.ingest',
      params: {
        body: 'secret note body',
      },
      requestedAt: 9_200,
    };
    const writerTakeCommand = vi.fn(async () => {
      currentNow += 12;
      return { command, pendingCommandCount: 0, now: 10_001 };
    });
    const writerCompleteCommand = vi.fn(async () => {
      currentNow += 18;
      return { ok: true, now: 10_002 };
    });
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
      relayDrainBudgetMs: 999_999,
      writerCommandHandler: vi.fn(async () => ({ body: 'secret result body' })),
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason: string) => Promise<void>;
    }).drainPendingWriterCommands('push:command');

    const report = getRuntimePerformanceDiagnosticsReport();
    const takeEvent = report.events.find((event) => event.operation === 'writer.take-command');
    const completeEvent = report.events.find((event) => event.operation === 'writer.complete-command');
    expect(takeEvent?.metadata).toMatchObject({
      wakeReason: 'push:command',
      wakeSource: 'push',
      queueStatus: 'command',
      commandId: 'cmd-sidecar-timing-1',
      method: 'kernel.transaction.ingest',
      pendingCommandCount: 0,
      commandAgeMs: 800,
      maxDelayCapHit: true,
    });
    expect(completeEvent?.metadata).toMatchObject({
      wakeReason: 'push:command',
      wakeSource: 'push',
      commandId: 'cmd-sidecar-timing-1',
      method: 'kernel.transaction.ingest',
      commandAgeMs: 800,
      completionStatus: 'completed',
    });
    expect(JSON.stringify(report)).not.toContain('secret note body');
    expect(JSON.stringify(report)).not.toContain('secret result body');

    await runtime.dispose();
  });

  it('keeps reconnect wake semantics while surfacing push relay state in diagnostics', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    let stateChange: ((diagnostics: { state: string; reconnectAttempts: number }) => void) | null = null;
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-reconnect-diagnostics-1',
          requesterInstanceId: 'follower-1',
          method: 'kernel.transaction.dequeue',
          requestedAt: Date.now(),
        },
        pendingCommandCount: 0,
        now: 2,
      })
      .mockResolvedValue({ command: null, pendingCommandCount: 0, now: 3 });
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 4 }));
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
      subscribeBroadcast: vi.fn((handlers) => {
        stateChange = handlers.onStateChange as (diagnostics: { state: string; reconnectAttempts: number }) => void;
        return {
          close: vi.fn(),
          getDiagnostics: () => ({ state: 'connecting', reconnectAttempts: 1 }),
        };
      }),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      relayDrainBudgetMs: 999_999,
      writerCommandHandler: vi.fn(async () => ({ ok: true })),
    });

    await runtime.start();
    stateChange?.({ state: 'open', reconnectAttempts: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writerCompleteCommand).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'cmd-reconnect-diagnostics-1',
    }));
    const drainEvent = getRuntimePerformanceDiagnosticsReport().events.find(
      (event) => event.operation === 'writer.drain-pending-commands'
        && event.metadata?.wakeReason === 'push:reconnect-drain',
    );
    expect(drainEvent?.metadata).toMatchObject({
      wakeSource: 'reconnect',
      pushRelayState: 'open',
      pushRelayReconnectAttempts: 2,
    });

    await runtime.dispose();
  });

  it('records relay drain budget diagnostics', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    const writerTakeCommand = vi.fn()
      .mockResolvedValueOnce({
        command: {
          commandId: 'cmd-diagnostics-1',
          requesterInstanceId: 'follower-1',
          method: 'review.feedback',
          requestedAt: 1,
        },
        pendingCommandCount: 0,
        now: 2,
      })
      .mockResolvedValueOnce({
        command: null,
        pendingCommandCount: 0,
        now: 3,
      });
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
      relayDrainBudgetMs: 999_999,
      writerCommandHandler: vi.fn(async () => ({ ok: true })),
    });

    await runtime.start();
    await (runtime as unknown as {
      drainPendingWriterCommands: (reason: string) => Promise<void>;
    }).drainPendingWriterCommands('diagnostics-test');

    const report = getRuntimePerformanceDiagnosticsReport();
    const drainEvent = report.events.find((event) => event.operation === 'writer.drain-pending-commands');
    expect(drainEvent?.metadata).toMatchObject({
      wakeReason: 'diagnostics-test',
      commandCount: 1,
      pendingCommandCount: 0,
      budgetExceeded: false,
      commandLimit: 4,
      budgetMs: 999_999,
      status: 'drained',
    });
    expect(report.counters['relay.writer-drain-wakes']).toBeGreaterThanOrEqual(1);
    expect(report.counters['relay.writer-drain-commands']).toBeGreaterThanOrEqual(1);
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
      writerGetLease: vi.fn()
        .mockResolvedValueOnce({ ok: true, lease: null, now: 1 })
        .mockResolvedValue({
          ok: true,
          lease: {
            instanceId: 'instance-b',
            acquiredAt: 1,
            expiresAt: 2,
            lastHeartbeatAt: 1,
          },
          now: 2,
        }),
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
    const warn = vi.fn();
    const writerCommandHandler = vi.fn(async () => ({ committed: true }));
    const writerCompleteCommand = vi.fn(async () => ({ ok: true, now: 4 }));
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
      writerGetLease: vi.fn()
        .mockResolvedValueOnce({ ok: true, lease: null, now: 1 })
        .mockResolvedValue({
          ok: true,
          lease: {
            instanceId: 'instance-b',
            acquiredAt: 1,
            expiresAt: 2,
            lastHeartbeatAt: 1,
          },
          now: 2,
        }),
      writerReleaseLease: vi.fn(async () => ({ ok: true, lease: null, now: 2 })),
      writerTakeCommand: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: writer takeCommand unavailable: current instance is not active writer');
      }),
      writerCompleteCommand,
      writerFailCommand: vi.fn(async () => ({ ok: true, now: 4 })),
    } as unknown as KernelSidecarClient, {
      instanceId: 'instance-a',
      relayPollIntervalMs: 250,
      writerCommandHandler,
      logger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
    });

    await runtime.start();
    expect(runtime.getMode()).toBe('writer');
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(runtime.getMode()).toBe('follower');
    expect(writerCommandHandler).not.toHaveBeenCalled();
    expect(writerCompleteCommand).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalledWith(
      '[FrontendInstanceRuntime] relay polling lost writer lease',
      expect.anything(),
    );
    await runtime.dispose();
  });
});
