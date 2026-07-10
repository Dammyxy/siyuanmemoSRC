import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendProgressiveCommandExecuteResult,
  type BackendTopicDerivedCommandExecuteResult,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS,
  BackendProgressiveCommandRuntime,
  type BackendProgressiveRpcHandlerContext,
} from '../rpc/BackendProgressiveRpcAdapter';
import {
  BACKEND_TOPIC_DERIVED_RPC_HANDLER_REGISTRATIONS,
  BackendTopicDerivedCommandRuntime,
  type BackendTopicDerivedRpcHandlerContext,
} from '../rpc/BackendTopicDerivedRpcAdapter';
import { BackendRpcDispatcher } from '../rpc/BackendRpcDispatcher';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

describe('Backend integration command RPC adapters', () => {
  it('runs progressive.command.execute through its runtime with duplicate replay', async () => {
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS),
    );
    const executor = vi.fn(async (request): Promise<BackendProgressiveCommandExecuteResult> => ({
      status: 'completed',
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: request.operation,
      result: { docId: 'doc-1' },
      rollback: { attempted: false, status: 'not-needed' },
      progress: { state: 'succeeded', updatedAt: 10 },
      diagnostics: {
        diagnosticEventId: 'progressive:test',
        family: 'progressive.command',
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const context: BackendProgressiveRpcHandlerContext = {
      progressive: new BackendProgressiveCommandRuntime(executor, { now: () => 100 }),
    };
    const params = {
      requestId: 'progressive-request-1',
      commandId: 'progressive-command-1',
      idempotencyKey: 'progressive-key-1',
      operation: 'create-child-doc',
      input: { sourceDocId: 'doc-1' },
      requestedAt: 1,
    };

    await expect(dispatch(dispatcher, context, 'progressive.command.execute', params)).resolves.toMatchObject({
      result: { status: 'completed', commandId: 'progressive-command-1' },
    });
    await expect(dispatch(dispatcher, context, 'progressive.command.execute', params)).resolves.toMatchObject({
      result: { status: 'duplicate', commandId: 'progressive-command-1' },
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('keeps progressive.command.execute unavailable when host effect is absent', async () => {
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS),
    );
    const context: BackendProgressiveRpcHandlerContext = {
      progressive: new BackendProgressiveCommandRuntime(undefined, { now: () => 100 }),
    };

    await expect(dispatch(dispatcher, context, 'progressive.command.execute', {
      requestId: 'progressive-request-1',
      commandId: 'progressive-command-1',
      idempotencyKey: 'progressive-key-1',
      operation: 'advance',
      input: {},
      requestedAt: 1,
    })).resolves.toMatchObject({
      result: {
        status: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
        reason: 'progressive.command.execute host effect unavailable',
      },
    });
  });

  it('runs topic-derived.command.execute through its runtime with duplicate replay', async () => {
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_TOPIC_DERIVED_RPC_HANDLER_REGISTRATIONS),
    );
    const executor = vi.fn(async (request): Promise<BackendTopicDerivedCommandExecuteResult> => ({
      status: 'completed',
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: 'create-from-topic-source',
      result: { created: 1 },
      audit: { created: 1, skipped: 0, nativeRiffRegistered: 1 },
      rollback: { attempted: false, status: 'not-needed' },
      progress: { state: 'succeeded', updatedAt: 10 },
      diagnostics: {
        diagnosticEventId: 'topic-derived:test',
        family: 'topic-derived.command',
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const context: BackendTopicDerivedRpcHandlerContext = {
      topicDerived: new BackendTopicDerivedCommandRuntime(executor, { now: () => 100 }),
    };
    const params = {
      requestId: 'topic-request-1',
      commandId: 'topic-command-1',
      idempotencyKey: 'topic-key-1',
      operation: 'create-from-topic-source',
      input: { sourceBlockId: 'block-1' },
      requestedAt: 1,
    };

    await expect(dispatch(dispatcher, context, 'topic-derived.command.execute', params)).resolves.toMatchObject({
      result: { status: 'completed', commandId: 'topic-command-1' },
    });
    await expect(dispatch(dispatcher, context, 'topic-derived.command.execute', params)).resolves.toMatchObject({
      result: { status: 'duplicate', commandId: 'topic-command-1' },
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

function dispatch<TContext>(
  dispatcher: BackendRpcDispatcher<TContext>,
  context: TContext,
  method: typeof BACKEND_PROGRESSIVE_RPC_HANDLER_REGISTRATIONS[number]['method']
    | typeof BACKEND_TOPIC_DERIVED_RPC_HANDLER_REGISTRATIONS[number]['method'],
  params?: unknown,
) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id: method,
    method,
    params: params === undefined ? undefined : [params],
  }, context);
}
