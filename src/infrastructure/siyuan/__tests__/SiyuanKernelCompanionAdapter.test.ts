import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiyuanKernelCompanionAdapter } from '../SiyuanKernelCompanionAdapter';

const fetchMock = vi.fn();

function mockJsonResponse(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('SiyuanKernelCompanionAdapter', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports running companion status with health details', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        code: 0,
        msg: '',
        data: {
          name: 'siyuan-plugin-siyuanmemo',
          state: 'running',
          methods: [
            { name: 'health', descriptions: ['Return health'] },
            { name: 'version', descriptions: [] },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        jsonrpc: '2.0',
        result: {
          ok: true,
          plugin: 'siyuan-plugin-siyuanmemo',
          version: '0.2.1',
          platform: 'windows',
          uptimeMs: 1234,
        },
        id: 1,
      }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'available',
      pluginName: 'siyuan-plugin-siyuanmemo',
      pluginState: 'running',
      version: '0.2.1',
      platform: 'windows',
      uptimeMs: 1234,
      methods: [
        { name: 'health', descriptions: ['Return health'] },
        { name: 'version', descriptions: [] },
      ],
    });
  });

  it('returns unavailable when plugin is not loaded', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      code: -32001,
      msg: 'Plugin not loaded',
      data: null,
    }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'unavailable',
      pluginName: 'siyuan-plugin-siyuanmemo',
      reason: 'not-loaded',
      message: 'Plugin not loaded',
    });
  });

  it('returns unavailable when plugin is loaded but not running', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      code: 0,
      msg: '',
      data: {
        name: 'siyuan-plugin-siyuanmemo',
        state: 'loaded',
        methods: [{ name: 'health', descriptions: [] }],
      },
    }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'unavailable',
      pluginState: 'loaded',
      reason: 'not-running',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable when loaded-plugin status endpoint fails', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      code: 500,
      msg: 'boom',
      data: null,
    }, false, 500, 'Internal Server Error'));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'http-error',
      message: 'Kernel companion status HTTP error 500: Internal Server Error',
    });
  });

  it('returns unavailable when health RPC fails during status check', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        code: 0,
        msg: '',
        data: {
          name: 'siyuan-plugin-siyuanmemo',
          state: 'running',
          methods: [{ name: 'health', descriptions: [] }],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'boom' },
        id: 1,
      }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'unavailable',
      pluginState: 'running',
      reason: 'rpc-error',
      message: 'Kernel companion RPC error -32603: boom',
    });
  });

  it('uses a JSON-RPC 2.0 envelope for method calls', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      jsonrpc: '2.0',
      result: { ok: true },
      id: 1,
    }));

    const adapter = new SiyuanKernelCompanionAdapter();
    await expect(adapter.call('health', { verbose: true })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugin/rpc/siyuan-plugin-siyuanmemo',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'health',
          params: { verbose: true },
          id: 1,
        }),
      }),
    );
  });

  it('uses empty positional params for parameterless method calls', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      jsonrpc: '2.0',
      result: { ok: true },
      id: 1,
    }));

    const adapter = new SiyuanKernelCompanionAdapter();
    await expect(adapter.call('health')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugin/rpc/siyuan-plugin-siyuanmemo',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'health',
          params: [],
          id: 1,
        }),
      }),
    );
  });

  it('wraps primitive params as positional params', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      jsonrpc: '2.0',
      result: 'ok',
      id: 1,
    }));

    const adapter = new SiyuanKernelCompanionAdapter();
    await expect(adapter.call('echo', 'value')).resolves.toBe('ok');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugin/rpc/siyuan-plugin-siyuanmemo',
      expect.objectContaining({
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'echo',
          params: ['value'],
          id: 1,
        }),
      }),
    );
  });

  it('surfaces JSON-RPC errors as adapter errors', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found' },
      id: 1,
    }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.call('missing')).rejects.toThrow('Kernel companion RPC error -32601: Method not found');
  });

  it('reports fast-path capabilities in status diagnostics', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        code: 0,
        msg: '',
        data: {
          name: 'siyuan-plugin-siyuanmemo',
          state: 'running',
          methods: [{ name: 'health', descriptions: [] }],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        jsonrpc: '2.0',
        result: {
          ok: true,
          plugin: 'siyuan-plugin-siyuanmemo',
          version: '0.2.1',
          platform: 'windows',
        },
        id: 1,
      }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'available',
      capabilities: {
        rpcWebSocketPush: { state: 'available' },
        backendRealWorkerTransport: { state: 'unknown' },
        kernelNetworkProxy: { state: 'unknown' },
        privateHttp: { state: 'unknown' },
        privateSse: { state: 'unknown' },
      },
    });
  });

  it('marks kernel private fast paths available when kernel capabilities expose supported methods', async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        code: 0,
        msg: '',
        data: {
          name: 'siyuan-plugin-siyuanmemo',
          state: 'running',
          methods: [{ name: 'health', descriptions: [] }],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        jsonrpc: '2.0',
        result: {
          ok: true,
          plugin: 'siyuan-plugin-siyuanmemo',
        },
        id: 1,
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        jsonrpc: '2.0',
        result: {
          methods: ['network.fetchExternal'],
          kernelNetworkProxy: true,
          privateHttp: true,
          privateSse: true,
        },
        id: 1,
      }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.getStatus()).resolves.toMatchObject({
      kind: 'available',
      capabilities: {
        kernelNetworkProxy: { state: 'available' },
        privateHttp: { state: 'available' },
        privateSse: { state: 'available' },
      },
    });
  });

  it('opens RPC WebSocket and emits normalized broadcast notifications', async () => {
    const events: unknown[] = [];
    const states: unknown[] = [];
    const sockets: Array<{
      url: string;
      onopen: (() => void) | null;
      onmessage: ((event: { data: string }) => void) | null;
      onclose: (() => void) | null;
      close: () => void;
    }> = [];
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(public readonly url: string) {
        sockets.push(this);
      }
      close = vi.fn(() => {
        this.onclose?.();
      });
    }
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: '6806',
      },
    });
    const adapter = new SiyuanKernelCompanionAdapter();

    const subscription = adapter.subscribeBroadcast({
      onEvent: (event) => events.push(event),
      onStateChange: (state) => states.push(state),
    });

    expect(sockets[0]?.url).toBe('ws://127.0.0.1:6806/ws/plugin/rpc/siyuan-plugin-siyuanmemo');
    sockets[0].onopen?.();
    sockets[0].onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'memo.writer.command',
        params: {
          commandId: 'cmd-1',
          requesterInstanceId: 'follower-1',
          method: 'review.feedback',
          requestedAt: 1,
        },
      }),
    });

    expect(events).toEqual([
      {
        method: 'memo.writer.command',
        params: {
          commandId: 'cmd-1',
          requesterInstanceId: 'follower-1',
          method: 'review.feedback',
          requestedAt: 1,
        },
      },
    ]);
    expect(states).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'connecting' }),
      expect.objectContaining({ state: 'open' }),
    ]));
    subscription.close();
  });

  it('reports push relay unavailable when WebSocket URL cannot be resolved', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('WebSocket', undefined);
    const adapter = new SiyuanKernelCompanionAdapter();

    const subscription = adapter.subscribeBroadcast({
      onEvent: vi.fn(),
      onStateChange: vi.fn(),
    });

    expect(subscription.getDiagnostics()).toMatchObject({
      state: 'unavailable',
      unavailableReason: 'websocket-url-unavailable',
    });
  });
});
