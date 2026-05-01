import { describe, expect, it, vi } from 'vitest';
import { PrivateApiClient } from '../PrivateApiClient';
import type { FollowerCommandClient } from '../FollowerCommandClient';
import type { FrontendInstanceRuntime } from '../FrontendInstanceRuntime';
import type { SrsBackendClient } from '../SrsBackendClient';

describe('PrivateApiClient', () => {
  it('uses backend client for private reads in writer mode', async () => {
    const read = vi.fn(async () => ({
      ok: true,
      data: { items: [] },
      diagnosticEventId: 'diag-read-1',
      auditStatus: 'recorded',
    }));
    const client = new PrivateApiClient({
      backendClient: {
        privateRead: read,
      } as unknown as SrsBackendClient,
      frontendRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-1',
      } as unknown as FrontendInstanceRuntime,
    });

    const result = await client.read({
      method: 'private.read.cards',
      callerIntent: 'test-read',
      requestId: 'read-1',
      limit: 3,
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, auditStatus: 'recorded' });
  });

  it('routes private mutation through follower relay when runtime is follower', async () => {
    const submitAndWait = vi.fn(async () => ({
      ok: true,
      commandId: 'cmd-private-1',
      writerInstanceId: 'writer-1',
      changed: { cardIds: ['card-1'] },
      result: { committed: true },
      auditStatus: 'recorded',
      diagnosticEventId: 'diag-mutation-1',
    }));
    const client = new PrivateApiClient({
      backendClient: {
        privateCommand: vi.fn(async () => {
          throw new Error('should not be called in follower mode');
        }),
      } as unknown as SrsBackendClient,
      frontendRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'follower-1',
      } as unknown as FrontendInstanceRuntime,
      followerCommandClient: {
        submitAndWait,
      } as unknown as FollowerCommandClient,
    });

    const result = await client.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutation',
      requestId: 'mutation-1',
      idempotencyKey: 'private-mutation-1',
      params: { action: 'noop' },
    });

    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      method: 'private.command.execute',
      instanceId: 'follower-1',
    }), 15_000);
    expect(result).toMatchObject({
      ok: true,
      commandId: 'cmd-private-1',
    });
  });

  it('rejects follower mutation when relay is unavailable', async () => {
    const client = new PrivateApiClient({
      backendClient: {
        privateCommand: vi.fn(async () => ({
          ok: true,
        })),
      } as unknown as SrsBackendClient,
      frontendRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'follower-1',
      } as unknown as FrontendInstanceRuntime,
      followerCommandClient: null,
    });

    await expect(client.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutation',
      requestId: 'mutation-2',
      idempotencyKey: 'private-mutation-2',
      params: { action: 'noop' },
    })).rejects.toThrow('WRITER_UNAVAILABLE: private mutation relay is unavailable in follower mode');
  });

  it('rejects mutation when writer relay runtime is required but missing', async () => {
    const privateCommand = vi.fn(async () => ({
      ok: true,
      commandId: 'cmd-direct',
      writerInstanceId: 'writer-1',
      changed: {},
      result: { committed: true },
      auditStatus: 'recorded',
      diagnosticEventId: 'diag-direct',
    }));
    const client = new PrivateApiClient({
      backendClient: {
        privateCommand,
      } as unknown as SrsBackendClient,
      frontendRuntime: null,
      followerCommandClient: null,
    });

    await expect(client.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutation',
      requestId: 'mutation-3',
      idempotencyKey: 'private-mutation-3',
      params: { action: 'noop' },
    })).rejects.toThrow('WRITER_UNAVAILABLE: private mutation requires writer relay runtime');
    expect(privateCommand).not.toHaveBeenCalled();
  });

  it('allows explicit single-writer mutation mode without relay runtime', async () => {
    const privateCommand = vi.fn(async () => ({
      ok: true,
      commandId: 'cmd-single-writer',
      writerInstanceId: 'writer-1',
      changed: {},
      result: { committed: true },
      auditStatus: 'recorded',
      diagnosticEventId: 'diag-single-writer',
    }));
    const client = new PrivateApiClient({
      backendClient: {
        privateCommand,
      } as unknown as SrsBackendClient,
      frontendRuntime: null,
      followerCommandClient: null,
      writerRelayRequiredForMutations: false,
    });

    const result = await client.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutation',
      requestId: 'mutation-4',
      idempotencyKey: 'private-mutation-4',
      params: { action: 'noop' },
    });

    expect(privateCommand).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      commandId: 'cmd-single-writer',
    });
  });
});
