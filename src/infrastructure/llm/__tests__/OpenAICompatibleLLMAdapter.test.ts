import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMRequest } from '@/application/ports/LLMPort';
import { OpenAICompatibleLLMAdapter } from '../OpenAICompatibleLLMAdapter';

const BASE_REQUEST: LLMRequest = {
  baseUrl: 'https://example.test/v1/',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 1000,
  temperature: 0.2,
  messages: [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'user prompt' },
  ],
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('OpenAICompatibleLLMAdapter', () => {
  const adapter = new OpenAICompatibleLLMAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('extracts plain string content and usage from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{ message: { content: 'hello world' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    ));

    const result = await adapter.chat(BASE_REQUEST);

    expect(result.content).toBe('hello world');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('extracts text parts from array-based content payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{
          message: {
            content: [
              { type: 'text', text: 'line 1' },
              { type: 'image', text: 'ignored' },
              { type: 'text', text: 'line 2' },
            ],
          },
        }],
      }),
    ));

    const result = await adapter.chat(BASE_REQUEST);

    expect(result.content).toBe('line 1\nline 2');
  });

  it('maps 401 responses to unauthorized errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        error: { message: 'bad key' },
      }, 401),
    ));

    await expect(adapter.chat(BASE_REQUEST)).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
      message: 'bad key',
    });
  });

  it('maps 429 responses to retryable rate limit errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        error: { message: 'slow down' },
      }, 429),
    ));

    await expect(adapter.chat(BASE_REQUEST)).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
      retryable: true,
      message: 'slow down',
    });
  });

  it('throws empty_response when the completion has no text content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{ message: { content: '' } }],
      }),
    ));

    await expect(adapter.chat(BASE_REQUEST)).rejects.toMatchObject({
      code: 'empty_response',
    });
  });

  it('maps aborted fetches to timeout errors', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }));

    const expectation = expect(adapter.chat(BASE_REQUEST)).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });
});
