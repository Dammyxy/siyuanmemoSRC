import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendAINetworkProxyAdapter } from '@/infrastructure/ai/BackendAINetworkProxyAdapter';

describe('BackendAINetworkProxyAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts configured secret keys in response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"apiKey":"secret-value"}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })));
    const adapter = new BackendAINetworkProxyAdapter();

    const response = await adapter.execute({
      url: 'https://example.com',
      redactionKeys: ['apiKey'],
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('***REDACTED***');
    expect(response.body).not.toContain('secret-value');
  });

  it('redacts bearer token when transport throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Authorization: Bearer abc123xyz');
    }));
    const adapter = new BackendAINetworkProxyAdapter();

    await expect(adapter.execute({
      url: 'https://example.com',
      redactionKeys: ['apiKey'],
    })).rejects.toThrow('BACKEND_UNAVAILABLE: ai network proxy unavailable (Authorization: Bearer ***REDACTED***)');
  });
});
