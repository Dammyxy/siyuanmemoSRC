import { describe, expect, it, vi } from 'vitest';
import { FollowerCommandClient } from '../FollowerCommandClient';
import type { KernelSidecarClient } from '../KernelSidecarClient';

describe('FollowerCommandClient', () => {
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
});
