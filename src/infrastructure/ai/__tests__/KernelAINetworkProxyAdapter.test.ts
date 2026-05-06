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
    });

    await expect(adapter.execute({
      url: 'https://provider.test/v1/chat/completions',
    })).rejects.toThrow('TIMEOUT: network.fetchExternal request timed out');
  });
});
