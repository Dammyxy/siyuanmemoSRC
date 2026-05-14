import { afterEach, describe, expect, it, vi } from 'vitest';
import { FollowerCommandClient } from '../FollowerCommandClient';
import type { KernelSidecarClient } from '../KernelSidecarClient';

describe('FollowerCommandClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits submitted and completed relay diagnostics', async () => {
    const info = vi.fn();
    const writerSubmitCommand = vi.fn(async () => ({
      commandId: 'cmd-1',
      ownerInstanceId: 'writer-1',
      ownerSurfaceId: 'scope-writer',
      status: 'queued',
      now: 1,
    }));
    const writerGetCommandResult = vi.fn(async () => ({
      commandId: 'cmd-1',
      status: 'completed',
      ownerInstanceId: 'writer-1',
      ownerSurfaceId: 'scope-writer',
      result: { ok: true },
      completedAt: 2,
      now: 2,
    }));
    const client = new FollowerCommandClient({
      writerSubmitCommand,
      writerGetCommandResult,
    } as unknown as KernelSidecarClient, {
      info,
      warn: vi.fn(),
    });

    await client.submitAndWait<{ ok: boolean }>({
      instanceId: 'follower-1',
      method: 'autocard.execute',
      params: { idempotencyKey: 'auto-card:block-1' },
    }, 2_000);

    expect(info).toHaveBeenCalledWith('[FollowerCommandClient] relay command submitted', expect.objectContaining({
      commandId: 'cmd-1',
      instanceId: 'follower-1',
      method: 'autocard.execute',
      ownerInstanceId: 'writer-1',
      ownerSurfaceId: 'scope-writer',
      status: 'queued',
    }));
    expect(info).toHaveBeenCalledWith('[FollowerCommandClient] relay command completed', expect.objectContaining({
      commandId: 'cmd-1',
      instanceId: 'follower-1',
      method: 'autocard.execute',
      ownerInstanceId: 'writer-1',
      ownerSurfaceId: 'scope-writer',
      status: 'completed',
    }));
  });

  it('keeps empty kernel transaction dequeue polling out of info diagnostics', async () => {
    const info = vi.fn();
    const writerSubmitCommand = vi.fn(async () => ({
      commandId: 'cmd-empty-dequeue',
      ownerInstanceId: 'writer-1',
      status: 'queued',
      now: 1,
    }));
    const writerGetCommandResult = vi.fn(async () => ({
      commandId: 'cmd-empty-dequeue',
      status: 'completed',
      ownerInstanceId: 'writer-1',
      result: { actions: [], remaining: 0 },
      completedAt: 2,
      now: 2,
    }));
    const client = new FollowerCommandClient({
      writerSubmitCommand,
      writerGetCommandResult,
    } as unknown as KernelSidecarClient, {
      info,
      warn: vi.fn(),
    });

    await client.submitAndWait<{ actions: unknown[]; remaining: number }>({
      instanceId: 'follower-1',
      method: 'kernel.transaction.dequeue',
      params: { maxActions: 4 },
    }, 2_000);

    expect(info).not.toHaveBeenCalledWith(
      '[FollowerCommandClient] relay command submitted',
      expect.objectContaining({ commandId: 'cmd-empty-dequeue' }),
    );
    expect(info).not.toHaveBeenCalledWith(
      '[FollowerCommandClient] relay command completed',
      expect.objectContaining({ commandId: 'cmd-empty-dequeue' }),
    );
  });

  it('emits completed diagnostics for kernel transaction dequeue when actions exist', async () => {
    const info = vi.fn();
    const writerSubmitCommand = vi.fn(async () => ({
      commandId: 'cmd-action-dequeue',
      ownerInstanceId: 'writer-1',
      status: 'queued',
      now: 1,
    }));
    const writerGetCommandResult = vi.fn(async () => ({
      commandId: 'cmd-action-dequeue',
      status: 'completed',
      ownerInstanceId: 'writer-1',
      result: {
        actions: [{ type: 'native-riff-upsert' }],
        remaining: 0,
      },
      completedAt: 2,
      now: 2,
    }));
    const client = new FollowerCommandClient({
      writerSubmitCommand,
      writerGetCommandResult,
    } as unknown as KernelSidecarClient, {
      info,
      warn: vi.fn(),
    });

    await client.submitAndWait<{ actions: unknown[]; remaining: number }>({
      instanceId: 'follower-1',
      method: 'kernel.transaction.dequeue',
      params: { maxActions: 4 },
    }, 2_000);

    expect(info).not.toHaveBeenCalledWith(
      '[FollowerCommandClient] relay command submitted',
      expect.objectContaining({ commandId: 'cmd-action-dequeue' }),
    );
    expect(info).toHaveBeenCalledWith('[FollowerCommandClient] relay command completed', expect.objectContaining({
      commandId: 'cmd-action-dequeue',
      instanceId: 'follower-1',
      method: 'kernel.transaction.dequeue',
      ownerInstanceId: 'writer-1',
      status: 'completed',
      actionCount: 1,
      remaining: 0,
    }));
  });

  it('submits command and resolves completed result', async () => {
    const writerSubmitCommand = vi.fn(async () => ({
      commandId: 'cmd-1',
      ownerInstanceId: 'writer-1',
      status: 'queued',
      now: 1,
    }));
    const writerGetCommandResult = vi.fn()
      .mockResolvedValueOnce({
        commandId: 'cmd-1',
        status: 'pending',
        ownerInstanceId: 'writer-1',
        now: 2,
      })
      .mockResolvedValueOnce({
        commandId: 'cmd-1',
        status: 'completed',
        ownerInstanceId: 'writer-1',
        result: { ok: true },
        completedAt: 3,
        now: 3,
      });
    const client = new FollowerCommandClient({
      writerSubmitCommand,
      writerGetCommandResult,
    } as unknown as KernelSidecarClient);

    await expect(client.submitAndWait<{ ok: boolean }>({
      instanceId: 'follower-1',
      method: 'review.feedback',
      params: { cardId: 'card-1' },
    }, 2_000)).resolves.toEqual({ ok: true });
  });

  it('throws when writer relay reports failed', async () => {
    const client = new FollowerCommandClient({
      writerSubmitCommand: vi.fn(async () => ({
        commandId: 'cmd-1',
        ownerInstanceId: 'writer-1',
        status: 'queued',
        now: 1,
      })),
      writerGetCommandResult: vi.fn(async () => ({
        commandId: 'cmd-1',
        status: 'failed',
        ownerInstanceId: 'writer-1',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'boom',
        },
        completedAt: 2,
        now: 2,
      })),
    } as unknown as KernelSidecarClient);

    await expect(client.submitAndWait({
      instanceId: 'follower-1',
      method: 'review.feedback',
      params: { cardId: 'card-1' },
    }, 2_000)).rejects.toThrow('INTERNAL_ERROR: boom');
  });

  it('throws explicit unavailable when relay polling times out', async () => {
    const client = new FollowerCommandClient({
      writerSubmitCommand: vi.fn(async () => ({
        commandId: 'cmd-1',
        ownerInstanceId: 'writer-1',
        status: 'queued',
        now: 1,
      })),
      writerGetCommandResult: vi.fn(async () => ({
        commandId: 'cmd-1',
        status: 'pending',
        ownerInstanceId: 'writer-1',
        now: Date.now(),
      })),
    } as unknown as KernelSidecarClient);

    await expect(client.submitAndWait({
      instanceId: 'follower-1',
      method: 'review.feedback',
      params: { cardId: 'card-1' },
    }, 50)).rejects.toThrow('BACKEND_UNAVAILABLE: writer relay timeout');
  });

  it('attaches relay timeout diagnostics to timeout errors', async () => {
    const client = new FollowerCommandClient({
      writerSubmitCommand: vi.fn(async () => ({
        commandId: 'cmd-timeout',
        ownerInstanceId: 'writer-1',
        status: 'queued',
        now: 1,
      })),
      writerGetCommandResult: vi.fn(async () => ({
        commandId: 'cmd-timeout',
        status: 'pending',
        ownerInstanceId: 'writer-1',
        now: Date.now(),
      })),
    } as unknown as KernelSidecarClient);

    let captured: unknown;
    try {
      await client.submitAndWait({
        instanceId: 'follower-1',
        method: 'kernel.transaction.dequeue',
        params: { maxActions: 8 },
      }, 50);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(Error);
    expect(captured).toMatchObject({
      message: 'BACKEND_UNAVAILABLE: writer relay timeout',
      commandId: 'cmd-timeout',
      method: 'kernel.transaction.dequeue',
      timeoutMs: 50,
    });
  });

  it('passes relay metadata for deterministic command identity', async () => {
    const writerSubmitCommand = vi.fn(async () => ({
      commandId: 'cmd-fixed',
      ownerInstanceId: 'writer-1',
      status: 'queued',
      now: 1,
    }));
    const writerGetCommandResult = vi.fn(async () => ({
      commandId: 'cmd-fixed',
      status: 'completed',
      ownerInstanceId: 'writer-1',
      result: { ok: true },
      completedAt: 2,
      now: 2,
    }));
    const client = new FollowerCommandClient({
      writerSubmitCommand,
      writerGetCommandResult,
    } as unknown as KernelSidecarClient);

    await client.submitAndWait({
      instanceId: 'follower-1',
      commandId: 'cmd-fixed',
      method: 'autocard.decision.resolve',
      params: {
        idempotencyKey: 'candidate:block-1',
      },
    }, 2_000);

    expect(writerSubmitCommand).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-1',
      commandId: 'cmd-fixed',
      method: 'autocard.decision.resolve',
    }));
  });

  it('throws explicit unavailable class reported by relay result', async () => {
    const client = new FollowerCommandClient({
      writerSubmitCommand: vi.fn(async () => ({
        commandId: 'cmd-1',
        ownerInstanceId: 'writer-1',
        status: 'queued',
        now: 1,
      })),
      writerGetCommandResult: vi.fn(async () => ({
        commandId: 'cmd-1',
        status: 'unavailable',
        ownerInstanceId: 'writer-1',
        error: {
          code: 'WRITER_UNAVAILABLE',
          message: 'writer lease lost',
        },
        completedAt: 2,
        now: 2,
      })),
    } as unknown as KernelSidecarClient);

    await expect(client.submitAndWait({
      instanceId: 'follower-1',
      method: 'autocard.decision.resolve',
      params: { blockId: 'block-1', content: 'Alpha <> Beta' },
    }, 2_000)).rejects.toThrow('WRITER_UNAVAILABLE: writer lease lost');
  });

  it('uses command result push notifications instead of waiting for polling delay', async () => {
    vi.useFakeTimers();
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
    const writerGetCommandResult = vi.fn()
      .mockResolvedValueOnce({
        commandId: 'cmd-push-result',
        status: 'pending',
        ownerInstanceId: 'writer-1',
        now: 1,
      })
      .mockResolvedValueOnce({
        commandId: 'cmd-push-result',
        status: 'completed',
        ownerInstanceId: 'writer-1',
        result: { ok: true },
        completedAt: 2,
        now: 2,
      });
    const client = new FollowerCommandClient({
      subscribeBroadcast,
      writerSubmitCommand: vi.fn(async () => ({
        commandId: 'cmd-push-result',
        ownerInstanceId: 'writer-1',
        status: 'queued',
        now: 1,
      })),
      writerGetCommandResult,
    } as unknown as KernelSidecarClient);

    const promise = client.submitAndWait<{ ok: boolean }>({
      instanceId: 'follower-1',
      method: 'review.feedback',
      params: { cardId: 'card-1' },
    }, 2_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(subscribeBroadcast).toHaveBeenCalledTimes(1);
    expect(writerGetCommandResult).toHaveBeenCalledTimes(1);
    onEvent?.({
      method: 'memo.writer.commandResult',
      params: {
        commandId: 'cmd-push-result',
        requesterInstanceId: 'follower-1',
        writerInstanceId: 'writer-1',
        ok: true,
        result: { ok: true },
        completedAt: 2,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(writerGetCommandResult).toHaveBeenCalledTimes(2);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('deduplicates duplicate command result push notifications', async () => {
    vi.useFakeTimers();
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
    const writerGetCommandResult = vi.fn()
      .mockResolvedValueOnce({
        commandId: 'cmd-duplicate-result',
        status: 'pending',
        ownerInstanceId: 'writer-1',
        now: 1,
      })
      .mockResolvedValueOnce({
        commandId: 'cmd-duplicate-result',
        status: 'completed',
        ownerInstanceId: 'writer-1',
        result: { ok: true },
        completedAt: 2,
        now: 2,
      });
    const client = new FollowerCommandClient({
      subscribeBroadcast,
      writerSubmitCommand: vi.fn(async () => ({
        commandId: 'cmd-duplicate-result',
        ownerInstanceId: 'writer-1',
        status: 'queued',
        now: 1,
      })),
      writerGetCommandResult,
    } as unknown as KernelSidecarClient);

    const promise = client.submitAndWait<{ ok: boolean }>({
      instanceId: 'follower-1',
      method: 'review.feedback',
      params: { cardId: 'card-1' },
    }, 2_000);
    await Promise.resolve();
    await Promise.resolve();

    const event = {
      method: 'memo.writer.commandResult',
      params: {
        commandId: 'cmd-duplicate-result',
        requesterInstanceId: 'follower-1',
        writerInstanceId: 'writer-1',
        ok: true,
        result: { ok: true },
        completedAt: 2,
      },
    };
    onEvent?.(event);
    onEvent?.(event);
    await Promise.resolve();
    await Promise.resolve();

    expect(writerGetCommandResult).toHaveBeenCalledTimes(2);
    await expect(promise).resolves.toEqual({ ok: true });
  });
});
