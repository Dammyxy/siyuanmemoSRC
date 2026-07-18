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
          ownerSurfaceId: 'scope-writer',
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
          ownerSurfaceId: 'scope-writer',
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
            expiresAt: 99,
            idempotencyKey: 'review:card-1',
          },
          pendingCommandCount: 2,
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
      ownerSurfaceId: 'scope-writer',
      status: 'queued',
    });

    await expect(client.writerGetCommandResult({ commandId: 'cmd-1' })).resolves.toMatchObject({
      commandId: 'cmd-1',
      status: 'completed',
      result: { committed: true },
      ownerInstanceId: 'writer-1',
      ownerSurfaceId: 'scope-writer',
    });

    await expect(client.writerTakeCommand({ instanceId: 'writer-1' })).resolves.toMatchObject({
      pendingCommandCount: 2,
      command: expect.objectContaining({
        commandId: 'cmd-1',
        requesterInstanceId: 'follower-1',
        method: 'review.feedback',
        expiresAt: 99,
        idempotencyKey: 'review:card-1',
      }),
    });
  });

  it('preserves unavailable relay lookup envelope without collapsing error class', async () => {
    const client = new KernelSidecarClient({
      getStatus: vi.fn(),
      call: vi.fn(async (method: string) => {
        if (method !== 'writer.getCommandResult') {
          return { ok: true, now: 1 };
        }
        return {
          ok: true,
          commandId: 'cmd-expired',
          status: 'expired',
          ownerInstanceId: 'writer-1',
          error: {
            code: 'COMMAND_EXPIRED',
            message: 'writer command expired before completion',
          },
          completedAt: 4,
          now: 4,
        };
      }),
    });

    await expect(client.writerGetCommandResult({ commandId: 'cmd-expired' })).resolves.toMatchObject({
      commandId: 'cmd-expired',
      status: 'expired',
      error: {
        code: 'COMMAND_EXPIRED',
        message: 'writer command expired before completion',
      },
    });
  });

  it('calls kernel network.fetchExternal and validates payload shape', async () => {
    const call = vi.fn(async () => ({
      requestId: 'network-1',
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    }));
    const client = new KernelSidecarClient({
      getStatus: vi.fn(),
      call,
    });

    await expect(client.networkFetchExternal({
      requestId: 'network-1',
      url: 'https://provider.test/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: '{}',
      timeoutMs: 10_000,
    })).resolves.toEqual({
      requestId: 'network-1',
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
    expect(call).toHaveBeenCalledWith('network.fetchExternal', {
      requestId: 'network-1',
      url: 'https://provider.test/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: '{}',
      timeoutMs: 10_000,
    });
  });

  it('publishes queue projection identity broadcasts through the kernel relay', async () => {
    const request = {
      queueId: 'filter-group',
      queueType: 'filter-group' as const,
      policyId: 'policy-a',
      generation: 2,
      reason: 'refreshed' as const,
      source: 'runtime' as const,
      sourceInstanceId: 'writer-a',
      sourceSurfaceId: 'surface-a',
      sourceMode: 'writer',
      timestamp: 10,
      diagnosticEventId: 'event-a',
    };
    const call = vi.fn(async () => ({ ok: true, broadcast: request, now: 11 }));
    const client = new KernelSidecarClient({
      getStatus: vi.fn(),
      call,
    });

    await expect(client.queueProjectionPublishIdentityChanged(request)).resolves.toEqual({
      ok: true,
      broadcast: request,
      now: 11,
    });
    expect(call).toHaveBeenCalledWith('queueProjection.publishIdentityChanged', request);
  });

  it('preserves identity initialization fence success and unavailable envelopes', async () => {
    const call = vi.fn(async (method: string) => {
      if (method === 'identity.acquireInitializationFence') {
        return {
          ok: true,
          fence: {
            instanceId: 'origin-a',
            token: 'token-a',
            acquiredAt: 1,
            expiresAt: 100,
          },
          now: 1,
        };
      }
      return {
        ok: false,
        error: { code: 'FENCE_UNAVAILABLE', message: 'owned elsewhere' },
        fence: null,
        now: 2,
      };
    });
    const client = new KernelSidecarClient({ getStatus: vi.fn(), call });
    await expect(client.identityAcquireInitializationFence({ instanceId: 'origin-a' }))
      .resolves.toMatchObject({ ok: true, fence: { token: 'token-a' } });
    await expect(client.identityReleaseInitializationFence({ instanceId: 'origin-a', token: 'token-a' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'FENCE_UNAVAILABLE' } });
  });
});
