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
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Response;
}

function mockTextResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function mockStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    text: vi.fn().mockResolvedValue(chunks.join('')),
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

  it('streams incremental OpenAI-compatible deltas through the observer', async () => {
    const textDeltas: string[] = [];
    const reasoningDeltas: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStreamResponse([
        'data: {"choices":[{"delta":{"content":"hello ","reasoning_content":"step 1"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"world","reasoning_content":"step 2"}}],"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}\n\n',
        'data: [DONE]\n\n',
      ]),
    ));

    const result = await adapter.chat({
      ...BASE_REQUEST,
      stream: true,
      observer: {
        onTextDelta: (delta) => textDeltas.push(delta),
        onReasoningDelta: (delta) => reasoningDeltas.push(delta),
      },
    });

    expect(result.content).toBe('hello world');
    expect(result.reasoningContent).toBe('step 1step 2');
    expect(result.usage).toEqual({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
    });
    expect(textDeltas).toEqual(['hello ', 'world']);
    expect(reasoningDeltas).toEqual(['step 1', 'step 2']);
  });

  it('passes json_object response_format when the caller requests structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await adapter.chat({
      ...BASE_REQUEST,
      responseFormat: 'json_object',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'test-model',
      response_format: {
        type: 'json_object',
      },
    });
  });

  it('resolves relative OpenAI-compatible endpoints against provider baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{ message: { content: 'hello world' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await adapter.chat({
      ...BASE_REQUEST,
      baseUrl: 'https://api.deepseek.com/v1',
      provider: {
        id: 'deepseek',
        name: 'DeepSeek',
        protocol: 'openai-compatible',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'test-key',
        endpoints: {
          chatCompletions: '/chat/completions',
        },
        models: [{ id: 'deepseek-chat' }],
        capabilities: {},
      },
      model: 'deepseek-chat',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.any(Object),
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

  it('accepts output_text content parts from OpenAI-compatible providers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{
          message: {
            content: [
              { type: 'output_text', text: { value: '{"ok":true}' } },
            ],
          },
        }],
      }),
    ));

    const result = await adapter.chat(BASE_REQUEST);

    expect(result.content).toBe('{"ok":true}');
  });

  it('stringifies object content returned by json_object-compatible providers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{
          message: {
            content: {
              workingDefinition: 'Definition A',
              triggers: ['Trigger A'],
            },
          },
        }],
      }),
    ));

    const result = await adapter.chat(BASE_REQUEST);

    expect(result.content).toBe(JSON.stringify({
      workingDefinition: 'Definition A',
      triggers: ['Trigger A'],
    }));
  });

  it('falls back to parsed structured payloads when content is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{
          message: {
            content: '',
            parsed: {
              whatItTests: 'Test A',
            },
          },
        }],
      }),
    ));

    const result = await adapter.chat(BASE_REQUEST);

    expect(result.content).toBe(JSON.stringify({
      whatItTests: 'Test A',
    }));
  });

  it('falls back to legacy text completions when message.content is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({
        choices: [{
          text: 'legacy completion text',
        }],
      }),
    ));

    const result = await adapter.chat(BASE_REQUEST);

    expect(result.content).toBe('legacy completion text');
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

  it('includes the raw response payload in empty_response diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockTextResponse('<html><body>proxy placeholder</body></html>'),
    ));

    await expect(adapter.chat(BASE_REQUEST)).rejects.toMatchObject({
      code: 'empty_response',
      diagnostic: expect.stringContaining('<html><body>proxy placeholder</body></html>'),
    });
  });

  it('retries once for DeepSeek structured requests when a 200 response has an empty body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockTextResponse(''))
      .mockResolvedValueOnce(mockJsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.chat({
      ...BASE_REQUEST,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      responseFormat: 'json_object',
    });

    expect(result.content).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to prompt_json transport when DeepSeek rejects response_format', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        error: { message: 'response_format json_object is not supported' },
      }, 422))
      .mockResolvedValueOnce(mockJsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.chat({
      ...BASE_REQUEST,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      responseFormat: 'json_object',
    });

    expect(result.content).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(firstInit.body))).toMatchObject({
      response_format: { type: 'json_object' },
    });
    expect(JSON.parse(String(secondInit.body))).not.toHaveProperty('response_format');
  });

  it('does not retry empty-body completions for non-DeepSeek providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockTextResponse(''));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.chat({
      ...BASE_REQUEST,
      responseFormat: 'json_object',
    })).rejects.toMatchObject({
      code: 'empty_response',
      diagnostic: expect.stringContaining('Attempt: 1/1'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes all structured attempts in diagnostics when the DeepSeek empty-body retry and prompt fallback both fail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockTextResponse(''))
      .mockResolvedValueOnce(mockTextResponse(''))
      .mockResolvedValueOnce(mockTextResponse(''));
    vi.stubGlobal('fetch', fetchMock);

    let caught: unknown;
    try {
      await adapter.chat({
        ...BASE_REQUEST,
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        responseFormat: 'json_object',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: 'empty_response',
      diagnostic: expect.stringContaining('Attempt: 1/3'),
    });
    expect((caught as { diagnostic?: string }).diagnostic).toContain('Attempt: 2/3');
    expect((caught as { diagnostic?: string }).diagnostic).toContain('Attempt: 3/3');
    expect((caught as { diagnostic?: string }).diagnostic).toContain('Structured profile: deepseek-json-object-fallback');
    expect((caught as { diagnostic?: string }).diagnostic).toContain('Structured transport: prompt_json');
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

  it('resolves relative Gemini endpoints against baseUrl and fills the model placeholder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        candidates: [{
          content: {
            parts: [{ text: 'gemini ok' }],
          },
        }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.chat({
      ...BASE_REQUEST,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
      protocol: 'gemini',
      provider: {
        id: 'gemini',
        name: 'Gemini',
        protocol: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'test-key',
        endpoints: {
          generateContent: '/models/{model}:generateContent',
        },
        models: [{ id: 'gemini-2.5-flash' }],
        capabilities: {},
      },
    });

    expect(result.content).toBe('gemini ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-key',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'test-key',
        }),
      }),
    );
  });
});
