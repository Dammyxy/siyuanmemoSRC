import { describe, expect, it, vi } from 'vitest';
import { KernelAINetworkProxyAdapter } from '@/infrastructure/ai/KernelAINetworkProxyAdapter';

describe('KernelAINetworkProxyAdapter', () => {
  it('routes provider requests through kernel network.fetchExternal and redacts response body secrets', async () => {
    const networkFetchExternal = vi.fn(async () => ({
      requestId: 'request-1',
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"apiKey":"secret","ok":true}',
    }));
    const adapter = new KernelAINetworkProxyAdapter({
      getStatus: vi.fn(async () => ({
        kind: 'available',
        checkedAt: 1,
        pluginName: 'siyuan-plugin-siyuanmemo',
        methods: [],
      })),
      networkFetchExternal,
      networkStreamExternal: vi.fn(),
      subscribeAiStream: vi.fn(),
    });

    const result = await adapter.execute({
      url: 'https://provider.test/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: '{"prompt":"hello"}',
      redactionKeys: ['apiKey'],
    });

    expect(networkFetchExternal).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://provider.test/v1/chat/completions',
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: '{"prompt":"hello"}',
    }));
    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"apiKey":"***REDACTED***","ok":true}',
    });
  });

  it('fails closed with KERNEL_SIDECAR_UNAVAILABLE when sidecar status is unavailable', async () => {
    const adapter = new KernelAINetworkProxyAdapter({
      getStatus: vi.fn(async () => ({
        kind: 'unavailable',
        checkedAt: 1,
        pluginName: 'siyuan-plugin-siyuanmemo',
        methods: [],
        reason: 'not-running',
        message: 'Plugin state is loading',
      })),
      networkFetchExternal: vi.fn(),
      networkStreamExternal: vi.fn(),
      subscribeAiStream: vi.fn(),
    });

    await expect(adapter.execute({
      url: 'https://provider.test/v1/chat/completions',
    })).rejects.toThrow('KERNEL_SIDECAR_UNAVAILABLE');
  });

  it('preserves timeout failures from kernel network proxy', async () => {
    const adapter = new KernelAINetworkProxyAdapter({
      getStatus: vi.fn(async () => ({
        kind: 'available',
        checkedAt: 1,
        pluginName: 'siyuan-plugin-siyuanmemo',
        methods: [],
      })),
      networkFetchExternal: vi.fn(async () => {
        throw new Error('TIMEOUT: network.fetchExternal request timed out');
      }),
      networkStreamExternal: vi.fn(),
      subscribeAiStream: vi.fn(),
    });

    await expect(adapter.execute({
      url: 'https://provider.test/v1/chat/completions',
    })).rejects.toThrow('TIMEOUT: network.fetchExternal request timed out');
  });

  it('streams token deltas through kernel network SSE and resolves final response', async () => {
    let streamHandlers: Parameters<KernelAINetworkProxyAdapter['subscribeStream']>[1] | null = null;
    const close = vi.fn();
    const networkStreamExternal = vi.fn(async () => {
      streamHandlers?.onEvent({
        type: 'token',
        streamId: 'stream-1',
        text: 'hel',
        emittedAt: 1,
      });
      streamHandlers?.onEvent({
        type: 'final',
        streamId: 'stream-1',
        final: {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          body: '{"apiKey":"secret","text":"hello"}',
        },
        emittedAt: 2,
      });
      return {
        requestId: 'request-stream-1',
        streamId: 'stream-1',
        state: 'started' as const,
        privateSsePath: '/plugin/private/siyuan-plugin-siyuanmemo/ai/stream/stream-1',
        startedAt: 1,
      };
    });
    const adapter = new KernelAINetworkProxyAdapter({
      getStatus: vi.fn(async () => ({
        kind: 'available',
        checkedAt: 1,
        pluginName: 'siyuan-plugin-siyuanmemo',
        methods: [],
      })),
      networkFetchExternal: vi.fn(),
      networkStreamExternal,
      subscribeAiStream: vi.fn((_streamId, handlers) => {
        streamHandlers = handlers;
        return { close };
      }),
    });
    const onStreamEvent = vi.fn();

    const result = await adapter.execute({
      url: 'https://provider.test/events',
      method: 'GET',
      stream: true,
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
      redactionKeys: ['apiKey'],
      onStreamEvent,
    });

    expect(networkStreamExternal).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
      url: 'https://provider.test/events',
      method: 'GET',
    }));
    expect(onStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'token',
      text: 'hel',
    }));
    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: '{"apiKey":"***REDACTED***","text":"hello"}',
    });
    expect(close).toHaveBeenCalled();
  });

  it('fails closed for unsupported streaming requests instead of falling back to whole-response fetch', async () => {
    const networkFetchExternal = vi.fn();
    const networkStreamExternal = vi.fn();
    const adapter = new KernelAINetworkProxyAdapter({
      getStatus: vi.fn(async () => ({
        kind: 'available',
        checkedAt: 1,
        pluginName: 'siyuan-plugin-siyuanmemo',
        methods: [],
      })),
      networkFetchExternal,
      networkStreamExternal,
      subscribeAiStream: vi.fn(),
    });

    await expect(adapter.execute({
      url: 'https://provider.test/v1/chat/completions',
      method: 'POST',
      body: '{"stream":true}',
      stream: true,
      streamId: 'stream-post',
    })).rejects.toThrow('KERNEL_SIDECAR_UNAVAILABLE: ai streaming unsupported');

    expect(networkFetchExternal).not.toHaveBeenCalled();
    expect(networkStreamExternal).not.toHaveBeenCalled();
  });
});
