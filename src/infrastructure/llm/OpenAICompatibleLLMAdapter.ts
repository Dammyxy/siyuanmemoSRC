import type {
  LLMMessage,
  LLMPort,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition,
} from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';
import type { AIProviderProtocol } from '@/types/settings';

interface OpenAIChoice {
  text?: string;
  finish_reason?: string;
  message?: {
    content?: unknown;
    parsed?: unknown;
    reasoning_content?: string;
    tool_calls?: LLMToolCall[];
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

type StructuredTransport = 'json_object' | 'prompt_json';

type StructuredRequestProfile = {
  id: string;
  attempts: StructuredTransport[];
};

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function truncateDiagnostic(value: string, limit = 16000): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit)}\n\n...[truncated]`;
}

function stringifyDiagnosticPayload(value: unknown): string {
  if (typeof value === 'string') {
    return truncateDiagnostic(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return truncateDiagnostic(JSON.stringify(value, null, 2));
  } catch {
    return '';
  }
}

function buildRequestDiagnostic(options: {
  endpoint: string;
  model: string;
  protocol?: AIProviderProtocol;
  responseFormat?: 'json_object';
  structuredProfile?: string;
  structuredTransport?: StructuredTransport;
  status?: number;
  payload?: unknown;
  rawText?: string;
  errorMessage?: string;
  attempt?: number;
  totalAttempts?: number;
}): string {
  const body = stringifyDiagnosticPayload(options.payload)
    || truncateDiagnostic(options.rawText || '')
    || '<empty body>';

  return truncateDiagnostic([
    ...(typeof options.attempt === 'number' && typeof options.totalAttempts === 'number'
      ? [`Attempt: ${options.attempt}/${options.totalAttempts}`]
      : []),
    `Endpoint: ${options.endpoint}`,
    `Model: ${options.model}`,
    ...(options.protocol ? [`Protocol: ${options.protocol}`] : []),
    ...(options.responseFormat ? [`Response format: ${options.responseFormat}`] : []),
    ...(options.structuredProfile ? [`Structured profile: ${options.structuredProfile}`] : []),
    ...(options.structuredTransport ? [`Structured transport: ${options.structuredTransport}`] : []),
    ...(typeof options.status === 'number' ? [`HTTP status: ${options.status}`] : []),
    ...(options.errorMessage ? [`Error: ${options.errorMessage}`] : []),
    'Response body:',
    body,
  ].join('\n'));
}

function combineDiagnostics(entries: string[]): string {
  const normalized = entries.map((entry) => truncateDiagnostic(entry)).filter(Boolean);
  if (normalized.length <= 1) {
    return normalized[0] || '';
  }
  return truncateDiagnostic(normalized.join('\n\n--- retry ---\n\n'));
}

function resolveProtocol(request: LLMRequest): AIProviderProtocol {
  return request.provider?.protocol || request.protocol || 'openai-compatible';
}

function isDeepSeekStructuredRetryCandidate(request: LLMRequest): boolean {
  if (request.responseFormat !== 'json_object') {
    return false;
  }
  const normalizedBaseUrl = normalizeBaseUrl(request.baseUrl).toLowerCase();
  const normalizedModel = String(request.model || '').trim().toLowerCase();
  return normalizedBaseUrl.includes('deepseek.com') || normalizedModel.startsWith('deepseek-');
}

function resolveStructuredRequestProfile(request: LLMRequest): StructuredRequestProfile | null {
  if (request.responseFormat !== 'json_object') {
    return null;
  }
  const protocol = resolveProtocol(request);
  if (protocol !== 'openai' && protocol !== 'openai-compatible') {
    return {
      id: `${protocol}-prompt-json`,
      attempts: ['prompt_json'],
    };
  }
  if (request.provider?.capabilities.unstableJsonObject || isDeepSeekStructuredRetryCandidate(request)) {
    return {
      id: 'deepseek-json-object-fallback',
      attempts: ['json_object', 'json_object', 'prompt_json'],
    };
  }
  return {
    id: 'openai-json-object',
    attempts: ['json_object'],
  };
}

function shouldFallbackStructuredTransport(status: number, message?: string): boolean {
  if (![400, 404, 415, 422].includes(status)) {
    return false;
  }
  return /response[_ -]?format|json[_ -]?object|unsupported|not\s+support/i.test(String(message || ''));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyStructuredValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (!value || (typeof value !== 'object' && !Array.isArray(value))) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function extractContentPartText(part: unknown): string {
  if (typeof part === 'string') {
    return part.trim();
  }
  if (!isRecord(part)) {
    return '';
  }

  const type = typeof part.type === 'string' ? part.type : '';
  if (type && type !== 'text' && type !== 'output_text' && type !== 'input_text') {
    return '';
  }

  if (typeof part.text === 'string') {
    return part.text.trim();
  }
  if (isRecord(part.text) && typeof part.text.value === 'string') {
    return part.text.value.trim();
  }
  if (typeof part.content === 'string') {
    return part.content.trim();
  }
  if (typeof part.value === 'string') {
    return part.value.trim();
  }
  return '';
}

function extractMessageContent(
  message: OpenAIChoice['message'],
  fallbackText?: string,
): string {
  if (!message) {
    return String(fallbackText || '').trim();
  }

  if (typeof message.content === 'string') {
    const text = message.content.trim();
    if (text) {
      return text;
    }
  }

  if (Array.isArray(message.content)) {
    const text = message.content
      .map((item) => extractContentPartText(item))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }

  const parsed = stringifyStructuredValue(message.parsed);
  if (parsed) {
    return parsed;
  }

  const structuredContent = stringifyStructuredValue(message.content);
  if (structuredContent) {
    return structuredContent;
  }

  return String(fallbackText || '').trim();
}

function normalizeToolCall(toolCall: unknown): LLMToolCall | null {
  if (!isRecord(toolCall)) {
    return null;
  }
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = typeof fn.name === 'string' ? fn.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    id: String(toolCall.id || `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
    type: 'function',
    function: {
      name,
      arguments: typeof fn.arguments === 'string' ? fn.arguments : stringifyStructuredValue(fn.arguments),
    },
  };
}

