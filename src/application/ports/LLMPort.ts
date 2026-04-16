import type { AIProviderConfig, AIProviderProtocol } from '@/types/settings';

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
  reasoningContent?: string;
}

export interface LLMToolFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolDefinition {
  type: 'function';
  function: LLMToolFunctionDefinition;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type LLMToolChoice = 'auto' | 'none' | 'required' | {
  type: 'function';
  function: { name: string };
};

export interface LLMModelRef {
  providerId: string;
  modelId: string;
}

export interface LLMReasoningOptions {
  enabled?: boolean;
  effort?: 'low' | 'medium' | 'high';
}

export interface LLMStreamObserver {
  onTextDelta?: (delta: string) => void;
  onToolCallDelta?: (toolCall: Partial<LLMToolCall>) => void;
  onDiagnostic?: (diagnostic: string) => void;
}

export interface LLMRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol?: AIProviderProtocol;
  provider?: AIProviderConfig;
  modelRef?: LLMModelRef;
  timeoutMs: number;
  temperature: number;
  responseFormat?: 'json_object';
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  toolChoice?: LLMToolChoice;
  reasoning?: LLMReasoningOptions;
  stream?: boolean;
  observer?: LLMStreamObserver;
}

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
  role?: 'assistant';
  toolCalls?: LLMToolCall[];
  finishReason?: string;
  reasoningContent?: string;
  diagnostics?: string[];
  raw: unknown;
}

export class LLMError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly diagnostic?: string;

  constructor(message: string, options: {
    code: string;
    status?: number;
    retryable?: boolean;
    diagnostic?: string;
  }) {
    super(message);
    this.name = 'LLMError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable === true;
    this.diagnostic = typeof options.diagnostic === 'string' && options.diagnostic.trim().length > 0
      ? options.diagnostic
      : undefined;
  }
}

export interface LLMPort {
  complete?(request: LLMRequest): Promise<LLMResponse>;
  chat(request: LLMRequest): Promise<LLMResponse>;
}
