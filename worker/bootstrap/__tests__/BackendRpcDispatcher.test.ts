import { describe, expect, it } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  type BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import { BackendRpcDispatcher, type BackendRpcDispatcherTimingEvent } from '../rpc/BackendRpcDispatcher';
import type { BackendRpcHandlerContext } from '../rpc/BackendRpcHandlerContext';
import { createBackendRpcHandlerRegistry } from '../rpc/BackendRpcRegistry';

interface TestDispatchContext extends BackendRpcHandlerContext {
  readonly calls: string[];
}

describe('BackendRpcDispatcher', () => {
  it('invokes exactly one registered handler and wraps the result in the backend RPC success envelope', async () => {
    const handler: BackendRpcHandlerAdapter<{ ping: true }, { pong: true }, TestDispatchContext> = {
      method: 'system.health',
      family: 'core',
      handle(params, context) {
        context.calls.push(`${params?.ping ? 'ping' : 'missing'}:${this.method}`);
        return { pong: true };
      },
    };
    const dispatcher = new BackendRpcDispatcher<TestDispatchContext>(
      createBackendRpcHandlerRegistry([{ ...handler, owner: 'test-core' }]),
    );
    const context = { calls: [] as string[] };

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 7,
      method: 'system.health',
      params: { ping: true },
    }, context)).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 7,
      result: { pong: true },
    });
    expect(context.calls).toEqual(['ping:system.health']);
  });

  it('runs pre-request lifecycle before the handler and can use context error mapping', async () => {
    const events: string[] = [];
    const dispatcher = new BackendRpcDispatcher<BackendRpcHandlerContext>(
      createBackendRpcHandlerRegistry([{
        ...createSystemHealthHandler(() => {
          events.push('handler');
          throw new Error('custom mapped');
        }),
        owner: 'test-core',
      }]),
    );

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'hooked',
      method: 'system.health',
      params: { sample: true },
    }, {
      lifecycle: {
        beforeHandle(request) {
          events.push(`${request.method}:${JSON.stringify(request.params)}`);
        },
        mapError(error) {
          events.push(error instanceof Error ? error.message : String(error));
          return { code: 'FAILED', message: 'mapped by context' };
        },
      },
    })).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'hooked',
      error: {
        code: 'FAILED',
        message: 'mapped by context',
      },
    });
    expect(events).toEqual([
      'system.health:{"sample":true}',
      'handler',
      'custom mapped',
    ]);
  });

  it('rejects invalid backend RPC requests before invoking handlers', async () => {
    const handler = createSystemHealthHandler(() => ({ ok: true }));
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{ ...handler, owner: 'test-core' }]),
    );

    await expect(dispatcher.dispatch({
      jsonrpc: '1.0',
      id: 'bad',
      method: 'system.health',
    }, {})).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 'bad',
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid SrsBackendWorker JSON-RPC request',
      },
    });
  });

  it('returns METHOD_NOT_FOUND for methods absent from the registry without invoking another family handler', async () => {
    const calls: string[] = [];
    const handler = createSystemHealthHandler(() => {
      calls.push('called');
      return { ok: true };
    });
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{ ...handler, owner: 'test-core' }]),
    );

    await expect(dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 8,
      method: 'browser.deck.page',
    }, {})).resolves.toEqual({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 8,
      error: {
        code: 'METHOD_NOT_FOUND',
        message: 'Unknown method: browser.deck.page',
      },
    });
    expect(calls).toEqual([]);
  });

  it('maps handler errors through the shared backend RPC error policy', async () => {
    const invalidRequestDispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{
        ...createSystemHealthHandler(() => {
          throw new Error('INVALID_REQUEST: missing payload');
        }),
        owner: 'test-core',
      }]),
    );
    await expect(validRequest(invalidRequestDispatcher, 9)).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST', message: 'missing payload' },
    });

    const backendUnavailableDispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{
        ...createSystemHealthHandler(() => {
          throw new Error('BACKEND_UNAVAILABLE: sqlite bridge unavailable');
        }),
        owner: 'test-core',
      }]),
    );
    await expect(validRequest(backendUnavailableDispatcher, 10)).resolves.toMatchObject({
      error: { code: 'BACKEND_UNAVAILABLE', message: 'BACKEND_UNAVAILABLE: sqlite bridge unavailable' },
    });

    const storageErrorDispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{
        ...createSystemHealthHandler(() => {
          throw new Error('SOURCE_READ_UNAVAILABLE: source file missing');
        }),
        owner: 'test-core',
      }]),
    );
    await expect(validRequest(storageErrorDispatcher, 11)).resolves.toMatchObject({
      error: { code: 'SOURCE_READ_UNAVAILABLE', message: 'source file missing' },
    });

    const internalErrorDispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{
        ...createSystemHealthHandler(() => {
          throw new Error('unexpected failure');
        }),
        owner: 'test-core',
      }]),
    );
    await expect(validRequest(internalErrorDispatcher, 12)).resolves.toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'unexpected failure' },
    });
  });

  it('records one dispatch timing event with method, family, owner, outcome, and duration', async () => {
    const timingEvents: BackendRpcDispatcherTimingEvent[] = [];
    let now = 100;
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry([{ ...createSystemHealthHandler(() => ({ ok: true })), owner: 'test-core' }]),
      {
        now: () => {
          now += 7;
          return now;
        },
        recordTiming: (event) => timingEvents.push(event),
      },
    );

    await validRequest(dispatcher, 13);

    expect(timingEvents).toEqual([{
      method: 'system.health',
      family: 'core',
      owner: 'test-core',
      outcome: 'success',
      durationMs: 7,
    }]);
  });
});

function createSystemHealthHandler<TResult>(
  handle: () => TResult,
): BackendRpcHandlerAdapter<void, TResult, BackendRpcHandlerContext> {
  return {
    method: 'system.health',
    family: 'core',
    handle,
  };
}

function validRequest(dispatcher: BackendRpcDispatcher<BackendRpcHandlerContext>, id: number) {
  return dispatcher.dispatch({
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'system.health',
  }, {});
}