function openAIMessage(message: LLMMessage): Record<string, unknown> {
  const base: Record<string, unknown> = {
    role: message.role,
    content: message.content,
  };
  if (message.name) {
    base.name = message.name;
  }
  if (message.role === 'tool' && message.toolCallId) {
    base.tool_call_id = message.toolCallId;
  }
  if (message.toolCalls?.length) {
    base.tool_calls = message.toolCalls;
  }
  if (message.reasoningContent) {
    base.reasoning_content = message.reasoningContent;
  }
  return base;
}

function buildOpenAIRequestBody(request: LLMRequest, transport: StructuredTransport | null): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    temperature: request.temperature,
    response_format: transport === 'json_object' && request.responseFormat
      ? { type: request.responseFormat }
      : undefined,
    messages: request.messages.map(openAIMessage),
    tools: request.tools && request.tools.length > 0 ? request.tools : undefined,
    tool_choice: request.toolChoice,
    stream: request.stream === true ? true : undefined,
  };
  Object.keys(body).forEach((key) => {
    if (body[key] === undefined) {
      delete body[key];
    }
  });
  return body;
}

function appendPromptJsonInstruction(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((message, index) => {
    if (index !== 0 || message.role !== 'system') {
      return message;
    }
    return {
      ...message,
      content: [
        message.content,
        '如果服务端不支持 response_format，请仍然只在正文中返回合法 JSON；不要使用 Markdown 代码块。',
      ].join('\n\n'),
    };
  });
}

export class OpenAICompatibleLLMAdapter implements LLMPort {
  async complete(request: LLMRequest): Promise<LLMResponse> {
    return this.chat(request);
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const protocol = resolveProtocol(request);
    if (protocol === 'claude') {
      return this.chatClaude(request);
    }
    if (protocol === 'gemini') {
      return this.chatGemini(request);
    }
    return this.chatOpenAI(request);
  }

