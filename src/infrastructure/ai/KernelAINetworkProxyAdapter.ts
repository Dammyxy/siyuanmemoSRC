import type {
  AINetworkProxyPort,
  AINetworkProxyRequest,
  AINetworkProxyResponse,
} from '@/application/ports/AINetworkProxyPort';
import type { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';

type KernelNetworkClient = Pick<KernelSidecarClient, 'getStatus' | 'networkFetchExternal'>;

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
}
