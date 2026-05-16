import { describe, expect, it, vi } from 'vitest';
import { SemanticActivationCommandClient } from '../SemanticActivationCommandClient';
import type { FollowerCommandClient } from '../FollowerCommandClient';
import type { FrontendInstanceRuntime } from '../FrontendInstanceRuntime';
import type { SrsBackendClient } from '../SrsBackendClient';
import type { BackendSemanticCommandRequest } from '../../../../packages/contracts/src/backend-rpc';

function semanticRequest(overrides: Partial<BackendSemanticCommandRequest> = {}): BackendSemanticCommandRequest {
  return {
    requestId: 'semantic-command-1',
    method: 'semantic.command.execute',
    callerIntent: 'test-semantic-command',
    idempotencyKey: 'semantic-key-1',
    command: {
      type: 'start-session',
      rootFocusNodeId: 'node-root',
    },
    ...overrides,
  };
}

describe('SemanticActivationCommandClient', () => {
  it('routes semantic mutation through follower relay when runtime is follower', async () => {
    const submitAndWait = vi.fn(async () => ({
      status: 'ok',
      commandId: 'semantic-command-1',
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['semantic-session-1'] },
      diagnosticEventId: 'diag-semantic-1',
    }));
    const client = new SemanticActivationCommandClient({
      backendClient: {
        semanticCommand: vi.fn(async () => {
          throw new Error('follower must not write directly');
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

    const result = await client.execute(semanticRequest());

    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.command.execute',
      instanceId: 'follower-1',
      idempotencyKey: 'semantic-key-1',
    }), 15_000);
    expect(result).toMatchObject({
      status: 'ok',
      commandId: 'semantic-command-1',
    });
  });

  it('refreshes writer lease before direct semantic mutation', async () => {
    const ensureWritable = vi.fn(async () => undefined);
    const semanticCommand = vi.fn(async () => ({
      status: 'ok' as const,
      commandId: 'semantic-command-1',
      writerInstanceId: 'writer-1',
      changed: {},
      diagnosticEventId: 'diag-semantic-writer',
    }));
    const client = new SemanticActivationCommandClient({
      backendClient: {
        semanticCommand,
      } as unknown as SrsBackendClient,
      frontendRuntime: {
        getMode: () => 'writer',
        getInstanceId: () => 'writer-1',
        ensureWritable,
      } as unknown as FrontendInstanceRuntime,
      followerCommandClient: {
        submitAndWait: vi.fn(async () => {
          throw new Error('writer should not relay');
        }),
      } as unknown as FollowerCommandClient,
    });

    await client.execute(semanticRequest());

    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(semanticCommand).toHaveBeenCalledTimes(1);
  });

  it('routes stale writer semantic mutation through follower relay after guard refresh', async () => {
    let mode: 'writer' | 'follower' = 'writer';
    const semanticCommand = vi.fn(async () => {
      throw new Error('stale writer must not write directly');
    });
    const submitAndWait = vi.fn(async () => ({
      status: 'ok',
      commandId: 'semantic-relayed',
      writerInstanceId: 'writer-real',
      changed: {},
      diagnosticEventId: 'diag-semantic-relayed',
    }));
    const client = new SemanticActivationCommandClient({
      backendClient: {
        semanticCommand,
      } as unknown as SrsBackendClient,
      frontendRuntime: {
        getMode: () => mode,
        getInstanceId: () => 'stale-writer-1',
        ensureWritable: vi.fn(async () => {
          mode = 'follower';
          throw new Error('BACKEND_UNAVAILABLE: writer lease held by another instance');
        }),
      } as unknown as FrontendInstanceRuntime,
      followerCommandClient: {
        submitAndWait,
      } as unknown as FollowerCommandClient,
    });

    const result = await client.execute(semanticRequest());

    expect(semanticCommand).not.toHaveBeenCalled();
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.command.execute',
      instanceId: 'stale-writer-1',
    }), 15_000);
    expect(result.commandId).toBe('semantic-relayed');
  });

  it('returns explicit unavailable when follower relay is unavailable', async () => {
    const client = new SemanticActivationCommandClient({
      backendClient: {
        semanticCommand: vi.fn(async () => {
          throw new Error('follower must not write directly');
        }),
      } as unknown as SrsBackendClient,
      frontendRuntime: {
        getMode: () => 'follower',
        getInstanceId: () => 'follower-1',
      } as unknown as FrontendInstanceRuntime,
      followerCommandClient: null,
    });

    const result = await client.execute(semanticRequest());

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'writer-unavailable',
    });
  });
});
