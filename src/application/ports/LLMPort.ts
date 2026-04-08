export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  messages: LLMMessage[];
}

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  raw: unknown;
}

export class LLMError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: {
    code: string;
    status?: number;
    retryable?: boolean;
  }) {
    super(message);
    this.name = 'LLMError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable === true;
  }
}

export interface LLMPort {
  chat(request: LLMRequest): Promise<LLMResponse>;
}
