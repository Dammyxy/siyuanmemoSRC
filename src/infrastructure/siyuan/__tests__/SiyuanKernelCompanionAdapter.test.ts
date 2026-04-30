import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('surfaces JSON-RPC errors as adapter errors', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found' },
      id: 1,
    }));

    const adapter = new SiyuanKernelCompanionAdapter();

    await expect(adapter.call('missing')).rejects.toThrow('Kernel companion RPC error -32601: Method not found');
  });
});
