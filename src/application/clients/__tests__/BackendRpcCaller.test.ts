import { describe, expect, it, vi } from 'vitest';
import { BACKEND_RPC_VERSION } from '../../../../packages/contracts/src/backend-rpc';
import { BackendRpcCaller, type SrsBackendTransport } from '../backend/BackendRpcCaller';

describe('BackendRpcCaller', () => {
  it('builds backend JSON-RPC envelopes with shared request ids and params wrapping', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: BACKEND_RPC_VERSION,
        id: request.id,
        result: { method: request.method, params: request.params },
      })),
    };
    const caller = new BackendRpcCaller(transport);

    await expect(caller.call('system.health')).resolves.toEqual({
      method: 'system.health',
      params: [],
    });
    await expect(caller.call('browser.count', { query: null })).resolves.toEqual({
      method: 'browser.count',
      params: [{ query: null }],
    });

    expect(transport.request).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 1,
      method: 'system.health',
      params: [],
    });
    expect(transport.request).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 2,
      method: 'browser.count',
      params: [{ query: null }],
    });
  });

  it('propagates backend RPC errors without hiding unavailability', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: BACKEND_RPC_VERSION,
        id: request.id,
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'worker offline',
        },
      })),
    };
    const caller = new BackendRpcCaller(transport);

    await expect(caller.call('db.load')).rejects.toThrow('BACKEND_UNAVAILABLE: worker offline');
  });
});
