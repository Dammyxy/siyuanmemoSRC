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

  it('supports writer command relay submit and result polling envelopes', async () => {
    const call = vi.fn(async (method: string) => {
      if (method === 'writer.submitCommand') {
        return {
          ok: true,
          commandId: 'cmd-1',
          ownerInstanceId: 'writer-1',
          status: 'queued',
          now: 1,
        };
      }
      if (method === 'writer.getCommandResult') {
        return {
          ok: true,
          commandId: 'cmd-1',
          status: 'completed',
          result: { committed: true },
          ownerInstanceId: 'writer-1',
          completedAt: 2,
          now: 2,
        };
      }
      if (method === 'writer.takeCommand') {
        return {
          ok: true,
          command: {
            commandId: 'cmd-1',
            requesterInstanceId: 'follower-1',
            method: 'review.feedback',
            params: { cardId: 'card-1' },
            requestedAt: 1,
          },
          now: 2,
        };
      }
      return { ok: true, now: 1 };
    });
    const client = new KernelSidecarClient({
      getStatus: vi.fn(),
      call,
    });

    await expect(client.writerSubmitCommand({
      instanceId: 'follower-1',
      method: 'review.feedback',
      params: { cardId: 'card-1' },
    })).resolves.toMatchObject({
      commandId: 'cmd-1',
      ownerInstanceId: 'writer-1',
      status: 'queued',
    });

    await expect(client.writerGetCommandResult({ commandId: 'cmd-1' })).resolves.toMatchObject({
      commandId: 'cmd-1',
      status: 'completed',
      result: { committed: true },
      ownerInstanceId: 'writer-1',
    });

    await expect(client.writerTakeCommand({ instanceId: 'writer-1' })).resolves.toMatchObject({
      command: expect.objectContaining({
        commandId: 'cmd-1',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
      }),
    });
  });
});