  private async chatOpenAI(request: LLMRequest): Promise<LLMResponse> {
    const endpoint = request.provider?.endpoints?.chatCompletions
      || `${normalizeBaseUrl(request.baseUrl)}/chat/completions`;
    const structuredProfile = resolveStructuredRequestProfile(request);
    const attemptPlan = structuredProfile?.attempts || [null];
    const totalAttempts = attemptPlan.length;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), Math.max(1000, request.timeoutMs));

    try {
      const attemptDiagnostics: string[] = [];
      for (let attemptIndex = 0; attemptIndex < attemptPlan.length; attemptIndex += 1) {
        const transport = attemptPlan[attemptIndex];
        const attempt = attemptIndex + 1;
        const requestForAttempt = transport === 'prompt_json'
          ? { ...request, messages: appendPromptJsonInstruction(request.messages), responseFormat: undefined }
          : request;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${request.apiKey}`,
          },
          body: JSON.stringify(buildOpenAIRequestBody(requestForAttempt, transport)),
          signal: controller.signal,
        });

        let rawText = '';
        try {
          rawText = await response.text();
        } catch {
          rawText = '';
        }

        let payload: OpenAICompletionResponse | null = null;
        try {
          payload = rawText.trim()
            ? JSON.parse(rawText) as OpenAICompletionResponse
            : null;
        } catch {
          payload = null;
        }

        const diagnostic = buildRequestDiagnostic({
          endpoint,
          model: request.model,
          protocol: resolveProtocol(request),
          responseFormat: request.responseFormat,
          structuredProfile: structuredProfile?.id,
          structuredTransport: transport || undefined,
          status: response.status,
          payload,
          rawText,
          attempt,
          totalAttempts,
        });

        const combinedDiagnostic = combineDiagnostics([...attemptDiagnostics, diagnostic]);

        if (!response.ok) {
          const message = payload?.error?.message || `LLM request failed with status ${response.status}`;
          if (
            transport === 'json_object'
            && attempt < totalAttempts
            && shouldFallbackStructuredTransport(response.status, message)
          ) {
            attemptDiagnostics.push(diagnostic);
            while (attemptIndex + 1 < attemptPlan.length && attemptPlan[attemptIndex + 1] === transport) {
              attemptIndex += 1;
            }
            continue;
          }
          throw this.httpError(response.status, message, combinedDiagnostic);
        }

        const firstChoice = payload?.choices?.[0];
        const toolCalls = (firstChoice?.message?.tool_calls || [])
          .map((toolCall) => normalizeToolCall(toolCall))
          .filter((toolCall): toolCall is LLMToolCall => Boolean(toolCall));
        const content = extractMessageContent(firstChoice?.message, firstChoice?.text);
        if (!content && toolCalls.length === 0) {
          if (transport === 'json_object' && attempt < totalAttempts) {
            attemptDiagnostics.push(diagnostic);
            continue;
          }
          throw new LLMError('LLM returned an empty completion', {
            code: 'empty_response',
            diagnostic: combinedDiagnostic,
          });
        }

        request.observer?.onTextDelta?.(content);
        return {
          role: 'assistant',
          content,
          toolCalls,
          finishReason: firstChoice?.finish_reason,
          reasoningContent: firstChoice?.message?.reasoning_content,
          usage: {
            promptTokens: payload?.usage?.prompt_tokens,
            completionTokens: payload?.usage?.completion_tokens,
            totalTokens: payload?.usage?.total_tokens,
          },
          diagnostics: [diagnostic],
          raw: payload,
        };
      }

      throw new LLMError('LLM returned an empty completion', {
        code: 'empty_response',
        diagnostic: buildRequestDiagnostic({
          endpoint,
          model: request.model,
          protocol: resolveProtocol(request),
          responseFormat: request.responseFormat,
          structuredProfile: structuredProfile?.id,
          structuredTransport: structuredProfile?.attempts.at(-1),
          errorMessage: 'Retry loop exited without a completion.',
          attempt: totalAttempts,
          totalAttempts,
        }),
      });
    } catch (error) {
      throw this.normalizeThrownError(error, {
        endpoint,
        model: request.model,
        protocol: resolveProtocol(request),
        responseFormat: request.responseFormat,
        structuredProfile: structuredProfile?.id,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async chatClaude(request: LLMRequest): Promise<LLMResponse> {
    const endpoint = request.provider?.endpoints?.messages
      || `${normalizeBaseUrl(request.baseUrl || 'https://api.anthropic.com/v1')}/messages`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), Math.max(1000, request.timeoutMs));
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: message.toolCallId || message.name || 'tool',
              content: message.content,
            }],
          };
        }
        return {
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.toolCalls?.length
            ? [
              ...(message.content ? [{ type: 'text', text: message.content }] : []),
              ...message.toolCalls.map((call) => ({
                type: 'tool_use',
                id: call.id,
                name: call.function.name,
                input: safeJsonParse(call.function.arguments),
              })),
            ]
            : message.content,
        };
      });
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: 4096,
      temperature: request.temperature,
      system: system || undefined,
      messages,
      tools: request.tools?.map(toClaudeTool),
      tool_choice: request.tools?.length ? { type: 'auto' } : undefined,
    };
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) {
        delete body[key];
      }
    });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': request.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await this.parseClaudeResponse(response, request, endpoint);
    } catch (error) {
      throw this.normalizeThrownError(error, {
        endpoint,
        model: request.model,
        protocol: 'claude',
        responseFormat: request.responseFormat,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async chatGemini(request: LLMRequest): Promise<LLMResponse> {
    const base = normalizeBaseUrl(request.baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
    const endpoint = request.provider?.endpoints?.generateContent
      || `${base}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), Math.max(1000, request.timeoutMs));
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const contents = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: message.toolCalls?.length
          ? message.toolCalls.map((call) => ({
            functionCall: {
              name: call.function.name,
              args: safeJsonParse(call.function.arguments),
            },
          }))
          : [{ text: message.content }],
      }));
    const body: Record<string, unknown> = {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: {
        temperature: request.temperature,
        responseMimeType: request.responseFormat === 'json_object' ? 'application/json' : undefined,
      },
      tools: request.tools?.length ? [{ functionDeclarations: request.tools.map(toGeminiTool) }] : undefined,
    };
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await this.parseGeminiResponse(response, request, endpoint);
    } catch (error) {
      throw this.normalizeThrownError(error, {
        endpoint,
        model: request.model,
        protocol: 'gemini',
        responseFormat: request.responseFormat,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async parseClaudeResponse(response: Response, request: LLMRequest, endpoint: string): Promise<LLMResponse> {
    const rawText = await response.text().catch(() => '');
    const payload = rawText.trim() ? safeJsonParse(rawText) as Record<string, unknown> : null;
    const diagnostic = buildRequestDiagnostic({
      endpoint,
      model: request.model,
      protocol: 'claude',
      responseFormat: request.responseFormat,
      status: response.status,
      payload,
      rawText,
    });
    if (!response.ok) {
      const error = isRecord(payload?.error) ? payload.error : {};
      throw this.httpError(response.status, String(error.message || `Claude request failed with status ${response.status}`), diagnostic);
    }
    const contentParts = Array.isArray(payload?.content) ? payload.content : [];
    const text = contentParts
      .filter(isRecord)
      .filter((part) => part.type === 'text')
      .map((part) => String(part.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    const toolCalls = contentParts
      .filter(isRecord)
      .filter((part) => part.type === 'tool_use')
      .map((part): LLMToolCall | null => {
        const name = String(part.name || '').trim();
        if (!name) {
          return null;
        }
        return {
          id: String(part.id || `tool-${Date.now().toString(36)}`),
          type: 'function',
          function: {
            name,
            arguments: stringifyStructuredValue(part.input || {}),
          },
        };
      })
      .filter((call): call is LLMToolCall => Boolean(call));
    if (!text && toolCalls.length === 0) {
      throw new LLMError('LLM returned an empty completion', {
        code: 'empty_response',
        diagnostic,
      });
    }
    request.observer?.onTextDelta?.(text);
    const usage = isRecord(payload?.usage) ? payload.usage : {};
    return {
      role: 'assistant',
      content: text,
      toolCalls,
      finishReason: String(payload?.stop_reason || ''),
      usage: {
        promptTokens: Number(usage.input_tokens) || undefined,
        completionTokens: Number(usage.output_tokens) || undefined,
        totalTokens: (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0) || undefined,
      },
      diagnostics: [diagnostic],
      raw: payload,
    };
  }

  private async parseGeminiResponse(response: Response, request: LLMRequest, endpoint: string): Promise<LLMResponse> {
    const rawText = await response.text().catch(() => '');
    const payload = rawText.trim() ? safeJsonParse(rawText) as Record<string, unknown> : null;
    const diagnostic = buildRequestDiagnostic({
      endpoint,
      model: request.model,
      protocol: 'gemini',
      responseFormat: request.responseFormat,
      status: response.status,
      payload,
      rawText,
    });
    if (!response.ok) {
      const error = isRecord(payload?.error) ? payload.error : {};
      throw this.httpError(response.status, String(error.message || `Gemini request failed with status ${response.status}`), diagnostic);
    }
    const candidate = Array.isArray(payload?.candidates) && isRecord(payload.candidates[0])
      ? payload.candidates[0]
      : {};
    const content = isRecord(candidate.content) ? candidate.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .filter(isRecord)
      .map((part) => String(part.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    const toolCalls = parts
      .filter(isRecord)
      .map((part): LLMToolCall | null => {
        const call = isRecord(part.functionCall) ? part.functionCall : null;
        const name = String(call?.name || '').trim();
        if (!name) {
          return null;
        }
        return {
          id: `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'function',
          function: {
            name,
            arguments: stringifyStructuredValue(call?.args || {}),
          },
        };
      })
      .filter((call): call is LLMToolCall => Boolean(call));
    if (!text && toolCalls.length === 0) {
      throw new LLMError('LLM returned an empty completion', {
        code: 'empty_response',
        diagnostic,
      });
    }
    request.observer?.onTextDelta?.(text);
    const usage = isRecord(payload?.usageMetadata) ? payload.usageMetadata : {};
    return {
      role: 'assistant',
      content: text,
      toolCalls,
      finishReason: String(candidate.finishReason || ''),
      usage: {
        promptTokens: Number(usage.promptTokenCount) || undefined,
        completionTokens: Number(usage.candidatesTokenCount) || undefined,
        totalTokens: Number(usage.totalTokenCount) || undefined,
      },
      diagnostics: [diagnostic],
      raw: payload,
    };
  }

  private httpError(status: number, message: string, diagnostic: string): LLMError {
    if (status === 401) {
      return new LLMError(message, { code: 'unauthorized', status, diagnostic });
    }
    if (status === 429) {
      return new LLMError(message, { code: 'rate_limited', status, retryable: true, diagnostic });
    }
    return new LLMError(message, {
      code: 'http_error',
      status,
      retryable: status >= 500,
      diagnostic,
    });
  }

  private normalizeThrownError(error: unknown, options: {
    endpoint: string;
    model: string;
    protocol: AIProviderProtocol;
    responseFormat?: 'json_object';
    structuredProfile?: string;
  }): Error {
    if (error instanceof LLMError) {
      return error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new LLMError('LLM request timed out', {
        code: 'timeout',
        retryable: true,
        diagnostic: buildRequestDiagnostic({
          ...options,
          errorMessage: 'Request aborted by timeout.',
        }),
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return new LLMError(message, {
      code: 'network_error',
      retryable: true,
      diagnostic: buildRequestDiagnostic({
        ...options,
        errorMessage: message,
      }),
    });
  }
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toClaudeTool(tool: LLMToolDefinition): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  };
}

function toGeminiTool(tool: LLMToolDefinition): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  };
}
