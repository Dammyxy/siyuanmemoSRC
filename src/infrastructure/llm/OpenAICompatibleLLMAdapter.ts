import type { LLMPort, LLMRequest, LLMResponse } from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';

interface OpenAIChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

interface OpenAICompletionResponse {
  choices?: OpenAIChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function extractMessageContent(value: OpenAIChoice['message']): string {
  if (!value) {
    return '';
  }
  if (typeof value.content === 'string') {
    return value.content;
  }
  if (Array.isArray(value.content)) {
    return value.content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text || '')
      .join('\n')
      .trim();
  }
  return '';
}

export class OpenAICompatibleLLMAdapter implements LLMPort {
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), Math.max(1000, request.timeoutMs));

    try {
      const response = await fetch(`${normalizeBaseUrl(request.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature,
          messages: request.messages,
        }),
        signal: controller.signal,
      });

      let payload: OpenAICompletionResponse | null = null;
      try {
        payload = await response.json() as OpenAICompletionResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = payload?.error?.message || `LLM request failed with status ${response.status}`;
        if (response.status === 401) {
          throw new LLMError(message, { code: 'unauthorized', status: response.status });
        }
        if (response.status === 429) {
          throw new LLMError(message, { code: 'rate_limited', status: response.status, retryable: true });
        }
        throw new LLMError(message, {
          code: 'http_error',
          status: response.status,
          retryable: response.status >= 500,
        });
      }

      const content = extractMessageContent(payload?.choices?.[0]?.message);
      if (!content) {
        throw new LLMError('LLM returned an empty completion', { code: 'empty_response' });
      }

      return {
        content,
        usage: {
          promptTokens: payload?.usage?.prompt_tokens,
          completionTokens: payload?.usage?.completion_tokens,
          totalTokens: payload?.usage?.total_tokens,
        },
        raw: payload,
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LLMError('LLM request timed out', { code: 'timeout', retryable: true });
      }
      throw new LLMError(
        error instanceof Error ? error.message : String(error),
        { code: 'network_error', retryable: true },
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}
