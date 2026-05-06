import type {
  AINetworkProxyPort,
  AINetworkProxyRequest,
  AINetworkProxyResponse,
} from '@/application/ports/AINetworkProxyPort';
import type { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import type { KernelAiStreamEvent } from '../../../packages/contracts/src/kernel-rpc';

type KernelNetworkClient = Pick<
  KernelSidecarClient,
  'getStatus' | 'networkFetchExternal' | 'networkStreamExternal' | 'subscribeAiStream'
>;

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeHeaderRecord(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers || typeof headers !== 'object') {
    return result;
  }
  const iterable = headers as { entries?: () => IterableIterator<[unknown, unknown]> };
  if (typeof iterable.entries === 'function') {
    for (const [key, value] of iterable.entries()) {
      const name = normalizeString(key);
      if (name) {
        result[name] = String(value ?? '');
      }
    }
    return result;
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    const name = normalizeString(key);
    if (!name || typeof value === 'undefined' || value === null) {
      continue;
    }
    result[name] = Array.isArray(value)
      ? value.map((item) => String(item)).join(', ')
      : String(value);
  }
  return result;
}

function redactSecrets(raw: string, redactionKeys: string[]): string {
  let output = String(raw || '');
  for (const key of redactionKeys) {
    const normalized = normalizeString(key);
    if (!normalized) {
      continue;
    }
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const valuePattern = new RegExp(`("${escaped}"\\s*:\\s*")[^"]*(")`, 'gi');
    output = output.replace(valuePattern, '$1***REDACTED***$2');
  }
  output = output.replace(/(Authorization\s*:\s*Bearer\s+)[^\s"']+/gi, '$1***REDACTED***');
  return output;
}

function toUnavailableError(error: unknown, redactionKeys: string[]): Error {
  const message = redactSecrets(error instanceof Error ? error.message : String(error || 'unknown error'), redactionKeys);
  if (message.startsWith('TIMEOUT:')) {
    return new Error(message);
  }
  if (/timeout/i.test(message)) {
    return new Error(`TIMEOUT: ai network proxy request timed out (${message})`);
  }
  if (message.startsWith('KERNEL_SIDECAR_UNAVAILABLE:')) {
    return new Error(message);
  }
  return new Error(`KERNEL_SIDECAR_UNAVAILABLE: ai network proxy sidecar unavailable (${message})`);
}

export class KernelAINetworkProxyAdapter implements AINetworkProxyPort {
  constructor(private readonly client: KernelNetworkClient) {}

  async execute(request: AINetworkProxyRequest): Promise<AINetworkProxyResponse> {
    const url = normalizeString(request.url);
    if (!url) {
      throw new Error('INVALID_REQUEST: ai network proxy requires url');
    }
    const redactionKeys = request.redactionKeys || [];
    const timeoutMs = Math.max(500, Math.floor(Number(request.timeoutMs || 15_000)));
    try {
      const status = await this.client.getStatus();
      if (status.kind !== 'available') {
        throw new Error(status.message || `kernel companion is ${status.reason}`);
      }
      if (request.stream === true) {
        return await this.executeStreaming({
          ...request,
          url,
          timeoutMs,
        }, redactionKeys);
      }
      const response = await this.client.networkFetchExternal({
        requestId: `ai-network-${Date.now().toString(36)}`,
        url,
        method: request.method || 'GET',
        headers: request.headers,
        body: request.body,
        timeoutMs,
      });
      return {
        status: response.status,
        headers: normalizeHeaderRecord(response.headers),
        body: redactSecrets(response.body, redactionKeys),
      };
    } catch (error) {
      throw toUnavailableError(error, redactionKeys);
    }
  }

  subscribeStream(
    streamId: string,
    handlers: {
      onEvent(event: KernelAiStreamEvent): void;
      onError?(error: Error): void;
      onClose?(): void;
    },
  ): { close(): void } {
    const subscription = this.client.subscribeAiStream(streamId, handlers);
    if (!subscription) {
      handlers.onError?.(new Error('KERNEL_SIDECAR_UNAVAILABLE: private AI stream SSE is unavailable'));
      return { close: () => undefined };
    }
    return subscription;
  }

  private async executeStreaming(
    request: AINetworkProxyRequest & { url: string; timeoutMs: number },
    redactionKeys: string[],
  ): Promise<AINetworkProxyResponse> {
    const streamId = normalizeString(request.streamId);
    if (!streamId) {
      throw new Error('KERNEL_SIDECAR_UNAVAILABLE: ai streaming requires streamId');
    }
    if (normalizeString(request.method || 'GET').toUpperCase() !== 'GET' || request.body != null) {
      throw new Error('KERNEL_SIDECAR_UNAVAILABLE: ai streaming unsupported by kernel SSE proxy for non-GET/body requests');
    }

    let finalEvent: KernelAiStreamEvent | null = null;
    let terminalError: Error | null = null;
    let streamSubscription: { close(): void } = { close: () => undefined };
    const terminal = new Promise<KernelAiStreamEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`TIMEOUT: ai streaming request timed out (${request.timeoutMs}ms)`));
      }, request.timeoutMs);
      streamSubscription = this.subscribeStream(streamId, {
        onEvent: (event) => {
          request.onStreamEvent?.(event);
          if (event.type === 'final') {
            finalEvent = event;
            clearTimeout(timeout);
            streamSubscription.close();
            resolve(event);
          }
          if (event.type === 'error' || event.type === 'timeout' || event.type === 'canceled') {
            terminalError = new Error(`${event.error?.code || event.type.toUpperCase()}: ${event.error?.message || event.type}`);
            clearTimeout(timeout);
            streamSubscription.close();
            reject(terminalError);
          }
        },
        onError: (error) => {
          terminalError = error;
          clearTimeout(timeout);
          streamSubscription.close();
          reject(error);
        },
      });
    });

    let started;
    try {
      started = await this.client.networkStreamExternal({
        requestId: `ai-stream-${Date.now().toString(36)}`,
        streamId,
        sessionId: request.sessionId,
        jobId: request.jobId,
        url: request.url,
        method: request.method || 'GET',
        headers: request.headers,
        timeoutMs: request.timeoutMs,
      });
    } catch (error) {
      streamSubscription.close();
      terminal.catch(() => undefined);
      throw error;
    }
    if (started.state !== 'started') {
      streamSubscription.close();
      terminal.catch(() => undefined);
      throw new Error(`KERNEL_SIDECAR_UNAVAILABLE: ai streaming unavailable (${started.unavailableReason || 'unknown'}) ${started.message || ''}`.trim());
    }

    let event: KernelAiStreamEvent;
    try {
      event = finalEvent ?? await terminal;
    } catch (error) {
      streamSubscription.close();
      throw error;
    }
    if (!event.final) {
      throw terminalError || new Error('KERNEL_SIDECAR_UNAVAILABLE: ai streaming finished without final response');
    }
    return {
      status: event.final.status,
      headers: normalizeHeaderRecord(event.final.headers),
      body: redactSecrets(event.final.body || '', redactionKeys),
    };
  }
}
